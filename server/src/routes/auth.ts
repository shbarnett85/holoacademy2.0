import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { supabaseAdmin, supabaseAnon } from '../lib/supabase.js'
import { AppError } from '../middleware/errors.js'
import { isUserActive, isSuperAdminEmail } from '../middleware/staffAuth.js'
import { hasCanShare, hasApprovalStatus, hasIsActive } from '../lib/activeColumn.js'
import { planSignup, signupMail, confirmationRedirect, JOIN_UNAVAILABLE_MESSAGE } from '../lib/staffSignup.js'
import { info as logInfo, error as logError } from '../lib/log.js'
import { rateLimitByIp, recordFailure, isLocked, RATE_LIMIT_MESSAGE } from '../middleware/rateLimit.js'

export const authRouter = Router()

/* האם עמודת schools.is_restricted_org קיימת (cache חיובי בלבד) */
let restrictedColOk = false
async function hasRestrictedOrgColumn(): Promise<boolean> {
  if (restrictedColOk) return true
  const { error } = await supabaseAdmin.from('schools').select('is_restricted_org').limit(1)
  if (!error) restrictedColOk = true
  return restrictedColOk
}

/* GET /api/schools — רשימת בתי ספר לטופס ההרשמה (פתוח) */
authRouter.get('/schools', async (_req, res, next) => {
  try {
    /* ארגוני פיילוט מוגבלים (is_restricted_org) מוסתרים מההרשמה העצמית — מוסיפים
       אליהם אנשים רק מנהל הארגון / מנהל-על. עמיד לפני מיגרציית org_permissions. */
    let q = supabaseAdmin.from('schools').select('id, name').order('name')
    if (await hasRestrictedOrgColumn()) q = q.eq('is_restricted_org', false)
    const { data, error } = await q
    if (error) throw new AppError(500, 'שגיאה בשליפת בתי ספר')
    res.json({ schools: data ?? [] })
  } catch (err) {
    next(err)
  }
})

/* ── הזדהות צוות (מורה/מנהל) דרך Supabase Auth ── */

const staffSignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, 'הסיסמה חייבת לפחות 6 תווים'),
  name: z.string().min(1),
  /* 'admin' תקף רק יחד עם newSchoolName (יוצר בית ספר חדש) — planSignup דוחה אותו בהצטרפות לבית ספר קיים */
  role: z.enum(['teacher', 'admin']).optional(),
  schoolId: z.string().uuid().optional(),
  /* בית ספר שאינו ברשימה — נוצר תוך כדי ההרשמה */
  newSchoolName: z.string().min(2).max(80).optional(),
}).refine((d) => d.schoolId || d.newSchoolName, { message: 'יש לבחור בית ספר או להזין חדש' })

/* POST /api/auth/staff-signup — הרשמה עצמית של צוות.
   - בית ספר חדש: היוצר מורה/מנהל של בית הספר החדש שלו (ללא גישה לאחרים).
   - בית ספר קיים: מורה ממתין (approval_status='pending', is_active=false) עד אישור מנהל בית הספר.
   - בשני המסלולים המייל לא מאושר מראש: נשלח קישור אימות, ועד אז staff-login חסום. */
