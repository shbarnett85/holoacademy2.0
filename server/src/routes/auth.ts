import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { supabaseAdmin, supabaseAnon } from '../lib/supabase.js'
import { AppError } from '../middleware/errors.js'
import { isUserActive, isSuperAdminEmail } from '../middleware/staffAuth.js'
import { rateLimitByIp, recordFailure, isLocked, RATE_LIMIT_MESSAGE } from '../middleware/rateLimit.js'

export const authRouter = Router()

/* GET /api/schools — רשימת בתי ספר לטופס ההרשמה (פתוח) */
authRouter.get('/schools', async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin.from('schools').select('id, name').order('name')
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
  role: z.enum(['teacher', 'admin']),
  schoolId: z.string().uuid(),
})

/* POST /api/auth/staff-signup — יצירת מורה/מנהל (MVP: signup פתוח) */
authRouter.post('/auth/staff-signup', rateLimitByIp('staff-signup', 5), async (req, res, next) => {
  try {
    const parsed = staffSignupSchema.safeParse(req.body)
    if (!parsed.success) throw new AppError(400, 'בקשה לא תקינה: ' + parsed.error.message)
    const { email, password, name, role, schoolId } = parsed.data

    /* 1) יצירת משתמש ב-Supabase Auth (admin API, service_role) */
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createErr || !created.user) {
      throw new AppError(400, 'יצירת המשתמש נכשלה: ' + (createErr?.message ?? 'שגיאה'))
    }

    /* 2) רשומה בטבלת users עם auth_id מקושר */
    const { data: userRow, error: insErr } = await supabaseAdmin
      .from('users')
      .insert({ name, role, school_id: schoolId, auth_id: created.user.id })
      .select('id, name, role, school_id')
      .single()
    if (insErr || !userRow) {
      /* ניקוי משתמש ה-auth כדי לא להשאיר יתום */
      await supabaseAdmin.auth.admin.deleteUser(created.user.id).catch(() => {})
      throw new AppError(500, 'יצירת רשומת המשתמש נכשלה: ' + (insErr?.message ?? ''))
    }

    res.status(201).json({ ok: true, user: userRow })
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

    const { data: userRow, error: uErr } = await supabaseAdmin
      .from('users')
      .select('id, name, role, school_id')
      .eq('auth_id', data.user.id)
      .single()
    if (uErr || !userRow) throw new AppError(403, 'המשתמש אינו מורה/מנהל רשום')
    if (!['teacher', 'admin', 'super_admin'].includes(userRow.role)) {
      throw new AppError(403, 'אין הרשאת צוות')
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
      staff: { userId: userRow.id, name: 'מורה אורח', role: userRow.role, schoolId: userRow.school_id, email },
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
