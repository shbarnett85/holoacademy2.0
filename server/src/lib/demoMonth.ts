/* ── העולם החודשי של ארגון ההדגמה ─────────────────────────────────────────────────────
   ארגון עם demo_data_enabled (נשר) מקבל נתונים פיקטיביים שתמיד נראים עדכניים: החודש האחרון של הנתונים
   הוא החודש הקודם לכניסה. נכנסים בנובמבר — רואים נתונים מאוקטובר (ומשני החודשים שלפניו); נכנסים בדצמבר — מנובמבר.

   · בנייה (buildDemoWorld, דרך scripts/demoMonthWorld.ts): שתי כיתות ח׳ עם 10 תלמידים בכל אחת, מחנך/ת פיקטיבי/ת לכל כיתה,
     ו-15 שיעורים בחמישה מקצועות, 5 בכל חודש, שנשלחים לשתי הכיתות. התוצאות נכתבות דרך אותו מסלול כמו התוצאות
     של תלמידים אמיתיים (demoData.writeSession: sessions, events, answers, כיול, snapshot), עם is_synthetic/is_fictitious.
   · גלגול (rollDemoWorld): כשהחודש מתחלף, כל מועדי הנתונים הפיקטיביים של הארגון זזים באותו מספר חודשים קדימה.
     לא בונים מחדש: אותם תלמידים ואותן תוצאות, רק התאריכים. נעילה: ההקצאה האחרונה מוזזת ראשונה בעדכון מותנה
     (created_at הישן), ורק מי שהצליח ממשיך — שני שרתים על אותו מסד (פיתוח ופרודקשן) לא יזיזו פעמיים.
   · הפעלה: ensureDemoMonth(schoolId) מכל בקשת צוות בארגון הדגמה (staffAuth), ברקע ופעם בחודש לכל תהליך.
   הקובץ לא נוגע בשום שורה שאינה פיקטיבית/סינתטית, ובשום ארגון אחר. */
import { randomBytes } from 'node:crypto'
import { supabaseAdmin } from './supabase.js'
import { israelMonthRange } from '../../../src/shared/lib/lessonState.js'
import { extractPuzzles, fakeStudentName, hashStr, simulateSession, behaviorForIndex } from './demoSim.js'
import { deleteDemoData, fictitiousIndexFromName, tierOfStudentName, writeSession, type QuestRow } from './demoData.js'
import { invalidateAllClassAnalyses } from './analyticsV2/analysisCache.js'

export const DEMO_MONTHS = 3
const LESSONS_PER_MONTH = 5
const STUDENTS_PER_CLASS = 10
const SEED_TAG = 'demo-world'

export interface MonthRef { year: number; month1: number }
export const monthIndex = (m: MonthRef): number => m.year * 12 + (m.month1 - 1)
export const monthOfIndex = (i: number): MonthRef => ({ year: Math.floor(i / 12), month1: (i % 12) + 1 })

/* החודש האחרון של הנתונים: החודש הקודם לחודש הנוכחי בשעון ישראל */
export function anchorMonth(now: Date): MonthRef {
  const cur = israelMonthRange(now)
  return monthOfIndex(monthIndex({ year: cur.year, month1: cur.month1 }) - 1)
}

/* חודש קדימה/אחורה באותו יום בחודש (31 בינואר + חודש = 28/29 בפברואר), באותה שעה */
export function addMonthsKeepDay(d: Date, n: number): Date {
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + n
  const target = new Date(Date.UTC(y, m, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()))
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d.getUTCDate(), last))
  return target
}

/* הימים בחודש שבהם נשלחים השיעורים. שישי ושבת עוברים לחמישי/ראשון הקרובים */
const SEND_DAYS = [3, 8, 13, 18, 23]
export function schoolDay(year: number, month1: number, day: number): Date {
  const d = new Date(Date.UTC(year, month1 - 1, day, 6, 30)) /* 08:30–09:30 בשעון ישראל */
  const wd = d.getUTCDay()
  if (wd === 5) d.setUTCDate(d.getUTCDate() - 1)
  if (wd === 6) d.setUTCDate(d.getUTCDate() + 1)
  return d
}

