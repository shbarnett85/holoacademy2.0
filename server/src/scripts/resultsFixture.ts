/* ── פיקסצ'ר חי לטאב "תוצאות" ───────────────────────────────────────────────────────
   יוצר בבסיס הנתונים (המשותף עם הפרודקשן!) ארגון זמני מלא — בית ספר, מורים בכל התפקידים, כיתות, תלמידים,
   הדמיות, שליחות, sessions, answers ו-events — **כל שורה עם הקידומת zz-ux-res-** (תת-קידומת של zz-ux-) (שם / כותרת / קוד / אימייל),
   כדי שאפשר יהיה לנקות אותה בוודאות (cleanupResultsFixture) ולוודא שלא נשאר דבר (leftoverResultsFixture).

   שימוש (גם מסוכנים אחרים — צילומי מסך e2e):
     import { seedResultsFixture, cleanupResultsFixture } from './resultsFixture.js'
     const fx = await seedResultsFixture()   // fx.teachers.homeroom.token = JWT של Supabase לשימוש ב-Authorization: Bearer
     ...
     await cleanupResultsFixture(fx)

   מה נוצר (כיתה ראשית "fx.classId", 6 תלמידים):
   · הדמיה מדעית "sci" (רב-ברירה עם מסיח מתויג + מסיח לא מתויג, נכון/לא-נכון, זיכרון, מבחן סיכום 3 שאלות):
       אבי — סיים, הכול נכון · בני — סיים, ויתר על 2 אתגרים + בחר במסיח המתויג · גלית — סיימה, בחרה במסיח המתויג
       דנה — סיימה, בחרה במסיח המתויג (שלושה תלמידים באותה תשובה שגויה = "טעות נפוצה") · הדס — באמצע (session פתוח) ·
       ויקטור — לא התחיל (יש לו session *סינתטי* מושלם — נראה רק בארגון הדגמה).
     מועד ההגשה של sci עבר אתמול ("לא התחיל" נחשב לתשומת לב רק אחרי המועד).
   · הדמיה ישנה "old" — שליחה מלפני 400 יום: sessions + events מסוכמים בלבד, אין answers (הדמיה מלפני לכידת התשובות).
   · הדמיה היסטורית "hist" שנשלחה ע"י מורה אחר (senderOnly) — לא גלויה למורה המדעים.
   · כיתה שנייה עם מורה שאינו מקושר לכיתה הראשית (+ שליחה משלו) — לבדיקת בידוד.
   סיסמאות אקראיות בזיכרון בלבד; לא מודפסות. לא מפעיל שום LLM.                                        */
import '../env.js'
import { randomBytes } from 'node:crypto'
import { supabaseAdmin, supabaseAnon } from '../lib/supabase.js'
import { hasIsActive } from '../lib/activeColumn.js'

/* תת-קידומת ייחודית לפיקסצ'ר הזה (עדיין zz-ux-*): סוכנים אחרים משתמשים ב-zz-ux-* לשורות זמניות משלהם,
   והניקוי כאן לפי קידומת — כך הוא לא נוגע בשורות שלהם (ולהפך, ככל שהם מנקים בקידומת מלאה יותר). */
export const FX_PREFIX = 'zz-ux-res-'

export interface FxPrincipal { userId: string; name: string; token: string }
export interface ResultsFixture {
  schoolId: string
  classId: string
  otherClassId: string
  subjectIds: { science: string; history: string }
  teachers: {
    /* מחנך הכיתה הראשית */
    homeroom: FxPrincipal
    /* מורה מדעים בכיתה: יצר את sci/old ושלח אותן */
    subjectSame: FxPrincipal
    /* מורה היסטוריה בכיתה: יצר את hist */
    subjectOther: FxPrincipal
    /* מורה בכיתה (שיוך כללי, בלי מקצוע) ששלח את hist — לא יצר */
    senderOnly: FxPrincipal
    /* מחנך של הכיתה השנייה — לא מקושר לראשית */
    unlinked: FxPrincipal
    admin: FxPrincipal
    municipal: FxPrincipal
  }
  quests: { sci: string; old: string; hist: string }
  /* מזהי השליחות (assignments) */
  submissions: { sci: string; old: string; hist: string; other: string }
  /* תלמידי הכיתה הראשית לפי שם-מפתח */
  students: Record<'avi' | 'beni' | 'galit' | 'dana' | 'hadas' | 'viktor', { id: string; name: string }> & { otherClass: { id: string; name: string } }
  misconceptionId: string
}

