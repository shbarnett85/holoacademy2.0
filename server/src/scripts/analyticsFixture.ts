/* ── פיקסצ'ר חי לאנליטיקה v2 (מורים אמיתיים, ספק חי) ───────────────────────────────────
   יוצר בבסיס הנתונים (המשותף עם הפרודקשן!) ארגונים זמניים — בתי ספר, מורים בכל התפקידים, כיתות, תלמידים, הדמיות
   מסווגות לפי מקצוע, sessions, progress_snapshots, answers ו-events — **כל שורה עם הקידומת zz-ux-v2-w8-** (שם / כותרת / אימייל),
   כדי שאפשר יהיה לנקות אותה בוודאות (cleanupAnalyticsFixture) ולוודא שלא נשאר דבר (leftoverAnalyticsFixture).
   המחיקה לעולם אינה LIKE גורף: הקידומת הייחודית משמשת רק לגילוי מזהים, והמחיקה עצמה לפי מזהים.
   אין is_synthetic: השורות "אמיתיות" כדי שהספק החי יציג אותן (הספק החי מסתיר סינתטי לצופה שאינו בארגון הדגמה).

   שימוש:
     import { seedAnalyticsFixture, cleanupAnalyticsFixture } from './analyticsFixture.js'
     const fx = await seedAnalyticsFixture()      // fx.teachers.homeroom.token = JWT של Supabase לשימוש ב-Authorization: Bearer
     ...
     await cleanupAnalyticsFixture(fx)             // fx אופציונלי — הניקוי מגלה לפי הקידומת, ולכן עובד גם אחרי קריסה
   שורת פקודה (cleanup / leftover בלבד — ה-seed מחזיר טוקנים בזיכרון, לכן נקרא מקוד):  npm run fixture:v2 -- <cleanup|leftover>
   למריץ ה-e2e (e2e/lib/fixtureChild.ts): export בשם seedFixture / cleanupFixture.
   מה שה-seed מחזיר: { schoolId, classes, ids, teachers[תפקיד].{userId,name,email,password,token}, students, subjectIds, expected } — ראו AnalyticsFixture.

   מה נוצר (הכול דטרמיניסטי — seed קבוע; הזמן מחושב מימי הלימוד של היום):
   · כיתה עשירה (rich, שכבה ו׳, 14 תלמידים): מתמטיקה ועברית (~14–18 משחקים לתלמיד-מקצוע; המנוע משווה חלון של 60 ימי לימוד אחרונים מול 120 שלפניו, ולכן המשחקים פרושים על פני ~150 ימי לימוד), מדעים (5 תלמידים),
     תנ"ך (2 תלמידים), היסטוריה כמקצוע-כיתה בלי נתונים, ו-6 משחקים בהדמיות בלי מקצוע. כל סיפור = תלמיד אחד (ראו STORIES):
       trendUp / trendDown / crossDip → מגמת רמה מדווחת (עלייה / ירידה / ירידה בשני מקצועות = התרעה חוצת-מקצועות למחנך)
       positionBias → הטיית מיקום · memoryRandom → דפוס זיכרון אקראי · readingSkipper → דילוג קריאה
       controlMc / memoryAttentive / steady* → בקרות (אין ממצא) · almost → שינוי גדול אך N קטן ("אין עדיין מספיק נתונים")
       newcomer → 3 משחקים בלבד במתמטיקה (שניים אחרונים ברמה 9.8, אחד ישן ברמה 7.6) — אין ממצא, אך תווית המגמה בלוח מחושבת גם מכך.
   · כיתה דלה (sparse, שכבה ו׳, 3 תלמידים, 2 משחקים לכל אחד: מתמטיקה + עברית).
   · כיתה בלי נתונים (empty, שכבה ה׳, 6 תלמידים, אפס משחקים).
   · מורים: homeroom (מחנך rich) · subject (מתמטיקה ב-rich) · mixed (מחנך sparse + עברית ב-rich) · cross (מתמטיקה ב-sparse + היסטוריה ב-rich —
     מלכודת המכפלה הקרטזית) · unspecified (שיוך ב-rich בלי מקצוע ובלי מחנכות) · emptyHomeroom (מחנך empty) · noClasses (בלי כיתות)
     · admin (מנהל בית הספר) · municipal (מנהל עירוני). unlinked = כינוי של noClasses.
   · כיתות dualA + dualB: תלמיד/ה משותף/ת (4 משחקי מתמטיקה + 4 תנ"ך, הכיתה העיקרית dualB) ומורה dual (מחנך dualA + תנ"ך ב-dualB).
   · בית ספר שני (בידוד בין בתי ספר): כיתה other (ו׳9, 2 תלמידים) + outsider (מחנך שלה) + outsiderAdmin (המנהל שלו). בית ספר שלישי בלי כיתות: emptySchoolAdmin.
   סיסמאות אקראיות בזיכרון בלבד; לא מודפסות. סך השורות ~1,250 (37 משתמשים, ~420 משחקים + snapshots, ~170 אירועי קריאה, ~75 תשובות, 44 הדמיות); יצירה ~13 שניות. לא מפעיל שום LLM.                                           */