/* השיעורים, לפי הסדר: 5 בכל חודש, מהחודש הוותיק לחדש. source = שיעור קיים שמועתק לארגון (או שיעור הדגמה שכבר שלו) */
export const WORLD_LESSONS: { source: string; subject: string }[] = [
  { source: '602eac4b-294a-4020-8095-6bef191ee870', subject: 'math' }, /* עוגה בחלקים — שברים פשוטים */
  { source: 'd806d6af-6831-49ee-a249-b8284bf5ea0d', subject: 'history' }, /* מסעות הגילוי הגדולים */
  { source: 'e936f73f-b5f9-4c99-9a0c-64317673007a', subject: 'science' }, /* דמו — מערכת השמש */
  { source: 'c5471a48-c27c-4ec7-bb30-9545b0bfe663', subject: 'hebrew' }, /* בלשי השורש */
  { source: '4cd08af5-6a74-468c-aa6c-5a277670cd5b', subject: 'history' }, /* המצאת הדפוס */
  { source: 'da43e443-e55d-477b-a735-7cf4a2cad6c3', subject: 'math' }, /* שברים פשוטים */
  { source: 'bb86b579-47f2-4d1e-aff1-dc3435cb0a85', subject: 'history' }, /* לאונרדו דה וינצ'י */
  { source: '3e5a11f2-f2de-47f4-927e-f0d41801d022', subject: 'bible' }, /* דמו — דוד וגליית */
  { source: 'c9609a23-9fb6-4595-987c-7539c091129a', subject: 'hebrew' }, /* חכמת המשל */
  { source: '679dc19b-0dd8-4fc4-b220-fc3100dad35d', subject: 'math' }, /* מספרים עשרוניים */
  { source: 'c23e708f-dacb-454d-9d9e-e03badbc375c', subject: 'math' }, /* דמו — ציידי ההנחות */
  { source: '3e993e20-41dc-4fd6-9032-5dbf6651830d', subject: 'history' }, /* המהפכה התעשייתית */
  { source: '33e2ff26-4a6c-4efb-8f47-a4982c91aadc', subject: 'science' }, /* מסע טיפת המים */
  { source: '544dbd9b-bf55-4bea-89e7-8d3b094a83a3', subject: 'bible' }, /* תיבת נח */
  { source: 'e5a59695-8fa0-4800-a769-b81701d299ae', subject: 'history' }, /* יוון העתיקה */
]

/* מועד השליחה של כל שיעור: DEMO_MONTHS חודשים שמסתיימים בחודש העוגן */
export function lessonSendDates(anchor: MonthRef): Date[] {
  const first = monthIndex(anchor) - (DEMO_MONTHS - 1)
  return WORLD_LESSONS.map((_, i) => {
    const m = monthOfIndex(first + Math.floor(i / LESSONS_PER_MONTH))
    return schoolDay(m.year, m.month1, SEND_DAYS[i % LESSONS_PER_MONTH])
  })
}

/* מתי תלמיד/ה התחיל/ה שיעור: 0–4 ימים אחרי השליחה, בשעות הלימודים, דטרמיניסטי */
export function studentStart(sentAt: Date, studentId: string, questId: string): Date {
  const h = hashStr(studentId + questId)
  const d = new Date(sentAt.getTime() + (h % 5) * 86_400_000 + (1 + (h >>> 3) % 5) * 3_600_000)
  const wd = d.getUTCDay()
  if (wd === 5) d.setUTCDate(d.getUTCDate() + 2)
  if (wd === 6) d.setUTCDate(d.getUTCDate() + 1)
  return d
}

/* ── כמה חודשים להזיז: החודש של ההקצאה האחרונה מול חודש העוגן ── */
export function monthsToShift(latestSentAt: Date, now: Date): number {
  const r = israelMonthRange(latestSentAt)
  return monthIndex(anchorMonth(now)) - monthIndex({ year: r.year, month1: r.month1 })
}