type Row = Record<string, unknown>

async function ins(table: string, rows: Row | Row[], select = 'id'): Promise<{ id: string }[]> {
  const { data, error } = await supabaseAdmin.from(table).insert(rows).select(select)
  if (error) throw new Error(`${table} insert: ${error.message}`)
  return (data ?? []) as unknown as { id: string }[]
}

const iso = (offsetMs: number): string => new Date(Date.now() + offsetMs).toISOString()
const DAY = 24 * 3600e3

/* ── תוכן ההדמיות ── */
const SCI_GAME = {
  entrySceneId: 's0',
  scenes: [
    { id: 's0', title: 'zz-ux-פתיחה', narrative: 'מים קרח ואדים בדרך לכיתה', nextSceneId: 's1' },
    { id: 's1', title: 'zz-ux-מצב הצבירה', narrative: 'שאלה על קרח', nextSceneId: 's2', puzzle: { type: 'multipleChoice', question: 'מה מצב הצבירה של קרח?', difficulty: 5, choices: [
      { id: 'a', text: 'מוצק', isCorrect: true }, { id: 'b', text: 'נוזל', isCorrect: false }, { id: 'c', text: 'גז', isCorrect: false },
    ] } },
    { id: 's2', title: 'zz-ux-נכון או לא', narrative: 'טענה על רתיחה', nextSceneId: 's3', puzzle: { type: 'trueFalse', question: 'מים רותחים ב-100 מעלות', difficulty: 5, choices: [
      { id: 't', text: 'נכון', isCorrect: true }, { id: 'f', text: 'לא נכון', isCorrect: false },
    ] } },
    { id: 's3', title: 'zz-ux-זיכרון', narrative: 'התאימו זוגות', nextSceneId: 's4', puzzle: { type: 'memory', question: 'התאימו כל מושג להגדרה', difficulty: 5, pairs: [{ a: 'קרח', b: 'מוצק' }, { a: 'אדים', b: 'גז' }] } },
    { id: 's4', title: 'zz-ux-מבחן סיכום', narrative: 'שלוש שאלות', puzzle: { type: 'finalQuiz', question: 'סיכום', difficulty: 5, questions: [
      { question: 'שאלה ראשונה', options: ['א', 'ב', 'ג'], correctIndex: 0, explanationCorrect: 'x', explanationIncorrect: 'y' },
      { question: 'שאלה שנייה', options: ['ד', 'ה', 'ו'], correctIndex: 2, explanationCorrect: 'x', explanationIncorrect: 'y' },
      { question: 'שאלה שלישית', options: ['ז', 'ח', 'ט'], correctIndex: 1, explanationCorrect: 'x', explanationIncorrect: 'y' },
    ] } },
  ],
}
const OLD_GAME = {
  entrySceneId: 's0',
  scenes: [
    { id: 's0', title: 'zz-ux-פתיחה ישנה', narrative: 'פתיחה', nextSceneId: 's1' },
    { id: 's1', title: 'zz-ux-חידה ישנה', narrative: 'שאלה', puzzle: { type: 'multipleChoice', question: 'שאלה ישנה', difficulty: 5, choices: [
      { id: 'a', text: 'נכון', isCorrect: true }, { id: 'b', text: 'שגוי', isCorrect: false },
    ] } },
  ],
}
const HIST_GAME = {
  entrySceneId: 's0',
  scenes: [
    { id: 's0', title: 'zz-ux-פתיחה היסטורית', narrative: 'פתיחה', nextSceneId: 's1' },
    { id: 's1', title: 'zz-ux-חידה היסטורית', narrative: 'שאלה', puzzle: { type: 'multipleChoice', question: 'באיזו שנה?', difficulty: 5, choices: [
      { id: 'a', text: '1789', isCorrect: true }, { id: 'b', text: '1848', isCorrect: false },
    ] } },
  ],
}