import '../env.js'
import { randomBytes, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { hasIsActive } from '../lib/activeColumn.js'
import { buildSchoolDays } from '../lib/analyticsV2/schoolCalendar.js'
import { schemaHas } from '../lib/analyticsV2/realWorld/queryUtil.js'
import { supabaseAdmin, supabaseAnon } from '../lib/supabase.js'

/* תת-קידומת ייחודית לפיקסצ'ר הזה: סוכנים אחרים משתמשים ב-zz-ux-* לשורות זמניות משלהם. הניקוי כאן מגלה מזהים לפי הקידומת המלאה בלבד. */
export const FX_PREFIX = 'zz-ux-v2-w8-'

export interface FxPrincipal { userId: string; name: string; email: string; password: string; token: string }
export interface FxClass { id: string; name: string; grade: number }
export interface FxStudent { id: string; name: string; story: string }
export type FxSubject = 'math' | 'hebrew' | 'history' | 'science' | 'bible'

export interface AnalyticsFixture {
  prefix: string
  schoolId: string
  /* בית ספר שני (בידוד בין בתי ספר): כיתה אחת עם שני תלמידים, מחנך ומנהל */
  otherSchoolId: string
  /* בית ספר שלישי בלי אף כיתה: מנהל בית ספר חדש (ההיקף ריק — אסור שייכשל) */
  emptySchoolId: string
  classes: { rich: FxClass; sparse: FxClass; empty: FxClass; other: FxClass; dualA: FxClass; dualB: FxClass }
  subjectIds: Record<FxSubject, string>
  /* מזהים נוחים לתרחישי e2e (כיתה עשירה, תלמידה לדוגמה …) */
  ids: {
    classId: string
    homeroomClassId: string
    sparseClassId: string
    emptyClassId: string
    /* תלמידה בירידה בשני מקצועות: ממצאים בשני מקצועות + התרעה חוצת-מקצועות למחנך */
    attentionStudentId: string
    studentId: string
    /* תלמיד בלי ממצאים (יציב) */
    calmStudentId: string
    /* תלמיד בכיתה בלי נתונים */
    emptyStudentId: string
    /* המקצוע שבו יש הכי הרבה נתונים */
    subject: 'math'
  }
  teachers: {
    homeroom: FxPrincipal
    subject: FxPrincipal
    mixed: FxPrincipal
    cross: FxPrincipal
    unspecified: FxPrincipal
    emptyHomeroom: FxPrincipal
    noClasses: FxPrincipal
    /* כינוי של noClasses (שם התפקיד ב-e2e של התוצאות) */
    unlinked: FxPrincipal
    admin: FxPrincipal
    municipal: FxPrincipal
    /* בית הספר השני: מחנך הכיתה שלו, והמנהל שלו (אין לו אף כיתה אחרת מלבד other) */
    outsider: FxPrincipal
    outsiderAdmin: FxPrincipal
    emptySchoolAdmin: FxPrincipal
    /* מחנך dualA + מורה תנ"ך ב-dualB: תלמיד/ה משותף/ת לשתי הכיתות (הכיתה העיקרית שלו/ה היא dualB) */
    dual: FxPrincipal
  }
  /* תלמידים לפי כיתה ולפי שם-סיפור (rich: STORIES; sparse: s1..s3; empty: e1..e6; other: o1..o2) */
  students: {
    rich: Record<string, FxStudent>
    sparse: Record<string, FxStudent>
    empty: Record<string, FxStudent>
    other: Record<string, FxStudent>
    /* shared = חבר/ה בשתי הכיתות dualA ו-dualB, עם משחקי מתמטיקה ותנ"ך; a1 / b1 = תלמיד/ה בכיתה אחת בלבד */
    dual: Record<string, FxStudent>
  }
  /* מה שהמנוע החי אמור לדווח על הנתונים האלה — נבדק ב-v2Acceptance */
  expected: {
    richStudentCount: number
    sparseStudentCount: number
    emptyStudentCount: number
    /* משחקים בהדמיות בלי מקצוע (בכיתה rich) */
    unclassifiedSessions: number
    /* סיפורים (מפתחות students.rich) שאמורים לקבל ממצא מדווח בטון "תשומת לב" */
    attentionStories: string[]
    positiveStories: string[]
  }
}

type Row = Record<string, unknown>

/* ══════════════════════════════════════════════════════════════════════════
   עזרים
   ══════════════════════════════════════════════════════════════════════════ */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))
const round1 = (v: number): number => Math.round(v * 10) / 10

async function insMany(table: string, rows: Row[], size = 250): Promise<void> {
  for (let i = 0; i < rows.length; i += size) {
    const { error } = await supabaseAdmin.from(table).insert(rows.slice(i, i + size))
    if (error) throw new Error(`${table} insert: ${error.message}`)
  }
}

/* ── יצירת חשבון צוות עם JWT ── */
async function mkStaff(schoolId: string, role: 'teacher' | 'admin' | 'municipal_admin', label: string): Promise<FxPrincipal> {
  const email = `${FX_PREFIX}${label}-${randomBytes(3).toString('hex')}@example.com`
  const password = randomBytes(18).toString('base64url')
  const { data: au, error } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !au.user) throw new Error('createUser: ' + error?.message)
  const name = `${FX_PREFIX}${label}`
  const act = (await hasIsActive('users')) ? { is_active: true } : {}
  const { data: u, error: ue } = await supabaseAdmin.from('users').insert({ name, role, school_id: schoolId, auth_id: au.user.id, ...act }).select('id').single()
  if (ue || !u) throw new Error('users insert: ' + ue?.message)
  const { data: s, error: se } = await supabaseAnon.auth.signInWithPassword({ email, password })
  if (se || !s.session) throw new Error('signIn: ' + se?.message)
  return { userId: (u as { id: string }).id, name, email, password, token: s.session.access_token }
}

/* ══════════════════════════════════════════════════════════════════════════
   התוכן: הדמיות (game_data זהה לכולן — MC · זיכרון של 8 זוגות · MC)
   ══════════════════════════════════════════════════════════════════════════ */
