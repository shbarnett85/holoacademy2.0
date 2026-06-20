import { Router } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabase.js'
import { AppError } from '../middleware/errors.js'
import { requireSuperAdmin } from '../middleware/staffAuth.js'
import { hasQuestReports } from '../lib/activeColumn.js'

/* כל ה-routes כאן מוגנים ב-requireSuperAdmin (role=super_admin בלבד) */
export const adminRouter = Router()
adminRouter.use(requireSuperAdmin)

/* האם עמודת is_active כבר קיימת (אחרי schema.sql)? נבדק פעם אחת ונשמר ב-cache.
   כך הפאנל עובד גם לפני המיגרציה (הכול נחשב פעיל), ופעולות ההשבתה דורשות את העמודה. */
let isActiveAvail: boolean | null = null
async function hasIsActive(): Promise<boolean> {
  if (isActiveAvail !== null) return isActiveAvail
  const { error } = await supabaseAdmin.from('users').select('is_active').limit(1)
  isActiveAvail = !error
  return isActiveAvail
}

/* יצירת משתמש ב-Supabase Auth; מחזיר את ה-id */
async function createAuthUser(email: string, password: string): Promise<string> {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw new AppError(400, 'יצירת חשבון ההזדהות נכשלה: ' + (error?.message ?? ''))
  return data.user.id
}

/* השבתה/הפעלה דרך Supabase Auth ban — חוסם התחברות **בלי תלות בעמודת is_active**.
   כך השבתת מנהל/בית ספר עובדת מיד, גם לפני המיגרציה. */
async function setBan(authId: string | null | undefined, banned: boolean): Promise<void> {
  if (!authId) return
  await supabaseAdmin.auth.admin.updateUserById(authId, { ban_duration: banned ? '876000h' : 'none' }).catch(() => {})
}

/* קבוצת ה-auth ids החסומים כעת — לחישוב סטטוס פעיל/מושבת ללא עמודה */
async function bannedAuthIds(): Promise<Set<string>> {
  const set = new Set<string>()
  try {
    const { data } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const now = Date.now()
    for (const u of data?.users ?? []) {
      const bu = (u as { banned_until?: string }).banned_until
      if (bu && new Date(bu).getTime() > now) set.add(u.id)
    }
  } catch {
    /* התעלמות — נחזיר סט ריק */
  }
  return set
}

/* ── בתי ספר ── */

const createSchoolSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'slug באנגלית קטנה/מקפים בלבד'),
  admin: z.object({ email: z.string().email(), password: z.string().min(6), name: z.string().min(1) }),
})

/* POST /api/admin/schools — בית ספר חדש + חשבון המנהל הראשון שלו (אטומי) */
adminRouter.post('/schools', async (req, res, next) => {
  try {
    const parsed = createSchoolSchema.safeParse(req.body)
    if (!parsed.success) throw new AppError(400, 'בקשה לא תקינה: ' + parsed.error.message)
    const { name, slug, admin } = parsed.data
    const withActive = await hasIsActive()

    const schoolPayload: Record<string, unknown> = { name, slug }
    if (withActive) schoolPayload.is_active = true
    const { data: school, error: sErr } = await supabaseAdmin
      .from('schools')
      .insert(schoolPayload)
      .select('id, name, slug')
      .single()
    if (sErr || !school) throw new AppError(400, 'יצירת בית הספר נכשלה: ' + (sErr?.message ?? ''))

    try {
      const authId = await createAuthUser(admin.email, admin.password)
      const userPayload: Record<string, unknown> = { name: admin.name, role: 'admin', school_id: school.id, auth_id: authId }
      if (withActive) userPayload.is_active = true
      const { error: uErr } = await supabaseAdmin.from('users').insert(userPayload)
      if (uErr) {
        await supabaseAdmin.auth.admin.deleteUser(authId).catch(() => {})
        throw new AppError(500, 'יצירת המנהל נכשלה: ' + uErr.message)
      }
    } catch (e) {
      await supabaseAdmin.from('schools').delete().eq('id', school.id)
      throw e
    }

    res.status(201).json({ ok: true, school })
  } catch (err) {
    next(err)
  }
})