/* ── יצירת חשבון צוות עם JWT ── */
async function mkStaff(schoolId: string, role: string, label: string, auths: string[]): Promise<FxPrincipal> {
  const email = `${FX_PREFIX}${label}-${randomBytes(3).toString('hex')}@example.com`
  const password = randomBytes(18).toString('base64url')
  const { data: au, error } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !au.user) throw new Error('createUser: ' + error?.message)
  auths.push(au.user.id)
  const name = `${FX_PREFIX}${label}`
  const act = (await hasIsActive('users')) ? { is_active: true } : {}
  const [u] = await ins('users', { name, role, school_id: schoolId, auth_id: au.user.id, ...act })
  const { data: s, error: se } = await supabaseAnon.auth.signInWithPassword({ email, password })
  if (se || !s.session) throw new Error('signIn: ' + se?.message)
  return { userId: u.id, name, token: s.session.access_token }
}

export async function seedResultsFixture(): Promise<ResultsFixture> {
  const auths: string[] = []
  try {
    return await build(auths)
  } catch (e) {
    /* כשל באמצע — מנקים מה שכבר נוצר ומעבירים הלאה */
    await cleanupResultsFixture().catch(() => {})
    throw e
  }
}

async function build(auths: string[]): Promise<ResultsFixture> {
  const { data: subs } = await supabaseAdmin.from('subjects').select('id, code')
  const sid = (code: string): string => {
    const r = (subs ?? []).find((s) => s.code === code)
    if (!r) throw new Error('subject missing: ' + code)
    return r.id as string
  }
  const SCI = sid('science')
  const HIST = sid('history')

  const tag = randomBytes(3).toString('hex')
  const [school] = await ins('schools', { name: `${FX_PREFIX}school-${tag}`, slug: `${FX_PREFIX}school-${tag}` })

  const homeroom = await mkStaff(school.id, 'teacher', 'homeroom', auths)
  const subjectSame = await mkStaff(school.id, 'teacher', 'sci-teacher', auths)
  const subjectOther = await mkStaff(school.id, 'teacher', 'hist-teacher', auths)
  const senderOnly = await mkStaff(school.id, 'teacher', 'sender-only', auths)
  const unlinked = await mkStaff(school.id, 'teacher', 'unlinked', auths)
  const admin = await mkStaff(school.id, 'admin', 'admin', auths)
  const municipal = await mkStaff(school.id, 'municipal_admin', 'municipal', auths)

  const mkClass = async (label: string): Promise<string> => {
    const code = `${FX_PREFIX}${label}-${randomBytes(2).toString('hex')}`
    const [c] = await ins('classes', { name: `${FX_PREFIX}${label}`, grade_label: `${FX_PREFIX}${label}`, slug: code, url_code: code, school_id: school.id })
    return c.id
  }
  const classId = await mkClass('main')
  const otherClassId = await mkClass('other')

  const link = (class_id: string, teacher_id: string, o: { subject?: string; subject_id?: string | null; is_homeroom?: boolean } = {}): Row =>
    ({ class_id, teacher_id, subject: o.subject ?? '', subject_id: o.subject_id ?? null, is_homeroom: o.is_homeroom ?? false })
  await ins('class_teachers', [
    link(classId, homeroom.userId, { is_homeroom: true }),
    link(classId, subjectSame.userId, { subject: 'science', subject_id: SCI }),
    link(classId, subjectOther.userId, { subject: 'history', subject_id: HIST }),
    link(classId, senderOnly.userId),
    link(otherClassId, unlinked.userId, { is_homeroom: true }),
  ], 'class_id')

  /* תלמידים */
  const mkStudent = async (name: string, cls: string): Promise<{ id: string; name: string }> => {
    const full = `${FX_PREFIX}${name}`
    const [u] = await ins('users', { name: full, role: 'student', school_id: school.id, pin: '0000' })
    await ins('class_members', { class_id: cls, user_id: u.id }, 'class_id')
    return { id: u.id, name: full }
  }
  const students = {
    avi: await mkStudent('אבי כהן', classId),
    beni: await mkStudent('בני לוי', classId),
    galit: await mkStudent('גלית ברק', classId),
    dana: await mkStudent('דנה רז', classId),
    hadas: await mkStudent('הדס שמש', classId),
    viktor: await mkStudent('ויקטור נחום', classId),
    otherClass: await mkStudent('תלמיד כיתה אחרת', otherClassId),
  }

  /* הדמיות */
  const mkQuest = async (title: string, game: unknown, subjectId: string, by: string): Promise<string> =>
    (await ins('quests', { title: `${FX_PREFIX}${title}`, game_data: game, status: 'draft', created_by: by, subject_id: subjectId }))[0].id
  const qSci = await mkQuest('sci', SCI_GAME, SCI, subjectSame.userId)
  const qOld = await mkQuest('old', OLD_GAME, SCI, subjectSame.userId)
  const qHist = await mkQuest('hist', HIST_GAME, HIST, subjectOther.userId)

  /* שליחות */
  const asg = async (cls: string, quest: string, by: string, ageDays: number, dueAgoDays?: number): Promise<string> =>
    (await ins('assignments', { class_id: cls, quest_id: quest, user_id: by, created_at: iso(-ageDays * DAY), ...(dueAgoDays !== undefined ? { due_at: iso(-dueAgoDays * DAY) } : {}) }))[0].id
  const submissions = {
    sci: await asg(classId, qSci, subjectSame.userId, 2, 1),
    old: await asg(classId, qOld, subjectSame.userId, 400),
    hist: await asg(classId, qHist, senderOnly.userId, 1),
    other: await asg(otherClassId, qHist, unlinked.userId, 3),
  }

  /* תגית מסיח: s1/b = "בלבול בין מוצק לנוזל" (מאושרת), s1/c נשאר ללא תגית */
  const [mis] = await ins('misconceptions', {
    subject_id: SCI, code: `${FX_PREFIX}solid-liquid-${tag}`, title_he: `${FX_PREFIX}בלבול בין מוצק לנוזל`,
    description_he: `${FX_PREFIX}תיאור הטעות`, status: 'approved', source: 'zz-ux-res fixture',
  })
  await ins('option_tags', { quest_id: qSci, scene_id: 's1', item_index: 0, option_id: 'b', misconception_id: mis.id, tag_source: 'teacher' })
  await ins('misconception_content_links', { misconception_id: mis.id, quest_id: qOld, created_by: subjectSame.userId }, 'quest_id')

  /* sessions + events + answers */
  type A = { scene: string; item: number; opt: string | null; outcome: 'correct' | 'wrong' | 'gave_up' | 'closed' | 'timeout'; type: string; ms?: number; attempt?: number }
  const mkSession = async (student: string, quest: string, o: { done: boolean; startedAgoMs: number; synthetic?: boolean }): Promise<string> => {
    const started = iso(-o.startedAgoMs)
    return (await ins('sessions', {
      user_id: student, quest_id: quest, started_at: started, completed_at: o.done ? new Date(Date.parse(started) + 20 * 60e3).toISOString() : null,
      total_score: 0, max_score: 4, inventory: [], visited_scenes: [], ...(o.synthetic ? { is_synthetic: true } : {}),
    }))[0].id
  }
  const writeEvents = async (sessionId: string, student: string, quest: string, solved: Record<string, boolean>, enters: { scene: string; payload: Row }[], synthetic = false) => {
    const base = { session_id: sessionId, user_id: student, quest_id: quest, ...(synthetic ? { is_synthetic: true } : {}) }
    const rows: Row[] = Object.entries(solved).map(([scene, ok]) => ({
      ...base, type: ok ? 'puzzle_solved' : 'puzzle_failed', scene_id: scene,
      payload: { puzzleType: 'x', difficulty: 5, attempts: 1, solveTimeMs: 9000, shards: ok ? 1 : 0 },
    }))
    for (const e of enters) rows.push({ ...base, type: 'scene_enter', scene_id: e.scene, payload: e.payload })
    rows.push({ ...base, type: 'session_completed', scene_id: null, payload: { successRate: 0.5, completed: true } })
    await ins('events', rows)
  }
  const writeAnswers = async (sessionId: string, student: string, quest: string, list: A[], synthetic = false) => {
    await ins('answers', list.map((a, i) => ({
      client_event_id: `${sessionId}:${a.scene}:${a.item}:${i}`, session_id: sessionId, student_id: student, class_id: classId, quest_id: quest,
      scene_id: a.scene, item_index: a.item, puzzle_type: a.type, subject_id: SCI, selected_option_id: a.opt, is_correct: a.outcome === 'correct',
      attempt_no: a.attempt ?? 1, response_ms: a.ms ?? 6000, outcome: a.outcome, schema_version: 1, ...(synthetic ? { is_synthetic: true } : {}),
    })), 'client_event_id')
  }
  const enters = [
    { scene: 's0', payload: { dwellMs: 20000, word_count: 110, closed_dwell_ms: 4000 } },
    { scene: 's1', payload: { dwellMs: 9000, word_count: 12, closed_dwell_ms: 8000 } },
  ]
  const MC = 'multipleChoice', TF = 'trueFalse', MEM = 'memory', FQ = 'finalQuiz'
  const perfect: A[] = [
    { scene: 's1', item: 0, opt: 'a', outcome: 'correct', type: MC }, { scene: 's2', item: 0, opt: 't', outcome: 'correct', type: TF },
    { scene: 's3', item: 0, opt: null, outcome: 'correct', type: MEM, ms: 40000, attempt: 3 },
    { scene: 's4', item: 0, opt: 'o0', outcome: 'correct', type: FQ }, { scene: 's4', item: 1, opt: 'o2', outcome: 'correct', type: FQ }, { scene: 's4', item: 2, opt: 'o1', outcome: 'correct', type: FQ },
  ]
  const play = async (stu: { id: string }, answers: A[], solved: Record<string, boolean>, startedAgoMs = 1.5 * DAY) => {
    const s = await mkSession(stu.id, qSci, { done: true, startedAgoMs })
    await writeAnswers(s, stu.id, qSci, answers)
    await writeEvents(s, stu.id, qSci, solved, enters)
  }
  await play(students.avi, perfect, { s1: true, s2: true, s3: true, s4: true })
  await play(students.beni, [
    { scene: 's1', item: 0, opt: 'b', outcome: 'wrong', type: MC }, { scene: 's2', item: 0, opt: null, outcome: 'gave_up', type: TF },
    { scene: 's3', item: 0, opt: null, outcome: 'closed', type: MEM },
    { scene: 's4', item: 0, opt: 'o1', outcome: 'wrong', type: FQ }, { scene: 's4', item: 1, opt: 'o0', outcome: 'wrong', type: FQ }, { scene: 's4', item: 2, opt: 'o1', outcome: 'correct', type: FQ },
  ], { s1: false, s2: false, s3: false, s4: false })
  await play(students.galit, [
    { scene: 's1', item: 0, opt: 'b', outcome: 'wrong', type: MC }, { scene: 's2', item: 0, opt: 't', outcome: 'correct', type: TF },
    { scene: 's3', item: 0, opt: null, outcome: 'correct', type: MEM, ms: 30000, attempt: 2 },
    { scene: 's4', item: 0, opt: 'o0', outcome: 'correct', type: FQ }, { scene: 's4', item: 1, opt: 'o2', outcome: 'correct', type: FQ }, { scene: 's4', item: 2, opt: 'o2', outcome: 'wrong', type: FQ },
  ], { s1: false, s2: true, s3: true, s4: true })
  await play(students.dana, [
    { scene: 's1', item: 0, opt: 'b', outcome: 'wrong', type: MC }, { scene: 's2', item: 0, opt: 't', outcome: 'correct', type: TF },
    { scene: 's3', item: 0, opt: null, outcome: 'correct', type: MEM },
    { scene: 's4', item: 0, opt: 'o0', outcome: 'correct', type: FQ }, { scene: 's4', item: 1, opt: 'o2', outcome: 'correct', type: FQ }, { scene: 's4', item: 2, opt: 'o1', outcome: 'correct', type: FQ },
  ], { s1: false, s2: true, s3: true, s4: true })
  /* הדס: באמצע — session פתוח, בלי events/answers (השליחה מרוכזת בסיום) */
  await mkSession(students.hadas.id, qSci, { done: false, startedAgoMs: 0.5 * DAY })
  /* ויקטור: session סינתטי שהושלם — נראה רק בארגון הדגמה */
  const synth = await mkSession(students.viktor.id, qSci, { done: true, startedAgoMs: 1 * DAY, synthetic: true })
  await writeAnswers(synth, students.viktor.id, qSci, perfect, true)
  await writeEvents(synth, students.viktor.id, qSci, { s1: true, s2: true, s3: true, s4: true }, enters, true)

  /* הדמיה ישנה: events מסוכמים בלבד, אין answers */
  const OLD_AGO = 399 * DAY
  for (const [stu, ok] of [[students.avi, true], [students.beni, false], [students.galit, true]] as const) {
    const s = await mkSession(stu.id, qOld, { done: true, startedAgoMs: OLD_AGO })
    await writeEvents(s, stu.id, qOld, { s1: ok }, [{ scene: 's0', payload: { dwellMs: 5000 } }])
  }

  void auths
  return {
    schoolId: school.id, classId, otherClassId, subjectIds: { science: SCI, history: HIST },
    teachers: { homeroom, subjectSame, subjectOther, senderOnly, unlinked, admin, municipal },
    quests: { sci: qSci, old: qOld, hist: qHist }, submissions, students, misconceptionId: mis.id,
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   ניקוי — מגלה לפי הקידומת (שורד קריסה באמצע), ולכן עובד גם בלי fx.
   ══════════════════════════════════════════════════════════════════════════ */
const like = `${FX_PREFIX}%`
const ids = (rows: { id: string }[] | null): string[] => (rows ?? []).map((r) => r.id)
const NONE = ['00000000-0000-0000-0000-000000000000']

async function authUsersWithPrefix(): Promise<{ id: string; email: string }[]> {
  const out: { id: string; email: string }[] = []
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error || !data) break
    for (const u of data.users) if ((u.email ?? '').startsWith(FX_PREFIX)) out.push({ id: u.id, email: u.email ?? '' })
    if (data.users.length < 1000) break
  }
  return out
}