/* ─────────────────────────── גלגול ─────────────────────────── */

interface Scope { classIds: string[]; studentIds: string[]; sessionIds: string[] }

async function demoScope(schoolId: string): Promise<Scope> {
  const { data: cls } = await supabaseAdmin.from('classes').select('id').eq('school_id', schoolId).eq('is_fictitious', true)
  const classIds = (cls ?? []).map((c) => c.id as string)
  if (classIds.length === 0) return { classIds, studentIds: [], sessionIds: [] }
  const { data: mem } = await supabaseAdmin.from('class_members').select('user_id, users(role, is_fictitious)').in('class_id', classIds)
  const studentIds = [...new Set((mem ?? []).filter((m) => {
    const u = (Array.isArray(m.users) ? m.users[0] : m.users) as { role: string; is_fictitious?: boolean } | null
    return !!u && u.role === 'student' && u.is_fictitious === true
  }).map((m) => m.user_id as string))]
  const sessionIds: string[] = []
  for (const part of chunks(studentIds, 100)) {
    const { data } = await supabaseAdmin.from('sessions').select('id').in('user_id', part).eq('is_fictitious', true)
    sessionIds.push(...(data ?? []).map((s) => s.id as string))
  }
  return { classIds, studentIds, sessionIds }
}

const chunks = <T,>(a: T[], n: number): T[][] => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))

/* מזיז את עמודות הזמן בשורות שנבחרו: קריאה מלאה, הזזה, upsert לפי המפתח. שורה בלי ערך נשארת כמו שהיא */
async function shiftRows(table: string, key: string, filterCol: string, ids: string[], cols: string[], months: number, extra?: (q: any) => any): Promise<number> { // eslint-disable-line @typescript-eslint/no-explicit-any
  let n = 0
  for (const part of chunks(ids, 100)) {
    let from = 0
    for (;;) {
      let q = supabaseAdmin.from(table).select('*').in(filterCol, part).order(key).range(from, from + 499)
      if (extra) q = extra(q)
      const { data, error } = await q
      if (error) {
        if (/does not exist|schema cache/i.test(error.message)) return n /* טבלה שלא קיימת במסד הזה */
        throw new Error(`${table}: ${error.message}`)
      }
      const rows = (data ?? []) as Record<string, unknown>[]
      if (rows.length === 0) break
      const moved = rows.map((r) => {
        const out = { ...r }
        for (const c of cols) if (typeof r[c] === 'string') out[c] = addMonthsKeepDay(new Date(r[c] as string), months).toISOString()
        return out
      })
      const { error: upErr } = await supabaseAdmin.from(table).upsert(moved, { onConflict: key })
      if (upErr) throw new Error(`${table} upsert: ${upErr.message}`)
      n += rows.length
      if (rows.length < 500) break
      from += 500
    }
  }
  return n
}

