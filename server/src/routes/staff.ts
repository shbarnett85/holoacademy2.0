import { Router } from 'express'
import type { Request } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabase.js'
import { AppError } from '../middleware/errors.js'
import { requireStaff } from '../middleware/staffAuth.js'
import { hasIsActive, hasClassTeachers, hasGradeLabel, hasUserGender } from '../lib/activeColumn.js'

/* שורת כיתה — שדות שעשויים להיות קיימים לפי מצב המיגרציה */
interface ClassRow {
  id: string
  name: string
  slug: string
  url_code: string
  school_id: string | null
  teacher_id?: string | null
  grade_label?: string | null
}

/* כל המסלולים דורשים הזדהות צוות. ההרשאות מדורגות בתוך כל handler. */
export const staffRouter = Router()
staffRouter.use(requireStaff)

function isAdmin(req: Request): boolean {
  return req.staff?.role === 'admin' || req.staff?.role === 'super_admin'
}
function requireAdminRole(req: Request): void {
  if (!isAdmin(req)) throw new AppError(403, 'נדרשת הרשאת מנהל')
}
function requireMigration(): never {
  throw new AppError(400, 'הפעולה דורשת עמודת is_active — הרץ את server/schema.sql ב-Supabase')
}
function rndPin(): string {
  return String(Math.floor(1000 + Math.random() * 9000))
}

/* יצירת משתמש ב-Supabase Auth (למורים/מנהלים) */
async function createAuthUser(email: string, password: string): Promise<string> {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw new AppError(400, 'יצירת חשבון ההזדהות נכשלה: ' + (error?.message ?? ''))
  return data.user.id
}

/* האם מורה מקושר לכיתה — דרך class_teachers (מודל חדש) או teacher_id (fallback) */
async function teacherLinkedToClass(teacherId: string, cls: ClassRow): Promise<boolean> {
  if (await hasClassTeachers()) {
    const { data } = await supabaseAdmin.from('class_teachers').select('class_id').eq('class_id', cls.id).eq('teacher_id', teacherId).limit(1)
    return !!data && data.length > 0
  }
  return cls.teacher_id === teacherId
}

/* ודא גישת הצוות לכיתה: מנהל → כיתה בבית ספרו; מורה → כיתה שהוא מקושר אליה. */
async function loadClassForAccess(req: Request, classId: string): Promise<ClassRow> {
  const { data, error } = await supabaseAdmin.from('classes').select('*').eq('id', classId).single()
  if (error || !data) throw new AppError(404, 'כיתה לא נמצאה')
  const cls = data as ClassRow
  const s = req.staff!
  if (s.role === 'super_admin') return cls
  if (isAdmin(req)) {
    if (cls.school_id !== s.schoolId) throw new AppError(403, 'הכיתה אינה בבית ספרך')
    return cls
  }
  if (!(await teacherLinkedToClass(s.userId, cls))) throw new AppError(403, 'אין לך גישה לכיתה זו')
  return cls
}

/* מפת מורים לכל כיתה: classId → [{teacherId, name, subject}] (dual-path) */
async function teachersByClass(classIds: string[]): Promise<Map<string, { teacherId: string; name: string; subject: string }[]>> {
  const map = new Map<string, { teacherId: string; name: string; subject: string }[]>()
  if (classIds.length === 0) return map
  if (await hasClassTeachers()) {
    const { data: links } = await supabaseAdmin.from('class_teachers').select('class_id, teacher_id, subject').in('class_id', classIds)
    const tIds = [...new Set((links ?? []).map((l) => l.teacher_id))]
    const names = new Map<string, string>()
    if (tIds.length) {
      const { data: ts } = await supabaseAdmin.from('users').select('id, name').in('id', tIds)
      for (const t of (ts ?? []) as { id: string; name: string }[]) names.set(t.id, t.name)
    }
    for (const l of (links ?? []) as { class_id: string; teacher_id: string; subject: string }[]) {
      const arr = map.get(l.class_id) ?? []
      arr.push({ teacherId: l.teacher_id, name: names.get(l.teacher_id) ?? '—', subject: l.subject ?? '' })
      map.set(l.class_id, arr)
    }
  } else {
    /* fallback: teacher_id יחיד מתוך classes */
    const { data: cs } = await supabaseAdmin.from('classes').select('id, teacher_id').in('id', classIds)
    const tIds = [...new Set((cs ?? []).map((c) => (c as ClassRow).teacher_id).filter(Boolean) as string[])]
    const names = new Map<string, string>()
    if (tIds.length) {
      const { data: ts } = await supabaseAdmin.from('users').select('id, name').in('id', tIds)
      for (const t of (ts ?? []) as { id: string; name: string }[]) names.set(t.id, t.name)
    }
    for (const c of (cs ?? []) as ClassRow[]) {
      if (c.teacher_id) map.set(c.id, [{ teacherId: c.teacher_id, name: names.get(c.teacher_id) ?? '—', subject: '' }])
    }
  }
  return map
}

