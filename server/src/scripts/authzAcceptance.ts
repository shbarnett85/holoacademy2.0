/* ── קבלה חיה: מטריצת ההרשאות של האנליטיקה (שלב 1A) ────────────────────────────
   רץ מול השרת המקומי ומול ה-DB. יוצר ארגון זמני (zz-authz-*) עם כיתות, מורים (מחנך /
   מקצועי / מכיתה אחרת), מנהל ומנהל עירוני, תלמידים, הדמיות במקצועות שונים וסשנים, ואז
   בודק תפקיד × פעולה × (בכיתה / לא) × (המקצוע שלו / אחר) ברמת ה-HTTP. מנקה אחריו הכול.
   סיסמאות אקראיות בזיכרון בלבד. לא מפעיל שום LLM.  הרצה:  npm run authz:accept          */
import '../env.js'
import { randomBytes } from 'node:crypto'
import { supabaseAdmin, supabaseAnon } from '../lib/supabase.js'
import { recalibrateProfile } from '../lib/profileCalibration.js'
import { hasIsActive } from '../lib/activeColumn.js'

const API = process.env.ACCEPT_API ?? 'http://localhost:3001/api'
let failed = 0
let total = 0
const check = (name: string, ok: boolean, extra = '') => { total++; if (!ok) failed++; console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  — ' + extra : ''}`) }

interface Tok { userId: string; token: string }
const cleanup = { users: [] as string[], auths: [] as string[], classes: [] as string[], quests: [] as string[], school: '' }
let selfSchool = ''

async function api(token: string, method: string, p: string, body?: unknown): Promise<{ status: number; json: any }> { // eslint-disable-line
  const r = await fetch(API + p, {
    method, headers: { Authorization: 'Bearer ' + token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let json: any = {} // eslint-disable-line
  try { json = await r.json() } catch { /* empty */ }
  return { status: r.status, json }
}

async function mkStaff(schoolId: string, role: string, label: string): Promise<Tok> {
  const email = `zz-authz-${label}-${randomBytes(3).toString('hex')}@example.com`
  const password = randomBytes(18).toString('base64url')
  const { data: au, error } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !au.user) throw new Error('createUser: ' + error?.message)
  cleanup.auths.push(au.user.id)
  const act = (await hasIsActive('users')) ? { is_active: true } : {}
  const { data: u, error: ue } = await supabaseAdmin.from('users')
    .insert({ name: 'zz-authz ' + label, role, school_id: schoolId, auth_id: au.user.id, can_share: false, ...act }).select('id').single()
  if (ue || !u) throw new Error('users insert: ' + ue?.message)
  cleanup.users.push(u.id)
  const { data: s, error: se } = await supabaseAnon.auth.signInWithPassword({ email, password })
  if (se || !s.session) throw new Error('signIn: ' + se?.message)
  return { userId: u.id, token: s.session.access_token }
}

async function mkClass(schoolId: string, label: string): Promise<string> {
  const code = `zz-authz-${label}-${randomBytes(2).toString('hex')}`
  const { data, error } = await supabaseAdmin.from('classes').insert({ name: 'zz ' + label, slug: code, school_id: schoolId, url_code: code }).select('id').single()
  if (error || !data) throw new Error('class: ' + error?.message)
  cleanup.classes.push(data.id)
  return data.id
}

async function mkStudent(schoolId: string, classId: string, n: string): Promise<string> {
  const { data, error } = await supabaseAdmin.from('users').insert({ name: 'zz-authz stu ' + n, role: 'student', school_id: schoolId, pin: '0000' }).select('id').single()
  if (error || !data) throw new Error('student: ' + error?.message)
  cleanup.users.push(data.id)
  await supabaseAdmin.from('class_members').insert({ class_id: classId, user_id: data.id })
  return data.id
}

const GAME = {
  entrySceneId: 's0',
  scenes: [
    { id: 's0', title: 'פתיחה', narrative: 'x', nextSceneId: 's1' },
    { id: 's1', title: 'חידה', narrative: 'y', puzzle: { type: 'multipleChoice', question: 'q', difficulty: 5, choices: [{ id: 'a', text: 'א', isCorrect: true }, { id: 'b', text: 'ב', isCorrect: false }] } },
  ],
}

async function main() {
  const { data: subs } = await supabaseAdmin.from('subjects').select('id, code')
  const sid = (code: string) => (subs ?? []).find((s) => s.code === code)!.id as string
  const MATH = sid('math'), HIST = sid('history')

  const slug = 'zz-authz-' + randomBytes(3).toString('hex')
  const { data: school, error: sErr } = await supabaseAdmin.from('schools').insert({ name: slug, slug }).select('id').single()
  if (sErr || !school) throw new Error('school: ' + sErr?.message)
  cleanup.school = school.id

  try {
    const tHome = await mkStaff(school.id, 'teacher', 'home')
    const tMath = await mkStaff(school.id, 'teacher', 'math')
    const tHist = await mkStaff(school.id, 'teacher', 'hist')
    const tOut = await mkStaff(school.id, 'teacher', 'outsider')
    const admin = await mkStaff(school.id, 'admin', 'admin')
    const mun = await mkStaff(school.id, 'municipal_admin', 'mun')

    const clsA = await mkClass(school.id, 'A')   // 6 תלמידים
    const clsB = await mkClass(school.id, 'B')   // כיתה אחרת
    const clsC = await mkClass(school.id, 'C')   // 3 תלמידים — מתחת לסף
    const link = (class_id: string, teacher_id: string, o: { subject?: string; subject_id?: string | null; is_homeroom?: boolean } = {}) =>
      ({ class_id, teacher_id, subject: o.subject ?? '', subject_id: o.subject_id ?? null, is_homeroom: o.is_homeroom ?? false })
    const { error: ctErr } = await supabaseAdmin.from('class_teachers').insert([
      link(clsA, tHome.userId, { is_homeroom: true }),
      link(clsA, tMath.userId, { subject: 'מתמטיקה', subject_id: MATH }),
      link(clsA, tHist.userId, { subject: 'היסטוריה', subject_id: HIST }),
      link(clsB, tOut.userId, { is_homeroom: true }),
      link(clsC, tHome.userId, { is_homeroom: true }),
      link(clsC, tMath.userId, { subject: 'מתמטיקה', subject_id: MATH }),
    ])
    if (ctErr) throw new Error('class_teachers insert: ' + ctErr.message)

    const stuA: string[] = []
    for (let i = 0; i < 6; i++) stuA.push(await mkStudent(school.id, clsA, 'A' + i))
    const stuC: string[] = []
    for (let i = 0; i < 3; i++) stuC.push(await mkStudent(school.id, clsC, 'C' + i))
    await mkStudent(school.id, clsB, 'B0')

    const mkQuest = async (title: string, subjectId: string | null, by: string) => {
      const { data, error } = await supabaseAdmin.from('quests').insert({ title, game_data: GAME, status: 'draft', created_by: by, subject_id: subjectId }).select('id').single()
      if (error || !data) throw new Error('quest: ' + error?.message)
      cleanup.quests.push(data.id)
      return data.id as string
    }
    const qMath = await mkQuest('zz-authz math', MATH, tMath.userId)
    const qHist = await mkQuest('zz-authz history', HIST, tHist.userId)
    const qNone = await mkQuest('zz-authz unclassified', null, tHome.userId)

    const asg = async (classId: string, questId: string, by: string) => {
      const { data, error } = await supabaseAdmin.from('assignments').insert({ class_id: classId, quest_id: questId, user_id: by }).select('id').single()
      if (error || !data) throw new Error('assignment: ' + error?.message)
      return data.id as string
    }
    const aMath = await asg(clsA, qMath, tMath.userId)
    const aHist = await asg(clsA, qHist, tHist.userId)
    const aNone = await asg(clsA, qNone, tHome.userId)
    const aMathC = await asg(clsC, qMath, tMath.userId)

    const mkSession = async (student: string, questId: string, rate: number) => {
      const { data: s } = await supabaseAdmin.from('sessions').insert({
        user_id: student, quest_id: questId, started_at: new Date(Date.now() - 3600e3).toISOString(),
        completed_at: new Date().toISOString(), total_score: rate, max_score: 1, inventory: [], visited_scenes: ['s0', 's1'],
      }).select('id').single()
      if (!s) return
      await supabaseAdmin.from('events').insert([
        { session_id: s.id, user_id: student, quest_id: questId, type: rate ? 'puzzle_solved' : 'puzzle_failed', scene_id: 's1', payload: { puzzleType: 'multipleChoice', difficulty: 5, attempts: 1, solveTimeMs: 9000, shards: rate } },
        { session_id: s.id, user_id: student, quest_id: questId, type: 'session_completed', scene_id: null, payload: { successRate: rate, avgSceneMs: 12000, crystalsEarned: rate * 5, completed: true, durationMs: 60000, totalChallenges: 1, correctChallenges: rate, scenesVisited: 2 } },
      ])
    }
    for (const [i, st] of stuA.entries()) {
      await mkSession(st, qMath, i % 2)
      await mkSession(st, qHist, 1)
      await mkSession(st, qNone, 1)
    }
    for (const st of stuC) await mkSession(st, qMath, 1)

    const s1 = stuA[0]

    /* ── 1) פריט ברמת תלמיד: GET /analytics/student/:id ── */
    console.log('\n— GET /analytics/student/:id —')
    const rHome = await api(tHome.token, 'GET', `/analytics/student/${s1}`)
    check('מחנך: 200, רואה את כל 3 ההדמיות (כולל "לא סווג")', rHome.status === 200 && rHome.json.history?.length === 3 && rHome.json.visibility?.full === true, `status=${rHome.status} history=${rHome.json.history?.length}`)
    const rMath = await api(tMath.token, 'GET', `/analytics/student/${s1}`)
    const mathTitles: string[] = (rMath.json.history ?? []).map((h: any) => h.questTitle) // eslint-disable-line
    check('מורה מתמטיקה: 200, רק היסטוריית מתמטיקה', rMath.status === 200 && mathTitles.length === 1 && /math/.test(mathTitles[0]), JSON.stringify(mathTitles))
    check('מורה מתמטיקה: מקצועות אחרים כשמות בלבד (היסטוריה) וללא פרופיל כללי', (rMath.json.otherSubjects ?? []).some((o: any) => o.name === 'היסטוריה') && rMath.json.profile === null && rMath.json.visibility?.full === false) // eslint-disable-line
    const rHist = await api(tHist.token, 'GET', `/analytics/student/${s1}`)
    check('מורה היסטוריה: רק היסטוריה', rHist.status === 200 && (rHist.json.history ?? []).length === 1 && /history/.test(rHist.json.history[0].questTitle))
    check('מורה מכיתה אחרת: 403', (await api(tOut.token, 'GET', `/analytics/student/${s1}`)).status === 403)
    check('מנהל: 403 (אגרגטים בלבד)', (await api(admin.token, 'GET', `/analytics/student/${s1}`)).status === 403)
    check('מנהל עירוני: 403 (אגרגטים בלבד)', (await api(mun.token, 'GET', `/analytics/student/${s1}`)).status === 403)

    /* ── 2) עדשת התלמידים ── */
    console.log('\n— GET /analytics/students —')
    const lensHome = await api(tHome.token, 'GET', '/analytics/students')
    check('מחנך: רואה 6 תלמידים (+3 מכיתת C)', lensHome.status === 200 && lensHome.json.students.length === 9, `n=${lensHome.json.students?.length}`)
    const lensAdmin = await api(admin.token, 'GET', '/analytics/students')
    check('מנהל: רשימה ריקה + aggregateOnly', lensAdmin.status === 200 && lensAdmin.json.students.length === 0 && lensAdmin.json.aggregateOnly === true)
    const lensMun = await api(mun.token, 'GET', '/analytics/students')
    check('מנהל עירוני: רשימה ריקה + aggregateOnly', lensMun.json.students?.length === 0 && lensMun.json.aggregateOnly === true)
    const lensOut = await api(tOut.token, 'GET', '/analytics/students')
    check('מורה מכיתה אחרת: רואה רק את כיתתו (תלמיד אחד)', lensOut.json.students?.length === 1, `n=${lensOut.json.students?.length}`)

    /* ── 3) דשבורד מטלה ── */
    console.log('\n— GET /analytics/assignment/:id —')
    const dMathByMath = await api(tMath.token, 'GET', `/analytics/assignment/${aMath}`)
    check('מורה מתמטיקה על מטלת מתמטיקה: 200 עם 6 תלמידים', dMathByMath.status === 200 && dMathByMath.json.students.length === 6)
    check('מורה מתמטיקה על מטלת היסטוריה: 403', (await api(tMath.token, 'GET', `/analytics/assignment/${aHist}`)).status === 403)
    check('מחנך על כל המטלות: 200', (await api(tHome.token, 'GET', `/analytics/assignment/${aHist}`)).status === 200 && (await api(tHome.token, 'GET', `/analytics/assignment/${aNone}`)).status === 200)
    check('מורה מכיתה אחרת: 403', (await api(tOut.token, 'GET', `/analytics/assignment/${aMath}`)).status === 403)
    const dAdmin = await api(admin.token, 'GET', `/analytics/assignment/${aMath}`)
    check('מנהל: 200, אגרגט בלבד — בלי תלמידים בודדים, עם אחוז הצלחה (6 ≥ 5)', dAdmin.status === 200 && dAdmin.json.students.length === 0 && dAdmin.json.aggregateOnly === true && dAdmin.json.totals.avgSuccessRate !== null && dAdmin.json.insufficientData === false)
    const dAdminSmall = await api(admin.token, 'GET', `/analytics/assignment/${aMathC}`)
    check('מנהל, כיתה קטנה (3 < 5): "אין מספיק נתונים" — בלי אחוז הצלחה', dAdminSmall.status === 200 && dAdminSmall.json.insufficientData === true && dAdminSmall.json.totals.avgSuccessRate === null && dAdminSmall.json.students.length === 0)
    const dMun = await api(mun.token, 'GET', `/analytics/assignment/${aMath}`)
    check('מנהל עירוני: אגרגט בלבד', dMun.status === 200 && dMun.json.students.length === 0)
    const dTeacherSmall = await api(tMath.token, 'GET', `/analytics/assignment/${aMathC}`)
    check('מורה (גם בכיתה של 3): רואה את תלמידיו', dTeacherSmall.status === 200 && dTeacherSmall.json.students.length === 3)

    /* ── 4) רשימת מטלות ── */
    console.log('\n— GET /analytics/assignments —')
    const lMath = await api(tMath.token, 'GET', '/analytics/assignments')
    const mathIds: string[] = (lMath.json.assignments ?? []).map((a: any) => a.id) // eslint-disable-line
    check('מורה מתמטיקה: רק מטלות מתמטיקה', mathIds.includes(aMath) && mathIds.includes(aMathC) && !mathIds.includes(aHist) && !mathIds.includes(aNone), `n=${mathIds.length}`)
    const lHome = await api(tHome.token, 'GET', '/analytics/assignments')
    const homeIds: string[] = (lHome.json.assignments ?? []).map((a: any) => a.id) // eslint-disable-line
    check('מחנך: כל מטלות כיתתו', [aMath, aHist, aNone, aMathC].every((x) => homeIds.includes(x)))
    const lAdmin = await api(admin.token, 'GET', '/analytics/assignments')
    const adminRows = (lAdmin.json.assignments ?? []) as any[] // eslint-disable-line
    const aSmall = adminRows.find((a) => a.id === aMathC)
    check('מנהל: רשימת מטלות כיתתית; כיתה קטנה — אחוז הצלחה מוסתר', adminRows.length >= 4 && aSmall && aSmall.avgSuccessRate === null)

    /* ── 5) PATCH רמות ── */
    console.log('\n— PATCH /analytics/student/:id/profile —')
    const p1 = await api(tMath.token, 'PATCH', `/analytics/student/${s1}/profile`, { subjectCode: 'math', textLevel: 12 })
    check('מורה מתמטיקה במתמטיקה: 200 + נעילה', p1.status === 200 && p1.json.locked === true)
    const { data: lvl } = await supabaseAdmin.from('student_subject_levels').select('text_level, teacher_locked').eq('student_id', s1).eq('subject_id', MATH).single()
    check('שורת הרמות נכתבה (12, נעולה)', Number(lvl?.text_level) === 12 && lvl?.teacher_locked === true)
    const { data: hist1 } = await supabaseAdmin.from('level_history').select('trigger, actor_id').eq('student_id', s1).eq('subject_id', MATH).eq('trigger', 'teacher')
    check('level_history: trigger=teacher עם actor', (hist1 ?? []).length >= 1 && hist1![0].actor_id === tMath.userId)
    check('מורה מתמטיקה במקצוע היסטוריה: 403', (await api(tMath.token, 'PATCH', `/analytics/student/${s1}/profile`, { subjectCode: 'history', textLevel: 9 })).status === 403)
    check('מורה מתמטיקה ברמה גלובלית (בלי מקצוע): 403', (await api(tMath.token, 'PATCH', `/analytics/student/${s1}/profile`, { textLevel: 9 })).status === 403)
    check('מחנך בכל מקצוע: 200', (await api(tHome.token, 'PATCH', `/analytics/student/${s1}/profile`, { subjectCode: 'history', textLevel: 8 })).status === 200)
    check('מורה מכיתה אחרת: 403', (await api(tOut.token, 'PATCH', `/analytics/student/${s1}/profile`, { subjectCode: 'math', textLevel: 8 })).status === 403)
    check('מנהל: 403', (await api(admin.token, 'PATCH', `/analytics/student/${s1}/profile`, { subjectCode: 'math', textLevel: 8 })).status === 403)
    check('מנהל עירוני: 403', (await api(mun.token, 'PATCH', `/analytics/student/${s1}/profile`, { subjectCode: 'math', textLevel: 8 })).status === 403)
    check('מקצוע לא מוכר: 400', (await api(tHome.token, 'PATCH', `/analytics/student/${s1}/profile`, { subjectCode: 'physics', textLevel: 8 })).status === 400)

    /* ── 6) נעילה: הכיול האוטומטי לא דורס; שחרור מחזיר את הכיול ── */
    console.log('\n— teacher_locked —')
    const allWrong = { multipleChoice: { solved: 0, total: 5 } } as never
    await recalibrateProfile(s1, clsA, allWrong, 20000, { subjectId: MATH })
    const { data: lvl2 } = await supabaseAdmin.from('student_subject_levels').select('text_level').eq('student_id', s1).eq('subject_id', MATH).single()
    check('כיול אוטומטי לא דורס רמה נעולה', Number(lvl2?.text_level) === 12, `text_level=${lvl2?.text_level}`)
    const un = await api(tMath.token, 'PATCH', `/analytics/student/${s1}/profile`, { subjectCode: 'math', unlock: true })
    check('שחרור נעילה', un.status === 200 && un.json.locked === false)
    await recalibrateProfile(s1, clsA, allWrong, 20000, { subjectId: MATH })
    const { data: lvl3 } = await supabaseAdmin.from('student_subject_levels').select('text_level').eq('student_id', s1).eq('subject_id', MATH).single()
    check('אחרי שחרור — הכיול האוטומטי מורד רמה (60/80)', Number(lvl3?.text_level) === 11, `text_level=${lvl3?.text_level}`)

    /* ── 7) מקצוע חדש = פרופיל חדש ברמת הפתיחה, לא מועתק מהגלובלי ── */
    console.log('\n— פרופיל חדש לכל מקצוע —')
    await supabaseAdmin.from('difficulty_profiles').insert({ user_id: stuA[1], text_level: 18, per_puzzle_level: { multipleChoice: 18 } })
    await recalibrateProfile(stuA[1], clsA, { multipleChoice: { solved: 3, total: 5 } } as never, 20000, { subjectId: HIST })
    const { data: newLvl } = await supabaseAdmin.from('student_subject_levels').select('text_level').eq('student_id', stuA[1]).eq('subject_id', HIST).single()
    check('הרמה במקצוע החדש לא הועתקה מהגלובלי (18)', newLvl !== null && Number(newLvl.text_level) !== 18, `text_level=${newLvl?.text_level}`)
    const { data: seeds } = await supabaseAdmin.from('level_history').select('trigger').eq('student_id', stuA[1]).eq('subject_id', HIST).eq('trigger', 'seed')
    check('level_history: שורות trigger=seed למקצוע החדש', (seeds ?? []).length >= 1)

    /* ── 8) יומן גישה ── */
    console.log('\n— data_access_log —')
    const { data: logs } = await supabaseAdmin.from('data_access_log').select('viewer_id, scope, student_id').eq('student_id', s1)
    const scopes = new Set((logs ?? []).map((l) => `${l.viewer_id}:${l.scope}`))
    check('צפיות ברמת תלמיד נרשמו (מחנך, מורה מתמטיקה, מורה היסטוריה)', scopes.has(`${tHome.userId}:student_detail`) && scopes.has(`${tMath.userId}:student_detail`) && scopes.has(`${tHist.userId}:student_detail`))
    check('עדכוני רמות נרשמו ביומן', scopes.has(`${tMath.userId}:profile_patch`))
    const adminLogs = (logs ?? []).filter((l) => l.viewer_id === admin.userId || l.viewer_id === mun.userId)
    check('מנהלים לא מופיעים ביומן הצפיות (נחסמו לפני גישה)', adminLogs.length === 0)

    /* ── 9) סיכום פדגוגי ──
       הנתיב הישן (POST /analytics/summary) הופרש: 410 לכל משתמש אמיתי, בלי קשר להרשאה — ההרשאות עצמן נבדקות עכשיו ב-/api/ai-summary (הנתיב החדש),
       וכל בדיקה כאן מסתיימת *לפני* כל קריאת AI (הרשאה → 403/404; לא מגיעים ליצירה). */
    console.log('\n— POST /analytics/summary (הנתיב הישן): הופרש —')
    check('מנהל: 410 (נתיב מופרש, לא 403)', (await api(admin.token, 'POST', '/analytics/summary', { scope: 'student', id: s1 })).status === 410)
    check('מנהל עירוני: 410', (await api(mun.token, 'POST', '/analytics/summary', { scope: 'student', id: s1 })).status === 410)
    check('מורה מכיתה אחרת: 410', (await api(tOut.token, 'POST', '/analytics/summary', { scope: 'student', id: s1 })).status === 410)
    check('מנהל, סיכום מטלה: 410', (await api(admin.token, 'POST', '/analytics/summary', { scope: 'assignment', id: aMathC })).status === 410)
    check('מחנך: גם הוא 410 (אין דרך לעקוף את ההרשאות דרך הנתיב הישן)', (await api(tHome.token, 'POST', '/analytics/summary', { scope: 'student', id: s1 })).status === 410)
    check('PATCH בנתיב הישן: 410', (await api(tHome.token, 'PATCH', '/analytics/summary', { scope: 'student', id: s1, edited_content: 'x' })).status === 410)



    /* ── 10) ניהול כיתה + יצירה + שיוך מקצוע מהיר ── */
    console.log('— ניהול כיתה, יצירה ושיוך מקצוע —')
    const cl = await api(tHome.token, 'GET', '/staff/classes')
    const mineA = (cl.json.classes ?? []).find((c: any) => c.id === clsA) // eslint-disable-line
    check('מחנך: רואה את כיתותיו, עם מקצוע/מחנך לכל מורה', cl.status === 200 && !!mineA
      && mineA.teachers.some((t: any) => t.teacherId === tHome.userId && t.isHomeroom === true) // eslint-disable-line
      && mineA.teachers.some((t: any) => t.teacherId === tMath.userId && t.subjectCode === 'math' && t.subject === 'מתמטיקה')) // eslint-disable-line
    const clOut = await api(tOut.token, 'GET', '/staff/classes')
    check('מורה מכיתה אחרת: לא רואה את כיתה A', clOut.status === 200 && !(clOut.json.classes ?? []).some((c: any) => c.id === clsA)) // eslint-disable-line
    check('מורה מתמטיקה לא יכול לשייך מורים (הסלמת הרשאות): 403',
      (await api(tMath.token, 'POST', `/staff/classes/${clsA}/teachers`, { teacherId: tOut.userId, isHomeroom: true })).status === 403)
    check('מחנך לא יכול לסמן מחנך/ת (רק מנהל): 403',
      (await api(tHome.token, 'POST', `/staff/classes/${clsA}/teachers`, { teacherId: tOut.userId, isHomeroom: true })).status === 403)
    check('מנהל משייך מורה עם מקצוע (dropdown): 201',
      (await api(admin.token, 'POST', `/staff/classes/${clsA}/teachers`, { teacherId: tOut.userId, subjectCode: 'science' })).status === 201)
    const { data: linkRow } = await supabaseAdmin.from('class_teachers').select('subject_id, subject').eq('class_id', clsA).eq('teacher_id', tOut.userId).single()
    check('השיוך נשמר עם subject_id ושם המקצוע בטקסט', linkRow?.subject_id === sid('science') && linkRow?.subject === 'מדעים')
    check('מקצוע לא מוכר בשיוך מורה: 400',
      (await api(admin.token, 'POST', `/staff/classes/${clsA}/teachers`, { teacherId: tOut.userId, subjectCode: 'physics' })).status === 400)

    const g0 = await api(tHome.token, 'POST', '/quests/generate', { title: 'zz', questLength: 5 })
    check('יצירת הדמיה בלי מקצוע: 400', g0.status === 400 && /מקצוע/.test(JSON.stringify(g0.json)), `status=${g0.status}`)
    const g1 = await api(tHome.token, 'POST', '/quests/generate', { title: 'zz', questLength: 5, subjectCode: 'physics' })
    check('יצירת הדמיה עם מקצוע לא מוכר: 400', g1.status === 400)
    const ps = await api(tHome.token, 'PATCH', `/quests/${qNone}`, { subjectCode: 'math' })
    const { data: qrow } = await supabaseAdmin.from('quests').select('subject_id, subject').eq('id', qNone).single()
    check('שיוך מהיר של "לא סווג" למקצוע', ps.status === 200 && qrow?.subject_id === MATH && qrow?.subject === 'מתמטיקה')
    const lib = await api(tHome.token, 'GET', '/quests')
    const listed = (lib.json.quests ?? []).find((q: any) => q.id === qNone) // eslint-disable-line
    check('הספרייה מחזירה subjectCode אחרי השיוך', lib.status === 200 && listed?.subjectCode === 'math' && listed?.subject === 'מתמטיקה')

    /* ── 11) שלב 1B: מי רשאי לעדכן אילו מקצועות (חוזה ה-DifficultyModal) ── */
    console.log('— בורר מקצוע: editable —')
    const edHome = await api(tHome.token, 'GET', `/analytics/student/${stuA[2]}`)
    check('מחנך: גלובלי + כל 15 המקצועות', edHome.json.editable?.global === true && edHome.json.editable?.subjects?.length === 15, `n=${edHome.json.editable?.subjects?.length}`)
    const edMath = await api(tMath.token, 'GET', `/analytics/student/${stuA[2]}`)
    check('מורה מתמטיקה: רק מתמטיקה, בלי גלובלי', edMath.json.editable?.global === false
      && edMath.json.editable?.subjects?.length === 1 && edMath.json.editable.subjects[0].code === 'math')

    /* ── 12) שלב 1B: כיתה חדשה — היוצר נרשם כמחנך (גם מורה שנרשם לבד, בלי מנהל) ── */
    console.log('— יצירת כיתה: היוצר = מחנך —')
    const slugSelf = 'zz-authz-self-' + randomBytes(3).toString('hex')
    const selfEmail = `${slugSelf}@example.com`
    const selfPass = randomBytes(18).toString('base64url')
    const su = await fetch(API + '/auth/staff-signup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: selfEmail, password: selfPass, name: 'zz-authz self', role: 'teacher', newSchoolName: slugSelf }),
    })
    const suJson = (await su.json()) as { user?: { id: string; school_id: string } }
    check('הרשמה עצמית של מורה בלי מנהל: 201', su.status === 201 && !!suJson.user?.id, 'status=' + su.status)
    if (suJson.user) {
      cleanup.users.push(suJson.user.id)
      selfSchool = suJson.user.school_id
      const { data: authRow } = await supabaseAdmin.from('users').select('auth_id').eq('id', suJson.user.id).single()
      if (authRow?.auth_id) cleanup.auths.push(authRow.auth_id as string)
      const { data: ss } = await supabaseAnon.auth.signInWithPassword({ email: selfEmail, password: selfPass })
      const selfTok = ss.session!.access_token
      const mk = await api(selfTok, 'POST', '/staff/classes', { name: 'ז׳1', slug: 'zz' + randomBytes(2).toString('hex'), gradeLevel: 7 })
      check('מורה שנרשם לבד יוצר כיתה: 201', mk.status === 201, 'status=' + mk.status)
      const newClassId = mk.json.class?.id as string
      if (newClassId) cleanup.classes.push(newClassId)
      const { data: link } = await supabaseAdmin.from('class_teachers').select('is_homeroom, subject_id, teacher_id').eq('class_id', newClassId)
      check('נרשם ב-class_teachers: is_homeroom=true ו-subject_id=NULL', (link ?? []).length === 1 && link![0].is_homeroom === true && link![0].subject_id === null && link![0].teacher_id === suJson.user.id)
      const list = await api(selfTok, 'GET', '/staff/classes')
      check('הכיתה מופיעה אצל היוצר (לא איבד גישה)', (list.json.classes ?? []).some((c: any) => c.id === newClassId && c.gradeLevel === 7)) // eslint-disable-line
      const add = await api(selfTok, 'POST', `/staff/classes/${newClassId}/students`, { name: 'zz-authz stu self' })
      check('היוצר מוסיף תלמיד לכיתה שלו', add.status === 201, 'status=' + add.status)
      const lens = await api(selfTok, 'GET', '/analytics/students')
      check('היוצר רואה את התלמיד באנליטיקה (מחנך)', lens.status === 200 && (lens.json.students ?? []).length === 1)
      /* שכבה + קידום */
      const prom = await api(selfTok, 'POST', `/staff/classes/${newClassId}/promote`, {})
      check('קידום שכבה אוטומטי: 7 → 8 והתווית מתעדכנת', prom.status === 200 && prom.json.gradeLevel === 8 && prom.json.gradeLabel === 'ח׳1', JSON.stringify(prom.json))
      const set12 = await api(selfTok, 'PATCH', `/staff/classes/${newClassId}`, { gradeLevel: 12 })
      check('עדכון שכבה ל-12', set12.status === 200)
      const prom12 = await api(selfTok, 'POST', `/staff/classes/${newClassId}/promote`, {})
      check('קידום מי״ב: 400 עם הסבר', prom12.status === 400)
      const clr = await api(selfTok, 'PATCH', `/staff/classes/${newClassId}`, { gradeLevel: null })
      const promLabel = await api(selfTok, 'POST', `/staff/classes/${newClassId}/promote`, {})
      check('בלי שכבה מוגדרת אך עם תווית ח׳1: השכבה נגזרת מהתווית ומקודמת ל-9', clr.status === 200 && promLabel.status === 200 && promLabel.json.gradeLevel === 9, JSON.stringify(promLabel.json))
      const mk2 = await api(selfTok, 'POST', '/staff/classes', { name: 'כיתת ניסוי', slug: 'zz' + randomBytes(2).toString('hex') })
      if (mk2.json.class?.id) cleanup.classes.push(mk2.json.class.id as string)
      const prom0 = await api(selfTok, 'POST', `/staff/classes/${mk2.json.class?.id}/promote`, {})
      check('תווית שאין ממנה שכבה (וללא grade_level): 400 "הגדירו שכבה"', mk2.status === 201 && prom0.status === 400)
      const bad = await api(selfTok, 'PATCH', `/staff/classes/${newClassId}`, { gradeLevel: 13 })
      check('שכבה מחוץ ל-1–12: 400', bad.status === 400)
    }

    /* ── 13) אנליטיקה v2 (הספק החי): מטריצת הרשאות קטנה על אותו ארגון. הכיסוי המלא (נתונים, יומן, מנהל) ב-npm run v2:accept ── */
    console.log('\n— אנליטיקה v2: הרשאות פר-כיתה —')
    const { error: lvErr } = await supabaseAdmin.from('classes').update({ grade_level: 6 }).in('id', [clsA, clsB, clsC])
    if (lvErr) console.log('(דילוג: classes.grade_level חסרה — כיתות בלי שכבה אינן נכנסות לאנליטיקה v2)')
    else {
      const v2 = (t: Tok, p: string) => api(t.token, 'GET', '/analytics-v2' + p)
      const cls = (r: any, id: string) => (r.json.data?.classes ?? []).find((c: any) => c.id === id) // eslint-disable-line
      const codes = (xs: any[] | undefined) => (xs ?? []).map((s: any) => s.code).sort().join() // eslint-disable-line
      const NIL = '00000000-0000-0000-0000-000000000000'

      const rHomeV = await v2(tHome, '/roster')
      check('v2 מחנך של A ו-C: שתי הכיתות, שתיהן isHomeroom, 9 תלמידים (A + C, בלי B)',
        rHomeV.status === 200 && rHomeV.json.data.classes.length === 2 && cls(rHomeV, clsA)?.isHomeroom === true && cls(rHomeV, clsC)?.isHomeroom === true && !cls(rHomeV, clsB) && rHomeV.json.data.students.length === 9,
        'status=' + rHomeV.status)

      const rMathV = await v2(tMath, '/roster')
      check('v2 מורה מתמטיקה (A ו-C): isHomeroom=false; בשתיהן פתוחה רק מתמטיקה; ב-A היסטוריה נעולה',
        rMathV.status === 200 && cls(rMathV, clsA)?.isHomeroom === false && codes(cls(rMathV, clsA)?.subjects) === 'math' && codes(cls(rMathV, clsA)?.lockedSubjects).includes('history') && codes(cls(rMathV, clsC)?.subjects) === 'math' && !cls(rMathV, clsB),
        codes(cls(rMathV, clsA)?.subjects) + ' / ' + codes(cls(rMathV, clsA)?.lockedSubjects))
      check('v2 מורה מתמטיקה: מסך מתמטיקה ב-A = 200; היסטוריה ב-A = 403 (נעול); סקירת A = 403; כיתה B = 404',
        (await v2(tMath, '/class/' + clsA + '/subject/math')).status === 200 && (await v2(tMath, '/class/' + clsA + '/subject/history')).status === 403
        && (await v2(tMath, '/class/' + clsA + '/overview')).status === 403 && (await v2(tMath, '/class/' + clsB + '/subject/math')).status === 404)

      const rHistV = await v2(tHist, '/roster')
      check('v2 מורה היסטוריה (A בלבד): רק A, פתוחה רק היסטוריה; C = 404 אחיד כמו כיתה שאינה קיימת',
        rHistV.status === 200 && rHistV.json.data.classes.length === 1 && codes(cls(rHistV, clsA)?.subjects) === 'history'
        && (await v2(tHist, '/class/' + clsC + '/subject/math')).status === 404
        && JSON.stringify((await v2(tHist, '/class/' + clsC + '/subject/math')).json) === JSON.stringify((await v2(tHist, '/class/' + NIL + '/subject/math')).json))

      const rOutV = await v2(tOut, '/roster')
      check('v2 מורה מעורב (מחנך B + מדעים ב-A, שיוך שהמנהל הוסיף): ב-B מחנך; ב-A פתוחים מדעים בלבד; אין לו את C',
        rOutV.status === 200 && cls(rOutV, clsB)?.isHomeroom === true && cls(rOutV, clsA)?.isHomeroom === false && codes(cls(rOutV, clsA)?.subjects) === 'science' && !cls(rOutV, clsC),
        codes(cls(rOutV, clsA)?.subjects))
      check('v2 אותו מורה: מתמטיקה ב-A = 403 (לא מכפלה קרטזית עם מחנכות B); מדעים ב-A = 200; סקירת A = 403; סקירת B = 200',
        (await v2(tOut, '/class/' + clsA + '/subject/math')).status === 403 && (await v2(tOut, '/class/' + clsA + '/subject/science')).status === 200
        && (await v2(tOut, '/class/' + clsA + '/overview')).status === 403 && (await v2(tOut, '/class/' + clsB + '/overview')).status === 200)

      const sHistOnC = await v2(tHist, '/student/' + stuC[0])
      const sNil = await v2(tHist, '/student/' + NIL)
      check('v2 תלמיד מכיתה ללא קישור = 404 אחיד (≡ תלמיד שאינו קיים)', sHistOnC.status === 404 && sNil.status === 404 && JSON.stringify(sHistOnC.json) === JSON.stringify(sNil.json))
      const sMath = await v2(tMath, '/student/' + s1)
      check('v2 מורה מתמטיקה על תלמיד ב-A: access=subject_only, כל לוחות המקצוע של אחרים באפור (שם בלבד)',
        sMath.status === 200 && sMath.json.data.access === 'subject_only' && sMath.json.data.panels.filter((pn: any) => pn.access === 'greyed').every((pn: any) => Object.keys(pn).sort().join() === 'access,subject')) // eslint-disable-line

      for (const [label, who] of [['מנהל', admin], ['מנהל עירוני', mun]] as const) {
        const st = await v2(who, '/student/' + s1)
        const ro = await v2(who, '/roster')
        const ov = await v2(who, '/admin/overview')
        const text = JSON.stringify([ro.json, ov.json])
        const leak = [...stuA, ...stuC, clsA, clsB, clsC, tHome.userId, tMath.userId].some((id) => text.includes(id)) || /zz-authz (stu|home|math|hist|outsider)/.test(text)
        check('v2 ' + label + ': נקודות תלמיד = 403; roster ריק; admin/overview = 200 ובלי שם / מזהה של תלמיד, כיתה או מורה',
          st.status === 403 && ro.status === 200 && ro.json.data.classes.length === 0 && ro.json.data.students.length === 0 && ov.status === 200 && !leak, 'student=' + st.status + ' overview=' + ov.status)
      }
      check('v2 מורה מול admin/overview = 403', (await v2(tMath, '/admin/overview')).status === 403)

      /* ── סיכום AI (/api/ai-summary): ההרשאה נאכפת *לפני* כל קריאת AI. כאן, אחרי שלכיתות יש שכבה — כך ש-404 פירושו "מחוץ להיקף" ולא "הכיתה לא בניתוח".
         כל הבדיקות הן על הרשאה (403 / 404) או על GET זול; אף אחת לא מגיעה ליצירה (אין POST מורשה, ולכן אין קריאת LLM). ── */
      console.log('\n— /api/ai-summary: הרשאה לפני כל קריאת AI —')
      const ai = (t: Tok, method: 'GET' | 'POST', scope: string, id: string) =>
        method === 'GET' ? api(t.token, 'GET', `/ai-summary?scope=${scope}&id=${id}`) : api(t.token, 'POST', '/ai-summary', { scope, id })
      const sumControl = await ai(tHome, 'GET', 'student', s1)
      check('בקרה חיובית: מחנך הכיתה — GET של סיכום תלמיד = 200 (הכיתה בניתוח; ה-403 / 404 שלמטה אינם כשל כללי)', sumControl.status === 200, `status=${sumControl.status} ${sumControl.status === 200 ? '' : JSON.stringify(sumControl.json).slice(0, 100)}`)
      check('מנהל: סיכום תלמיד = 403 (POST ו-GET) — אין סיכום ברמת תלמיד לתפקיד אגרגטים', (await ai(admin, 'POST', 'student', s1)).status === 403 && (await ai(admin, 'GET', 'student', s1)).status === 403)
      check('מנהל עירוני: סיכום תלמיד = 403', (await ai(mun, 'POST', 'student', s1)).status === 403)
      check('מורה היסטוריה על תלמיד בכיתה C (לא משויך אליה): 404 אחיד, זהה לתלמיד שאינו קיים',
        (await ai(tHist, 'POST', 'student', stuC[0])).status === 404 && (await ai(tHist, 'POST', 'student', NIL)).status === 404
        && JSON.stringify((await ai(tHist, 'GET', 'student', stuC[0])).json) === JSON.stringify((await ai(tHist, 'GET', 'student', NIL)).json))
      check('מנהל: סיכום הגשה (מטלה) = 403', (await ai(admin, 'POST', 'submission', aMathC)).status === 403)
      check('מורה היסטוריה, סיכום כיתה C (לא משויך): 404', (await ai(tHist, 'POST', 'class', clsC)).status === 404)
      const mathClassSummary = await ai(tMath, 'POST', 'class', clsA)
      check('מורה מתמטיקה (לא מחנך), סיכום כיתה: 403 — רק מחנך הכיתה', mathClassSummary.status === 403, `status=${mathClassSummary.status} ${JSON.stringify(mathClassSummary.json).slice(0, 100)}`)
      check('GET בלי יעד תקין: 400', (await api(tHome.token, 'GET', '/ai-summary?scope=student')).status === 400)
    }
  } finally {
    /* ניקוי: כל השורות שנוצרו (סדר: תלות → הורה) */
    const { data: sess } = await supabaseAdmin.from('sessions').select('id').in('quest_id', cleanup.quests.length ? cleanup.quests : ['00000000-0000-0000-0000-000000000000'])
    const sids = (sess ?? []).map((s) => s.id)
    if (sids.length) {
      await supabaseAdmin.from('events').delete().in('session_id', sids)
      await supabaseAdmin.from('progress_snapshots').delete().in('session_id', sids)
      await supabaseAdmin.from('level_history').delete().in('session_id', sids)
      await supabaseAdmin.from('sessions').delete().in('id', sids)
    }
    if (cleanup.users.length) {
      await supabaseAdmin.from('level_history').delete().in('student_id', cleanup.users)
      await supabaseAdmin.from('student_subject_levels').delete().in('student_id', cleanup.users)
      await supabaseAdmin.from('difficulty_profiles').delete().in('user_id', cleanup.users)
      await supabaseAdmin.from('progress_snapshots').delete().in('student_id', cleanup.users)
      await supabaseAdmin.from('data_access_log').delete().in('viewer_id', cleanup.users)
      await supabaseAdmin.from('data_access_log').delete().in('student_id', cleanup.users)
    }
    if (cleanup.quests.length) {
      await supabaseAdmin.from('assignments').delete().in('quest_id', cleanup.quests)
      await supabaseAdmin.from('quests').delete().in('id', cleanup.quests)
    }
    /* כיתות שנוצרו אוטומטית ע"י משתמשי-הבדיקה (למשל כיתה לדוגמה בהרשמה) — לא נרשמו ב-cleanup.classes */
    if (cleanup.users.length) {
      const { data: auto } = await supabaseAdmin.from('classes').select('id').in('teacher_id', cleanup.users)
      for (const c of auto ?? []) if (!cleanup.classes.includes(c.id as string)) cleanup.classes.push(c.id as string)
    }
    if (cleanup.classes.length) {
      await supabaseAdmin.from('class_teachers').delete().in('class_id', cleanup.classes)
      await supabaseAdmin.from('class_members').delete().in('class_id', cleanup.classes)
      await supabaseAdmin.from('classes').delete().in('id', cleanup.classes)
    }
    if (cleanup.users.length) await supabaseAdmin.from('users').delete().in('id', cleanup.users)
    for (const a of cleanup.auths) await supabaseAdmin.auth.admin.deleteUser(a).catch(() => {})
    if (cleanup.school) await supabaseAdmin.from('schools').delete().eq('id', cleanup.school)
    if (selfSchool) await supabaseAdmin.from('schools').delete().eq('id', selfSchool)
    console.log('\n(נוקו הארגון, המשתמשים, הכיתות וההדמיות הזמניים)')
  }
  console.log(failed === 0 ? `\nכל ${total} הבדיקות עברו` : `\n${failed} מתוך ${total} בדיקות נכשלו`)
  if (failed) process.exitCode = 1
}

main().catch((e) => { console.error('FATAL', e instanceof Error ? e.message : e); process.exitCode = 1 })
