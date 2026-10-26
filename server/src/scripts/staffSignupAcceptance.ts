/* ── קבלה חיה: הרשמת צוות + אישור הצטרפות + בידוד בין בתי ספר ──────────────────────
   מדמה את התקיפה המקורית (הרשמה כמנהל של בית ספר קיים → קריאת נתוני תלמידים) ובודק שהיא חסומה,
   ושהזרימות הלגיטימיות עובדות: בית ספר חדש (מורה בודד / מנהל), הצטרפות + אישור, דחייה, כשל מייל.

   רץ מול ה-DB החי (משותף לפרודקשן!) אבל *בתוך התהליך*: מרכיב את הנתיבים האמיתיים (auth/staff/quests/
   analytics) על פורט אקראי, כך שלא נשלח מייל אמיתי (שליחת האימות מוחלפת בסטאב — Supabase דוחה
   כתובות example.com) ולא נוגעים בשרת הפיתוח/פרודקשן. כל השורות הזמניות עם הקידומת zz-sec-,
   מנוקות בסוף ומאומתות כנקיות. סיסמאות אקראיות בזיכרון בלבד, טוקנים לעולם לא מודפסים.
   הרצה:  npm run signup:accept                                                               */
import '../env.js'
import express from 'express'
import { randomBytes } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { supabaseAdmin, supabaseAnon } from '../lib/supabase.js'
import { authRouter } from '../routes/auth.js'
import { staffRouter } from '../routes/staff.js'
import { questsRouter } from '../routes/quests.js'
import { analyticsRouter } from '../routes/analytics.js'
import { errorHandler } from '../middleware/errors.js'
import { signupMail } from '../lib/staffSignup.js'
import { hasApprovalStatus, hasIsActive } from '../lib/activeColumn.js'