export async function cleanupResultsFixture(fx?: ResultsFixture): Promise<void> {
  const del = async (table: string, col: string, vals: string[]) => { if (vals.length) await supabaseAdmin.from(table).delete().in(col, vals) }

  const [{ data: qs }, { data: us }, { data: cs }, { data: ms }, { data: ss }] = await Promise.all([
    supabaseAdmin.from('quests').select('id').like('title', like),
    supabaseAdmin.from('users').select('id, auth_id').like('name', like),
    supabaseAdmin.from('classes').select('id').like('name', like),
    supabaseAdmin.from('misconceptions').select('id').like('code', like),
    supabaseAdmin.from('schools').select('id').like('name', like),
  ])
  const questIds = [...new Set([...ids(qs), ...(fx ? Object.values(fx.quests) : [])])]
  const userRows = (us ?? []) as { id: string; auth_id: string | null }[]
  const userIds = [...new Set([...userRows.map((u) => u.id), ...(fx ? [...Object.values(fx.teachers).map((t) => t.userId), ...Object.values(fx.students).map((s) => s.id)] : [])])]
  const classIds = [...new Set([...ids(cs), ...(fx ? [fx.classId, fx.otherClassId] : [])])]
  const misIds = [...new Set([...ids(ms), ...(fx ? [fx.misconceptionId] : [])])]
  const schoolIds = [...new Set([...ids(ss), ...(fx ? [fx.schoolId] : [])])]

  const { data: sess } = await supabaseAdmin.from('sessions').select('id').in('quest_id', questIds.length ? questIds : NONE)
  const { data: sess2 } = await supabaseAdmin.from('sessions').select('id').in('user_id', userIds.length ? userIds : NONE)
  const sessionIds = [...new Set([...ids(sess), ...ids(sess2)])]

  for (const part of chunk(sessionIds)) {
    await del('answers', 'session_id', part)
    await del('events', 'session_id', part)
    await del('progress_snapshots', 'session_id', part)
    await del('level_history', 'session_id', part)
    await del('sessions', 'id', part)
  }
  await del('answers', 'quest_id', questIds)
  await del('events', 'quest_id', questIds)
  await del('option_tags', 'quest_id', questIds)
  await del('moral_choices', 'quest_id', questIds)
  await del('misconception_content_links', 'quest_id', questIds)
  await del('misconception_content_links', 'misconception_id', misIds)
  await del('option_tags', 'misconception_id', misIds)
  for (const t of ['level_history', 'student_subject_levels', 'progress_snapshots']) await del(t, 'student_id', userIds)
  await del('difficulty_profiles', 'user_id', userIds)
  await del('data_access_log', 'viewer_id', userIds)
  await del('data_access_log', 'student_id', userIds)
  await del('assignments', 'quest_id', questIds)
  await del('assignments', 'class_id', classIds)
  await del('class_teachers', 'class_id', classIds)
  await del('class_teachers', 'teacher_id', userIds)
  await del('class_members', 'class_id', classIds)
  await del('class_members', 'user_id', userIds)
  await del('quests', 'id', questIds)
  await del('misconceptions', 'id', misIds)
  await del('classes', 'id', classIds)
  await del('users', 'id', userIds)
  const authIds = new Set<string>(userRows.map((u) => u.auth_id).filter((a): a is string => !!a))
  for (const a of await authUsersWithPrefix()) authIds.add(a.id)
  for (const a of authIds) await supabaseAdmin.auth.admin.deleteUser(a).catch(() => {})
  await del('schools', 'id', schoolIds)
}