/* GET /api/admin/schools — כל בתי הספר עם מספר משתמשים וסטטוס */
adminRouter.get('/schools', async (_req, res, next) => {
  try {
    const withActive = await hasIsActive()
    const { data: schools, error } = await supabaseAdmin
      .from('schools')
      .select(withActive ? 'id, name, slug, is_active' : 'id, name, slug')
      .order('name')
    if (error) throw new AppError(500, 'שגיאה בשליפת בתי ספר: ' + error.message)

    const { data: users } = await supabaseAdmin
      .from('users')
      .select(withActive ? 'school_id, auth_id, is_active' : 'school_id, auth_id')
    const banned = await bannedAuthIds()
    const counts = new Map<string, { total: number; active: number }>()
    for (const u of (users ?? []) as unknown as { school_id: string | null; auth_id: string | null; is_active?: boolean }[]) {
      if (!u.school_id) continue
      const active = u.is_active !== false && !(u.auth_id && banned.has(u.auth_id))
      const c = counts.get(u.school_id) ?? { total: 0, active: 0 }
      c.total++
      if (active) c.active++
      counts.set(u.school_id, c)
    }

    res.json({
      schools: ((schools ?? []) as unknown as { id: string; name: string; slug: string; is_active?: boolean }[]).map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        is_active: s.is_active !== false,
        userCount: counts.get(s.id)?.total ?? 0,
        activeUserCount: counts.get(s.id)?.active ?? 0,
      })),
    })
  } catch (err) {
    next(err)
  }
})

/* החלפת סטטוס בית ספר + כל משתמשיו (ban לאנשי הצוות + is_active אם קיים) */
async function setSchoolActive(schoolId: string, active: boolean): Promise<void> {
  const withActive = await hasIsActive()
  if (withActive) {
    await supabaseAdmin.from('schools').update({ is_active: active }).eq('id', schoolId)
    await supabaseAdmin.from('users').update({ is_active: active }).eq('school_id', schoolId)
  }
  /* חסימת/שחרור התחברות לכל אנשי הצוות של בית הספר (עובד גם ללא העמודה) */
  const { data: staff } = await supabaseAdmin.from('users').select('auth_id').eq('school_id', schoolId)
  for (const s of (staff ?? []) as { auth_id: string | null }[]) await setBan(s.auth_id, !active)
}