/* allowBack: גם אחורה (רק לבדיקה ידנית, scripts/demoMonthWorld.ts --roll-to) */
export async function rollDemoWorld(schoolId: string, now: Date = new Date(), opts: { allowBack?: boolean } = {}): Promise<{ shifted: number; months: number } | null> {
  const scope = await demoScope(schoolId)
  if (scope.classIds.length === 0) return null
  const { data: latest } = await supabaseAdmin.from('assignments').select('id, created_at, due_at, due_date')
    .in('class_id', scope.classIds).order('created_at', { ascending: false }).limit(1)
  const sentinel = latest?.[0] as { id: string; created_at: string; due_at: string | null; due_date: string | null } | undefined
  if (!sentinel) return null
  const months = monthsToShift(new Date(sentinel.created_at), now)
  if (months === 0 || (months < 0 && !opts.allowBack)) return { shifted: 0, months: 0 }

  /* נעילה: רק מי שמזיז את ההקצאה האחרונה (עדיין עם המועד הישן) ממשיך */
  const mv = (v: string | null) => (v ? addMonthsKeepDay(new Date(v), months).toISOString() : v)
  const { data: won } = await supabaseAdmin.from('assignments')
    .update({ created_at: mv(sentinel.created_at), due_at: mv(sentinel.due_at), due_date: mv(sentinel.due_date) })
    .eq('id', sentinel.id).eq('created_at', sentinel.created_at).select('id')
  if (!won || won.length === 0) return { shifted: 0, months: 0 }

  let shifted = 1
  shifted += await shiftRows('assignments', 'id', 'class_id', scope.classIds, ['created_at', 'due_at', 'due_date'], months, (q) => q.neq('id', sentinel.id))
  shifted += await shiftRows('sessions', 'id', 'id', scope.sessionIds, ['started_at', 'completed_at', 'last_seen_at'], months)
  shifted += await shiftRows('events', 'id', 'session_id', scope.sessionIds, ['created_at'], months)
  shifted += await shiftRows('answers', 'id', 'session_id', scope.sessionIds, ['created_at'], months)
  shifted += await shiftRows('progress_snapshots', 'id', 'student_id', scope.studentIds, ['taken_at', 'created_at'], months)
  shifted += await shiftRows('difficulty_profiles', 'id', 'user_id', scope.studentIds, ['last_updated'], months)
  invalidateAllClassAnalyses()
  console.log(`[demo-month] ${schoolId}: ${months} חודשים קדימה, ${shifted} שורות`)
  return { shifted, months }
}

/* פעם בחודש לכל ארגון בכל תהליך; ריצה אחת בכל פעם. כבוי בבדיקות ועם DEMO_MONTH_ROLL=0 */
const done = new Map<string, number>()
const running = new Map<string, Promise<unknown>>()
export function ensureDemoMonth(schoolId: string, now: Date = new Date()): void {
  if (process.env.DEMO_MONTH_ROLL === '0' || process.env.VITEST || process.env.NODE_ENV === 'test') return
  const key = monthIndex(anchorMonth(now))
  if (done.get(schoolId) === key || running.has(schoolId)) return
  const p = rollDemoWorld(schoolId, now)
    .then(() => { done.set(schoolId, key) })
    .catch((e) => { console.error('[demo-month] הגלגול נכשל:', e instanceof Error ? e.message : e) })
    .finally(() => running.delete(schoolId))
  running.set(schoolId, p)
}

/* ─────────────────────────── בנייה ─────────────────────────── */

async function subjectIds(): Promise<Map<string, string>> {
  const { data } = await supabaseAdmin.from('subjects').select('id, code')
  return new Map((data ?? []).map((s) => [s.code as string, s.id as string]))
}

async function register(table: string, id: string): Promise<void> {
  await supabaseAdmin.from('demo_seed_registry').insert({ seed_tag: `demo-seed:${SEED_TAG}`, table_name: table, row_id: id })
}

async function ensureTeacher(schoolId: string, name: string): Promise<string> {
  const { data } = await supabaseAdmin.from('users').select('id').eq('school_id', schoolId).eq('name', name).eq('role', 'teacher').eq('is_fictitious', true).limit(1)
  if (data?.[0]) return data[0].id as string
  const { data: u, error } = await supabaseAdmin.from('users').insert({ name, role: 'teacher', school_id: schoolId, is_fictitious: true, can_share: false }).select('id').single()
  if (error || !u) throw new Error('teacher: ' + error?.message)
  await register('users', u.id)
  return u.id as string
}