const PAIRS = 8
const GAME = {
  entrySceneId: 's0',
  scenes: [
    { id: 's0', title: 'zz-ux-v2-w8-פתיחה', narrative: 'פתיחה', nextSceneId: 's1' },
    { id: 's1', title: 'zz-ux-v2-w8-שאלה', narrative: 'שאלה', nextSceneId: 's2', puzzle: { type: 'multipleChoice', question: 'שאלה', difficulty: 5, choices: [
      { id: 'a', text: 'א', isCorrect: true }, { id: 'b', text: 'ב', isCorrect: false }, { id: 'c', text: 'ג', isCorrect: false }, { id: 'd', text: 'ד', isCorrect: false },
    ] } },
    { id: 's2', title: 'zz-ux-v2-w8-זיכרון', narrative: 'זוגות', nextSceneId: 's3', puzzle: { type: 'memory', question: 'התאימו', difficulty: 5, pairs: Array.from({ length: PAIRS }, (_, i) => ({ a: `מושג ${i}`, b: `הגדרה ${i}` })) } },
    { id: 's3', title: 'zz-ux-v2-w8-שאלה שנייה', narrative: 'שאלה', nextSceneId: 's4', puzzle: { type: 'multipleChoice', question: 'שאלה שנייה', difficulty: 5, choices: [
      { id: 'a', text: 'א', isCorrect: true }, { id: 'b', text: 'ב', isCorrect: false }, { id: 'c', text: 'ג', isCorrect: false }, { id: 'd', text: 'ד', isCorrect: false },
    ] } },
    { id: 's4', title: 'zz-ux-v2-w8-סיום', narrative: 'סיום' },
  ],
}

/* ══════════════════════════════════════════════════════════════════════════
   הסיפורים של הכיתה העשירה
   ══════════════════════════════════════════════════════════════════════════ */
interface Track {
  subject: FxSubject
  /* משחקים בחלון האחרון (ימי לימוד 0–59) ובחלון שלפניו (60–179) */
  recent: number
  prior: number
  /* רמה בחלון האחרון / הקודם (steady: אותה רמה) */
  recentLevel: number
  priorLevel: number
}
interface Story {
  key: string
  first: string
  last: string
  tracks: Track[]
  /* תלמיד שמקבל משחקי זיכרון בעברית: 'random' | 'attentive' */
  memory?: 'random' | 'attentive'
  /* תשובות רב-ברירה במתמטיקה: 'biased' (75% האפשרות הראשונה) | 'uniform' */
  mc?: 'biased' | 'uniform'
  /* אירועי קריאה במתמטיקה: 'normal' | 'skip' */
  reading?: 'normal' | 'skip'
}
const steady = (subject: FxSubject, level: number, n = 14): Track => ({ subject, recent: Math.ceil(n / 2), prior: Math.floor(n / 2), recentLevel: level, priorLevel: level })
const shift = (subject: FxSubject, priorLevel: number, recentLevel: number, nEach: number): Track => ({ subject, recent: nEach, prior: nEach, recentLevel, priorLevel })

/* שכבה ו׳ ← מרכז הנורמה 10, רצועה 8.5–11.5 */
const STORIES: Story[] = [
  { key: 'trendUp', first: 'אורי', last: 'שדה', tracks: [shift('math', 8.2, 10.4, 9), steady('hebrew', 9.6)] },
  { key: 'trendDown', first: 'דנה', last: 'ברק', tracks: [steady('math', 10.2), shift('hebrew', 11.0, 8.8, 9)] },
  { key: 'crossDip', first: 'תמר', last: 'לוי', tracks: [shift('math', 11.4, 8.9, 9), shift('hebrew', 10.8, 8.6, 9)] },
  { key: 'positionBias', first: 'יובל', last: 'כהן', tracks: [steady('math', 9.4, 15), steady('hebrew', 9.1)], mc: 'biased' },
  { key: 'controlMc', first: 'נועה', last: 'רז', tracks: [steady('math', 10.1, 15), steady('hebrew', 10.4)], mc: 'uniform' },
  { key: 'memoryRandom', first: 'איתי', last: 'גל', tracks: [steady('math', 9.0), steady('hebrew', 9.2)], memory: 'random' },
  { key: 'memoryAttentive', first: 'מאיה', last: 'חן', tracks: [steady('math', 9.8), steady('hebrew', 9.9)], memory: 'attentive' },
  { key: 'readingSkipper', first: 'רועי', last: 'אדמון', tracks: [steady('math', 10.3), steady('hebrew', 9.7), steady('science', 9.5, 3)], reading: 'skip' },
  { key: 'steadyA', first: 'שירה', last: 'מור', tracks: [steady('math', 8.7), steady('hebrew', 10.9), steady('science', 10.0, 3)], reading: 'normal' },
  { key: 'almost', first: 'ליאור', last: 'נחום', tracks: [steady('math', 9.9), shift('hebrew', 7.0, 10.0, 6), steady('science', 9.0, 3)], reading: 'normal' },
  { key: 'steadyB', first: 'אלון', last: 'פרידמן', tracks: [steady('math', 9.5), steady('hebrew', 9.3)], reading: 'normal' },
  { key: 'lowLevel', first: 'הדס', last: 'שמש', tracks: [steady('math', 6.8), steady('hebrew', 7.4), steady('science', 7.0, 3)], reading: 'normal' },
  { key: 'highLevel', first: 'גיל', last: 'ארז', tracks: [steady('math', 13.2), steady('hebrew', 12.6), steady('science', 12.0, 3), steady('bible', 12.4, 2)], reading: 'normal' },
  { key: 'newcomer', first: 'עומר', last: 'טל', tracks: [{ subject: 'math', recent: 2, prior: 1, recentLevel: 9.8, priorLevel: 7.6 }, steady('hebrew', 9.0, 2), steady('bible', 9.0, 2)] },
]
const SPARSE_NAMES = [['רוני', 'אביב'], ['מיכל', 'זהר'], ['נדב', 'שגב']]
const EMPTY_NAMES = [['אביגיל', 'סער'], ['בנימין', 'דר'], ['גלית', 'עמר'], ['דור', 'כץ'], ['הילה', 'נבו'], ['זיו', 'קרן']]
const OTHER_NAMES = [['חגי', 'ירון'], ['טלי', 'פז']]
const DUAL_NAMES = [['קורן', 'ליבני'], ['רינת', 'אשכנזי'], ['שחר', 'בנימיני']]
/* מי מקבל משחקים בהדמיות בלי מקצוע (2 כל אחד) */
const UNCLASSIFIED_STUDENTS = ['trendUp', 'trendDown', 'crossDip']