function chunk<T>(a: T[], n = 100): T[][] {
  const out: T[][] = []
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n))
  return out
}

/* כמה שורות zz-ux-* נשארו (0 בכל מקום = נקי). משמש את בדיקת הקבלה. */
export async function leftoverResultsFixture(fx?: ResultsFixture): Promise<Record<string, number>> {
  const count = async (table: string, col: string): Promise<number> => {
    const { count: n } = await supabaseAdmin.from(table).select('*', { count: 'exact', head: true }).like(col, like)
    return n ?? 0
  }
  const out: Record<string, number> = {
    schools: await count('schools', 'name'), users: await count('users', 'name'), classes: await count('classes', 'name'),
    quests: await count('quests', 'title'), misconceptions: await count('misconceptions', 'code'),
    auth_users: (await authUsersWithPrefix()).length,
  }
  /* שורות תלויות שאין להן קידומת משלהן: sessions/answers/events/assignments של הדמיות או משתמשים כאלה */
  const { data: qs } = await supabaseAdmin.from('quests').select('id').like('title', like)
  const { data: us } = await supabaseAdmin.from('users').select('id').like('name', like)
  const qAll = [...ids(qs), ...(fx ? Object.values(fx.quests) : [])]
  const uAll = [...ids(us), ...(fx ? [...Object.values(fx.teachers).map((t) => t.userId), ...Object.values(fx.students).map((x) => x.id)] : [])]
  const q = qAll.length ? qAll : NONE
  const u = uAll.length ? uAll : NONE
  for (const [t, c, vals] of [['sessions', 'quest_id', q], ['answers', 'quest_id', q], ['events', 'quest_id', q], ['assignments', 'quest_id', q], ['option_tags', 'quest_id', q], ['class_members', 'user_id', u], ['class_teachers', 'teacher_id', u], ['data_access_log', 'viewer_id', u]] as const) {
    const { count: n } = await supabaseAdmin.from(t).select('*', { count: 'exact', head: true }).in(c, [...vals])
    out[t] = n ?? 0
  }
  return out
}