/* class ids שמורה מקושר אליהם (dual-path) */
async function teacherClassIds(teacherId: string): Promise<string[]> {
  if (await hasClassTeachers()) {
    const { data } = await supabaseAdmin.from('class_teachers').select('class_id').eq('teacher_id', teacherId)
    return (data ?? []).map((l) => l.class_id)
  }
  const { data } = await supabaseAdmin.from('classes').select('id').eq('teacher_id', teacherId)
  return (data ?? []).map((c) => c.id)
}

/* ודא שמשתמש (מורה/תלמיד) שייך לבית הספר של המנהל */
async function loadSchoolUser(req: Request, userId: string, role: 'teacher' | 'student') {
  const { data: u, error } = await supabaseAdmin
    .from('users')
    .select('id, name, role, school_id')
    .eq('id', userId)
    .single()
  if (error || !u || u.role !== role) throw new AppError(404, role === 'teacher' ? 'מורה לא נמצא' : 'תלמיד לא נמצא')
  return u
}

/* ── מורים (admin בלבד) ── */

staffRouter.get('/teachers', async (req, res, next) => {
  try {
    requireAdminRole(req)
    const withActive = await hasIsActive('users')
    /* מנהל-על (ללא school_id) רואה את כל המורים; מנהל רגיל — רק בבית ספרו */
    let tq = supabaseAdmin
      .from('users')
      .select(withActive ? 'id, name, role, is_active' : 'id, name, role')
      .eq('role', 'teacher')
    if (req.staff!.schoolId) tq = tq.eq('school_id', req.staff!.schoolId)
    const { data, error } = await tq.order('name')
    if (error) throw new AppError(500, 'שגיאה בשליפת מורים: ' + error.message)
    const teachers = (data ?? []) as unknown as { id: string; name: string; is_active?: boolean }[]
    /* מספר כיתות לכל מורה — class_teachers (מודל חדש) או teacher_id (fallback) */
    const classCount = new Map<string, number>()
    if (await hasClassTeachers()) {
      let scq = supabaseAdmin.from('classes').select('id')
      if (req.staff!.schoolId) scq = scq.eq('school_id', req.staff!.schoolId)
      const { data: schoolClasses } = await scq
      const ids = (schoolClasses ?? []).map((c) => c.id)
      if (ids.length) {
        const { data: links } = await supabaseAdmin.from('class_teachers').select('teacher_id').in('class_id', ids)
        for (const l of (links ?? []) as { teacher_id: string }[]) classCount.set(l.teacher_id, (classCount.get(l.teacher_id) ?? 0) + 1)
      }
    } else {
      let cq = supabaseAdmin.from('classes').select('teacher_id')
      if (req.staff!.schoolId) cq = cq.eq('school_id', req.staff!.schoolId)
      const { data: classes } = await cq
      for (const c of (classes ?? []) as { teacher_id: string | null }[]) {
        if (c.teacher_id) classCount.set(c.teacher_id, (classCount.get(c.teacher_id) ?? 0) + 1)
      }
    }
    res.json({
      teachers: teachers.map((t) => ({ id: t.id, name: t.name, is_active: t.is_active !== false, classCount: classCount.get(t.id) ?? 0 })),
    })
  } catch (err) {
    next(err)
  }
})

const createTeacherSchema = z.object({ email: z.string().email(), password: z.string().min(6), name: z.string().min(1) })