const POOL = 18 /* הדמיות לכל מקצוע מרכזי — כל משחק בהדמיה אחרת (ההשלמה הראשונה לכל תלמיד-הדמיה היא מקור הראיות) */

/* ימי הלימוד (אינדקס אחורה) של מסלול: חלון אחרון 2–56, חלון קודם 62–146. offset מפזר בין תלמידים */
function trackDays(t: Track, offset: number): number[] {
  const spread = (n: number, from: number, to: number): number[] =>
    n <= 0 ? [] : n === 1 ? [Math.round((from + to) / 2)] : Array.from({ length: n }, (_, i) => Math.round(from + offset + (i * (to - from)) / (n - 1)))
  return [...spread(t.recent, 2, 54), ...spread(t.prior, 62, 144)]
}

/* ── משחק זיכרון (8 זוגות). attentive: משלים זוג מוכר מיד; random: מתעלם ממה שנחשף ── */
interface Flip { card: number; pair: number; t: number }
function memoryFlips(rand: () => number, attentive: boolean): Flip[] {
  const total = PAIRS * 2
  const unmatched = new Set<number>(Array.from({ length: total }, (_, i) => i))
  const seen = new Set<number>()
  const flips: Flip[] = []
  let t = 0
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)]
  const flip = (card: number): void => { t += 700 + Math.floor(rand() * 400); flips.push({ card, pair: Math.floor(card / 2), t }) }
  for (let guard = 0; unmatched.size > 0 && guard < 400; guard++) {
    const un = [...unmatched]
    let a: number
    let b: number
    const knownPair = attentive ? un.find((c) => seen.has(c) && seen.has(c ^ 1)) : undefined
    if (knownPair !== undefined) { a = knownPair; b = knownPair ^ 1 } else {
      const unseen = un.filter((c) => !seen.has(c))
      a = attentive && unseen.length ? pick(unseen) : pick(un)
      if (attentive && seen.has(a ^ 1)) b = a ^ 1
      else {
        const pool = (attentive ? unseen : un).filter((c) => c !== a)
        b = pick(pool.length ? pool : un.filter((c) => c !== a))
      }
    }
    flip(a); flip(b)
    if (Math.floor(a / 2) === Math.floor(b / 2)) { unmatched.delete(a); unmatched.delete(b); seen.delete(a); seen.delete(b) } else { seen.add(a); seen.add(b) }
  }
  return flips
}

/* ══════════════════════════════════════════════════════════════════════════
   בנייה
   ══════════════════════════════════════════════════════════════════════════ */
export async function seedAnalyticsFixture(): Promise<AnalyticsFixture> {
  try {
    return await build()
  } catch (e) {
    /* כשל באמצע — מנקים מה שכבר נוצר ומעבירים הלאה */
    await cleanupAnalyticsFixture().catch(() => {})
    throw e
  }
}