async function ensureClass(schoolId: string, schoolSlug: string, name: string, gradeLabel: string, teacherId: string): Promise<string> {
  const { data } = await supabaseAdmin.from('classes').select('id').eq('school_id', schoolId).eq('name', name).eq('is_fictitious', true).limit(1)
  let id = data?.[0]?.id as string | undefined
  if (!id) {
    const code = `${schoolSlug}-${randomBytes(2).toString('hex')}`
    const { data: c, error } = await supabaseAdmin.from('classes').insert({ name, slug: code, url_code: code, school_id: schoolId, is_fictitious: true, grade_label: gradeLabel, grade_level: 8, teacher_id: teacherId }).select('id').single()
    if (error || !c) throw new Error('class: ' + error?.message)
    id = c.id as string
    await register('classes', id)
  } else {
    await supabaseAdmin.from('classes').update({ grade_label: gradeLabel, grade_level: 8, teacher_id: teacherId }).eq('id', id)
  }
  const { data: link } = await supabaseAdmin.from('class_teachers').select('id').eq('class_id', id).eq('teacher_id', teacherId).limit(1)
  if (!link?.length) await supabaseAdmin.from('class_teachers').insert({ class_id: id, teacher_id: teacherId, subject: '', is_homeroom: true })
  return id
}

async function ensureStudents(schoolId: string, classId: string, startIndex: number): Promise<{ id: string; name: string }[]> {
  const { data: mem } = await supabaseAdmin.from('class_members').select('users(id, name, role, is_fictitious)').eq('class_id', classId)
  const have = (mem ?? []).map((m) => (Array.isArray(m.users) ? m.users[0] : m.users) as { id: string; name: string; role: string; is_fictitious?: boolean } | null)
    .filter((u): u is { id: string; name: string; role: string; is_fictitious?: boolean } => !!u && u.role === 'student' && u.is_fictitious === true)
  const out = have.map((u) => ({ id: u.id, name: u.name }))
  for (let n = startIndex; out.length < STUDENTS_PER_CLASS; n++) {
    const name = fakeStudentName(n)
    if (out.some((u) => u.name === name)) continue
    const { data: u, error } = await supabaseAdmin.from('users').insert({ name, role: 'student', school_id: schoolId, is_fictitious: true, pin: String(1000 + (hashStr(name) % 9000)) }).select('id, name').single()
    if (error || !u) throw new Error('student: ' + error?.message)
    await supabaseAdmin.from('class_members').insert({ class_id: classId, user_id: u.id })
    await register('users', u.id)
    out.push({ id: u.id as string, name: u.name as string })
  }
  return out
}

/* עותק של שיעור קיים בארגון (שיעור הדגמה שכבר שייך לארגון — רק המקצוע מתעדכן) */
async function ensureLesson(schoolId: string, teacherId: string, source: string, subjectId: string): Promise<QuestRow> {
  const { data: src, error } = await supabaseAdmin.from('quests').select('*').eq('id', source).single()
  if (error || !src) throw new Error('lesson ' + source + ': ' + error?.message)
  if (src.created_by === teacherId) {
    await supabaseAdmin.from('quests').update({ subject_id: subjectId }).eq('id', source)
    return { id: src.id, title: src.title, game_data: src.game_data, created_by: src.created_by, subject_id: subjectId }
  }
  const title = `דמו — ${String(src.title).replace(/^דמו — /, '')}`
  const { data: existing } = await supabaseAdmin.from('quests').select('id, title, game_data, created_by, subject_id').eq('created_by', teacherId).eq('title', title).limit(1)
  if (existing?.[0]) {
    await supabaseAdmin.from('quests').update({ subject_id: subjectId }).eq('id', existing[0].id)
    return { ...(existing[0] as QuestRow), subject_id: subjectId }
  }
  const copy: Record<string, unknown> = {
    created_by: teacherId, school_id: schoolId, title, curriculum: src.curriculum, art_style: src.art_style, quest_type: src.quest_type,
    quest_length: src.quest_length, include_dr_holo: src.include_dr_holo, puzzle_preferences: src.puzzle_preferences,
    difficulty_settings: src.difficulty_settings, game_data: src.game_data, status: 'published', is_public: false,
    subject_id: subjectId, thumb_url: src.thumb_url, thumb_src: src.thumb_src, grade_min: src.grade_min, grade_max: src.grade_max,
  }
  const { data: q, error: qe } = await supabaseAdmin.from('quests').insert(copy).select('id, title, game_data, created_by, subject_id').single()
  if (qe || !q) throw new Error('lesson copy: ' + qe?.message)
  await register('quests', q.id)
  return q as QuestRow
}