authRouter.post('/auth/staff-signup', rateLimitByIp('staff-signup', 5), async (req, res, next) => {
  try {
    const parsed = staffSignupSchema.safeParse(req.body)
    if (!parsed.success) throw new AppError(400, 'בקשה לא תקינה: ' + parsed.error.message)
    const { email, password, name, newSchoolName } = parsed.data
    const plan = planSignup(parsed.data)

    if (plan.kind === 'join') {
      /* נכשלים סגור: בלי עמודת approval_status אין איך לסמן/לאכוף המתנה לאישור. (users.is_active אינה תנאי —
         היא נכשלת-פתוח כשהעמודה חסרה, ולכן האכיפה היא על approval_status; is_active=false מתווספת כשהיא קיימת.) */
      if (!(await hasApprovalStatus())) throw new AppError(503, JOIN_UNAVAILABLE_MESSAGE, 'JOIN_UNAVAILABLE')
      /* הרשמה עצמית לארגון פיילוט מוגבל חסומה — רק מנהל הארגון מוסיף אליו מורים */
      if (await hasRestrictedOrgColumn()) {
        const { data: org } = await supabaseAdmin.from('schools').select('is_restricted_org').eq('id', plan.schoolId).maybeSingle()
        if ((org as { is_restricted_org?: boolean } | null)?.is_restricted_org) {
          throw new AppError(403, 'ההרשמה לארגון זה מתבצעת דרך מנהל הארגון בלבד')
        }
      }
      const { data: school } = await supabaseAdmin.from('schools').select('id').eq('id', plan.schoolId).maybeSingle()
      if (!school) throw new AppError(404, 'בית הספר לא נמצא')
    }

    /* 1) משתמש ב-Supabase Auth — ללא email_confirm: ההתחברות נחסמת עד לחיצה על קישור האימות */
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: false })
    if (createErr || !created.user) {
      if (createErr?.code === 'email_exists' || /already.*registered/i.test(createErr?.message ?? '')) {
        throw new AppError(409, 'כתובת האימייל כבר רשומה — התחברו, או השתמשו ב"שכחתי סיסמה"', 'EMAIL_EXISTS')
      }
      throw new AppError(400, 'יצירת המשתמש נכשלה: ' + (createErr?.message ?? 'שגיאה'))
    }
    const authId = created.user.id
    let createdSchoolId: string | null = null
    let userId: string | null = null
    /* ניקוי בסדר הפוך — כדי שכשל בשלב כלשהו לא ישאיר חשבון/בית ספר יתומים */
    const rollback = async () => {
      if (userId) { try { await supabaseAdmin.from('users').delete().eq('id', userId) } catch { /* best-effort */ } }
      if (createdSchoolId) { try { await supabaseAdmin.from('schools').delete().eq('id', createdSchoolId) } catch { /* best-effort */ } }
      await supabaseAdmin.auth.admin.deleteUser(authId).catch(() => {})
    }

    try {
      /* 2) בית ספר חדש — slug ייחודי (נגזר מהשם או אקראי) */
      let schoolId: string
      if (plan.kind === 'new_school') {
        const base = newSchoolName!.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
        const slug = (base || 'school') + '-' + Math.random().toString(36).slice(2, 7)
        const { data: school, error: schoolErr } = await supabaseAdmin
          .from('schools')
          .insert({ name: newSchoolName!.trim(), slug })
          .select('id')
          .single()
        if (schoolErr || !school) throw new AppError(500, 'יצירת בית הספר נכשלה: ' + (schoolErr?.message ?? ''))
        createdSchoolId = school.id
        schoolId = school.id
      } else {
        schoolId = plan.schoolId
      }

      /* 3) רשומה בטבלת users עם auth_id מקושר. מצטרף לבית ספר קיים נוצר ממתין ולא-פעיל */
      const payload: Record<string, unknown> = { name, role: plan.role, school_id: schoolId, auth_id: authId }
      if (plan.kind === 'join') {
        payload.approval_status = 'pending'
        if (await hasIsActive('users')) payload.is_active = false
      }
      const { data: userRow, error: insErr } = await supabaseAdmin
        .from('users')
        .insert(payload)
        .select('id, name, role, school_id')
        .single()
      if (insErr || !userRow) throw new AppError(500, 'יצירת רשומת המשתמש נכשלה: ' + (insErr?.message ?? ''))
      userId = userRow.id

      /* 4) מייל אימות. אם השליחה נכשלה — מבטלים הכול (חשבון שאי אפשר לאמת הוא חשבון מת) */
      const sent = await signupMail.sendConfirmation(email, confirmationRedirect(req.headers.origin as string | undefined))
      if (!sent.ok) {
        logError('[staff-signup] שליחת מייל האימות נכשלה:', sent.error)
        throw new AppError(503, 'לא הצלחנו לשלוח מייל אימות — נסו שוב בעוד כמה דקות', 'EMAIL_SEND_FAILED')
      }

      logInfo('[staff-signup] נרשם', plan.kind === 'join' ? 'מורה ממתין לאישור' : `${plan.role} בבית ספר חדש`, userRow.id)
      res.status(201).json({ ok: true, user: userRow, needsEmailVerification: true, pendingApproval: plan.kind === 'join' })
    } catch (err) {
      await rollback()
      throw err
    }
  } catch (err) {
    next(err)
  }
})

/* POST /api/auth/resend-confirmation — שליחה חוזרת של מייל האימות. תמיד 200 (לא מדליפים אילו
   כתובות קיימות); Supabase עצמו מגביל תדירות פר-משתמש, ופה גם פר-IP. */