let failed = 0
let total = 0
const check = (name: string, ok: boolean, extra = '') => { total++; if (!ok) failed++; console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  — ' + extra : ''}`) }

const P = 'zz-sec-' + randomBytes(3).toString('hex')
const email = (tag: string) => `${P}-${tag}@example.com`
const track = { users: [] as string[], auths: [] as string[], classes: [] as string[], quests: [] as string[], schools: [] as string[] }

/* ── שרת in-process + סטאב מייל ── */
const sent: { email: string; redirect: string }[] = []
let mailOk = true
signupMail.sendConfirmation = async (to, redirectTo) => {
  sent.push({ email: to, redirect: redirectTo })
  return mailOk ? { ok: true } : { ok: false, error: 'acceptance: simulated mail failure' }
}

const app = express()
app.set('trust proxy', 1)
app.use(express.json())
app.use('/api', authRouter)
app.use('/api/quests', questsRouter)
app.use('/api/staff', staffRouter)
app.use('/api/analytics', analyticsRouter)
app.use(errorHandler)
const server = app.listen(0)
const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`

let ipSeq = 0
/* IP ייחודי לכל בקשה (trust proxy) — כדי שמגבלות הקצב פר-IP לא יפריעו לסדרת הבדיקות */
async function http(method: string, path: string, o: { token?: string; body?: unknown } = {}): Promise<{ status: number; json: any }> { // eslint-disable-line
  ipSeq++
  const r = await fetch(base() + path, {
    method,
    headers: {
      'x-forwarded-for': `10.88.${(ipSeq >> 8) & 255}.${ipSeq & 255}`,
      ...(o.token ? { authorization: 'Bearer ' + o.token } : {}),
      ...(o.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: o.body === undefined ? undefined : JSON.stringify(o.body),
  })
  let json: any = {} // eslint-disable-line
  try { json = await r.json() } catch { /* empty */ }
  return { status: r.status, json }
}

async function findAuth(addr: string) {
  for (let page = 1; page <= 5; page++) {
    const { data } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 })
    const hit = data?.users.find((u) => (u.email ?? '').toLowerCase() === addr.toLowerCase())
    if (hit) return hit
    if (!data || data.users.length < 1000) break
  }
  return undefined
}
const userByAuth = async (authId: string) => (await supabaseAdmin.from('users').select('*').eq('auth_id', authId).maybeSingle()).data as Record<string, any> | null // eslint-disable-line

/* אישור מייל בפועל = לחיצה על הקישור; כאן מדמים ב-admin API */
async function confirmEmail(addr: string) {
  const a = await findAuth(addr)
  if (!a) throw new Error('auth user missing for ' + addr)
  await supabaseAdmin.auth.admin.updateUserById(a.id, { email_confirm: true })
  return a.id
}

/* חשבון צוות מוכן (כאילו עבר אימות ואישור) — לבניית "בית הספר הקורבן" */
async function provision(role: 'admin' | 'teacher', schoolId: string, tag: string) {
  const addr = email(tag)
  const password = randomBytes(18).toString('base64url')
  const { data: au, error } = await supabaseAdmin.auth.admin.createUser({ email: addr, password, email_confirm: true })
  if (error || !au.user) throw new Error('createUser: ' + error?.message)
  track.auths.push(au.user.id)
  const { data: u, error: ue } = await supabaseAdmin.from('users').insert({ name: `${P}-${tag}`, role, school_id: schoolId, auth_id: au.user.id }).select('id').single()
  if (ue || !u) throw new Error('users insert: ' + ue?.message)
  track.users.push(u.id)
  const { data: s, error: se } = await supabaseAnon.auth.signInWithPassword({ email: addr, password })
  if (se || !s.session) throw new Error('signIn: ' + se?.message)
  return { userId: u.id as string, token: s.session.access_token, email: addr, password }
}

/* התחברות דרך הנתיב האמיתי (staff-login) */
const login = (addr: string, password: string) => http('POST', '/api/auth/staff-login', { body: { email: addr, password } })
const signup = (body: Record<string, unknown>) => http('POST', '/api/auth/staff-signup', { body })

const GAME = { entrySceneId: 's0', scenes: [{ id: 's0', title: 'פתיחה', narrative: 'x' }] }

async function main() {
  if (!(await hasApprovalStatus())) throw new Error('חסרה העמודה users.approval_status — הריצו: npm run migrate -- migrations/staff_signup_approval.sql')

  /* ── בית הספר הקורבן: מנהל, מורה, כיתה, תלמיד, הדמיה ── */
  const { data: vs, error: vsErr } = await supabaseAdmin.from('schools').insert({ name: `${P}-victim-school`, slug: `${P}-victim` }).select('id').single()
  if (vsErr || !vs) throw new Error('victim school: ' + vsErr?.message)
  track.schools.push(vs.id)
  const V = vs.id as string
  const adminV = await provision('admin', V, 'admin-v')
  const teacherV = await provision('teacher', V, 'teacher-v')
  const { data: cls } = await supabaseAdmin.from('classes').insert({ name: `${P}-class`, slug: `${P}-class`, school_id: V, url_code: `${P}-class` }).select('id').single()
  track.classes.push(cls!.id)
  const CV = cls!.id as string
  await supabaseAdmin.from('class_teachers').insert({ class_id: CV, teacher_id: teacherV.userId, subject: '', is_homeroom: true })
  const { data: stu } = await supabaseAdmin.from('users').insert({ name: `${P}-student`, role: 'student', school_id: V, pin: '0000' }).select('id').single()
  track.users.push(stu!.id)
  const SV = stu!.id as string
  await supabaseAdmin.from('class_members').insert({ class_id: CV, user_id: SV })
  const { data: q } = await supabaseAdmin.from('quests').insert({ title: `${P}-quest`, game_data: GAME, status: 'draft', created_by: teacherV.userId }).select('id').single()
  track.quests.push(q!.id)
  const QV = q!.id as string

  console.log('— התקיפה המקורית: הרשמה כמנהל של בית ספר קיים —')
  const atkEmail = email('attacker')
  const atkPass = randomBytes(18).toString('base64url')
  const evil = await signup({ email: atkEmail, password: atkPass, name: `${P}-attacker`, role: 'admin', schoolId: V })
  check('role=admin + schoolId של בית ספר קיים: 400 ADMIN_JOIN_FORBIDDEN', evil.status === 400 && evil.json.code === 'ADMIN_JOIN_FORBIDDEN', `status=${evil.status}`)
  check('לא נוצר חשבון Auth ולא נשלח מייל', !(await findAuth(atkEmail)) && sent.length === 0)
  const evil2 = await signup({ email: atkEmail, password: atkPass, name: `${P}-attacker`, role: 'municipal_admin', schoolId: V })
  check('role לא מוכר (municipal_admin) בהרשמה ציבורית: 400', evil2.status === 400 && !(await findAuth(atkEmail)))

  console.log('— הצטרפות לבית ספר קיים כמורה: ממתין, לא מאומת, לא פעיל —')
  const join = await signup({ email: atkEmail, password: atkPass, name: `${P}-attacker`, role: 'teacher', schoolId: V })
  check('הרשמה כמורה לבית ספר קיים: 201, pendingApproval + needsEmailVerification', join.status === 201 && join.json.pendingApproval === true && join.json.needsEmailVerification === true, `status=${join.status}`)
  const joinAuth = await findAuth(atkEmail)
  if (joinAuth) track.auths.push(joinAuth.id)
  const joinRow = joinAuth ? await userByAuth(joinAuth.id) : null
  if (joinRow) track.users.push(joinRow.id)
  check('חשבון Auth נוצר *בלי* אימות מייל (email_confirmed_at ריק)', !!joinAuth && !joinAuth.email_confirmed_at)
  /* ב-DB החי users.is_active עדיין לא קיימת — האכיפה על approval_status; is_active=false נבדק רק כשהעמודה קיימת */
  const hasActiveCol = await hasIsActive('users')
  check(`שורת users: teacher, approval_status=pending, בית הספר הנכון${hasActiveCol ? ', is_active=false' : ' (is_active: עמודה לא קיימת ב-DB)'}`,
    joinRow?.role === 'teacher' && joinRow?.approval_status === 'pending' && joinRow?.school_id === V && (!hasActiveCol || joinRow?.is_active === false))
  check('נשלח מייל אימות אחד, עם יעד חזרה לעמוד ההתחברות', sent.length === 1 && sent[0].email === atkEmail && /\/staff\/login\?verified=1$/.test(sent[0].redirect))

  const l1 = await login(atkEmail, atkPass)
  check('התחברות לפני אימות המייל: 403 EMAIL_NOT_CONFIRMED, בלי session', l1.status === 403 && l1.json.code === 'EMAIL_NOT_CONFIRMED' && !l1.json.session)

  await confirmEmail(atkEmail) /* "לחיצה על הקישור" */
  const l2 = await login(atkEmail, atkPass)
  check('אחרי אימות מייל אך לפני אישור מנהל: 403 PENDING_APPROVAL, בלי session', l2.status === 403 && l2.json.code === 'PENDING_APPROVAL' && !l2.json.session)

  /* גם JWT תקף שנמשך ישירות מ-Supabase Auth (מה שהתוקף יכול להשיג לבד) לא פותח דבר */
  const direct = await supabaseAnon.auth.signInWithPassword({ email: atkEmail, password: atkPass })
  const pendTok = direct.data.session?.access_token
  check('התוקף הצליח לקבל JWT של Supabase (המייל מאומת) — והנתיבים חייבים לחסום אותו', !!pendTok)
  if (pendTok) {
    for (const p of ['/api/staff/classes', '/api/staff/students', '/api/staff/teachers', '/api/quests', '/api/analytics/students']) {
      const r = await http('GET', p, { token: pendTok })
      check(`JWT של בקשה ממתינה → GET ${p}: 403`, r.status === 403, `status=${r.status}`)
    }
  }

  console.log('— התוקף יוצר בית ספר חדש כמנהל (נשאר פתוח) ומנסה להגיע אל בית הספר הקורבן —')
  const atk2Email = email('attacker-admin')
  const atk2Pass = randomBytes(18).toString('base64url')
  const mine = await signup({ email: atk2Email, password: atk2Pass, name: `${P}-attacker-admin`, role: 'admin', newSchoolName: `${P}-atk-school` })
  check('בית ספר חדש כמנהל: 201, לא ממתין', mine.status === 201 && mine.json.pendingApproval === false, `status=${mine.status}`)
  const atk2Auth = await findAuth(atk2Email)
  if (atk2Auth) track.auths.push(atk2Auth.id)
  const atk2Row = atk2Auth ? await userByAuth(atk2Auth.id) : null
  if (atk2Row) { track.users.push(atk2Row.id); if (atk2Row.school_id) track.schools.push(atk2Row.school_id) }
  check('המנהל החדש בבית ספר משלו (לא הקורבן), מייל לא מאומת', !!atk2Row && atk2Row.role === 'admin' && atk2Row.school_id !== V && !atk2Auth?.email_confirmed_at)
  check('התחברות לפני אימות: 403', (await login(atk2Email, atk2Pass)).status === 403)
  await confirmEmail(atk2Email)
  const atkLogin = await login(atk2Email, atk2Pass)
  check('אחרי אימות מייל: התחברות מצליחה כ-admin', atkLogin.status === 200 && atkLogin.json.staff?.role === 'admin' && atkLogin.json.staff?.schoolId !== V)
  const AT: string = atkLogin.json.session?.access_token
  if (!AT) throw new Error('אין טוקן למנהל התוקף — לא ניתן להמשיך')

  const reqs = await http('GET', '/api/staff/teacher-requests', { token: AT })
  check('המנהל הזר לא רואה את בקשות ההצטרפות של בית הספר הקורבן', reqs.status === 200 && !JSON.stringify(reqs.json).includes(joinRow?.id ?? 'x'))
  check('אישור בקשה של בית ספר זר: 404', (await http('POST', `/api/staff/teacher-requests/${joinRow?.id}/approve`, { token: AT })).status === 404)
  check('דחיית בקשה של בית ספר זר: 404', (await http('POST', `/api/staff/teacher-requests/${joinRow?.id}/reject`, { token: AT })).status === 404)
  check('"הפעלה" של הבקשה הממתינה ע"י מנהל זר: 403', (await http('POST', `/api/staff/teachers/${joinRow?.id}/reactivate`, { token: AT })).status === 403)
  check('השבתת מורה של בית ספר זר: 403', (await http('POST', `/api/staff/teachers/${teacherV.userId}/deactivate`, { token: AT })).status === 403)
  check('איפוס PIN לתלמיד של בית ספר זר: 403', (await http('POST', `/api/staff/students/${SV}/reset-pin`, { token: AT })).status === 403)
  check('רשימת תלמידי הכיתה הזרה: 403', (await http('GET', `/api/staff/classes/${CV}/students`, { token: AT })).status === 403)
  check('שיוך עצמי כמחנך לכיתה זרה: 403', (await http('POST', `/api/staff/classes/${CV}/teachers`, { token: AT, body: { teacherId: atk2Row?.id, isHomeroom: true } })).status === 403)
  const cl = await http('GET', '/api/staff/classes', { token: AT })
  check('רשימת הכיתות של התוקף לא כוללת את הכיתה הזרה', cl.status === 200 && !JSON.stringify(cl.json).includes(CV))
  const st = await http('GET', '/api/staff/students', { token: AT })
  check('רשימת התלמידים של התוקף לא כוללת את התלמיד הזר', st.status === 200 && !JSON.stringify(st.json).includes(SV) && !JSON.stringify(st.json).includes(`${P}-student`))
  const an = await http('GET', '/api/analytics/students', { token: AT })
  check('אנליטיקה: אין נתוני תלמיד זר', !JSON.stringify(an.json).includes(SV) && !JSON.stringify(an.json).includes(`${P}-student`), `status=${an.status}`)
  const an2 = await http('GET', `/api/analytics/student/${SV}`, { token: AT })
  check('drill-down לתלמיד זר: לא 200', an2.status === 403 || an2.status === 404, `status=${an2.status}`)
  const mk = await http('POST', '/api/staff/teachers', { token: AT, body: { email: email('atk-teacher'), password: randomBytes(12).toString('base64url'), name: `${P}-atk-teacher` } })
  const mkAuth = await findAuth(email('atk-teacher'))
  if (mkAuth) track.auths.push(mkAuth.id)
  const mkRow = mkAuth ? await userByAuth(mkAuth.id) : null
  if (mkRow) track.users.push(mkRow.id)
  check('מורה שהתוקף יוצר נוצר רק בבית הספר של התוקף', mk.status === 201 && mkRow?.school_id === atk2Row?.school_id && mkRow?.school_id !== V)

  console.log('— שיעורים: מנהל זר כבר לא עוקף בעלות —')
  const ql = await http('GET', '/api/quests', { token: AT })
  check('ספריית השיעורים של המנהל הזר לא כוללת את השיעור הזר', ql.status === 200 && !JSON.stringify(ql.json).includes(QV))
  const qd = await http('DELETE', `/api/quests/${QV}`, { token: AT })
  check('מחיקת שיעור זר: 403', qd.status === 403, `status=${qd.status}`)
  check('PATCH על שיעור זר: 403', (await http('PATCH', `/api/quests/${QV}`, { token: AT, body: { title: 'hijacked' } })).status === 403)
  const stillThere = await supabaseAdmin.from('quests').select('id, title').eq('id', QV).maybeSingle()
  check('השיעור הזר לא נמחק ולא שונה', stillThere.data?.id === QV && stillThere.data?.title === `${P}-quest`)
  const qlOwn = await http('GET', '/api/quests', { token: adminV.token })
  check('בקרה חיובית: מנהל בית הספר עצמו רואה את שיעורי בית הספר שלו', qlOwn.status === 200 && JSON.stringify(qlOwn.json).includes(QV))
  const qpOwn = await http('PATCH', `/api/quests/${QV}`, { token: adminV.token, body: { title: `${P}-quest` } })
  check('בקרה חיובית: מנהל בית הספר רשאי לערוך שיעור של מורה בבית ספרו', qpOwn.status === 200, `status=${qpOwn.status}`)

  console.log('— מנהל בית הספר מאשר את הבקשה —')
  const lst = await http('GET', '/api/staff/teacher-requests', { token: adminV.token })
  const mine1 = (lst.json.requests ?? []).find((r: any) => r.id === joinRow?.id) // eslint-disable-line
  check('המנהל רואה את הבקשה עם אימייל ואימות מייל', lst.status === 200 && mine1?.email === atkEmail && mine1?.emailVerified === true)
  const tl = await http('GET', '/api/staff/teachers', { token: adminV.token })
  check('בקשה ממתינה לא מופיעה ברשימת המורים הרגילה', tl.status === 200 && !JSON.stringify(tl.json).includes(joinRow?.id ?? 'x'))
  check('"הפעלה" רגילה של בקשה ממתינה, גם ע"י מנהל בית הספר: 409', (await http('POST', `/api/staff/teachers/${joinRow?.id}/reactivate`, { token: adminV.token })).status === 409)

  /* בקשה שנייה — מייל לא מאומת: אישור נדחה; דחייה מוחקת הכול */
  const j2Email = email('joiner2')
  const j2 = await signup({ email: j2Email, password: randomBytes(12).toString('base64url'), name: `${P}-joiner2`, role: 'teacher', schoolId: V })
  const j2Auth = await findAuth(j2Email)
  if (j2Auth) track.auths.push(j2Auth.id)
  const j2Row = j2Auth ? await userByAuth(j2Auth.id) : null
  if (j2Row) track.users.push(j2Row.id)
  check('בקשה עם מייל לא מאומת נוצרה', j2.status === 201 && !!j2Row)
  const ap2 = await http('POST', `/api/staff/teacher-requests/${j2Row?.id}/approve`, { token: adminV.token })
  check('אישור בקשה עם מייל לא מאומת: 409', ap2.status === 409)
  const rj2 = await http('POST', `/api/staff/teacher-requests/${j2Row?.id}/reject`, { token: adminV.token })
  check('דחייה: 200, השורה וחשבון ה-Auth נמחקו', rj2.status === 200 && !(await userByAuth(j2Auth!.id)) && !(await findAuth(j2Email)))

  const ap = await http('POST', `/api/staff/teacher-requests/${joinRow?.id}/approve`, { token: adminV.token })
  check('אישור הבקשה המאומתת: 200', ap.status === 200, `status=${ap.status}`)
  const afterRow = await userByAuth(joinAuth!.id)
  check('approval_status נוקה והמורה פעיל', afterRow?.approval_status === null && (!hasActiveCol || afterRow?.is_active === true) && afterRow?.role === 'teacher')
  const l3 = await login(atkEmail, atkPass)
  check('אחרי האישור: התחברות מצליחה כ-teacher של בית הספר', l3.status === 200 && l3.json.staff?.role === 'teacher' && l3.json.staff?.schoolId === V)
  const T3: string = l3.json.session?.access_token
  if (T3) {
    const c3 = await http('GET', '/api/staff/classes', { token: T3 })
    check('המורה שאושר רואה רק את כיתותיו (אין עדיין) — לא את הכיתה של המורה האחר', c3.status === 200 && !JSON.stringify(c3.json).includes(CV))
    const s3 = await http('GET', '/api/staff/students', { token: T3 })
    check('המורה שאושר לא רואה תלמידים של כיתות שלא שויך אליהן', s3.status === 200 && !JSON.stringify(s3.json).includes(SV))
    const a3 = await http('GET', '/api/analytics/students', { token: T3 })
    check('אנליטיקה: המורה שאושר לא רואה את התלמיד', !JSON.stringify(a3.json).includes(SV), `status=${a3.status}`)
    check('המורה שאושר לא יכול לשייך את עצמו כמחנך', (await http('POST', `/api/staff/classes/${CV}/teachers`, { token: T3, body: { teacherId: joinRow?.id, isHomeroom: true } })).status === 403)
  }

  console.log('— זרימות קיימות שחייבות להמשיך לעבוד —')
  const soloEmail = email('solo')
  const soloPass = randomBytes(18).toString('base64url')
  const solo = await signup({ email: soloEmail, password: soloPass, name: `${P}-solo`, role: 'teacher', newSchoolName: `${P}-solo-school` })
  check('מורה בודד בבית ספר חדש: 201', solo.status === 201 && solo.json.pendingApproval === false)
  const soloAuth = await findAuth(soloEmail)
  if (soloAuth) track.auths.push(soloAuth.id)
  const soloRow = soloAuth ? await userByAuth(soloAuth.id) : null
  if (soloRow) { track.users.push(soloRow.id); if (soloRow.school_id) track.schools.push(soloRow.school_id) }
  check('המורה הבודד נשאר teacher (לא מנהל) ופעיל', soloRow?.role === 'teacher' && soloRow?.is_active !== false && (soloRow?.approval_status ?? null) === null)
  await confirmEmail(soloEmail)
  const soloLogin = await login(soloEmail, soloPass)
  check('אחרי אימות מייל המורה הבודד מתחבר', soloLogin.status === 200 && soloLogin.json.staff?.role === 'teacher')
  const mkc = await http('POST', '/api/staff/classes', { token: soloLogin.json.session?.access_token, body: { name: 'ז׳1', slug: 'zz' + randomBytes(2).toString('hex'), gradeLevel: 7 } })
  if (mkc.json.class?.id) track.classes.push(mkc.json.class.id)
  const { data: link } = await supabaseAdmin.from('class_teachers').select('is_homeroom').eq('class_id', mkc.json.class?.id ?? '')
  check('המורה הבודד יוצר כיתה ונרשם כמחנך שלה', mkc.status === 201 && link?.[0]?.is_homeroom === true, `status=${mkc.status}`)

  const dup = await signup({ email: soloEmail, password: soloPass, name: 'dup', role: 'teacher', newSchoolName: `${P}-dup-school` })
  check('אימייל קיים: 409 EMAIL_EXISTS', dup.status === 409 && dup.json.code === 'EMAIL_EXISTS')
  const { data: dupSchool } = await supabaseAdmin.from('schools').select('id').eq('name', `${P}-dup-school`)
  check('הרשמה כושלת לא משאירה בית ספר יתום', (dupSchool ?? []).length === 0)

  mailOk = false
  const failEmail = email('mailfail')
  const mf = await signup({ email: failEmail, password: randomBytes(12).toString('base64url'), name: `${P}-mailfail`, role: 'admin', newSchoolName: `${P}-mailfail-school` })
  mailOk = true
  const { data: mfSchool } = await supabaseAdmin.from('schools').select('id').eq('name', `${P}-mailfail-school`)
  check('כשל בשליחת מייל: 503 EMAIL_SEND_FAILED', mf.status === 503 && mf.json.code === 'EMAIL_SEND_FAILED', `status=${mf.status}`)
  check('וכל מה שנוצר בוטל (חשבון Auth, users, בית ספר)', !(await findAuth(failEmail)) && (mfSchool ?? []).length === 0)

  const rs = await http('POST', '/api/auth/resend-confirmation', { body: { email: atkEmail } })
  check('resend-confirmation: 200 ושולח דרך ערוץ המייל', rs.status === 200 && sent[sent.length - 1]?.email === atkEmail)

  const guest = await http('POST', '/api/auth/guest-login')
  check('כניסת מורה אורח ממשיכה לעבוד (או לא מוגדרת ב-env: 503)', (guest.status === 200 && guest.json.staff?.isGuest === true) || guest.status === 503, `status=${guest.status}`)
}

/* ── ניקוי + אימות שלא נשאר דבר ── */
async function cleanupAll(): Promise<void> {
  const like = `${P}%`
  const { data: sc } = await supabaseAdmin.from('schools').select('id').ilike('name', like)
  for (const s of sc ?? []) if (!track.schools.includes(s.id)) track.schools.push(s.id)
  if (track.schools.length) {
    const { data: us } = await supabaseAdmin.from('users').select('id').in('school_id', track.schools)
    for (const u of us ?? []) if (!track.users.includes(u.id)) track.users.push(u.id)
    const { data: cs } = await supabaseAdmin.from('classes').select('id').in('school_id', track.schools)
    for (const c of cs ?? []) if (!track.classes.includes(c.id)) track.classes.push(c.id)
  }
  const { data: qs } = await supabaseAdmin.from('quests').select('id').ilike('title', like)
  for (const x of qs ?? []) if (!track.quests.includes(x.id)) track.quests.push(x.id)
  const { data: un } = await supabaseAdmin.from('users').select('id, auth_id').ilike('name', like)
  for (const u of un ?? []) { if (!track.users.includes(u.id)) track.users.push(u.id); if (u.auth_id && !track.auths.includes(u.auth_id)) track.auths.push(u.auth_id) }

  if (track.quests.length) await supabaseAdmin.from('quests').delete().in('id', track.quests)
  if (track.classes.length) {
    await supabaseAdmin.from('class_teachers').delete().in('class_id', track.classes)
    await supabaseAdmin.from('class_members').delete().in('class_id', track.classes)
    await supabaseAdmin.from('classes').delete().in('id', track.classes)
  }
  if (track.users.length) {
    await supabaseAdmin.from('class_teachers').delete().in('teacher_id', track.users)
    await supabaseAdmin.from('class_members').delete().in('user_id', track.users)
    await supabaseAdmin.from('users').delete().in('id', track.users)
  }
  for (const a of track.auths) await supabaseAdmin.auth.admin.deleteUser(a).catch(() => {})
  /* חשבונות Auth שנוצרו ע"י הנתיבים ולא נרשמו (כשל באמצע) — סריקה לפי קידומת האימייל */
  for (let page = 1; page <= 5; page++) {
    const { data } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 })
    for (const u of data?.users ?? []) if ((u.email ?? '').toLowerCase().startsWith(P.toLowerCase())) await supabaseAdmin.auth.admin.deleteUser(u.id).catch(() => {})
    if (!data || data.users.length < 1000) break
  }
  if (track.schools.length) await supabaseAdmin.from('schools').delete().in('id', track.schools)
}

async function verifyClean(): Promise<boolean> {
  const like = `${P}%`
  const counts: Record<string, number> = {}
  counts.schools = (await supabaseAdmin.from('schools').select('id').ilike('name', like)).data?.length ?? -1
  counts.users = (await supabaseAdmin.from('users').select('id').ilike('name', like)).data?.length ?? -1
  counts.usersInTempSchools = track.schools.length ? ((await supabaseAdmin.from('users').select('id').in('school_id', track.schools)).data?.length ?? -1) : 0
  counts.classes = (await supabaseAdmin.from('classes').select('id').ilike('name', like)).data?.length ?? -1
  counts.quests = (await supabaseAdmin.from('quests').select('id').ilike('title', like)).data?.length ?? -1
  let auth = 0
  for (let page = 1; page <= 5; page++) {
    const { data } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 })
    auth += (data?.users ?? []).filter((u) => (u.email ?? '').toLowerCase().startsWith(P.toLowerCase())).length
    if (!data || data.users.length < 1000) break
  }
  counts.authUsers = auth
  const clean = Object.values(counts).every((n) => n === 0)
  console.log(`${clean ? '✓' : '✗'} ניקוי (${P}*): ` + Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' '))
  return clean
}

let crashed = false
try {
  await main()
} catch (e) {
  crashed = true
  console.error('✗ הבדיקה קרסה:', e instanceof Error ? e.message : e)
} finally {
  await cleanupAll()
  const clean = await verifyClean()
  server.close()
  if (!clean) failed++
  console.log(`\n${failed === 0 && !crashed ? '✅' : '❌'} ${total - failed}/${total} בדיקות עברו${crashed ? ' (הריצה קרסה)' : ''}`)
  process.exit(failed === 0 && !crashed ? 0 : 1)
}