async function build(): Promise<AnalyticsFixture> {
  const { data: subs } = await supabaseAdmin.from('subjects').select('id, code')
  const sid = (code: string): string => {
    const r = (subs ?? []).find((s) => s.code === code)
    if (!r) throw new Error('subject missing: ' + code)
    return r.id as string
  }
  const SUBJECT_IDS: Record<FxSubject, string> = { math: sid('math'), hebrew: sid('hebrew'), history: sid('history'), science: sid('science'), bible: sid('bible') }

  const tag = randomBytes(3).toString('hex')
  const { data: school, error: schoolErr } = await supabaseAdmin.from('schools').insert({ name: `${FX_PREFIX}school-${tag}`, slug: `${FX_PREFIX}school-${tag}` }).select('id').single()
  if (schoolErr || !school) throw new Error('school: ' + schoolErr?.message)
  const schoolId = (school as { id: string }).id
  const { data: school2, error: school2Err } = await supabaseAdmin.from('schools').insert({ name: `${FX_PREFIX}school-other-${tag}`, slug: `${FX_PREFIX}school-other-${tag}` }).select('id').single()
  if (school2Err || !school2) throw new Error('school (other): ' + school2Err?.message)
  const otherSchoolId = (school2 as { id: string }).id
  const { data: school3, error: school3Err } = await supabaseAdmin.from('schools').insert({ name: `${FX_PREFIX}school-empty-${tag}`, slug: `${FX_PREFIX}school-empty-${tag}` }).select('id').single()
  if (school3Err || !school3) throw new Error('school (empty): ' + school3Err?.message)
  const emptySchoolId = (school3 as { id: string }).id

  /* ── מורים ── */
  const homeroom = await mkStaff(schoolId, 'teacher', 'homeroom')
  const subject = await mkStaff(schoolId, 'teacher', 'subject-math')
  const mixed = await mkStaff(schoolId, 'teacher', 'mixed')
  const cross = await mkStaff(schoolId, 'teacher', 'cross')
  const unspecified = await mkStaff(schoolId, 'teacher', 'unspecified')
  const emptyHomeroom = await mkStaff(schoolId, 'teacher', 'empty-homeroom')
  const noClasses = await mkStaff(schoolId, 'teacher', 'no-classes')
  const admin = await mkStaff(schoolId, 'admin', 'admin')
  const municipal = await mkStaff(schoolId, 'municipal_admin', 'municipal')
  const outsider = await mkStaff(otherSchoolId, 'teacher', 'outsider')
  const outsiderAdmin = await mkStaff(otherSchoolId, 'admin', 'outsider-admin')
  const emptySchoolAdmin = await mkStaff(emptySchoolId, 'admin', 'empty-school-admin')
  const dual = await mkStaff(schoolId, 'teacher', 'dual')

  /* ── כיתות ── */
  const withLevel = await schemaHas('classes', 'grade_level')
  const mkClass = async (label: string, slugPart: string, grade: number, inSchool = schoolId): Promise<FxClass> => {
    const code = `${FX_PREFIX}${slugPart}-${randomBytes(2).toString('hex')}`
    const name = `${FX_PREFIX}${label}`
    const { data, error } = await supabaseAdmin.from('classes')
      .insert({ name, grade_label: name, slug: code, url_code: code, school_id: inSchool, ...(withLevel ? { grade_level: grade } : {}) }).select('id').single()
    if (error || !data) throw new Error('class: ' + error?.message)
    return { id: (data as { id: string }).id, name, grade }
  }
  const rich = await mkClass('ו׳1', 'rich', 6)
  const sparse = await mkClass('ו׳2', 'sparse', 6)
  const empty = await mkClass('ה׳1', 'empty', 5)
  const other = await mkClass('ו׳9', 'other', 6, otherSchoolId)
  const dualA = await mkClass('ו׳4', 'dual-a', 6)
  const dualB = await mkClass('ו׳5', 'dual-b', 6)

  const link = (class_id: string, teacher_id: string, o: { subject?: string; subject_id?: string | null; is_homeroom?: boolean } = {}): Row =>
    ({ class_id, teacher_id, subject: o.subject ?? '', subject_id: o.subject_id ?? null, is_homeroom: o.is_homeroom ?? false })
  await insMany('class_teachers', [
    link(rich.id, homeroom.userId, { is_homeroom: true }),
    link(rich.id, subject.userId, { subject: 'math', subject_id: SUBJECT_IDS.math }),
    link(rich.id, mixed.userId, { subject: 'hebrew', subject_id: SUBJECT_IDS.hebrew }),
    link(rich.id, cross.userId, { subject: 'history', subject_id: SUBJECT_IDS.history }),
    link(rich.id, unspecified.userId),
    link(sparse.id, mixed.userId, { is_homeroom: true }),
    link(sparse.id, cross.userId, { subject: 'math', subject_id: SUBJECT_IDS.math }),
    link(empty.id, emptyHomeroom.userId, { is_homeroom: true }),
    link(other.id, outsider.userId, { is_homeroom: true }),
    link(dualA.id, dual.userId, { is_homeroom: true }),
    link(dualB.id, dual.userId, { subject: 'bible', subject_id: SUBJECT_IDS.bible }),
  ])

  /* ── תלמידים ── */
  const students: AnalyticsFixture['students'] = { rich: {}, sparse: {}, empty: {}, other: {}, dual: {} }
  const userRows: Row[] = []
  const memberRows: Row[] = []
  const addStudent = (bucket: Record<string, FxStudent>, key: string, cls: FxClass, first: string, last: string, story: string, inSchool = schoolId): FxStudent => {
    const id = randomUUID()
    const name = `${FX_PREFIX}${first} ${last}`
    userRows.push({ id, name, role: 'student', school_id: inSchool, pin: '0000' })
    memberRows.push({ class_id: cls.id, user_id: id })
    return (bucket[key] = { id, name, story })
  }
  for (const s of STORIES) addStudent(students.rich, s.key, rich, s.first, s.last, s.key)
  SPARSE_NAMES.forEach(([f, l], i) => addStudent(students.sparse, `s${i + 1}`, sparse, f, l, 'sparse'))
  EMPTY_NAMES.forEach(([f, l], i) => addStudent(students.empty, `e${i + 1}`, empty, f, l, 'empty'))
  OTHER_NAMES.forEach(([f, l], i) => addStudent(students.other, `o${i + 1}`, other, f, l, 'other', otherSchoolId))
  /* תלמיד/ה משותף/ת לשתי כיתות: חברות בשתיהן (שורת חברות נוספת), הכיתה העיקרית לפי snapshots.class_id */
  const shared = addStudent(students.dual, 'shared', dualA, DUAL_NAMES[0][0], DUAL_NAMES[0][1], 'shared')
  memberRows.push({ class_id: dualB.id, user_id: shared.id })
  addStudent(students.dual, 'a1', dualA, DUAL_NAMES[1][0], DUAL_NAMES[1][1], 'dualA')
  addStudent(students.dual, 'b1', dualB, DUAL_NAMES[2][0], DUAL_NAMES[2][1], 'dualB')
  await insMany('users', userRows)
  await insMany('class_members', memberRows)

  /* ── הדמיות: מאגר לכל מקצוע מרכזי + מדעים + תנ"ך + בלי מקצוע ── */
  const questRows: Row[] = []
  const pools: Record<FxSubject, string[]> = { math: [], hebrew: [], history: [], science: [], bible: [] }
  const poolSize: Record<FxSubject, number> = { math: POOL, hebrew: POOL, history: 0, science: 3, bible: 2 }
  const unclassifiedQuests: string[] = []
  const mkQuest = (title: string, subjectId: string | null): string => {
    const id = randomUUID()
    questRows.push({ id, title: `${FX_PREFIX}${title}`, game_data: GAME, status: 'draft', created_by: homeroom.userId, subject_id: subjectId })
    return id
  }
  for (const code of ['math', 'hebrew', 'science', 'bible'] as const) {
    for (let i = 0; i < poolSize[code]; i++) pools[code].push(mkQuest(`${code}-${String(i + 1).padStart(2, '0')}`, SUBJECT_IDS[code]))
  }
  for (let i = 0; i < 3; i++) unclassifiedQuests.push(mkQuest(`no-subject-${i + 1}`, null))
  await insMany('quests', questRows)

  /* ── סשנים · snapshots · אירועי קריאה · תשובות ── */
  const days = buildSchoolDays(new Date(), 260, 0)
  const sessionRows: Row[] = []
  const snapRows: Row[] = []
  const eventRows: Row[] = []
  const answerRows: Row[] = []
  const rand = mulberry32(20260421)
  const withSnapSubject = await schemaHas('progress_snapshots', 'subject_id')

  const addSession = (studentId: string, cls: FxClass, questId: string, subjectId: string | null, dayIdx: number, minute: number, level: number, success: number): string => {
    const id = randomUUID()
    const completed = new Date(Date.parse(days[dayIdx]) + minute * 60_000)
    const started = new Date(completed.getTime() - 12 * 60_000)
    sessionRows.push({
      id, user_id: studentId, quest_id: questId, started_at: started.toISOString(), completed_at: completed.toISOString(),
      total_score: Math.round(success * 5), max_score: 5, inventory: [], visited_scenes: ['s0', 's1', 's2', 's3', 's4'],
    })
    snapRows.push({
      student_id: studentId, class_id: cls.id, session_id: id, ...(subjectId && withSnapSubject ? { subject_id: subjectId } : {}),
      taken_at: new Date(completed.getTime() + 1000).toISOString(), text_level: level, per_puzzle_level: {}, success_rates: {}, overall_success: success,
    })
    return id
  }
  const answerBase = (sessionId: string, studentId: string, questId: string, subjectId: string, scene: string, item: number): Row => ({
    client_event_id: `${sessionId}:${scene}:${item}:0`, session_id: sessionId, student_id: studentId, class_id: rich.id, quest_id: questId,
    scene_id: scene, item_index: item, subject_id: subjectId, attempt_no: 1, schema_version: 1,
  })

  STORIES.forEach((story, si) => {
    const st = students.rich[story.key]
    let memoryLeft = story.memory ? 7 : 0
    story.tracks.forEach((track, ti) => {
      const dayList = trackDays(track, si % 3)
      const quests = pools[track.subject]
      dayList.forEach((dayIdx, k) => {
        const isRecent = dayIdx < 60
        const base = isRecent ? track.recentLevel : track.priorLevel
        const level = round1(clamp(base + (rand() - 0.5) * 0.6, 1, 20))
        const success = round1(clamp(0.72 + (rand() - 0.5) * 0.2, 0.05, 1) * 100) / 100
        const questId = quests[k % quests.length]
        const sessionId = addSession(st.id, rich, questId, SUBJECT_IDS[track.subject], dayIdx, ti * 7 + 3, level, success)

        /* רב-ברירה במתמטיקה (שתי שאלות לכל משחק): הטיית מיקום מול בקרה אחידה */
        if (track.subject === 'math' && story.mc) {
          for (const [scene, item] of [['s1', 0], ['s3', 0]] as const) {
            const k4 = 4
            const correctPos = Math.floor(rand() * k4)
            const selected = story.mc === 'biased' && rand() < 0.75 ? 0 : Math.floor(rand() * k4)
            const order = ['a', 'b', 'c', 'd']
            const correct = selected === correctPos
            answerRows.push({
              ...answerBase(sessionId, st.id, questId, SUBJECT_IDS.math, scene, item), puzzle_type: 'multipleChoice',
              selected_option_id: order[selected], selected_position: selected, correct_position: correctPos, displayed_order: order,
              is_correct: correct, outcome: correct ? 'correct' : 'wrong', response_ms: 6000 + Math.floor(rand() * 4000),
            })
          }
        }
        /* זיכרון בעברית: 7 משחקים לתלמיד (אקראי / קשוב) */
        if (track.subject === 'hebrew' && memoryLeft > 0) {
          memoryLeft--
          const flips = memoryFlips(rand, story.memory === 'attentive')
          answerRows.push({
            ...answerBase(sessionId, st.id, questId, SUBJECT_IDS.hebrew, 's2', 0), puzzle_type: 'memory', selected_option_id: null,
            is_correct: true, outcome: 'correct', response_ms: flips[flips.length - 1]?.t ?? 60000, interaction: { flips, pairs: [], mistakes: 0 },
          })
        }
        /* אירועי קריאה במתמטיקה: שתי סצנות בלי אתגר לכל משחק; דלג = מעט זמן ביחס למספר המילים */
        if (track.subject === 'math' && story.reading) {
          for (const [scene, words] of [['s0', 90 + Math.floor(rand() * 50)], ['s4', 60 + Math.floor(rand() * 50)]] as const) {
            const msPerWord = story.reading === 'skip' ? 30 + rand() * 20 : 230 + rand() * 80
            eventRows.push({
              session_id: sessionId, user_id: st.id, quest_id: questId, type: 'scene_enter', scene_id: scene,
              payload: { dwellMs: Math.round(words * msPerWord) + 1500, word_count: words, closed_dwell_ms: Math.round(words * msPerWord) },
            })
          }
        }
      })
    })
  })

  /* הדמיות בלי מקצוע: 2 משחקים לכל אחד משלושה תלמידים (נספרים ב-coverage, לא נכנסים לתוצאות) */
  let unclassified = 0
  UNCLASSIFIED_STUDENTS.forEach((key, i) => {
    for (const [k, dayIdx] of [4 + i, 9 + i].entries()) {
      addSession(students.rich[key].id, rich, unclassifiedQuests[(i + k) % unclassifiedQuests.length], null, dayIdx, 31, round1(9 + rand()), 0.7)
      unclassified++
    }
  })

  /* הכיתה הדלה: מתמטיקה + עברית, משחק אחד לכל אחד */
  Object.values(students.sparse).forEach((st, i) => {
    addSession(st.id, sparse, pools.math[i], SUBJECT_IDS.math, 6 + i * 3, 5, round1(9.3 + i * 0.4), 0.7)
    addSession(st.id, sparse, pools.hebrew[i], SUBJECT_IDS.hebrew, 14 + i * 3, 9, round1(9.0 + i * 0.5), 0.68)
  })

  /* התלמיד/ה המשותף/ת: כל ה-snapshots נרשמו בכיתה dualB ← היא הכיתה העיקרית. מתמטיקה ותנ"ך, 4 משחקים כל אחד */
  ;(['math', 'bible'] as const).forEach((code, ci) => {
    for (let k = 0; k < 4; k++) addSession(shared.id, dualB, pools[code][k % pools[code].length], SUBJECT_IDS[code], 8 + k * 11 + ci * 3, 11 + ci, round1(9.6 + ci * 0.8 + (k % 2) * 0.2), 0.7)
  })
  await insMany('sessions', sessionRows)
  await insMany('progress_snapshots', snapRows)
  await insMany('events', eventRows)
  await insMany('answers', answerRows, 100)

  return {
    prefix: FX_PREFIX, schoolId, otherSchoolId, emptySchoolId,
    classes: { rich, sparse, empty, other, dualA, dualB },
    subjectIds: SUBJECT_IDS,
    ids: {
      classId: rich.id, homeroomClassId: rich.id, sparseClassId: sparse.id, emptyClassId: empty.id,
      attentionStudentId: students.rich.crossDip.id, studentId: students.rich.crossDip.id, calmStudentId: students.rich.steadyB.id, emptyStudentId: students.empty.e1.id,
      subject: 'math',
    },
    teachers: { homeroom, subject, mixed, cross, unspecified, emptyHomeroom, noClasses, unlinked: noClasses, admin, municipal, outsider, outsiderAdmin, emptySchoolAdmin, dual },
    students,
    expected: {
      richStudentCount: STORIES.length, sparseStudentCount: SPARSE_NAMES.length, emptyStudentCount: EMPTY_NAMES.length,
      unclassifiedSessions: unclassified,
      attentionStories: ['trendDown', 'crossDip', 'positionBias', 'memoryRandom', 'readingSkipper'],
      positiveStories: ['trendUp'],
    },
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   ניקוי — מגלה מזהים לפי הקידומת (שורד קריסה באמצע), ולכן עובד גם בלי fx. המחיקה עצמה לפי מזהים בלבד.
   ══════════════════════════════════════════════════════════════════════════ */
const like = `${FX_PREFIX}%`
const NONE = ['00000000-0000-0000-0000-000000000000']
const idsOf = (rows: { id: string }[] | null): string[] => (rows ?? []).map((r) => r.id)

function chunk<T>(a: T[], n = 100): T[][] {
  const out: T[][] = []
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n))
  return out
}

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