/* DELETE /api/admin/schools/:id — השבתה (לא מחיקה): בית הספר + כל משתמשיו */
adminRouter.delete('/schools/:id', async (req, res, next) => {
  try {
    await setSchoolActive(req.params.id, false)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

/* POST /api/admin/schools/:id/reactivate — הפעלה מחדש של בית הספר ומשתמשיו */
adminRouter.post('/schools/:id/reactivate', async (req, res, next) => {
  try {
    await setSchoolActive(req.params.id, true)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

/* ── משתמשים ── */

/* GET /api/admin/users?schoolId= — כל המשתמשים (כולל מושבתים) עם סטטוס */
adminRouter.get('/users', async (req, res, next) => {
  try {
    const withActive = await hasIsActive()
    let query = supabaseAdmin
      .from('users')
      .select(withActive ? 'id, name, role, school_id, auth_id, is_active' : 'id, name, role, school_id, auth_id')
      .order('name')
    const schoolId = req.query.schoolId
    if (typeof schoolId === 'string' && schoolId) query = query.eq('school_id', schoolId)
    const { data, error } = await query
    if (error) throw new AppError(500, 'שגיאה בשליפת משתמשים: ' + error.message)
    const banned = await bannedAuthIds()
    res.json({
      users: ((data ?? []) as unknown as { id: string; name: string; role: string; school_id: string | null; auth_id: string | null; is_active?: boolean }[]).map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role,
        school_id: u.school_id,
        is_active: u.is_active !== false && !(u.auth_id && banned.has(u.auth_id)),
      })),
    })
  } catch (err) {
    next(err)
  }
})

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.enum(['teacher', 'admin']),
  schoolId: z.string().uuid(),
})

/* POST /api/admin/users — יצירת מורה/מנהל בבית ספר נתון */
adminRouter.post('/users', async (req, res, next) => {
  try {
    const parsed = createUserSchema.safeParse(req.body)
    if (!parsed.success) throw new AppError(400, 'בקשה לא תקינה: ' + parsed.error.message)
    const { email, password, name, role, schoolId } = parsed.data
    const withActive = await hasIsActive()

    const authId = await createAuthUser(email, password)
    const payload: Record<string, unknown> = { name, role, school_id: schoolId, auth_id: authId }
    if (withActive) payload.is_active = true
    const { data: userRow, error: uErr } = await supabaseAdmin
      .from('users')
      .insert(payload)
      .select('id, name, role, school_id')
      .single()
    if (uErr || !userRow) {
      await supabaseAdmin.auth.admin.deleteUser(authId).catch(() => {})
      throw new AppError(500, 'יצירת המשתמש נכשלה: ' + (uErr?.message ?? ''))
    }
    res.status(201).json({ ok: true, user: userRow })
  } catch (err) {
    next(err)
  }
})

/* השבתה/הפעלה של משתמש בודד — ban (עובד תמיד) + is_active אם קיים */
async function setSingleUserActive(userId: string, active: boolean): Promise<void> {
  const { data: u } = await supabaseAdmin.from('users').select('auth_id').eq('id', userId).single()
  await setBan((u as { auth_id: string | null } | null)?.auth_id, !active)
  if (await hasIsActive()) await supabaseAdmin.from('users').update({ is_active: active }).eq('id', userId)
}

/* POST /api/admin/users/:id/deactivate — השבתת משתמש בודד */
adminRouter.post('/users/:id/deactivate', async (req, res, next) => {
  try { await setSingleUserActive(req.params.id, false); res.json({ ok: true }) } catch (err) { next(err) }
})

/* POST /api/admin/users/:id/reactivate — הפעלה מחדש של משתמש בודד */
adminRouter.post('/users/:id/reactivate', async (req, res, next) => {
  try { await setSingleUserActive(req.params.id, true); res.json({ ok: true }) } catch (err) { next(err) }
})

/* ── מודרציה: דיווחים על הדמיות ציבוריות (super_admin) ── */

/* GET /api/admin/reports — דיווחים (ברירת מחדל: פתוחים) עם כותרת ההדמיה ושם המדווח */
adminRouter.get('/reports', async (req, res, next) => {
  try {
    if (!(await hasQuestReports())) { res.json({ reports: [] }); return }
    const status = typeof req.query.status === 'string' ? req.query.status : 'open'
    let query = supabaseAdmin.from('quest_reports').select('id, quest_id, reporter_id, reason, status, created_at').order('created_at', { ascending: false })
    if (status !== 'all') query = query.eq('status', status)
    const { data, error } = await query
    if (error) throw new AppError(500, 'שגיאה בשליפת דיווחים: ' + error.message)
    const reports = (data ?? []) as { id: string; quest_id: string; reporter_id: string | null; reason: string; status: string; created_at: string }[]

    const questIds = [...new Set(reports.map((r) => r.quest_id))]
    const reporterIds = [...new Set(reports.map((r) => r.reporter_id).filter((x): x is string => !!x))]
    const qTitles = new Map<string, { title: string; is_public: boolean }>()
    if (questIds.length) {
      const { data: qs } = await supabaseAdmin.from('quests').select('id, title, is_public').in('id', questIds)
      for (const q of (qs ?? []) as { id: string; title: string; is_public?: boolean }[]) qTitles.set(q.id, { title: q.title, is_public: q.is_public === true })
    }
    const rNames = new Map<string, string>()
    if (reporterIds.length) {
      const { data: us } = await supabaseAdmin.from('users').select('id, name').in('id', reporterIds)
      for (const u of (us ?? []) as { id: string; name: string }[]) rNames.set(u.id, u.name)
    }

    res.json({
      reports: reports.map((r) => ({
        id: r.id, questId: r.quest_id, reason: r.reason, status: r.status, createdAt: r.created_at,
        questTitle: qTitles.get(r.quest_id)?.title ?? '(נמחקה)',
        questIsPublic: qTitles.get(r.quest_id)?.is_public ?? false,
        reporterName: (r.reporter_id && rNames.get(r.reporter_id)) || 'מורה',
      })),
    })
  } catch (err) {
    next(err)
  }
})

/* PATCH /api/admin/reports/:id — טיפול בדיווח: סטטוס reviewed/dismissed + אפשרות unshare להדמיה */
const reportPatchSchema = z.object({
  status: z.enum(['reviewed', 'dismissed']).optional(),
  unshare: z.boolean().optional(),
})
adminRouter.patch('/reports/:id', async (req, res, next) => {
  try {
    if (!(await hasQuestReports())) throw new AppError(503, 'מערכת הדיווחים עדיין לא זמינה')
    const parsed = reportPatchSchema.safeParse(req.body ?? {})
    if (!parsed.success) throw new AppError(400, 'בקשה לא תקינה')
    const { data: report, error } = await supabaseAdmin.from('quest_reports').select('id, quest_id').eq('id', req.params.id).single()
    if (error || !report) throw new AppError(404, 'דיווח לא נמצא')

    if (parsed.data.unshare) {
      await supabaseAdmin.from('quests').update({ is_public: false }).eq('id', (report as { quest_id: string }).quest_id)
    }
    const newStatus = parsed.data.status ?? (parsed.data.unshare ? 'reviewed' : undefined)
    if (newStatus) {
      const { error: upErr } = await supabaseAdmin.from('quest_reports').update({ status: newStatus }).eq('id', report.id)
      if (upErr) throw new AppError(500, 'שגיאה בעדכון הדיווח: ' + upErr.message)
    }
    res.json({ ok: true, status: newStatus, unshared: !!parsed.data.unshare })
  } catch (err) {
    next(err)
  }
})