staffRouter.post('/teachers', async (req, res, next) => {
  try {
    requireAdminRole(req)
    const parsed = createTeacherSchema.safeParse(req.body)
    if (!parsed.success) throw new AppError(400, 'בקשה לא תקינה: ' + parsed.error.message)
    const withActive = await hasIsActive('users')
    const authId = await createAuthUser(parsed.data.email, parsed.data.password)
    const payload: Record<string, unknown> = { name: parsed.data.name, role: 'teacher', school_id: req.staff!.schoolId, auth_id: authId }
    if (withActive) payload.is_active = true
    const { data: row, error } = await supabaseAdmin.from('users').insert(payload).select('id, name, role').single()
    if (error || !row) {
      await supabaseAdmin.auth.admin.deleteUser(authId).catch(() => {})
      throw new AppError(500, 'יצירת המורה נכשלה: ' + (error?.message ?? ''))
    }
    res.status(201).json({ ok: true, teacher: row })
  } catch (err) {
    next(err)
  }
})

async function setUserActive(req: Request, userId: string, role: 'teacher' | 'student', active: boolean, res: import('express').Response) {
  if (isAdmin(req)) await loadSchoolUser(req, userId, role)
  if (!(await hasIsActive('users'))) requireMigration()
  const { error } = await supabaseAdmin.from('users').update({ is_active: active }).eq('id', userId)
  if (error) throw new AppError(500, 'שגיאה בעדכון הסטטוס: ' + error.message)
  res.json({ ok: true })
}

staffRouter.post('/teachers/:id/deactivate', async (req, res, next) => {
  try { requireAdminRole(req); await setUserActive(req, req.params.id, 'teacher', false, res) } catch (e) { next(e) }
})
staffRouter.post('/teachers/:id/reactivate', async (req, res, next) => {
  try { requireAdminRole(req); await setUserActive(req, req.params.id, 'teacher', true, res) } catch (e) { next(e) }
})

/* ── כיתות ── */

staffRouter.get('/classes', async (req, res, next) => {
  try {
    const withGrade = await hasGradeLabel()
    let query = supabaseAdmin.from('classes').select('*').order('name')
    if (isAdmin(req)) {
      /* מנהל-על (ללא school_id) → כל הכיתות; מנהל רגיל → בית ספרו */
      if (req.staff!.schoolId) query = query.eq('school_id', req.staff!.schoolId)
    } else {
      /* מורה — רק כיתות שהוא מקושר אליהן (class_teachers / teacher_id) */
      const ids = await teacherClassIds(req.staff!.userId)
      query = query.in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
    }
    const { data, error } = await query
    if (error) throw new AppError(500, 'שגיאה בשליפת כיתות: ' + error.message)
    const classes = (data ?? []) as unknown as (ClassRow & { is_active?: boolean })[]

    const ids = classes.map((c) => c.id)
    const teacherMap = await teachersByClass(ids)
    const { data: members } = await supabaseAdmin.from('class_members').select('class_id, users(role)').in('class_id', ids.length ? ids : ['_'])
    const studentCount = new Map<string, number>()
    for (const m of (members ?? []) as { class_id: string; users: { role: string } | { role: string }[] | null }[]) {
      const u = Array.isArray(m.users) ? m.users[0] : m.users
      if (u?.role === 'student') studentCount.set(m.class_id, (studentCount.get(m.class_id) ?? 0) + 1)
    }

    res.json({
      classes: classes.map((c) => ({
        id: c.id, name: c.name, slug: c.slug, url_code: c.url_code,
        gradeLabel: (withGrade ? c.grade_label : null) ?? c.name,
        teachers: teacherMap.get(c.id) ?? [],
        studentCount: studentCount.get(c.id) ?? 0,
        is_active: c.is_active !== false,
      })),
    })
  } catch (err) {
    next(err)
  }
})