interface Discovered { schoolIds: string[]; userIds: string[]; authIds: string[]; classIds: string[]; questIds: string[] }
async function discover(fx?: Partial<AnalyticsFixture>): Promise<Discovered> {
  const { data: ss } = await supabaseAdmin.from('schools').select('id').like('name', like)
  const schoolIds = [...new Set([...idsOf(ss), ...(fx?.schoolId ? [fx.schoolId] : []), ...(fx?.otherSchoolId ? [fx.otherSchoolId] : []), ...(fx?.emptySchoolId ? [fx.emptySchoolId] : [])])]
  const bySchool = schoolIds.length ? schoolIds : NONE
  const [{ data: us }, { data: us2 }, { data: cs }, { data: cs2 }, { data: qs }] = await Promise.all([
    supabaseAdmin.from('users').select('id, auth_id').like('name', like),
    supabaseAdmin.from('users').select('id, auth_id').in('school_id', bySchool),
    supabaseAdmin.from('classes').select('id').like('name', like),
    supabaseAdmin.from('classes').select('id').in('school_id', bySchool),
    supabaseAdmin.from('quests').select('id').like('title', like),
  ])
  const userRows = [...((us ?? []) as { id: string; auth_id: string | null }[]), ...((us2 ?? []) as { id: string; auth_id: string | null }[])]
  const userIds = [...new Set([...userRows.map((u) => u.id), ...(fx?.teachers ? Object.values(fx.teachers).map((t) => t.userId) : [])])]
  const { data: qs2 } = await supabaseAdmin.from('quests').select('id').in('created_by', userIds.length ? userIds : NONE)
  const authIds = new Set<string>(userRows.map((u) => u.auth_id).filter((a): a is string => !!a))
  for (const a of await authUsersWithPrefix()) authIds.add(a.id)
  return {
    schoolIds, userIds, authIds: [...authIds],
    classIds: [...new Set([...idsOf(cs), ...idsOf(cs2), ...(fx?.classes ? Object.values(fx.classes).map((c) => c.id) : [])])],
    questIds: [...new Set([...idsOf(qs), ...idsOf(qs2)])],
  }
}