/* בונה את העולם מאפס: מוחק את הכיתות והתוצאות הפיקטיביות של הארגון (לא את המורים ולא את השיעורים), ואז כותב את הכול מחדש */
export async function buildDemoWorld(schoolId: string, now: Date = new Date(), log: (s: string) => void = () => {}): Promise<{ classes: number; students: number; lessons: number; sessions: number; anchor: MonthRef }> {
  const { data: school } = await supabaseAdmin.from('schools').select('id, slug, demo_data_enabled').eq('id', schoolId).single()
  if (!school?.demo_data_enabled) throw new Error('הארגון אינו ארגון הדגמה (demo_data_enabled)')
  const subj = await subjectIds()
  const anchor = anchorMonth(now)

  /* המורים: המחנך/ת הקיים/ת של ח׳1 (נשמר/ת, כי ייתכן שיש לו/ה חשבון כניסה) ומחנך/ת חדש/ה לח׳2 */
  const { data: oldLink } = await supabaseAdmin.from('users').select('id').eq('school_id', schoolId).eq('role', 'teacher').eq('is_fictitious', true).order('created_at').limit(1)
  const teacher1 = (oldLink?.[0]?.id as string | undefined) ?? await ensureTeacher(schoolId, 'מורה דמו')
  const teacher2 = await ensureTeacher(schoolId, 'מורה דמו ב')

  log('מוחק את התוצאות והכיתות הפיקטיביות הקודמות')
  await deleteDemoData({ schoolId, actorId: teacher1, role: 'municipal_admin' })

  const slug = (school.slug as string | null) ?? 'demo'
  const classes = [
    { id: await ensureClass(schoolId, slug, 'דמו ח׳1', 'ח׳1', teacher1), teacher: teacher1, start: 0 },
    { id: await ensureClass(schoolId, slug, 'דמו ח׳2', 'ח׳2', teacher2), teacher: teacher2, start: STUDENTS_PER_CLASS },
  ]
  const lessons: QuestRow[] = []
  for (const l of WORLD_LESSONS) {
    const sid = subj.get(l.subject)
    if (!sid) throw new Error('מקצוע חסר: ' + l.subject)
    lessons.push(await ensureLesson(schoolId, teacher1, l.source, sid))
  }
  const sentAt = lessonSendDates(anchor)

  let sessions = 0
  let studentsTotal = 0
  for (const c of classes) {
    const students = await ensureStudents(schoolId, c.id, c.start)
    studentsTotal += students.length
    for (let i = 0; i < lessons.length; i++) {
      const due = new Date(sentAt[i].getTime() + 7 * 86_400_000)
      due.setUTCHours(20, 59, 0, 0)
      await supabaseAdmin.from('assignments').insert({ class_id: c.id, quest_id: lessons[i].id, user_id: c.teacher, created_at: sentAt[i].toISOString(), due_at: due.toISOString(), due_date: due.toISOString() })
    }
    for (const stu of students) {
      const tier = tierOfStudentName(stu.name)
      const behavior = behaviorForIndex(fictitiousIndexFromName(stu.name))
      /* כרונולוגי, כדי שהכיול יתפתח כמו אצל תלמיד/ה אמיתי/ת */
      for (let i = 0; i < lessons.length; i++) {
        const q = lessons[i]
        if (extractPuzzles(q.game_data).puzzles.length === 0) continue
        const sim = simulateSession({ studentId: stu.id, questId: q.id, tier, gameData: q.game_data, questIndex: i, behavior, progress: lessons.length > 1 ? i / (lessons.length - 1) : 1 })
        if (await writeSession(stu.id, c.id, q, sim, studentStart(sentAt[i], stu.id, q.id))) sessions++
      }
      log(`${stu.name}: עד עכשיו ${sessions} משחקים`)
    }
  }
  invalidateAllClassAnalyses()
  return { classes: classes.length, students: studentsTotal, lessons: lessons.length, sessions, anchor }
}