/* יצירת url_code ייחודי {schoolSlug}-{classSlug} */
async function uniqueUrlCode(schoolSlug: string, classSlug: string): Promise<string> {
  const base = `${schoolSlug}-${classSlug}`
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`
    const { data } = await supabaseAdmin.from('classes').select('id').eq('url_code', candidate).maybeSingle()
    if (!data) return candidate
  }
  return `${base}-${Date.now()}`
}

/* slug/url_code יציבים לאורך שנים; grade_label היא השכבה הנוכחית. ללא teacher_id (שיוך נפרד) */
const createClassSchema = z.object({ name: z.string().min(1), slug: z.string().min(1).regex(/^[a-z0-9-]+$/), gradeLabel: z.string().optional() })

staffRouter.post('/classes', async (req, res, next) => {
  try {
    const parsed = createClassSchema.safeParse(req.body)
    if (!parsed.success) throw new AppError(400, 'בקשה לא תקינה: ' + parsed.error.message)
    const { name, slug } = parsed.data
    const schoolId = req.staff!.schoolId
    if (!schoolId) throw new AppError(400, 'אין שיוך לבית ספר')

    const { data: school } = await supabaseAdmin.from('schools').select('slug').eq('id', schoolId).single()
    const url_code = await uniqueUrlCode(school?.slug ?? 'school', slug)
    const withActive = await hasIsActive('classes')
    const withGrade = await hasGradeLabel()
    const withCT = await hasClassTeachers()
    const gradeLabel = parsed.data.gradeLabel?.trim() || name

    const payload: Record<string, unknown> = { name, slug, school_id: schoolId, url_code }
    if (withActive) payload.is_active = true
    if (withGrade) payload.grade_label = gradeLabel
    /* לפני המיגרציה teacher_id עדיין קיים (אולי NOT NULL) — משבצים את היוצר כברירת מחדל */
    if (!withCT) payload.teacher_id = req.staff!.userId

    const { data: cls, error } = await supabaseAdmin.from('classes').insert(payload).select('*').single()
    if (error || !cls) throw new AppError(500, 'יצירת הכיתה נכשלה: ' + (error?.message ?? ''))

    /* מודל חדש — היוצר (אם מורה) משויך דרך class_teachers */
    if (withCT && !isAdmin(req)) {
      await supabaseAdmin.from('class_teachers').insert({ class_id: (cls as ClassRow).id, teacher_id: req.staff!.userId, subject: '' })
    }
    res.status(201).json({ ok: true, class: { id: (cls as ClassRow).id, name: (cls as ClassRow).name, slug: (cls as ClassRow).slug, url_code: (cls as ClassRow).url_code } })
  } catch (err) {
    next(err)
  }
})

const patchClassSchema = z.object({ name: z.string().min(1).optional(), gradeLabel: z.string().min(1).optional() })

staffRouter.patch('/classes/:id', async (req, res, next) => {
  try {
    await loadClassForAccess(req, req.params.id)
    const parsed = patchClassSchema.safeParse(req.body)
    if (!parsed.success) throw new AppError(400, 'בקשה לא תקינה')
    const patch: Record<string, unknown> = {}
    if (parsed.data.name !== undefined) patch.name = parsed.data.name
    if (parsed.data.gradeLabel !== undefined) {
      if (!(await hasGradeLabel())) throw new AppError(400, 'עדכון שכבה דורש את עמודת grade_label — הרץ את server/schema.sql')
      patch.grade_label = parsed.data.gradeLabel
    }
    if (Object.keys(patch).length === 0) throw new AppError(400, 'אין שדות לעדכון')
    const { error } = await supabaseAdmin.from('classes').update(patch).eq('id', req.params.id)
    if (error) throw new AppError(500, 'שגיאה בעדכון הכיתה: ' + error.message)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

/* POST /api/staff/classes/:id/promote — קידום שכבה בתחילת שנה (עדכון grade_label בלבד) */
const promoteSchema = z.object({ gradeLabel: z.string().min(1) })
staffRouter.post('/classes/:id/promote', async (req, res, next) => {
  try {
    await loadClassForAccess(req, req.params.id)
    const parsed = promoteSchema.safeParse(req.body)
    if (!parsed.success) throw new AppError(400, 'נדרש gradeLabel')
    if (!(await hasGradeLabel())) throw new AppError(400, 'קידום שכבה דורש את עמודת grade_label — הרץ את server/schema.sql')
    const { error } = await supabaseAdmin.from('classes').update({ grade_label: parsed.data.gradeLabel }).eq('id', req.params.id)
    if (error) throw new AppError(500, 'שגיאה בקידום השכבה: ' + error.message)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

/* ── שיוך מורים לכיתה (רבים-לרבים) ── */
const addClassTeacherSchema = z.object({ teacherId: z.string().uuid(), subject: z.string().optional() })

staffRouter.post('/classes/:id/teachers', async (req, res, next) => {
  try {
    const cls = await loadClassForAccess(req, req.params.id)
    const parsed = addClassTeacherSchema.safeParse(req.body)
    if (!parsed.success) throw new AppError(400, 'בקשה לא תקינה')
    if (!(await hasClassTeachers())) throw new AppError(400, 'שיוך מורים מרובים דורש את טבלת class_teachers — הרץ את server/schema.sql')
    /* המורה חייב להיות בבית הספר של הכיתה */
    const { data: t } = await supabaseAdmin.from('users').select('id, school_id, role').eq('id', parsed.data.teacherId).single()
    if (!t || (t as { role: string }).role !== 'teacher' || (t as { school_id: string | null }).school_id !== cls.school_id) {
      throw new AppError(400, 'המורה אינו שייך לבית הספר של הכיתה')
    }
    const { error } = await supabaseAdmin.from('class_teachers').insert({ class_id: cls.id, teacher_id: parsed.data.teacherId, subject: parsed.data.subject?.trim() ?? '' })
    if (error && !/duplicate key/i.test(error.message)) throw new AppError(500, 'שיוך המורה נכשל: ' + error.message)
    res.status(201).json({ ok: true })
  } catch (err) {
    next(err)
  }
})

staffRouter.delete('/classes/:id/teachers/:teacherId', async (req, res, next) => {
  try {
    const cls = await loadClassForAccess(req, req.params.id)
    if (!(await hasClassTeachers())) throw new AppError(400, 'דורש את טבלת class_teachers — הרץ את server/schema.sql')
    const { error } = await supabaseAdmin.from('class_teachers').delete().eq('class_id', cls.id).eq('teacher_id', req.params.teacherId)
    if (error) throw new AppError(500, 'הסרת השיוך נכשלה: ' + error.message)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

async function setClassActive(req: Request, classId: string, active: boolean, res: import('express').Response) {
  await loadClassForAccess(req, classId)
  if (!(await hasIsActive('classes'))) requireMigration()
  const { error } = await supabaseAdmin.from('classes').update({ is_active: active }).eq('id', classId)
  if (error) throw new AppError(500, 'שגיאה בעדכון הכיתה: ' + error.message)
  res.json({ ok: true })
}
staffRouter.post('/classes/:id/deactivate', async (req, res, next) => {
  try { await setClassActive(req, req.params.id, false, res) } catch (e) { next(e) }
})
staffRouter.post('/classes/:id/reactivate', async (req, res, next) => {
  try { await setClassActive(req, req.params.id, true, res) } catch (e) { next(e) }
})

/* ── תלמידים ── */

/* GET /api/staff/students — כל התלמידים בכיתות הנגישות (דף "תלמידים" השטוח).
   מנהל → בית ספרו; מורה → כיתותיו. כולל קוד כיתה (url_code), PIN, מגדר ופעילות אחרונה. */
staffRouter.get('/students', async (req, res, next) => {
  try {
    const withGrade = await hasGradeLabel()
    const withGender = await hasUserGender()
    const withActive = await hasIsActive('users')

    /* כיתות נגישות */
    let cq = supabaseAdmin.from('classes').select('*')
    if (isAdmin(req)) {
      if (req.staff!.schoolId) cq = cq.eq('school_id', req.staff!.schoolId)
    } else {
      const ids = await teacherClassIds(req.staff!.userId)
      cq = cq.in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
    }
    const { data: clsData, error: clsErr } = await cq
    if (clsErr) throw new AppError(500, 'שגיאה בשליפת כיתות: ' + clsErr.message)
    const classes = (clsData ?? []) as unknown as { id: string; name: string; grade_label?: string | null; url_code: string }[]
    const classById = new Map(classes.map((c) => [c.id, c]))
    const classIds = classes.map((c) => c.id)
    if (classIds.length === 0) { res.json({ students: [] }); return }

    /* תלמידי הכיתות */
    const sCols = ['id', 'name', 'role', 'pin']
    if (withActive) sCols.push('is_active')
    if (withGender) sCols.push('gender')
    const sel: string = `class_id, users(${sCols.join(', ')})`
    const { data: membersRaw, error: mErr } = await supabaseAdmin.from('class_members').select(sel).in('class_id', classIds)
    if (mErr) throw new AppError(500, 'שגיאה בשליפת תלמידים: ' + mErr.message)
    type SUser = { id: string; name: string; role: string; pin?: string | null; is_active?: boolean; gender?: string | null }
    const members = (membersRaw ?? []) as unknown as { class_id: string; users: SUser | SUser[] | null }[]

    const students = members
      .map((m) => ({ classId: m.class_id, u: Array.isArray(m.users) ? m.users[0] : m.users }))
      .filter((x): x is { classId: string; u: SUser } => !!x.u && x.u.role === 'student')
      .map(({ classId, u }) => {
        const c = classById.get(classId)
        return {
          id: u.id, name: u.name,
          classId: classId,
          class: (withGrade ? c?.grade_label : null) ?? c?.name ?? '',
          classCode: c?.url_code ?? '',
          secret: u.pin ?? null,
          gender: u.gender ?? null,
          isActive: u.is_active !== false,
          lastActive: null as string | null,
        }
      })

    /* פעילות אחרונה — started_at האחרון לכל תלמיד */
    const userIds = [...new Set(students.map((s) => s.id))]
    if (userIds.length) {
      const { data: sess } = await supabaseAdmin
        .from('sessions')
        .select('user_id, started_at')
        .in('user_id', userIds)
        .order('started_at', { ascending: false })
      const last = new Map<string, string>()
      for (const r of (sess ?? []) as { user_id: string; started_at: string }[]) {
        if (!last.has(r.user_id)) last.set(r.user_id, r.started_at)
      }
      students.forEach((s) => { s.lastActive = last.get(s.id) ?? null })
    }

    res.json({ students })
  } catch (err) {
    next(err)
  }
})

staffRouter.get('/classes/:id/students', async (req, res, next) => {
  try {
    await loadClassForAccess(req, req.params.id)
    const withActive = await hasIsActive('users')
    const withGender = await hasUserGender()
    const cols = ['id', 'name', 'role']
    if (withActive) cols.push('is_active')
    if (withGender) cols.push('gender')
    const sel: string = `users(${cols.join(', ')})`
    const { data: membersRaw, error } = await supabaseAdmin
      .from('class_members')
      .select(sel)
      .eq('class_id', req.params.id)
    if (error) throw new AppError(500, 'שגיאה בשליפת תלמידים: ' + error.message)
    type UserRow = { id: string; name: string; role: string; is_active?: boolean; gender?: string | null }
    const members = (membersRaw ?? []) as unknown as { users: UserRow | UserRow[] }[]
    const students = members
      .map((m) => (Array.isArray(m.users) ? m.users[0] : m.users))
      .filter(Boolean)
      .filter((u: { role: string }) => u.role === 'student')
      .map((u: { id: string; name: string; is_active?: boolean; gender?: string | null }) => ({ id: u.id, name: u.name, is_active: u.is_active !== false, gender: u.gender ?? null }))
    res.json({ students })
  } catch (err) {
    next(err)
  }
})

/* יצירת תלמיד בודד ברשומת users + class_members; מחזיר PIN */
async function createStudent(name: string, schoolId: string | null, classId: string, gender?: 'male' | 'female' | null): Promise<{ id: string; name: string; pin: string }> {
  const pin = rndPin()
  const withActive = await hasIsActive('users')
  const payload: Record<string, unknown> = { name, role: 'student', pin, school_id: schoolId }
  if (withActive) payload.is_active = true
  if (gender && (await hasUserGender())) payload.gender = gender
  const { data: student, error } = await supabaseAdmin.from('users').insert(payload).select('id, name').single()
  if (error || !student) throw new AppError(500, 'יצירת התלמיד נכשלה: ' + (error?.message ?? ''))
  const { error: mErr } = await supabaseAdmin.from('class_members').insert({ class_id: classId, user_id: student.id })
  if (mErr) {
    await supabaseAdmin.from('users').delete().eq('id', student.id)
    throw new AppError(500, 'שיוך התלמיד לכיתה נכשל: ' + mErr.message)
  }
  return { id: student.id, name: student.name, pin }
}

const addStudentSchema = z.object({ name: z.string().min(1), gender: z.enum(['male', 'female']).nullable().optional() })

staffRouter.post('/classes/:id/students', async (req, res, next) => {
  try {
    const cls = await loadClassForAccess(req, req.params.id)
    const parsed = addStudentSchema.safeParse(req.body)
    if (!parsed.success) throw new AppError(400, 'חסר שם תלמיד')
    const created = await createStudent(parsed.data.name.trim(), cls.school_id, cls.id, parsed.data.gender ?? null)
    res.status(201).json({ ok: true, student: created })
  } catch (err) {
    next(err)
  }
})

const bulkSchema = z.object({ classId: z.string().uuid(), names: z.array(z.string()) })

staffRouter.post('/students/bulk', async (req, res, next) => {
  try {
    const parsed = bulkSchema.safeParse(req.body)
    if (!parsed.success) throw new AppError(400, 'בקשה לא תקינה')
    const cls = await loadClassForAccess(req, parsed.data.classId)
    const names = parsed.data.names.map((n) => n.trim()).filter(Boolean)
    if (names.length === 0) throw new AppError(400, 'הרשימה ריקה')
    if (names.length > 100) throw new AppError(400, 'מקסימום 100 תלמידים בבת אחת')
    const created: { id: string; name: string; pin: string }[] = []
    for (const name of names) created.push(await createStudent(name, cls.school_id, cls.id))
    res.status(201).json({ ok: true, students: created })
  } catch (err) {
    next(err)
  }
})

/* גישת צוות לתלמיד — דרך כיתה כלשהי שלו (מורה: כיתה שלו; מנהל: בית ספרו) */
async function assertStudentAccess(req: Request, studentId: string) {
  const student = await loadSchoolUser(req, studentId, 'student')
  const { data: memberships } = await supabaseAdmin.from('class_members').select('class_id').eq('user_id', studentId)
  const classIds = (memberships ?? []).map((m) => m.class_id)
  if (req.staff!.role === 'super_admin') return student
  if (isAdmin(req)) {
    if (student.school_id !== req.staff!.schoolId) throw new AppError(403, 'התלמיד אינו בבית ספרך')
    return student
  }
  /* מורה — חייב שהתלמיד יהיה באחת מכיתותיו (class_teachers / teacher_id) */
  if (classIds.length === 0) throw new AppError(403, 'אין לך גישה לתלמיד זה')
  const ownIds = new Set(await teacherClassIds(req.staff!.userId))
  if (!classIds.some((id) => ownIds.has(id))) throw new AppError(403, 'אין לך גישה לתלמיד זה')
  return student
}

staffRouter.post('/students/:id/reset-pin', async (req, res, next) => {
  try {
    await assertStudentAccess(req, req.params.id)
    const pin = rndPin()
    const { error } = await supabaseAdmin.from('users').update({ pin }).eq('id', req.params.id)
    if (error) throw new AppError(500, 'שגיאה באיפוס PIN: ' + error.message)
    res.json({ ok: true, pin })
  } catch (err) {
    next(err)
  }
})

staffRouter.post('/students/:id/deactivate', async (req, res, next) => {
  try { await assertStudentAccess(req, req.params.id); await setUserActive(req, req.params.id, 'student', false, res) } catch (e) { next(e) }
})
staffRouter.post('/students/:id/reactivate', async (req, res, next) => {
  try { await assertStudentAccess(req, req.params.id); await setUserActive(req, req.params.id, 'student', true, res) } catch (e) { next(e) }
})

const patchStudentSchema = z.object({
  name: z.string().min(1).optional(),
  moveToClassId: z.string().uuid().optional(),
  gender: z.enum(['male', 'female']).nullable().optional(),
})

staffRouter.patch('/students/:id', async (req, res, next) => {
  try {
    await assertStudentAccess(req, req.params.id)
    const parsed = patchStudentSchema.safeParse(req.body)
    if (!parsed.success) throw new AppError(400, 'בקשה לא תקינה')
    if (parsed.data.name !== undefined) {
      const { error } = await supabaseAdmin.from('users').update({ name: parsed.data.name }).eq('id', req.params.id)
      if (error) throw new AppError(500, 'שגיאה בעדכון השם: ' + error.message)
    }
    if (parsed.data.gender !== undefined && (await hasUserGender())) {
      const { error } = await supabaseAdmin.from('users').update({ gender: parsed.data.gender }).eq('id', req.params.id)
      if (error) throw new AppError(500, 'שגיאה בעדכון המגדר: ' + error.message)
    }
    if (parsed.data.moveToClassId) {
      await loadClassForAccess(req, parsed.data.moveToClassId) /* ודא גישה ליעד */
      await supabaseAdmin.from('class_members').delete().eq('user_id', req.params.id)
      const { error } = await supabaseAdmin.from('class_members').insert({ class_id: parsed.data.moveToClassId, user_id: req.params.id })
      if (error) throw new AppError(500, 'שגיאה בהעברת התלמיד: ' + error.message)
    }
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})