export async function cleanupAnalyticsFixture(fx?: Partial<AnalyticsFixture>): Promise<void> {
  const del = async (table: string, col: string, vals: string[]): Promise<void> => {
    for (const part of chunk(vals)) {
      const { error } = await supabaseAdmin.from(table).delete().in(col, part)
      if (error && !/does not exist|schema cache/i.test(error.message)) throw new Error(`${table} delete: ${error.message}`)
    }
  }
  const d = await discover(fx)
  const u = d.userIds
  const q = d.questIds

  const sessionIds = new Set<string>()
  for (const [col, vals] of [['user_id', u], ['quest_id', q]] as const) {
    for (const part of chunk(vals)) {
      const { data } = await supabaseAdmin.from('sessions').select('id').in(col, part)
      for (const r of (data ?? []) as { id: string }[]) sessionIds.add(r.id)
    }
  }
  const sess = [...sessionIds]
  await del('answers', 'session_id', sess)
  await del('events', 'session_id', sess)
  await del('progress_snapshots', 'session_id', sess)
  await del('level_history', 'session_id', sess)
  await del('answers', 'student_id', u)
  await del('answers', 'quest_id', q)
  await del('events', 'user_id', u)
  await del('events', 'quest_id', q)
  await del('progress_snapshots', 'student_id', u)
  await del('level_history', 'student_id', u)
  await del('student_subject_levels', 'student_id', u)
  await del('difficulty_profiles', 'user_id', u)
  await del('data_access_log', 'viewer_id', u)
  await del('data_access_log', 'student_id', u)
  await del('sessions', 'id', sess)
  await del('assignments', 'quest_id', q)
  await del('assignments', 'class_id', d.classIds)
  await del('option_tags', 'quest_id', q)
  await del('class_teachers', 'class_id', d.classIds)
  await del('class_teachers', 'teacher_id', u)
  await del('class_members', 'class_id', d.classIds)
  await del('class_members', 'user_id', u)
  await del('quests', 'id', q)
  await del('classes', 'id', d.classIds)
  await del('users', 'id', u)
  for (const a of d.authIds) await supabaseAdmin.auth.admin.deleteUser(a).catch(() => {})
  await del('schools', 'id', d.schoolIds)
}