authRouter.post('/auth/resend-confirmation', rateLimitByIp('resend-confirmation', 5), async (req, res, next) => {
  try {
    const email = z.string().email().safeParse((req.body as { email?: string })?.email)
    if (!email.success) throw new AppError(400, 'כתובת אימייל לא תקינה')
    await signupMail.sendConfirmation(email.data, confirmationRedirect(req.headers.origin as string | undefined)).catch(() => {})
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

/* ── שחזור סיסמה ─────────────────────────────────────────────────────────────
   forgot: שולח מייל איפוס דרך Supabase (תמיד 200 — לא מדליפים אילו חשבונות
   קיימים). reset: הקישור מהמייל נושא access_token (recovery) — מאמתים אותו
   ומעדכנים סיסמה דרך ה-admin API. */
authRouter.post('/auth/forgot-password', rateLimitByIp('forgot-password', 5), async (req, res, next) => {
  try {
    const email = z.string().email().safeParse((req.body as { email?: string })?.email)
    if (!email.success) throw new AppError(400, 'כתובת אימייל לא תקינה')
    const origin = (req.headers.origin as string | undefined) ?? 'https://holoacademy.ai'
    await supabaseAnon.auth.resetPasswordForEmail(email.data, { redirectTo: origin + '/staff/reset' }).catch(() => {})
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

authRouter.post('/auth/reset-password', rateLimitByIp('reset-password', 8), async (req, res, next) => {
  try {
    const parsed = z.object({ accessToken: z.string().min(10), password: z.string().min(6, 'הסיסמה חייבת לפחות 6 תווים') }).safeParse(req.body)
    if (!parsed.success) throw new AppError(400, 'בקשה לא תקינה: ' + parsed.error.message)
    const { data, error } = await supabaseAdmin.auth.getUser(parsed.data.accessToken)
    if (error || !data.user) throw new AppError(401, 'קישור האיפוס פג תוקף — בקשו קישור חדש')
    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(data.user.id, { password: parsed.data.password })
    if (updErr) throw new AppError(500, 'עדכון הסיסמה נכשל: ' + updErr.message)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

const staffLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

/* POST /api/auth/staff-login — אימות מול Supabase Auth, החזרת session + פרופיל הצוות */
authRouter.post('/auth/staff-login', rateLimitByIp('staff-login', 10), async (req, res, next) => {
  try {
    const parsed = staffLoginSchema.safeParse(req.body)
    if (!parsed.success) throw new AppError(400, 'בקשה לא תקינה')
    const { email, password } = parsed.data

    const { data, error } = await supabaseAnon.auth.signInWithPassword({ email, password })
    if (error?.code === 'email_not_confirmed') {
      throw new AppError(403, 'יש לאשר את כתובת האימייל — שלחנו קישור אימות למייל שהוזן בהרשמה', 'EMAIL_NOT_CONFIRMED')
    }
    if (error || !data.session || !data.user) throw new AppError(401, 'אימייל או סיסמה שגויים')

    /* מנהל-על מבוסס-אימייל — אינו דורש רשומת users / ערך enum / is_active */
    if (isSuperAdminEmail(data.user.email)) {
      res.json({
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at,
        },
        staff: { userId: data.user.id, name: 'מנהל-על', role: 'super_admin', schoolId: null, email },
      })
      return
    }

    const withShare = await hasCanShare()
    const withApproval = await hasApprovalStatus()
    const { data: userRowRaw, error: uErr } = await supabaseAdmin
      .from('users')
      .select('id, name, role, school_id' + (withShare ? ', can_share' : '') + (withApproval ? ', approval_status' : ''))
      .eq('auth_id', data.user.id)
      .single()
    const userRow = userRowRaw as unknown as { id: string; name: string; role: string; school_id: string | null; can_share?: boolean; approval_status?: string | null } | null
    if (uErr || !userRow) throw new AppError(403, 'המשתמש אינו מורה/מנהל רשום')
    if (!['teacher', 'admin', 'municipal_admin', 'super_admin'].includes(userRow.role)) {
      throw new AppError(403, 'אין הרשאת צוות')
    }
    /* מצטרף לבית ספר קיים שטרם אושר — לא מחזירים session בכלל (גם לא "מושבת" גנרי) */
    if (userRow.approval_status === 'pending') {
      throw new AppError(403, 'ההרשמה התקבלה וממתינה לאישור מנהל בית הספר — תקבלו גישה ברגע שהבקשה תאושר', 'PENDING_APPROVAL')
    }
    if (!(await isUserActive(userRow.id))) throw new AppError(403, 'החשבון הושבת — פנה למנהל המערכת')

    res.json({
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
      staff: {
        userId: userRow.id,
        name: userRow.name,
        role: userRow.role,
        schoolId: userRow.school_id,
        email,
        canShare: userRow.can_share !== false, /* תצוגה בלבד — האכיפה בשרת */
      },
    })
  } catch (err) {
    next(err)
  }
})

/* POST /api/auth/guest-login — כניסה כמורה אורח ללא סיסמה (חשבון הדגמה).
   האישורים נקראים מ-env: GUEST_EMAIL / GUEST_PASSWORD (ברירת מחדל: teacher@demo.com / demo1234).
   אם החשבון לא קיים או הסיסמה שגויה, מחזיר 503 במקום 401. */
authRouter.post('/auth/guest-login', rateLimitByIp('guest-login', 10), async (req, res, next) => {
  try {
    const email = process.env.GUEST_EMAIL || 'teacher@demo.com'
    const password = process.env.GUEST_PASSWORD || 'demo1234'

    const { data, error } = await supabaseAnon.auth.signInWithPassword({ email, password })
    if (error || !data.session || !data.user) throw new AppError(503, 'כניסת אורח אינה זמינה כרגע — פנה למנהל')

    const { data: userRow, error: uErr } = await supabaseAdmin
      .from('users').select('id, name, role, school_id').eq('auth_id', data.user.id).single()
    if (uErr || !userRow) throw new AppError(503, 'חשבון האורח לא הוגדר — פנה למנהל')

    res.json({
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
      staff: { userId: userRow.id, name: 'מורה אורח', role: userRow.role, schoolId: userRow.school_id, email, isGuest: true },
    })
  } catch (err) {
    next(err)
  }
})

/* GET /api/class/:urlCode — שלב 1: פרטי כיתה ורשימת תלמידים (ללא PIN!) */
authRouter.get('/class/:urlCode', async (req, res, next) => {
  try {
    const { urlCode } = req.params

    const { data: cls, error: classError } = await supabaseAdmin
      .from('classes')
      .select('id, name, school_id, schools(name)')
      .eq('url_code', urlCode)
      .single()

    if (classError || !cls) throw new AppError(404, 'כיתה לא נמצאה')

    /* תלמידי הכיתה דרך class_members — בלי להחזיר את ה-PIN */
    const { data: members, error: membersError } = await supabaseAdmin
      .from('class_members')
      .select('users(id, name, role)')
      .eq('class_id', cls.id)

    if (membersError) throw new AppError(500, 'שגיאה בשליפת תלמידים')

    /* רק תלמידים — לא המורה. (תלמיד מושבת נחסם בעת ההתחברות עצמה ב-student-login) */
    const students = (members ?? [])
      .map((m) => m.users)
      .flat()
      .filter(Boolean)
      .filter((u: { role: string }) => u.role === 'student')
      .map((u: { id: string; name: string }) => ({ id: u.id, name: u.name }))

    const school = Array.isArray(cls.schools) ? cls.schools[0] : cls.schools

    res.json({
      class: { id: cls.id, name: cls.name },
      school: { name: school?.name ?? '' },
      students,
    })
  } catch (err) {
    next(err)
  }
})

const loginSchema = z.object({
  studentId: z.string().min(1),
  pin: z.string().min(1),
})

/* POST /api/auth/student-login — שלב 2: אימות PIN והנפקת JWT.
   הגנת brute-force כפולה: פר-IP (middleware) + נעילת-תלמיד מדורגת אחרי 5 PINs
   שגויים — כל נעילה עוקבת ארוכה פי-3 (1דק׳→3→9…, תקרה 30דק׳). נספרים כשלונות
   בלבד — התחברות תקינה לא ננעלת. */
const STUDENT_PIN_MAX_FAILS = 5
authRouter.post('/auth/student-login', rateLimitByIp('student-login', 20), async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) throw new AppError(400, 'בקשה לא תקינה')

    const { studentId, pin } = parsed.data
    if (isLocked('student-pin', studentId, STUDENT_PIN_MAX_FAILS)) {
      throw new AppError(429, RATE_LIMIT_MESSAGE)
    }

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, role, pin, class_members(class_id)')
      .eq('id', studentId)
      .single()

    if (error || !user) throw new AppError(401, 'תלמיד לא נמצא')
    if (!(await isUserActive(user.id))) throw new AppError(403, 'החשבון הושבת — פנה למורה')
    if (String(user.pin) !== String(pin)) {
      recordFailure('student-pin', studentId, STUDENT_PIN_MAX_FAILS)
      throw new AppError(401, 'קוד PIN שגוי')
    }

    const secret = process.env.JWT_SECRET
    if (!secret) throw new AppError(500, 'JWT_SECRET לא מוגדר')

    const membership = Array.isArray(user.class_members)
      ? user.class_members[0]
      : user.class_members

    /* טוקן בתוקף 12 שעות */
    const token = jwt.sign(
      {
        userId: user.id,
        role: user.role,
        classId: membership?.class_id ?? null,
      },
      secret,
      { expiresIn: '12h' },
    )

    res.json({ token })
  } catch (err) {
    next(err)
  }
})