/* כמה שורות מהפיקסצ'ר נשארו (0 בכל מקום = נקי). שורות תלויות נספרות לפי מזהי הורים שעדיין קיימים או שניתנו ב-fx. */
export async function leftoverAnalyticsFixture(fx?: Partial<AnalyticsFixture>): Promise<Record<string, number>> {
  const count = async (table: string, col: string): Promise<number> => {
    const { count: n } = await supabaseAdmin.from(table).select('*', { count: 'exact', head: true }).like(col, like)
    return n ?? 0
  }
  const out: Record<string, number> = {
    schools: await count('schools', 'name'), users: await count('users', 'name'), classes: await count('classes', 'name'),
    quests: await count('quests', 'title'), auth_users: (await authUsersWithPrefix()).length,
  }
  const d = await discover(fx)
  const u = d.userIds.length ? d.userIds : NONE
  const q = d.questIds.length ? d.questIds : NONE
  const c = d.classIds.length ? d.classIds : NONE
  const probes: [string, string, string[]][] = [
    ['sessions', 'user_id', u], ['sessions', 'quest_id', q], ['answers', 'student_id', u], ['answers', 'quest_id', q], ['events', 'user_id', u], ['events', 'quest_id', q],
    ['progress_snapshots', 'student_id', u], ['class_members', 'user_id', u], ['class_members', 'class_id', c], ['class_teachers', 'teacher_id', u], ['class_teachers', 'class_id', c],
    ['data_access_log', 'viewer_id', u], ['data_access_log', 'student_id', u],
  ]
  for (const [t, col, vals] of probes) {
    const { count: n } = await supabaseAdmin.from(t).select('*', { count: 'exact', head: true }).in(col, vals)
    out[`${t}.${col}`] = n ?? 0
  }
  return out
}

/* שמות שהמריץ של ה-e2e (e2e/lib/fixtureChild.ts) מחפש */
export const seedFixture = seedAnalyticsFixture
export const cleanupFixture = cleanupAnalyticsFixture

/* ── שורת פקודה: tsx src/scripts/analyticsFixture.ts <cleanup|leftover> — seed נעשה מקוד (הטוקנים מוחזרים בזיכרון בלבד) ── */
const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const mode = process.argv[2]
  void (async () => {
    if (mode === 'cleanup') { await cleanupAnalyticsFixture(); console.log('נוקה') }
    else if (mode === 'leftover') { const l = await leftoverAnalyticsFixture(); const dirty = Object.entries(l).filter(([, n]) => n > 0); console.log(dirty.length ? JSON.stringify(Object.fromEntries(dirty)) : 'נקי: 0 שורות') }
    else { console.error('usage: analyticsFixture.ts <cleanup|leftover>   (seed: import { seedAnalyticsFixture })'); process.exitCode = 1 }
    process.exit(process.exitCode ?? 0)
  })().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
}
