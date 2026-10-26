/* ── קבלה חיה: אנליטיקה v2 על נתוני אמת (/api/analytics-v2, הספק החי) ───────────────────────
   רץ מול השרת המקומי (ACCEPT_API, ברירת מחדל http://localhost:3001/api) ומול ה-DB המשותף. יוצר פיקסצ'ר zz-ux-v2-w8-* (analyticsFixture.ts):
   שלושה בתי ספר זמניים (הראשי עם כיתות עשירה / דלה / בלי נתונים / שתי כיתות עם תלמיד/ה משותף/ת; השני עם כיתה אחת; השלישי בלי כיתות), שלושה־עשר תפקידים
   ונתונים שהמנוע החי מגיב אליהם. בודק ברמת HTTP:
     · מטריצת הרשאות: תפקיד × נקודת קצה × תוצאה צפויה (200 / 403 / 404), כולל מלכודת המכפלה הקרטזית (מתמטיקה בדלה + היסטוריה בעשירה)
     · מורה מקצועי / שיוך בלי מקצוע לא מקבלים נתוני מקצוע אחר; מחנך מקבל הכול רק בכיתתו
     · מנהל: אין שם / מזהה תלמיד / מידע על מורים באף תגובה; תאים קטנים או של כיתה אחת מוסתרים
     · 404 אחיד: ישות מחוץ להיקף נראית בדיוק כישות שאינה קיימת
     · יומן גישה (data_access_log, scope analytics_v2_*): נכתב לתלמידים שנחשפו בשמם, לפני התגובה, בלי כפילות בחלון
     · מה שהמנוע החי מדווח (מגמה, הטיית מיקום, זיכרון אקראי, דילוג קריאה, התרעה חוצת-מקצועות) ו"אין עדיין מספיק נתונים" בשאר המקומות
     · בידוד בין בתי ספר (מחנך ומנהל של בית ספר אחר; מנהל בית ספר חדש בלי כיתות = 200 ולא 500)
     · כל תגובה 200 עומדת בסכמות החוזה (src/shared/types/analyticsV2.ts); אין נתוני הדגמה במסלול החי
   שורות ℹ = מידע בלבד (כולל זמני תגובה ומדידת מטמון הצופה; V2_ACCEPT_PERF=0 מדלג על המדידה האיטית).
   שני הבאגים שהקבלה מצאה בריצה הראשונה (תלמיד/ה בשתי כיתות: הרשאה לפי הכיתה העיקרית בלבד; ספירה כפולה בשכבה) תוקנו והם בדיקות רגילות; V2_ACCEPT_STRICT=1 נשאר תקף (כל כשל מפיל).
   בסוף מנקה ומוודא שלא נשארה אף שורה zz-ux-v2-w8-*. סיסמאות אקראיות בזיכרון בלבד. בלי LLM.
   הרצה:  npm run v2:accept                                                                           */
import '../env.js'
import {
  CATALOG_UNTAGGED_TEXT, ERR_AGGREGATE_ONLY, ERR_NOT_FOUND, ERR_NO_ACCESS, LIVE_COVERAGE_UNTAGGED, narrateAdminHiddenNote, narrateAdminUnclassifiedNote, narrateEntryBasisNote,
  narrateNoOpenSubjectNote, narrateScopedCoverageNote, narrateTrendNeedMore,
} from '../../../src/shared/lib/findingsNarrative.js'
import { ENTRY_MAX_ALERTS, KIND_THRESHOLDS } from '../../../src/shared/lib/analyticsConfig.js'
import { EP, type EndpointName } from '../../../src/shared/types/analyticsV2.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { FX_PREFIX, cleanupAnalyticsFixture, leftoverAnalyticsFixture, seedAnalyticsFixture, type AnalyticsFixture } from './analyticsFixture.js'

/* eslint-disable @typescript-eslint/no-explicit-any */
const API = process.env.ACCEPT_API ?? 'http://localhost:3001/api'
let failed = 0
let total = 0
const check = (name: string, ok: boolean, extra = ''): void => {
  total++
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  — ' + extra : ''}`)
}
/* מידע בלבד (אינו נספר כבדיקה): התנהגות שהתגלתה על נתונים אמיתיים ושראוי שהמתאם יראה */
const info = (msg: string): void => { console.log(`ℹ ${msg}`) }

const NIL = '00000000-0000-0000-0000-000000000000'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/* ══════════════════════════════════════════════════════════════════════════
   HTTP: ניסיונות חוזרים (שרת הפיתוח מתאתחל בכל שמירת קובץ), קצב מתון (תקרת 120 לדקה למשתמש), אימות מול סכמות החוזה
   ══════════════════════════════════════════════════════════════════════════ */
interface Res { status: number; json: any; cache: string | null; ms: number }
const sent = new Map<string, number[]>()
const schemaFailures: string[] = []
const latencies: number[] = []
let validated = 0
const bodies: { who: string; path: string; json: any }[] = []

async function pace(token: string | null): Promise<void> {
  const now = Date.now()
  for (const key of [token ?? '-', '*']) {
    const cap = key === '*' ? 420 : 95
    const list = (sent.get(key) ?? []).filter((t) => now - t < 60_000)
    if (list.length >= cap) await sleep(60_000 - (now - list[0]) + 200)
    list.push(Date.now())
    sent.set(key, list)
  }
}

const EP_OF: [RegExp, EndpointName][] = [
  [/^\/analytics-v2\/config$/, 'config'], [/^\/analytics-v2\/roster$/, 'roster'], [/^\/analytics-v2\/entry$/, 'entry'],
  [/^\/analytics-v2\/student\/[^/]+\/feedback$/, 'feedback'], [/^\/analytics-v2\/student\/[^/]+$/, 'student'],
  [/^\/analytics-v2\/class\/[^/]+\/overview$/, 'classOverview'], [/^\/analytics-v2\/class\/[^/]+\/subject\/[^/]+$/, 'classSubject'],
  [/^\/analytics-v2\/admin\/overview$/, 'admin'], [/^\/analytics-v2\/briefing\/[^/]+\/[^/]+$/, 'briefing'],
]

async function get(who: string, token: string | null, path: string): Promise<Res> {
  let last: unknown
  for (let attempt = 0; attempt < 10; attempt++) {
    await pace(token)
    const t0 = Date.now()
    try {
      const r = await fetch(API + path, { headers: token ? { Authorization: 'Bearer ' + token } : {} })
      let json: any = {}
      try { json = await r.json() } catch { /* ריק */ }
      /* אתחול שרת (502-504) / חימום מטמון (503) / מגבלת קצב (429): מנסים שוב */
      if ((r.status >= 502 && r.status <= 504) || r.status === 429) { await sleep(2000); continue }
      const res: Res = { status: r.status, json, cache: r.headers.get('cache-control'), ms: Date.now() - t0 }
      if (r.status === 200) {
        latencies.push(res.ms)
        const ep = EP_OF.find(([re]) => re.test(path.split('?')[0]))?.[1]
        if (ep) {
          const parsed = EP[ep].response.safeParse(json)
          validated++
          if (!parsed.success) schemaFailures.push(`${who} ${path}: ${parsed.error.issues.slice(0, 2).map((i) => i.path.join('.') + ' ' + i.message).join(' | ')}`)
        }
        bodies.push({ who, path, json })
      }
      return res
    } catch (e) {
      last = e
      await sleep(1500)
    }
  }
  throw last instanceof Error ? last : new Error('request failed')
}

/* מעבר על כל המחרוזות והמפתחות בגוף JSON */
function walk(v: any, visit: (key: string | null, value: any, path: string) => void, path = '', key: string | null = null): void {
  visit(key, v, path)
  if (Array.isArray(v)) v.forEach((x, i) => walk(x, visit, `${path}[${i}]`, null))
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, visit, path ? `${path}.${k}` : k, k)
}
const strings = (json: any): { path: string; value: string }[] => {
  const out: { path: string; value: string }[] = []
  walk(json, (_k, v, p) => { if (typeof v === 'string') out.push({ path: p, value: v }) })
  return out
}
const keysOf = (json: any): string[] => {
  const out: string[] = []
  walk(json, (k) => { if (k) out.push(k) })
  return out
}

/* ══════════════════════════════════════════════════════════════════════════
   הרצה
   ══════════════════════════════════════════════════════════════════════════ */
type Who = keyof AnalyticsFixture['teachers']
const WHO_LIST: Who[] = ['homeroom', 'subject', 'mixed', 'cross', 'unspecified', 'emptyHomeroom', 'noClasses', 'admin', 'municipal']

async function waitForRoute(token: string): Promise<boolean> {
  for (let i = 0; i < 20; i++) {
    const r = await get('ready', token, '/analytics-v2/config')
    if (r.status === 200 && r.json?.data?.enabled === true) return true
    if (r.status === 200 && r.json?.data?.enabled === false) return false
    await sleep(1500)
  }
  return false
}

const sortedIds = (xs: string[]): string => [...xs].sort().join(',')

async function main(): Promise<void> {
  /* ניקוי שאריות מריצה קודמת שנקטעה */
  await cleanupAnalyticsFixture()
  const fx: AnalyticsFixture = await seedAnalyticsFixture()
  try {
    await run(fx)
  } finally {
    await cleanupAnalyticsFixture(fx)
    const left = await leftoverAnalyticsFixture(fx)
    const dirty = Object.entries(left).filter(([, n]) => n > 0)
    check(`ניקוי: לא נשארה אף שורה ${FX_PREFIX}*`, dirty.length === 0, dirty.length ? JSON.stringify(Object.fromEntries(dirty)) : `${Object.keys(left).length} בדיקות, הכול 0`)
  }
  console.log(failed === 0 ? `\nכל ${total} הבדיקות עברו` : `\n${failed} מתוך ${total} בדיקות נכשלו`)
  if (failed) process.exitCode = 1
}

async function run(fx: AnalyticsFixture): Promise<void> {
  const T = fx.teachers
  const tok = (w: Who): string => T[w].token
  const C = fx.classes
  const R = fx.students.rich
  const SP = fx.students.sparse
  const EM = fx.students.empty
  const richIds = Object.values(R).map((s) => s.id)
  const sparseIds = Object.values(SP).map((s) => s.id)
  const emptyIds = Object.values(EM).map((s) => s.id)
  const OT = fx.students.other
  const otherIds = Object.values(OT).map((s) => s.id)
  const DU = fx.students.dual
  const dualIds = Object.values(DU).map((s) => s.id)
  const wideIds = Object.values(fx.students.wide).map((s) => s.id)
  const TOTAL_STUDENTS = richIds.length + sparseIds.length + emptyIds.length + dualIds.length + wideIds.length /* בית הספר שלנו; התלמיד/ה המשותף/ת נספר/ת פעם אחת */
  const allStudentIds = new Set([...richIds, ...sparseIds, ...emptyIds, ...otherIds, ...dualIds, ...wideIds])
  const allClassIds = new Set([C.rich.id, C.sparse.id, C.empty.id, C.other.id, C.dualA.id, C.dualB.id, C.wide.id])
  const attentionIds = fx.expected.attentionStories.map((k) => R[k].id)
  const P = (w: Who, path: string): Promise<Res> => get(w, tok(w), path)

  if (!(await waitForRoute(tok('homeroom')))) throw new Error('/api/analytics-v2 אינו מוגש או כבוי (enabled=false) — הפעילו מחדש את שרת הפיתוח / בדקו ANALYTICS_V2 ו-ANALYTICS_V2_LIVE')

  /* ───────── אימות וכותרות ───────── */
  console.log('\n— אימות, כותרות, חוזה —')
  check('בלי טוקן: 401', (await get('anon', null, '/analytics-v2/config')).status === 401)
  const cfg: Record<string, Res> = {}
  for (const w of WHO_LIST) cfg[w] = await P(w, '/analytics-v2/config')
  check('כל תשעת התפקידים: config 200 ו-enabled=true (גם מורה בלי כיתות)', WHO_LIST.every((w) => cfg[w].status === 200 && cfg[w].json.data?.enabled === true), WHO_LIST.map((w) => `${w}=${cfg[w].status}`).join(' '))
  check('Cache-Control: private, no-store', /private/.test(cfg.homeroom.cache ?? '') && /no-store/.test(cfg.homeroom.cache ?? ''), String(cfg.homeroom.cache))
  check('עדשות: מחנך=homeroom · מקצועי / שיוך / בלי כיתות=subject_teacher · מנהלים=admin · מורה מעורב=homeroom (מחנך באחת)', [
    cfg.homeroom.json.data.lens === 'homeroom', cfg.subject.json.data.lens === 'subject_teacher', cfg.cross.json.data.lens === 'subject_teacher',
    cfg.unspecified.json.data.lens === 'subject_teacher', cfg.noClasses.json.data.lens === 'subject_teacher', cfg.admin.json.data.lens === 'admin',
    cfg.municipal.json.data.lens === 'admin', cfg.mixed.json.data.lens === 'homeroom', cfg.emptyHomeroom.json.data.lens === 'homeroom',
  ].every(Boolean))
  check('לא-אורח: availableLenses = העדשה היחידה; אין "נתוני הדגמה" ואין "מיפוי לדוגמה" במסלול החי', WHO_LIST.every((w) => {
    const d = cfg[w].json.data
    return d.availableLenses.length === 1 && d.availableLenses[0] === d.lens && d.dataNotice === null && d.curriculumNotice === null
  }))
  check('config.classes: מחנך=[עשירה] · מעורב / cross=שתי כיתות · בלי כיתות=ריק · מנהלים=ריק (אין רשימת כיתות)', [
    sortedIds(cfg.homeroom.json.data.classes.map((c: any) => c.id)) === C.rich.id,
    sortedIds(cfg.mixed.json.data.classes.map((c: any) => c.id)) === sortedIds([C.rich.id, C.sparse.id]),
    sortedIds(cfg.cross.json.data.classes.map((c: any) => c.id)) === sortedIds([C.rich.id, C.sparse.id]),
    cfg.noClasses.json.data.classes.length === 0, cfg.admin.json.data.classes.length === 0, cfg.municipal.json.data.classes.length === 0,
  ].every(Boolean))
  check('config.subjects: מקצועי=[math] · שיוך בלי מקצוע=[] · בלי כיתות=[] · מעורב=[hebrew]', [
    cfg.subject.json.data.subjects.map((s: any) => s.code).join() === 'math', cfg.unspecified.json.data.subjects.length === 0,
    cfg.noClasses.json.data.subjects.length === 0, cfg.mixed.json.data.subjects.map((s: any) => s.code).join() === 'hebrew',
  ].every(Boolean))

  /* ───────── מסך הכניסה: GET /entry ───────── */
  console.log('\n— GET /entry —')
  const entry: Record<string, Res> = {}
  for (const w of WHO_LIST) entry[w] = await P(w, '/analytics-v2/entry')
  check('כל התפקידים: entry 200', WHO_LIST.every((w) => entry[w].status === 200), WHO_LIST.map((w) => `${w}=${entry[w].status}`).join(' '))
  {
    const e = entry.homeroom.json.data
    const c = e.classes.find((x: any) => x.id === C.rich.id)
    check('מחנך: כיתה עשירה — 14 תלמידים, hasResults=true, 5 תלמידים לתשומת לב', e.classes.length === 1 && c?.studentCount === 14 && c.hasResults === true && c.attentionCount === 5, JSON.stringify(c))
    check(`מחנך: ${ENTRY_MAX_ALERTS} התרעות מוצגות מתוך 5 (alertsTotal=5) + "ועוד" במילים; כל ההתרעות על תלמידי הכיתה`, e.alerts.length === ENTRY_MAX_ALERTS && e.alertsTotal === 5 && typeof e.alertsMore === 'string' && e.alerts.every((a: any) => attentionIds.includes(a.studentId) && a.classId === C.rich.id), `alerts=${e.alerts.length} total=${e.alertsTotal}`)
    check('מחנך: coverageNote מסביר שיעורים בלי מקצוע (unclassifiedCount=6 — מה שה-fixture כתב)', e.unclassifiedCount === fx.expected.unclassifiedSessions && typeof e.coverageNote === 'string' && e.coverageNote.length > 10, `unclassified=${e.unclassifiedCount}`)
    check('מחנך: dataState=ok (יש תוצאות)', entry.homeroom.json.dataState === 'ok')
  }
  {
    const e = entry.subject.json.data
    const c = e.classes.find((x: any) => x.id === C.rich.id)
    check('מורה מתמטיקה: 14 תלמידים, 3 לתשומת לב במקצועו בלבד (בלי התרעות עברית וחוצות-מקצועות)', e.classes.length === 1 && c?.studentCount === 14 && c.attentionCount === 3 && c.hasResults === true && e.alertsTotal === 3, JSON.stringify(c))
  }
  {
    const e = entry.mixed.json.data
    const rich = e.classes.find((x: any) => x.id === C.rich.id), sparse = e.classes.find((x: any) => x.id === C.sparse.id)
    check('מורה מעורב: שתי כיתות, לפי שם (עשירה לפני דלה); עשירה — רק עברית (3 לתשומת לב); דלה — hasResults=true, 0 התרעות', e.classes.length === 2 && e.classes[0].id === C.rich.id && rich?.attentionCount === 3 && rich.hasResults === true && sparse?.studentCount === 3 && sparse.hasResults === true && sparse.attentionCount === 0, JSON.stringify(e.classes))
  }
  {
    const e = entry.cross.json.data
    const rich = e.classes.find((x: any) => x.id === C.rich.id), sparse = e.classes.find((x: any) => x.id === C.sparse.id)
    check('מורה היסטוריה@עשירה + מתמטיקה@דלה: עשירה hasResults=false (להיסטוריה אין נתונים — לא לקבל את נתוני המתמטיקה), דלה hasResults=true', rich?.hasResults === false && rich.attentionCount === 0 && sparse?.hasResults === true, JSON.stringify(e.classes))
    check('אותו מורה: אין התרעות (עשירה — אין נתוני היסטוריה; דלה — אין ממצאים)', e.alerts.length === 0 && e.alertsTotal === 0)
  }
  {
    const e = entry.unspecified.json.data
    const c = e.classes.find((x: any) => x.id === C.rich.id)
    check('שיוך בלי מקצוע: הכיתה מופיעה בגודלה האמיתי (14 תלמידים, בלי רשימה) ולא "0 תלמידים"; noOpenSubject=true; בלי תוצאות ובלי התרעות (אין ברירת מחדל למקצוע)', e.classes.length === 1 && c?.studentCount === 14 && c.noOpenSubject === true && c.hasResults === false && c.attentionCount === 0 && e.alerts.length === 0 && entry.unspecified.json.dataState === 'insufficient', JSON.stringify(c))
    check('שיוך בלי מקצוע: הערת "שיעורים בלי מקצוע" לא מוצגת (אין לו מקצוע פתוח — unclassifiedCount=0), ובמקומה coverageNote שאומר שהמקצוע שלו לא הוגדר ולמי לפנות', e.unclassifiedCount === 0 && e.coverageNote === narrateNoOpenSubjectNote([c.name]), `unclassified=${e.unclassifiedCount} note=${e.coverageNote}`)
  }
  {
    const e = entry.emptyHomeroom.json.data
    const c = e.classes[0]
    check('כיתה בלי נתונים: 6 תלמידים, hasResults=false, אפס התרעות, dataState=insufficient, בלי coverageNote', e.classes.length === 1 && c.id === C.empty.id && c.studentCount === 6 && c.hasResults === false && c.attentionCount === 0 && e.alerts.length === 0 && e.coverageNote === null && e.unclassifiedCount === 0 && entry.emptyHomeroom.json.dataState === 'insufficient', JSON.stringify(c))
  }
  check('מורה בלי כיתות: 200 עם classes=[] ו-alerts=[] (לא שגיאה)', entry.noClasses.json.data.classes.length === 0 && entry.noClasses.json.data.alerts.length === 0 && entry.noClasses.json.data.coverageNote === null)
  check('מנהל / מנהל עירוני: entry ריק (אין כיתות, אין התרעות, אין שמות)', ['admin', 'municipal'].every((w) => entry[w].json.data.classes.length === 0 && entry[w].json.data.alerts.length === 0 && entry[w].json.data.alertsTotal === 0))

  /* ───────── רשימת התלמידים: GET /roster ───────── */
  console.log('\n— GET /roster —')
  const roster: Record<string, Res> = {}
  for (const w of WHO_LIST) roster[w] = await P(w, '/analytics-v2/roster')
  check('כל התפקידים: roster 200', WHO_LIST.every((w) => roster[w].status === 200))
  const rc = (w: Who, classId: string): any => roster[w].json.data.classes.find((c: any) => c.id === classId)
  const codes = (xs: any[] | undefined): string => (xs ?? []).map((s: any) => s.code).sort().join()
  const rc2 = (r: Res, classId: string): any => r.json.data.classes.find((c: any) => c.id === classId)
  {
    const c = rc('homeroom', C.rich.id)
    check('מחנך: isHomeroom=true; כל מקצועות הכיתה פתוחים (עברית, היסטוריה, מתמטיקה, מדעים, תנ"ך), אין נעולים', roster.homeroom.json.data.classes.length === 1 && c.isHomeroom === true && codes(c.subjects) === 'bible,hebrew,history,math,science' && c.lockedSubjects.length === 0, `${codes(c.subjects)} / locked ${codes(c.lockedSubjects)}`)
    const ids = roster.homeroom.json.data.students.map((s: any) => s.id)
    check('מחנך: כל 14 תלמידי הכיתה ברשימה (גם בלי נתונים)', sortedIds(ids) === sortedIds(richIds))
    const att = roster.homeroom.json.data.students.filter((s: any) => s.attention > 0).map((s: any) => s.id)
    check('מחנך: תלמידים לתשומת לב = בדיוק הסיפורים שתוכננו (ירידה, ירידה בשני מקצועות, הטיית מיקום, זיכרון אקראי, דילוג קריאה)', sortedIds(att) === sortedIds(attentionIds), `${att.length} תלמידים`)
    const pos = roster.homeroom.json.data.students.filter((s: any) => s.positive > 0).map((s: any) => s.id)
    const ew = roster.homeroom.json.data.students.filter((s: any) => s.earlyWarning).map((s: any) => s.id)
    check('מחנך: חיובי = תלמיד/ה בעלייה בלבד; התרעה חוצת-מקצועות = רק מי שירד בשני מקצועות', sortedIds(pos) === R.trendUp.id && sortedIds(ew) === R.crossDip.id, `positive=${pos.length} early=${ew.length}`)
  }
  {
    const c = rc('subject', C.rich.id)
    check('מורה מתמטיקה: isHomeroom=false; פתוח רק מתמטיקה; שאר המקצועות נעולים (שם בלבד)', c.isHomeroom === false && codes(c.subjects) === 'math' && codes(c.lockedSubjects) === 'bible,hebrew,history,science', `${codes(c.subjects)} / locked ${codes(c.lockedSubjects)}`)
    check('מורה מתמטיקה: 14 תלמידים; התרעה חוצת-מקצועות כבויה (רק למחנך)', roster.subject.json.data.students.length === 14 && roster.subject.json.data.students.every((s: any) => s.earlyWarning === false))
    const att = roster.subject.json.data.students.filter((s: any) => s.attention > 0).map((s: any) => s.id)
    check('מורה מתמטיקה: לתשומת לב = ירידה במתמטיקה, הטיית מיקום, דילוג קריאה (לא ירידה בעברית / זיכרון)', sortedIds(att) === sortedIds([R.crossDip.id, R.positionBias.id, R.readingSkipper.id]))
  }
  {
    const rich = rc('mixed', C.rich.id), sparse = rc('mixed', C.sparse.id)
    check('מורה מעורב (מחנך בדלה + עברית בעשירה): בעשירה isHomeroom=false ופתוחה רק עברית; בדלה isHomeroom=true וכל המקצועות פתוחים', rich.isHomeroom === false && codes(rich.subjects) === 'hebrew' && codes(rich.lockedSubjects) === 'bible,history,math,science' && sparse.isHomeroom === true && codes(sparse.subjects) === 'hebrew,math' && sparse.lockedSubjects.length === 0, `rich ${codes(rich.subjects)} · sparse ${codes(sparse.subjects)}`)
    check('מורה מעורב: אין התרעה חוצת-מקצועות בעשירה (אינו מחנך שם); 17 תלמידים', roster.mixed.json.data.students.length === 17 && roster.mixed.json.data.students.every((s: any) => s.earlyWarning === false))
  }
  {
    const rich = rc('cross', C.rich.id), sparse = rc('cross', C.sparse.id)
    check('מלכודת המכפלה הקרטזית (מתמטיקה בדלה + היסטוריה בעשירה): בעשירה פתוחה רק היסטוריה (לא מתמטיקה), בדלה פתוחה רק מתמטיקה (לא היסטוריה)', codes(rich.subjects) === 'history' && !codes(rich.subjects).includes('math') && codes(sparse.subjects) === 'math' && !codes(sparse.subjects).includes('history') && codes(sparse.lockedSubjects) === 'hebrew', `rich ${codes(rich.subjects)} · sparse ${codes(sparse.subjects)}`)
    check('אותו מורה: אינו מחנך באף כיתה', rich.isHomeroom === false && sparse.isHomeroom === false)
  }
  {
    const c = rc('unspecified', C.rich.id)
    check('שיוך בלי מקצוע: הכיתה מופיעה, אין אף מקצוע פתוח (כולם נעולים), ואין תלמידים ברשימה', roster.unspecified.json.data.classes.length === 1 && c.subjects.length === 0 && c.isHomeroom === false && codes(c.lockedSubjects) === 'bible,hebrew,history,math,science' && roster.unspecified.json.data.students.length === 0)
  }
  {
    const c = rc('emptyHomeroom', C.empty.id)
    check('מחנך הכיתה הריקה: isHomeroom=true; כל 6 התלמידים ברשימה בלי התרעות', roster.emptyHomeroom.json.data.classes.length === 1 && c.isHomeroom === true && c.studentCount === 6 && sortedIds(roster.emptyHomeroom.json.data.students.map((s: any) => s.id)) === sortedIds(emptyIds) && roster.emptyHomeroom.json.data.students.every((s: any) => s.attention === 0 && s.positive === 0 && !s.earlyWarning))
  }
  check('מורה בלי כיתות: roster ריק', roster.noClasses.json.data.classes.length === 0 && roster.noClasses.json.data.students.length === 0)
  check('מנהל / מנהל עירוני: roster ריק (אין תלמידים ואין כיתות)', ['admin', 'municipal'].every((w) => roster[w].json.data.classes.length === 0 && roster[w].json.data.students.length === 0))

  /* ───────── מסך מקצוע בכיתה: GET /class/:id/subject/:subject ───────── */
  console.log('\n— GET /class/:classId/subject/:subject —')
  const subj = (cid: string, s: string): string => `/analytics-v2/class/${cid}/subject/${s}`
  const subjectCases: [Who, string, string, number][] = [
    ['homeroom', C.rich.id, 'math', 200], ['homeroom', C.rich.id, 'hebrew', 200], ['homeroom', C.rich.id, 'science', 200], ['homeroom', C.rich.id, 'bible', 200], ['homeroom', C.rich.id, 'history', 200],
    ['homeroom', C.rich.id, 'english', 404], ['homeroom', C.sparse.id, 'math', 404], ['homeroom', C.empty.id, 'math', 404],
    ['subject', C.rich.id, 'math', 200], ['subject', C.rich.id, 'hebrew', 403], ['subject', C.rich.id, 'history', 403], ['subject', C.rich.id, 'science', 403], ['subject', C.sparse.id, 'math', 404],
    ['mixed', C.rich.id, 'hebrew', 200], ['mixed', C.rich.id, 'math', 403], ['mixed', C.rich.id, 'history', 403], ['mixed', C.sparse.id, 'math', 200], ['mixed', C.sparse.id, 'hebrew', 200], ['mixed', C.sparse.id, 'history', 404], ['mixed', C.empty.id, 'math', 404],
    ['cross', C.rich.id, 'history', 200], ['cross', C.rich.id, 'math', 403], ['cross', C.rich.id, 'hebrew', 403], ['cross', C.sparse.id, 'math', 200], ['cross', C.sparse.id, 'hebrew', 403], ['cross', C.sparse.id, 'history', 404],
    ['unspecified', C.rich.id, 'math', 403], ['unspecified', C.rich.id, 'hebrew', 403], ['unspecified', C.rich.id, 'english', 404], ['unspecified', C.sparse.id, 'math', 404],
    ['emptyHomeroom', C.empty.id, 'math', 404], ['emptyHomeroom', C.rich.id, 'math', 404],
    ['noClasses', C.rich.id, 'math', 404], ['noClasses', C.empty.id, 'math', 404],
    ['admin', C.rich.id, 'math', 403], ['admin', NIL, 'math', 403], ['municipal', C.rich.id, 'math', 403],
  ]
  const subjRes = new Map<string, Res>()
  for (const [w, cid, s, status] of subjectCases) {
    const r = await P(w, subj(cid, s))
    subjRes.set(`${w}|${cid}|${s}`, r)
    const clsName = cid === C.rich.id ? 'עשירה' : cid === C.sparse.id ? 'דלה' : cid === C.empty.id ? 'ריקה' : 'NIL'
    check(`${w} · ${clsName}/${s}: ${status}`, r.status === status, `status=${r.status}`)
  }
  check('קוד מקצוע לא מוכר: 400', (await P('homeroom', subj(C.rich.id, 'physics'))).status === 400)
  {
    const d = subjRes.get(`homeroom|${C.rich.id}|math`)!.json.data
    const trendOf = (id: string): string => d.students.find((x: any) => x.id === id)?.trend
    check('מחנך, עשירה/מתמטיקה: 14 תלמידים; תלמיד בעלייה = "משתפר/ת", תלמידה בירידה = "בירידה" (ורק היא); בלי טעויות נפוצות (אין תיוג — עדיין)', d.students.length === 14 && trendOf(R.trendUp.id) === 'improving' && trendOf(R.crossDip.id) === 'declining' && d.students.filter((x: any) => x.trend === 'declining').length === 1 && d.misconceptions.length === 0 && d.recommendations.length === 0 && d.classFindings.length === 0, JSON.stringify(d.students.map((s: any) => s.trend).sort().join()))
    check('מחנך, עשירה/מתמטיקה: ארבעה ממצאי תלמידים מדווחים (מגמה חיובית, מגמה שלילית, הטיית מיקום, דילוג קריאה) ורק הם', ['level_trend', 'position_bias', 'reading_skip'].every((k) => d.studentFindings.some((f: any) => f.finding.kind === k && f.finding.status === 'reported')) && d.studentFindings.filter((f: any) => f.finding.status === 'reported').length === 4, d.studentFindings.map((f: any) => `${f.finding.kind}:${f.finding.status}`).join(' '))
    check('משפט פתיחה לכל תת-טאב (סיכום / טעויות נפוצות / התקדמות / תלמידים) — במילים', typeof d.summary.headline === 'string' && ['misconceptions', 'progress', 'students'].every((k) => typeof d.tabSummaries[k] === 'string' && d.tabSummaries[k].length > 5))
  }
  {
    const d = subjRes.get(`homeroom|${C.rich.id}|hebrew`)!.json.data
    check('מחנך, עשירה/עברית: ירידה (2) + זיכרון אקראי מדווחים; "ליאור" — שינוי גדול בלי מספיק משחקים: "אין עדיין מספיק נתונים" ולא אירוע', d.studentFindings.filter((f: any) => f.finding.kind === 'level_trend' && f.finding.status === 'reported').length === 2 && d.studentFindings.some((f: any) => f.finding.kind === 'memory_random_pattern' && f.finding.status === 'reported') && d.studentFindings.some((f: any) => f.finding.kind === 'level_trend' && f.finding.status === 'insufficient' && f.finding.reason === 'n_below_min' && f.studentId === R.almost.id), d.studentFindings.map((f: any) => `${f.finding.kind}:${f.finding.status}`).join(' '))
  }
  {
    const r = subjRes.get(`homeroom|${C.rich.id}|history`)!
    check('מחנך, עשירה/היסטוריה (מקצוע-כיתה בלי נתונים): 200 תקף, dataState=insufficient, ללא רמה ובמילים מה יקרה', r.json.dataState === 'insufficient' && r.json.data.classLevel.mean === null && r.json.data.students.length === 14 && /נתונים|הדמיות/.test(r.json.data.summary.headline), r.json.data.summary.headline)
  }
  {
    const d = subjRes.get(`mixed|${C.rich.id}|hebrew`)!.json.data
    check('מורה מעורב, עשירה/עברית: אותו מבט של עברית; "מקצועות אחרים" באפור — שמות בלבד', d.students.length === 14 && d.otherSubjects.length > 0 && d.otherSubjects.every((s: any) => Object.keys(s).sort().join() === 'code,nameHe'))
  }
  {
    const r = subjRes.get(`cross|${C.rich.id}|history`)!
    check('מורה היסטוריה@עשירה: מבט ריק תקף — אין נתוני היסטוריה, אך לא קיבל את ממצאי המתמטיקה / העברית', r.json.dataState === 'insufficient' && r.json.data.studentFindings.length === 0 && r.json.data.students.every((s: any) => s.level === null))
  }
  {
    /* 404 אחיד: כיתה מחוץ להיקף נראית בדיוק כמו כיתה שאינה קיימת */
    const miss = await P('noClasses', subj(NIL, 'math'))
    const foreign = subjRes.get(`noClasses|${C.rich.id}|math`)!
    check('404 אחיד: כיתה בהיקף של מישהו אחר ≡ כיתה שאינה קיימת (סטטוס וגוף)', miss.status === 404 && foreign.status === 404 && JSON.stringify(miss.json) === JSON.stringify(foreign.json) && foreign.json.error === ERR_NOT_FOUND, JSON.stringify(foreign.json))
    const miss2 = await P('subject', subj(NIL, 'math'))
    check('404 אחיד גם לכיתה אחרת של אותו בית ספר (דלה ללא קישור) — אותה תשובה בדיוק', JSON.stringify(subjRes.get(`subject|${C.sparse.id}|math`)!.json) === JSON.stringify(miss2.json))
    check('מקצוע נעול → 403 עם הודעת "אין הרשאה" (בכיתה של הצופה); מנהל → הודעת "אגרגט בלבד"', subjRes.get(`subject|${C.rich.id}|hebrew`)!.json.error === ERR_NO_ACCESS && subjRes.get(`admin|${C.rich.id}|math`)!.json.error === ERR_AGGREGATE_ONLY)
  }

  /* ───────── סקירת הכיתה: GET /class/:id/overview ───────── */
  console.log('\n— GET /class/:classId/overview —')
  const ov = (cid: string): string => `/analytics-v2/class/${cid}/overview`
  const overviewCases: [Who, string, number][] = [
    ['homeroom', C.rich.id, 200], ['homeroom', C.sparse.id, 404], ['homeroom', C.empty.id, 404],
    ['subject', C.rich.id, 403], ['subject', C.sparse.id, 404],
    ['mixed', C.sparse.id, 200], ['mixed', C.rich.id, 403],
    ['cross', C.rich.id, 403], ['cross', C.sparse.id, 403],
    ['unspecified', C.rich.id, 403], ['emptyHomeroom', C.empty.id, 200], ['emptyHomeroom', C.rich.id, 404],
    ['noClasses', C.rich.id, 404], ['admin', C.rich.id, 403], ['municipal', C.rich.id, 403],
  ]
  const ovRes = new Map<string, Res>()
  for (const [w, cid, status] of overviewCases) {
    const r = await P(w, ov(cid))
    ovRes.set(`${w}|${cid}`, r)
    check(`${w} · סקירה ${cid === C.rich.id ? 'עשירה' : cid === C.sparse.id ? 'דלה' : 'ריקה'}: ${status}`, r.status === status, `status=${r.status}`)
  }
  {
    const d = ovRes.get(`homeroom|${C.rich.id}`)!.json.data
    /* רמה כיתתית רק כש-CLASS_LEVEL_MIN_STUDENTS תלמידים לפחות עומדים בסף האישי (PERSONAL_LEVEL_MIN_SESSIONS משחקים): מתמטיקה / עברית / מדעים (5) כן; תנ"ך (תלמיד/ה אחד/ת עם סף) והיסטוריה (בלי נתונים) — לא */
    const levelCodes = d.rows.filter((r: any) => r.level !== null).map((r: any) => r.subject.code).sort().join()
    check('מחנך: סקירת הכיתה העשירה — שורה לכל מקצוע (חמישה); רמה רק במקצועות עם מספיק תלמידים (מתמטיקה, עברית, מדעים), בתוך הטווח; תנ"ך והיסטוריה בלי רמה', d.rows.length === 5 && levelCodes === 'hebrew,math,science' && d.rows.find((r: any) => r.subject.code === 'history')?.level === null && d.rows.find((r: any) => r.subject.code === 'bible')?.level === null && d.rows.every((r: any) => r.level === null || r.positionVsNorm === 'within'), d.rows.map((r: any) => `${r.subject.code}:${r.level}`).join(' '))
    const e = ovRes.get(`emptyHomeroom|${C.empty.id}`)!
    check('מחנך הכיתה הריקה: סקירה תקפה בלי שורות / בלי רמות, dataState=insufficient', e.json.dataState === 'insufficient' && e.json.data.rows.every((r: any) => r.level === null))
    const miss = await P('noClasses', ov(NIL))
    check('סקירה: 404 אחיד לכיתה מחוץ להיקף ולכיתה שאינה קיימת', JSON.stringify(miss.json) === JSON.stringify(ovRes.get(`noClasses|${C.rich.id}`)!.json) && JSON.stringify(miss.json) === JSON.stringify(ovRes.get(`homeroom|${C.sparse.id}`)!.json))
  }

  /* ───────── מסך תלמיד / משוב / תדריך ───────── */
  console.log('\n— GET /student/:id · /feedback · /briefing —')
  const stu = (id: string): string => `/analytics-v2/student/${id}`
  const panelsOf = (r: Res): any[] => r.json.data.panels
  const visible = (r: Res): string => panelsOf(r).filter((p) => p.access === 'visible').map((p) => p.subject.code).sort().join()
  const greyed = (r: Res): string => panelsOf(r).filter((p) => p.access === 'greyed').map((p) => p.subject.code).sort().join()
  const findingsOf = (r: Res, code: string): any[] => panelsOf(r).find((p) => p.subject.code === code)?.findings ?? []
  const sh = await P('homeroom', stu(R.crossDip.id))
  const shAgain = await P('homeroom', stu(R.crossDip.id))
  check('מחנך על תלמידה בירידה בשני מקצועות: 200, access=full, עברית + מתמטיקה + היסטוריה פתוחים', sh.status === 200 && sh.json.data.access === 'full' && visible(sh) === 'hebrew,history,math' && greyed(sh) === '', `${visible(sh)} / ${greyed(sh)}`)
  check('התרעה חוצת-מקצועות למחנך: קיימת אחת, על שני המקצועות', sh.json.data.crossSubject.length === 1 && sh.json.data.crossSubject[0].kind === 'cross_subject_dip' && sh.json.data.crossSubject[0].evidence.subjects.map((s: any) => s.code).sort().join() === 'hebrew,math')
  check('אותה תלמידה, בקשה שנייה: אותה תשובה (המטמון יציב)', shAgain.status === 200 && JSON.stringify(sh.json.data.panels) === JSON.stringify(shAgain.json.data.panels))
  {
    const mathF = findingsOf(sh, 'math').find((f) => f.kind === 'level_trend')
    check('ירידה במתמטיקה מדווחת: כיוון down, ירידה של 1.5–3.5 רמות, 9 משחקים לפני ו-9 אחרי', mathF?.status === 'reported' && mathF.evidence.direction === 'down' && mathF.evidence.deltaLevels <= -1.5 && mathF.evidence.deltaLevels >= -3.5 && mathF.evidence.sessionsBefore === 9 && mathF.evidence.sessionsAfter === 9, JSON.stringify(mathF?.evidence && { d: mathF.evidence.direction, delta: mathF.evidence.deltaLevels, b: mathF.evidence.sessionsBefore, a: mathF.evidence.sessionsAfter }))
  }
  {
    const r = await P('homeroom', stu(R.trendUp.id))
    const f = findingsOf(r, 'math').find((x) => x.kind === 'level_trend')
    check('תלמיד בעלייה: מגמה "משתפר/ת", ממצא חיובי up של 1.5–3.5 רמות', r.json.data.panels.find((p: any) => p.subject.code === 'math').trend === 'improving' && f?.status === 'reported' && f.tone === 'positive' && f.evidence.direction === 'up' && f.evidence.deltaLevels >= 1.5 && f.evidence.deltaLevels <= 3.5)
  }
  {
    const r = await P('homeroom', stu(R.positionBias.id))
    const f = findingsOf(r, 'math').find((x) => x.kind === 'position_bias')
    check('הטיית מיקום: מדווחת, שיעור בחירת האפשרות הראשונה מעל 50% מול ~25% צפוי (36 פריטים: 18 משחקים × 2 שאלות)', f?.status === 'reported' && f.evidence.observedShare > 0.5 && f.evidence.expectedShare > 0.2 && f.evidence.expectedShare < 0.3 && f.evidence.items === 36, JSON.stringify(f?.evidence))
  }
  {
    const r = await P('homeroom', stu(R.memoryRandom.id))
    const f = findingsOf(r, 'hebrew').find((x) => x.kind === 'memory_random_pattern')
    check('דפוס זיכרון: מדווח (7 משחקים), שיעור איתור מתחת ל-40% מול 70% בקשב', f?.status === 'reported' && f.evidence.games === 7 && f.evidence.observedRate < 0.4 && f.evidence.attentiveRate === 0.7, JSON.stringify(f?.evidence))
  }
  {
    const r = await P('homeroom', stu(R.readingSkipper.id))
    const f = findingsOf(r, 'math').find((x) => x.kind === 'reading_skip')
    check('דילוג קריאה: מדווח, זמן-למילה קטן מ-40% מהחציון הכיתתי', f?.status === 'reported' && f.evidence.ratio < 0.4 && f.evidence.scenes === 36, JSON.stringify(f?.evidence))
  }
  {
    const r = await P('homeroom', stu(R.almost.id))
    const f = findingsOf(r, 'hebrew').find((x) => x.kind === 'level_trend')
    check('שינוי גדול עם N קטן (6 משחקים בכל חלון): "אין עדיין מספיק נתונים" — status=insufficient, בלי ראיות ובלי אפקט', f?.status === 'insufficient' && f.reason === 'n_below_min' && f.evidence === null && f.effectSize === null && /\S/.test(f.text), JSON.stringify(f && { s: f.status, r: f.reason }))
  }
  {
    const quiet = ['controlMc', 'memoryAttentive', 'steadyA', 'steadyB', 'lowLevel', 'highLevel', 'newcomer']
    const out: string[] = []
    for (const k of quiet) {
      const r = await P('homeroom', stu(R[k].id))
      const reported = panelsOf(r).flatMap((p) => p.findings ?? []).filter((f: any) => f.status === 'reported')
      if (reported.length) out.push(k)
      if (k === 'lowLevel') check('תלמיד ברמה נמוכה יציבה: מתחת לטווח המיועד, בלי ממצא', panelsOf(r).find((p) => p.subject.code === 'math').positionVsNorm === 'below' && !reported.length)
      if (k === 'highLevel') check('תלמיד ברמה גבוהה יציבה: מעל הטווח המיועד, בלי ממצא', panelsOf(r).find((p) => p.subject.code === 'math').positionVsNorm === 'above' && !reported.length)
      if (k === 'newcomer') {
        const m = panelsOf(r).find((p) => p.subject.code === 'math')
        check('תלמיד עם 3 משחקים בלבד: רמה קיימת, אפס ממצאים (גם לא "אין עדיין מספיק נתונים" — N קטן מדי אפילו להתחיל לבדוק)', m.sessionsCount === 3 && m.currentLevel !== null && m.findings.length === 0, `findings=${m.findings.length}`)
        check('תלמיד עם 3 משחקים בלבד (שניים בחלון האחרון, אחד לפניו, הפרש 2.2 רמות): המגמה "אין עדיין מספיק נתונים" ולא "משתפר/ת"; התווית אומרת כמה משחקים יש וכמה צריך (UX#10)', m.trend === 'insufficient' && m.trendText === narrateTrendNeedMore(3, 2 * KIND_THRESHOLDS.level_trend.minN), `trend=${m.trend} text=${m.trendText}`)
      }
    }
    check('בקרות (אחידה, קשוב, יציבים, ברמה נמוכה / גבוהה, חדש): אפס ממצאים מדווחים — לא ממציאים אירוע', out.length === 0, out.join())
  }
  {
    const r = await P('homeroom', stu(R.steadyA.id))
    check('תלמיד/ה בלי תיוג שיעורים: אין "תחומים" ואין "טעויות נפוצות" (עדיין לא תויגו) — מערכים ריקים, לא ניחוש', panelsOf(r).every((p) => p.access !== 'visible' || (p.areas.strong.length === 0 && p.areas.challenging.length === 0 && p.commonErrors.length === 0 && p.contentVectors.length === 0)))
  }

  /* מורה מקצועי: רק מקצועו */
  {
    const r = await P('subject', stu(R.crossDip.id))
    check('מורה מתמטיקה על אותה תלמידה: access=subject_only; מתמטיקה פתוחה, עברית והיסטוריה באפור', r.status === 200 && r.json.data.access === 'subject_only' && visible(r) === 'math' && greyed(r) === 'hebrew,history', `${visible(r)} / ${greyed(r)}`)
    check('אותו מורה: אפור = שם בלבד (בלי רמה, בלי ממצאים), ובלי התרעה חוצת-מקצועות', panelsOf(r).filter((p) => p.access === 'greyed').every((p) => Object.keys(p).sort().join() === 'access,subject') && r.json.data.crossSubject.length === 0)
    check('אותו מורה: כל הממצאים בתגובה הם של מתמטיקה, והמשפט בראש העמוד אינו מזכיר עברית (אין דליפה)', panelsOf(r).flatMap((p) => p.access === 'visible' ? p.findings : []).every((f: any) => f.subjectCode === 'math') && !/עברית/.test(r.json.data.summary))
  }
  {
    const r = await P('mixed', stu(R.crossDip.id))
    check('מורה מעורב על תלמידת העשירה: עברית פתוחה; מתמטיקה והיסטוריה באפור; access=subject_only; בלי התרעה חוצת-מקצועות (לא מחנך שם)', r.status === 200 && r.json.data.access === 'subject_only' && visible(r) === 'hebrew' && greyed(r) === 'history,math' && r.json.data.crossSubject.length === 0, `${visible(r)} / ${greyed(r)}`)
    const s = await P('mixed', stu(SP.s1.id))
    check('אותו מורה על תלמיד הכיתה הדלה (שם הוא מחנך): access=full, מתמטיקה ועברית פתוחות', s.status === 200 && s.json.data.access === 'full' && visible(s) === 'hebrew,math' && greyed(s) === '', `${visible(s)} / ${greyed(s)}`)
  }
  {
    const r = await P('cross', stu(R.crossDip.id))
    check('מורה היסטוריה@עשירה על תלמידת העשירה: היסטוריה בלבד פתוחה (אין נתונים), מתמטיקה ועברית באפור — לא מקבל את מתמטיקת הדלה', r.status === 200 && visible(r) === 'history' && greyed(r) === 'hebrew,math', `${visible(r)} / ${greyed(r)}`)
    check('אותו מורה: אין בתגובה אף ממצא רמה (לא דולף ירידה במתמטיקה / עברית)', !JSON.stringify(r.json).includes('level_trend'))
    const s = await P('cross', stu(SP.s1.id))
    check('אותו מורה על תלמיד הדלה: מתמטיקה פתוחה, עברית באפור (היסטוריה אינה מקצוע של הדלה — לא מופיעה בכלל)', s.status === 200 && visible(s) === 'math' && greyed(s) === 'hebrew', `${visible(s)} / ${greyed(s)}`)
  }
  {
    const r = await P('unspecified', stu(R.crossDip.id))
    check('שיוך בלי מקצוע: התלמיד נפתח אך כל לוחות המקצוע באפור (שם בלבד), בלי התרעה חוצת-מקצועות', r.status === 200 && visible(r) === '' && panelsOf(r).length > 0 && r.json.data.crossSubject.length === 0 && r.json.data.access === 'subject_only', `${visible(r)} / ${greyed(r)}`)
  }
  {
    const own = await P('emptyHomeroom', stu(EM.e1.id))
    check('תלמיד/ה בכיתה בלי נתונים (מחנך הכיתה): 200 תקף, dataState=insufficient, בלי לוחות רמה', own.status === 200 && own.json.dataState === 'insufficient' && own.json.data.summary.length > 5 && panelsOf(own).every((p) => p.access !== 'visible' || p.currentLevel === null))
  }

  /* 404 אחיד לתלמידים; 403 למנהלים */
  {
    const missing = await P('noClasses', stu(NIL))
    const cases: [Who, string][] = [['noClasses', R.crossDip.id], ['emptyHomeroom', R.crossDip.id], ['homeroom', EM.e1.id], ['homeroom', SP.s1.id], ['subject', SP.s1.id], ['homeroom', 'not-a-uuid']]
    for (const [w, id] of cases) {
      const r = await P(w, stu(id))
      check(`404 אחיד · ${w} על תלמיד/ה מחוץ להיקף (${id === 'not-a-uuid' ? 'מזהה פגום' : 'קיים בכיתה זרה'}) ≡ תלמיד/ה שאינו/ה קיים/ת`, r.status === 404 && JSON.stringify(r.json) === JSON.stringify(missing.json), `status=${r.status}`)
    }
    for (const [label, fn] of [['feedback', (id: string) => `/analytics-v2/student/${id}/feedback`], ['briefing', (id: string) => `/analytics-v2/briefing/student/${id}`]] as const) {
      const a = await P('emptyHomeroom', fn(R.crossDip.id)), b = await P('emptyHomeroom', fn(NIL))
      check(`404 אחיד · ${label} של תלמיד/ה מחוץ להיקף ≡ שאינו/ה קיים/ת`, a.status === 404 && b.status === 404 && JSON.stringify(a.json) === JSON.stringify(b.json))
    }
    const bc = await P('emptyHomeroom', `/analytics-v2/briefing/class/${C.rich.id}`), bn = await P('emptyHomeroom', `/analytics-v2/briefing/class/${NIL}`)
    check('404 אחיד · תדריך כיתה מחוץ להיקף ≡ כיתה שאינה קיימת', bc.status === 404 && bn.status === 404 && JSON.stringify(bc.json) === JSON.stringify(bn.json))
    for (const w of ['admin', 'municipal'] as const) {
      const real = await P(w, stu(R.crossDip.id)), nil = await P(w, stu(NIL))
      check(`${w}: נקודות תלמיד = 403 "אגרגט בלבד" — גם לתלמיד שקיים וגם לשאינו קיים (בלי אורקל קיום)`, real.status === 403 && nil.status === 403 && real.json.error === ERR_AGGREGATE_ONLY && JSON.stringify(real.json) === JSON.stringify(nil.json))
      const fb = await P(w, `/analytics-v2/student/${R.crossDip.id}/feedback`), br = await P(w, `/analytics-v2/briefing/student/${R.crossDip.id}`), bcl = await P(w, `/analytics-v2/briefing/class/${C.rich.id}`)
      check(`${w}: משוב / תדריך תלמיד / תדריך כיתה = 403`, fb.status === 403 && br.status === 403 && bcl.status === 403)
    }
  }
  check('הגבלת תפקיד: מורה מול /admin/overview = 403 "אין הרשאה" (כל שבעת המורים)', (await Promise.all((['homeroom', 'subject', 'mixed', 'cross', 'unspecified', 'emptyHomeroom', 'noClasses'] as const).map((w) => P(w, '/analytics-v2/admin/overview')))).every((r) => r.status === 403 && r.json.error === ERR_NO_ACCESS))

  /* משוב לתלמיד/ה */
  {
    const fb = await P('homeroom', `/analytics-v2/student/${R.trendUp.id}/feedback`)
    check('משוב לתלמיד בעלייה: 200 עם פריט צמיחה', fb.status === 200 && fb.json.data.items.some((i: any) => i.kind === 'growth'))
    const fbDown = await P('homeroom', `/analytics-v2/student/${R.crossDip.id}/feedback`)
    check('משוב לתלמידה בירידה: צעד הבא (בלי שיפוט)', fbDown.status === 200 && fbDown.json.data.items.some((i: any) => i.kind === 'next_step'))
    const fbNone = await P('emptyHomeroom', `/analytics-v2/student/${EM.e1.id}/feedback`)
    check('משוב לתלמיד/ה בלי משחקים ובלי מקצועות: 200 עם items ריק (לא שגיאה)', fbNone.status === 200 && fbNone.json.data.items.length === 0)
    const fbSub = await P('subject', `/analytics-v2/student/${R.trendUp.id}/feedback`)
    check('משוב למורה מקצועי: רק מקצועו (מתמטיקה) — פריט הצמיחה קיים, בלי עברית', fbSub.status === 200 && fbSub.json.data.items.every((i: any) => i.subject.code === 'math'))
  }
  /* תדריך */
  {
    const bs = await P('homeroom', `/analytics-v2/briefing/student/${R.crossDip.id}`)
    check('תדריך תלמיד (מחנך): 200, שבעה סעיפים, "איך חישבנו?" אחרון', bs.status === 200 && bs.json.data.sections.length === 7 && bs.json.data.sections[6].id === 'how_we_calculated')
    const bc = await P('homeroom', `/analytics-v2/briefing/class/${C.rich.id}`)
    check('תדריך כיתה (מחנך): 200', bc.status === 200 && bc.json.data.scope === 'class')
    const bsub = await P('subject', `/analytics-v2/briefing/class/${C.rich.id}`)
    check('תדריך כיתה למורה מתמטיקה: 200 — מקצועו בלבד', bsub.status === 200 && !/עברית/.test(bsub.json.data.subtitle ?? ''))
    check('תדריך כיתה: שיוך בלי מקצוע = 403; מורה מחוץ לכיתה = 404; מורה היסטוריה@עשירה = 200', (await P('unspecified', `/analytics-v2/briefing/class/${C.rich.id}`)).status === 403 && (await P('noClasses', `/analytics-v2/briefing/class/${C.rich.id}`)).status === 404 && (await P('cross', `/analytics-v2/briefing/class/${C.rich.id}`)).status === 200)
    check('תדריך: תחום ("scope") לא תקין = 400', (await P('homeroom', `/analytics-v2/briefing/school/${C.rich.id}`)).status === 400)
    const bm = await P('mixed', `/analytics-v2/briefing/class/${C.sparse.id}`)
    check('תדריך כיתה דלה למחנך הכיתה הדלה: 200', bm.status === 200)
  }

  /* ───────── מנהל: אגרגטים בלבד ───────── */
  console.log('\n— GET /admin/overview (אגרגט בלבד) —')
  const adm = await P('admin', '/analytics-v2/admin/overview')
  const mun = await P('municipal', '/analytics-v2/admin/overview')
  check('מנהל ומנהל עירוני: 200', adm.status === 200 && mun.status === 200)
  {
    const d = adm.json.data
    const cell = (grade: number, code: string): any => d.cells.find((c: any) => c.grade === grade && c.subject.code === code)
    /* תא מוצג רק מתורמים (מי שיש לו לפחות PERSONAL_LEVEL_MIN_SESSIONS משחקים במקצוע) ורק אם גם בלי הכיתה הגדולה ביותר נשארים ≥ ADMIN_CELL_MIN_OUTSIDE_LARGEST_CLASS: הכיתה העשירה + הרחבה (+ המשותף/ת במתמטיקה, פעם אחת) */
    const contrib = fx.expected.adminContributors
    check(`תא שכבה ו׳ × עברית: מוצג, מ-${contrib.hebrew} תורמים משתי כיתות (עשירה + רחבה); מתמטיקה: ${contrib.math} (ועוד התלמיד/ה המשותף/ת, פעם אחת) — נספרים תורמים, לא רשומים`, cell(6, 'hebrew')?.status === 'shown' && cell(6, 'hebrew').studentCount === contrib.hebrew && cell(6, 'math')?.status === 'shown' && cell(6, 'math').studentCount === contrib.math, `hebrew=${cell(6, 'hebrew')?.studentCount} math=${cell(6, 'math')?.studentCount}`)
    check('תא שכולו כיתה אחת (מדעים, 5 תלמידים) מוסתר מסיבת "כיתה אחת" — מורה מזוהה, חוק 9', cell(6, 'science')?.status === 'hidden' && cell(6, 'science').reason === 'single_class')
    check('תא עם פחות מ-5 תורמים (תנ"ך, 2) מוסתר מסיבת "תא קטן"', cell(6, 'bible')?.status === 'hidden' && cell(6, 'bible').reason === 'small_cell')
    check('תא מוסתר אינו נושא מספר תלמידים או רמה (אין studentCount / avgLevel)', d.cells.filter((c: any) => c.status === 'hidden').every((c: any) => !('studentCount' in c) && !('avgLevel' in c) && !('deltaVsNorm' in c)))
    check('אין תא להיסטוריה (אין תורמים) — לא תא "מוסתר" שמרמז על נתונים', !cell(6, 'history'))
    check('שכבה ה׳ (כיתה ריקה): בלי תאים; hiddenCells=2', d.cells.filter((c: any) => c.grade === 5).length === 0 && d.hiddenCells === 2)
    check(`התמונה מבית הספר הנכון: 2 שכבות, 6 כיתות, ${TOTAL_STUDENTS} תלמידים בסך הכול — תלמיד/ה בשתי כיתות נספר/ת פעם אחת (כל שכבה ≥ 5 תלמידים — הסכום מתפרסם)`, d.grades.length === 2 && d.highlights.some((h: string) => h.includes(String(TOTAL_STUDENTS))) && d.grades.reduce((s: number, g: any) => s + g.classCount, 0) === 6, d.highlights.join(' '))
    check('admin: grades[].studentCount סופר תלמידים שונים — תלמיד/ה בשתי כיתות של אותה שכבה נספר/ת פעם אחת (סכום השכבות = סך בית הספר)', d.grades.reduce((s: number, g: any) => s + g.studentCount, 0) === TOTAL_STUDENTS, `שכבות=${d.grades.map((g: any) => g.gradeLabel + ':' + g.studentCount).join(' ')} · סך בית הספר=${TOTAL_STUDENTS}`)
    check('מנהל עירוני: אותה תמונה בדיוק כמו מנהל בית הספר (אותו בית ספר)', JSON.stringify(mun.json.data.cells) === JSON.stringify(d.cells))
  }
  {
    /* אין שם / מזהה תלמיד / מורה / כיתה באף תגובה של מנהל; אין מפתחות על מורים */
    const adminBodies = [cfg.admin, entry.admin, roster.admin, adm, cfg.municipal, entry.municipal, roster.municipal, mun]
    const leaks: string[] = []
    const teacherIds = new Set(Object.values(T).map((t) => t.userId))
    for (const b of adminBodies) {
      for (const { path, value } of strings(b.json)) {
        if (allStudentIds.has(value) || teacherIds.has(value) || allClassIds.has(value)) leaks.push(`${path}=id`)
        else if (value.includes(FX_PREFIX) && !/^data\.school\.name$/.test(path)) leaks.push(`${path}=prefix`)
        else if (UUID_RE.test(value) && !/^data\.school\.id$/.test(path)) leaks.push(`${path}=uuid`)
      }
      for (const k of keysOf(b.json)) if (/teacher|homeroom|student(Id|Name)|displayName/i.test(k)) leaks.push(`key:${k}`)
    }
    check('מנהל: אין בשום תגובה (config / entry / roster / overview) שם או מזהה של תלמיד, מורה או כיתה, ואין מפתחות על מורים', leaks.length === 0, leaks.slice(0, 4).join(' · '))
    const text = JSON.stringify(adm.json.data)
    check('מנהל: אין מונחים של מורים בטקסטים (מחנך / מורה)', !/מחנך|מחנכת|המורה/.test(text))
  }

  /* ───────── G1: אמת במצבים ריקים ───────── */
  console.log('\n— אמת במצבים ריקים: קטלוג, כיסוי ממוקד, שיוך בלי מקצוע, בסיס ל"אין חריג" —')
  {
    const untagged = (d: any): boolean => d.catalogReady === false && d.catalogNote === LIVE_COVERAGE_UNTAGGED
    const ovD = ovRes.get(`homeroom|${C.rich.id}`)!.json.data
    const csD = subjRes.get(`homeroom|${C.rich.id}|math`)!.json.data
    const csSubj = subjRes.get(`subject|${C.rich.id}|math`)!.json.data
    const stCross = (await P('homeroom', stu(R.crossDip.id))).json.data
    check('קטלוג ריק (אין תיוג בחשבון): סקירה / מקצוע / תלמידה / מנהל — catalogReady=false ו-catalogNote המשפט הכן; משפט הלשונית "טעויות נפוצות" אינו מבטיח שיופיעו', untagged(ovD) && untagged(csD) && untagged(stCross) && untagged(adm.json.data) && csD.tabSummaries.misconceptions === CATALOG_UNTAGGED_TEXT.errorsTabSummary && !/יופיעו|יצטברו/.test(`${csD.tabSummaries.misconceptions} ${csD.catalogNote}`), JSON.stringify([ovD.catalogReady, csD.catalogReady, stCross.catalogReady, adm.json.data.catalogReady]))

    const gapClass = narrateScopedCoverageNote({ unclassified: fx.expected.unclassifiedSessions, withoutLevel: 0 }) as string
    check(`הערת כיסוי ממוקדת בכיתה העשירה: ${fx.expected.unclassifiedSessions} משחקים בשיעורים בלי מקצוע — בסקירה, במסך המקצוע ואצל המורה המקצועי; ההערה אומרת ששיוך בדיעבד לא מחזיר משחקים שכבר שוחקו (לא "יתווספו")`, ovD.coverageNote === gapClass && csD.coverageNote === gapClass && csSubj.coverageNote === gapClass && /לא ייכללו גם אחרי שיוך/.test(gapClass) && !/יתווספו/.test(gapClass), String(ovD.coverageNote))
    const withGap = fx.expected.unclassifiedStories.map((k) => R[k].id)
    const stGap = await Promise.all(withGap.map(async (id) => (await P('homeroom', stu(id))).json.data.coverageNote))
    const stNone = (await P('homeroom', stu(R.steadyA.id))).json.data
    check(`הערת כיסוי במסך תלמיד/ה: רק למי ששיחק/ה בשיעורים בלי מקצוע (${fx.expected.unclassifiedStories.length} תלמידים, ${fx.expected.unclassifiedPlaysEach} משחקים לכל אחד/ת); לשאר — null`, stGap.every((n) => n === narrateScopedCoverageNote({ unclassified: fx.expected.unclassifiedPlaysEach, withoutLevel: 0 })) && stNone.coverageNote === null, JSON.stringify(stGap))
    check('כיתות בלי משחקים כאלה (הדלה אצל המחנך שלה, הריקה): coverageNote=null בסקירה ובמסך מקצוע', ovRes.get(`mixed|${C.sparse.id}`)!.json.data.coverageNote === null && ovRes.get(`emptyHomeroom|${C.empty.id}`)!.json.data.coverageNote === null && subjRes.get(`mixed|${C.sparse.id}|math`)!.json.data.coverageNote === null)
    check('מצב ריק בכיתה בלי תוצאות (היסטוריה בעשירה): הכותרת אומרת שהמשחקים שכבר שוחקו בשיעורים בלי מקצוע לא נכללו, ולא "התמונה תופיע כשתלמידים יסיימו"', /שיעורים שעוד לא שויך להם מקצוע/.test(subjRes.get(`homeroom|${C.rich.id}|history`)!.json.data.summary.headline) && !/כשתלמידים יסיימו/.test(subjRes.get(`homeroom|${C.rich.id}|history`)!.json.data.summary.headline), subjRes.get(`homeroom|${C.rich.id}|history`)!.json.data.summary.headline)

    const eMixed = entry.mixed.json.data.classes.find((x: any) => x.id === C.sparse.id), eRich = entry.homeroom.json.data.classes.find((x: any) => x.id === C.rich.id)
    check('כרטיס כיתה בכניסה: בכיתה הדלה (3 תלמידים, אף אחד לא נבדק) אין "אין תלמידים לתשומת לב" אלא basisNote עם כמה נבדקו; בעשירה (יש תשומת לב) basisNote=null', eMixed?.attentionCount === 0 && eMixed.studentsAssessed === 0 && eMixed.basisNote === narrateEntryBasisNote(0, 3) && eRich?.basisNote === null, JSON.stringify(eMixed))

    const dAdm = adm.json.data
    check('מנהל: coverageNote על משחקים בשיעורים בלי מקצוע (בלי שמות), hiddenNote בלי המילה "תא", ו-sizeText ביחיד / רבים נכון', dAdm.coverageNote === narrateAdminUnclassifiedNote(fx.expected.unclassifiedSessions) && dAdm.hiddenNote === narrateAdminHiddenNote(dAdm.hiddenCells) && !/תא/.test(dAdm.hiddenNote) && dAdm.grades.every((g: any) => typeof g.sizeText === 'string' && g.sizeText.includes(g.classCount === 1 ? 'כיתה אחת' : `${g.classCount} כיתות`)), `${dAdm.coverageNote} | ${dAdm.hiddenNote}`)
  }

  /* ───────── בידוד בין בתי ספר ───────── */
  console.log('\n— בידוד בין בתי ספר —')
  {
    const oEntry = await P('outsider', '/analytics-v2/entry'), oRoster = await P('outsider', '/analytics-v2/roster'), oCfg = await P('outsider', '/analytics-v2/config')
    check('מחנך בבית ספר אחר: רואה רק את כיתתו (2 תלמידים), בלי כיתות / תלמידים / הערת כיסוי של בית הספר שלנו', oEntry.status === 200 && oEntry.json.data.classes.length === 1 && oEntry.json.data.classes[0].id === C.other.id && oEntry.json.data.classes[0].studentCount === 2 && oEntry.json.data.coverageNote === null && sortedIds(oRoster.json.data.students.map((x: any) => x.id)) === sortedIds(otherIds) && oCfg.json.data.classes.length === 1)
    const miss = await P('outsider', stu(NIL))
    const probes: [string, Res][] = [
      ['תלמיד של בית הספר שלנו', await P('outsider', stu(R.crossDip.id))], ['משוב', await P('outsider', `/analytics-v2/student/${R.crossDip.id}/feedback`)],
      ['תדריך תלמיד', await P('outsider', `/analytics-v2/briefing/student/${R.crossDip.id}`)],
    ]
    check('מחנך בבית ספר אחר: תלמיד / משוב / תדריך של בית הספר שלנו = 404 אחיד (≡ תלמיד שאינו קיים)', probes.every(([, r]) => r.status === 404 && JSON.stringify(r.json) === JSON.stringify(miss.json)), probes.map(([l, r]) => `${l}=${r.status}`).join(' '))
    const classProbes = await Promise.all([P('outsider', subj(C.rich.id, 'math')), P('outsider', ov(C.rich.id)), P('outsider', `/analytics-v2/briefing/class/${C.rich.id}`), P('outsider', subj(NIL, 'math'))])
    check('מחנך בבית ספר אחר: מסך מקצוע / סקירה / תדריך של כיתה מבית הספר שלנו = 404 אחיד (≡ כיתה שאינה קיימת)', classProbes.every((r) => r.status === 404 && JSON.stringify(r.json) === JSON.stringify(classProbes[3].json)))
    check('ובכיוון ההפוך: המחנך שלנו לא רואה את כיתת בית הספר האחר ולא את תלמידיה (404 אחיד)', (await P('homeroom', stu(OT.o1.id))).status === 404 && (await P('homeroom', subj(C.other.id, 'math'))).status === 404 && (await P('subject', ov(C.other.id))).status === 404)
    const ownOverview = await P('outsider', ov(C.other.id))
    check('המחנך בבית הספר האחר: סקירת כיתתו תקפה (200) ובלי נתונים (insufficient)', ownOverview.status === 200 && ownOverview.json.dataState === 'insufficient')

    const oa = await P('outsiderAdmin', '/analytics-v2/admin/overview')
    check('מנהל בית ספר אחר: 200 על בית הספר שלו בלבד — school.id נכון, בלי שכבות / תאים (כיתה אחת של 2 תלמידים)', oa.status === 200 && oa.json.data.school.id === fx.otherSchoolId && oa.json.data.grades.length === 0 && oa.json.data.cells.length === 0, JSON.stringify(oa.json.data?.grades))
    const leak = strings(oa.json).filter(({ path, value }) => value.includes(FX_PREFIX) && !/^data\.school\.name$/.test(path))
    check('מנהל בית ספר אחר: בגוף התגובה אין שום דבר מבית הספר שלנו (שם / מזהה / כיתה / תלמיד)', leak.length === 0 && !strings(oa.json).some(({ value }) => allStudentIds.has(value) || allClassIds.has(value) || value === fx.schoolId))
    check('מנהל בית הספר שלנו: school.id הוא שלנו; הכיתה והתלמידים של בית הספר האחר לא נספרו (סך התלמידים בהדגשות)', adm.json.data.school.id === fx.schoolId && adm.json.data.highlights.some((h: string) => h.includes(String(TOTAL_STUDENTS))) && !adm.json.data.highlights.some((h: string) => h.includes(String(TOTAL_STUDENTS + otherIds.length))))

    const ea = await P('emptySchoolAdmin', '/analytics-v2/admin/overview')
    const eCfg = await P('emptySchoolAdmin', '/analytics-v2/config'), eEntry = await P('emptySchoolAdmin', '/analytics-v2/entry'), eRoster = await P('emptySchoolAdmin', '/analytics-v2/roster')
    check('מנהל בית ספר חדש בלי אף כיתה: overview 200 (לא 500) עם dataState=insufficient ובלי שכבות / תאים / הדגשות', ea.status === 200 && ea.json.dataState === 'insufficient' && ea.json.data.grades.length === 0 && ea.json.data.cells.length === 0 && ea.json.data.highlights.length === 0 && ea.json.data.hiddenCells === 0, `status=${ea.status} ${ea.status !== 200 ? JSON.stringify(ea.json) : ''}`)
    check('אותו מנהל: config / entry / roster = 200 ריק', [eCfg, eEntry, eRoster].every((r) => r.status === 200) && eCfg.json.data.lens === 'admin' && eEntry.json.data.classes.length === 0 && eRoster.json.data.classes.length === 0)
  }

  /* ───────── תלמיד/ה בשתי כיתות ───────── */
  console.log('\n— תלמיד/ה בשתי כיתות (הכיתה העיקרית שלו/ה ≠ הכיתה שבה המורה מחנך) —')
  {
    const D = DU.shared.id
    const dRoster = await P('dual', '/analytics-v2/roster')
    const dA = rc2(dRoster, C.dualA.id), dB = rc2(dRoster, C.dualB.id)
    check('מורה dual (מחנך dualA + תנ"ך ב-dualB): ב-dualA מחנך וכל המקצועות פתוחים; ב-dualB פתוח רק תנ"ך, מתמטיקה נעולה', dRoster.status === 200 && dA?.isHomeroom === true && codes(dA.subjects) === 'bible,math' && dB?.isHomeroom === false && codes(dB.subjects) === 'bible' && codes(dB.lockedSubjects) === 'math', `A ${codes(dA?.subjects)} · B ${codes(dB?.subjects)}/${codes(dB?.lockedSubjects)}`)
    const inA = await P('dual', subj(C.dualA.id, 'math')), inB = await P('dual', subj(C.dualB.id, 'math')), bibB = await P('dual', subj(C.dualB.id, 'bible'))
    check('מורה dual: מסך מתמטיקה של dualA = 200 ושל dualB = 403; תנ"ך ב-dualB = 200; סקירת dualA = 200, סקירת dualB = 403', inA.status === 200 && inB.status === 403 && bibB.status === 200 && (await P('dual', ov(C.dualA.id))).status === 200 && (await P('dual', ov(C.dualB.id))).status === 403)
    check('מסך מתמטיקה של dualA (שבה הוא מחנך) מציג את התלמיד/ה המשותף/ת עם רמה', inA.json.data.students.some((x: any) => x.id === D && x.level !== null))
    const sB = await P('dual', stu(DU.b1.id)), sA = await P('dual', stu(DU.a1.id))
    check('תלמיד/ה של dualB בלבד: נפתח/ת עם תנ"ך בלבד (access=subject_only); תלמיד/ה של dualA בלבד: נפתח/ת כמחנך (access=full)', sB.status === 200 && sB.json.data.access === 'subject_only' && sA.status === 200 && sA.json.data.access === 'full')
    const sh = await P('dual', stu(D))
    check('תלמיד/ה בשתי כיתות — המורה מחנך של אחת מהן: מסך התלמיד/ה = access=full ומתמטיקה פתוחה (איחוד הרשאות בין הכיתות, כמו authz.studentScope; ומסך המקצוע של אותה כיתה כבר מציג את הרמה שלו/ה)', sh.status === 200 && sh.json.data.access === 'full' && sh.json.data.panels.some((x: any) => x.subject.code === 'math' && x.access === 'visible'), `access=${sh.json.data?.access} math=${sh.json.data?.panels?.find((x: any) => x.subject.code === 'math')?.access} כיתה=${sh.json.data?.student?.className}`)
    const dRosterIds = dRoster.json.data.students.map((x: any) => x.id)
    info(`roster: התלמיד/ה המשותף/ת מופיע/ה ${dRosterIds.filter((id: string) => id === D).length} פעמים (שורה לכל כיתה, classId שונה) — בלקוח מפתח הרשימה צריך להיות id+classId`)
    const dEntry = await P('dual', '/analytics-v2/entry')
    check('מורה dual: entry — שתי הכיתות, בכל אחת 2 תלמידים והתוצאות קיימות', dEntry.status === 200 && dEntry.json.data.classes.length === 2 && dEntry.json.data.classes.every((c: any) => c.studentCount === 2 && c.hasResults === true))
    check('המורה dual ביקש תלמיד של כיתה אחרת בבית הספר (rich) = 404 אחיד', (await P('dual', stu(R.crossDip.id))).status === 404)
  }

  /* ───────── יומן גישה: data_access_log ───────── */
  console.log('\n— data_access_log (scope analytics_v2_*) —')
  {
    /* כתיבה לפני התגובה: מורה שלא קרא עדיין את התלמיד — השורה קיימת מיד אחרי שהתגובה התקבלה */
    const first = await P('subject', stu(R.controlMc.id))
    const { data: justNow } = await supabaseAdmin.from('data_access_log').select('student_id').eq('viewer_id', T.subject.userId).eq('student_id', R.controlMc.id).eq('scope', 'analytics_v2_student')
    check('השורה ביומן כבר קיימת כשהתגובה מתקבלת (נכתבת לפני res.json)', first.status === 200 && (justNow ?? []).length === 1, `rows=${(justNow ?? []).length}`)
  }
  /* מטמון הכפילות חי בזיכרון השרת, ושרת הפיתוח מתאתחל בכל שמירת קובץ — לכן שלוש הבקשות הרצופות כאן הן הבדיקה, ולא ריק הזמן שבין הבקשה הראשונה למסך הזה */
  const dedupFrom = new Date(Date.now() - 5000).toISOString()
  for (let i = 0; i < 3; i++) await P('homeroom', stu(R.crossDip.id))
  const { data: logData } = await supabaseAdmin.from('data_access_log').select('viewer_id, viewer_role, student_id, scope, endpoint')
    .in('viewer_id', Object.values(T).map((t) => t.userId)).like('scope', 'analytics_v2_%')
  const logs = (logData ?? []) as { viewer_id: string; viewer_role: string; student_id: string | null; scope: string; endpoint: string }[]
  const rowsOf = (w: Who, scope?: string): typeof logs => logs.filter((l) => l.viewer_id === T[w].userId && (!scope || l.scope === `analytics_v2_${scope}`))
  const stuSet = (rows: typeof logs): string => sortedIds([...new Set(rows.map((r) => r.student_id ?? '-'))])
  check('מחנך: roster נרשם לכל 14 תלמידי הכיתה (שורה לכל תלמיד, בלי כפילות)', rowsOf('homeroom', 'roster').length === 14 && stuSet(rowsOf('homeroom', 'roster')) === sortedIds(richIds))
  check('מחנך: מסך מקצוע (classSubject) נרשם לתלמידי הכיתה שנחשפו בשמם', new Set(rowsOf('homeroom', 'classSubject').map((r) => r.student_id)).size === 14 && rowsOf('homeroom', 'classSubject').every((r) => richIds.includes(r.student_id as string)))
  check('מחנך: מסך הכניסה נרשם לתלמידי ההתרעות שהוצגו (3) בלבד', rowsOf('homeroom', 'entry').length === ENTRY_MAX_ALERTS && rowsOf('homeroom', 'entry').every((r) => attentionIds.includes(r.student_id as string)))
  const { data: freshRows } = await supabaseAdmin.from('data_access_log').select('student_id').eq('viewer_id', T.homeroom.userId).eq('student_id', R.crossDip.id).eq('scope', 'analytics_v2_student').gte('created_at', dedupFrom)
  check('מחנך: אותו תלמיד נפתח 3 פעמים ברצף באותה נקודה בחלון הכפילות — לכל היותר שורה אחת חדשה (בלי רישום כפול), והצפייה עצמה רשומה', (freshRows ?? []).length <= 1 && rowsOf('homeroom', 'student').filter((r) => r.student_id === R.crossDip.id).length >= 1, `fresh=${(freshRows ?? []).length}`)
  check('מחנך: משוב ותדריך תלמיד נרשמו (analytics_v2_feedback / analytics_v2_briefing)', rowsOf('homeroom', 'feedback').some((r) => r.student_id === R.crossDip.id) && rowsOf('homeroom', 'briefing').some((r) => r.student_id === R.crossDip.id))
  check('סקירת כיתה נרשמה לתלמידים שהוצגו בהתרעות הסקירה', rowsOf('homeroom', 'classOverview').length > 0 && rowsOf('homeroom', 'classOverview').every((r) => attentionIds.includes(r.student_id as string)))
  check('endpoint נרשם בצורה "GET /api/analytics-v2/…" ותפקיד הצופה = teacher', logs.length > 0 && logs.every((l) => l.endpoint.startsWith('GET /api/analytics-v2/') && l.viewer_role === 'teacher'))
  check('כל תלמיד שנרשם שייך לפיקסצ\'ר (אין תלמיד זר ביומן)', logs.every((l) => l.student_id !== null && allStudentIds.has(l.student_id)))
  check('נחסם / לא נמצא ← לא נרשם: מורה שיוך-בלי-מקצוע — אין שורת classSubject (כל הבקשות 403 / 404)', rowsOf('unspecified', 'classSubject').length === 0)
  check('נחסם / לא נמצא ← לא נרשם: מורה הכיתה הריקה ביקש תלמידי עשירה (404) — אין שורה על תלמיד עשירה', rowsOf('emptyHomeroom').every((r) => emptyIds.includes(r.student_id as string)))
  check('מורה בלי כיתות / מנהלים: אפס שורות ביומן (אין תלמידים שנחשפו בשמם)', ['noClasses', 'admin', 'municipal', 'outsiderAdmin', 'emptySchoolAdmin'].every((w) => rowsOf(w as Who).length === 0))
  check('מחנך בית ספר אחר: ביומן רק תלמידי כיתתו (נחסם / לא נמצא ← לא נרשם)', rowsOf('outsider').length > 0 && rowsOf('outsider').every((r) => otherIds.includes(r.student_id as string)))
  check('מורה מעורב: ב-roster נרשמו 17 התלמידים (14 + 3); מורה היסטוריה@עשירה: רק מה שנחשף בשמו', rowsOf('mixed', 'roster').length === 17 && stuSet(rowsOf('cross', 'roster')) === sortedIds([...richIds, ...sparseIds]))

  /* ───────── שלמות: חוזה, מסלול חי נקי מהדגמה, הכיסוי ───────── */
  console.log('\n— חוזה ומסלול חי —')
  check(`כל ${validated} תגובות 200 עומדות בסכמות החוזה (EP[*].response)`, validated >= 60 && schemaFailures.length === 0, schemaFailures.slice(0, 3).join(' | '))
  {
    const ms = latencies.filter((x) => x > 0).sort((a, b) => a - b)
    if (ms.length) info(`זמני תגובה (${ms.length} בקשות מוצלחות): חציון ${ms[Math.floor(ms.length / 2)]}ms · p95 ${ms[Math.floor(ms.length * 0.95)]}ms · מקסימום ${ms[ms.length - 1]}ms (בקשה ראשונה לכיתה = בניית ניתוח קרה)`)
  }
  if (process.env.V2_ACCEPT_PERF !== '0') {
    /* מטמון הצופה (ViewerMemo, TTL 20 ש'): מורה בלי כיתות — הניתוח ריק וזול, לכן הזמן הוא בעיקר requireStaff + זיהוי הצופה.
       חם = בקשות רצופות בתוך ה-TTL; קר = בקשה אחרי שה-TTL פג. ההפרש הוא מה שהמטמון חוסך. מידע בלבד. */
    const ONE = '/analytics-v2/config'
    const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
    const warm: number[] = []
    await P('noClasses', ONE)
    for (let i = 0; i < 12; i++) warm.push((await P('noClasses', ONE)).ms)
    const cold: number[] = []
    for (let i = 0; i < 3; i++) { await sleep(21_000); cold.push((await P('noClasses', ONE)).ms) }
    info(`מטמון הצופה (/config, מורה בלי כיתות): חם — חציון ${median(warm)}ms (${warm.length} בקשות, מקס' ${Math.max(...warm)}ms) · קר (אחרי פקיעת ה-TTL, ${cold.length} דגימות) — ${cold.join('/')}ms; ההפרש = מה שהמטמון חוסך`)
    const warmRoster: number[] = []
    for (let i = 0; i < 8; i++) warmRoster.push((await P('homeroom', '/analytics-v2/roster')).ms)
    info(`רשימת הכיתה של המחנך (ניתוח במטמון, צופה חם): חציון ${median(warmRoster)}ms · מקס' ${Math.max(...warmRoster)}ms`)
  }
  {
    const demo: string[] = []
    const fixtureIds = new Set([...allStudentIds, ...allClassIds, fx.schoolId, ...Object.values(T).map((t) => t.userId)])
    for (const b of bodies) {
      for (const { path, value } of strings(b.json)) {
        if (/^c-(d1|d2|v1|v2)$/.test(value) || /נתוני הדגמה/.test(value) || /מיפוי לדוגמה/.test(value)) demo.push(`${b.who}:${path}`)
      }
      walk(b.json, (k, v, p) => {
        if (typeof v === 'string' && k !== null && /^(studentId|classId|entityId)$/.test(k) && !fixtureIds.has(v) && !/^[a-z_]+:/.test(v)) demo.push(`${b.who}:${p}=${v}`)
      })
    }
    check('במסלול החי אין נתוני הדגמה: אין מזהי c-v2 / c-d1 …, אין "נתוני הדגמה" / "מיפוי לדוגמה", וכל מזהה תלמיד / כיתה שייך לפיקסצ\'ר', demo.length === 0, demo.slice(0, 4).join(' · '))
  }
  {
    const withNote = entry.homeroom.json.data.coverageNote as string
    check('coverageNote במילים פשוטות ובלי ז\'רגון (אין "אינדקס" / "וקטור" / "מובהק")', !/אינדקס|וקטור|מובהק|קורלציה/.test(withNote), withNote)
  }

  /* ───────── שיוך מקצוע מבטל את המטמון (UX#4) — אחרון: משנה את מצב הפיקסצ'ר ───────── */
  console.log('\n— שיוך מקצוע לשיעור (PATCH /api/quests/:id) מבטל את מטמון האנליטיקה —')
  {
    const total = fx.expected.unclassifiedSessions
    const idx = fx.expected.unclassifiedQuestPlays.findIndex((n) => n > 0)
    const qid = fx.ids.unclassifiedQuestIds[idx]
    const plays = fx.expected.unclassifiedQuestPlays[idx]
    const warm = await P('homeroom', ov(C.rich.id)) /* הניתוח של הכיתה במטמון (TTL 5 דקות) */
    const warmEntry = await P('homeroom', '/analytics-v2/entry')
    check('לפני השיוך: הערת הכיסוי אומרת שכל המשחקים בשיעורים בלי מקצוע', warm.json.data.coverageNote === narrateScopedCoverageNote({ unclassified: total, withoutLevel: 0 }) && warmEntry.json.data.unclassifiedCount === total)
    const r = await fetch(`${API}/quests/${qid}`, { method: 'PATCH', headers: { Authorization: 'Bearer ' + tok('homeroom'), 'Content-Type': 'application/json' }, body: JSON.stringify({ subjectCode: 'math' }) })
    check('המורה (יוצרת השיעור) משייכת מקצוע לשיעור אחד: 200', r.status === 200, `status=${r.status}`)
    /* מיד אחרי השיוך, בלי להמתין ל-TTL: הניתוח נבנה מחדש — השיעור כבר אינו "בלי מקצוע", אך משחקים שכבר שוחקו לא נכנסים (הרמה שלהם חושבה בלי מקצוע) */
    const after = await P('homeroom', ov(C.rich.id))
    const afterEntry = await P('homeroom', '/analytics-v2/entry')
    check(`מיד אחרי השיוך (בלי המתנה): ${plays} המשחקים עברו מ"בשיעורים בלי מקצוע" ל"בלי רמה לפי מקצוע", ושאר המשחקים נשארו — המטמון בוטל, לא הוגש הערך הישן`,
      after.json.data.coverageNote === narrateScopedCoverageNote({ unclassified: total - plays, withoutLevel: plays }) && afterEntry.json.data.unclassifiedCount === total - plays,
      `note=${String(after.json.data.coverageNote).slice(0, 120)} entry=${afterEntry.json.data.unclassifiedCount}`)
    check('הרמות וההתרעות לא זזו בגלל השיוך (משחקים שכבר שוחקו אינם מצטרפים לסדרות)', JSON.stringify(after.json.data.rows.map((x: any) => [x.subject.code, x.level])) === JSON.stringify(warm.json.data.rows.map((x: any) => [x.subject.code, x.level])) && afterEntry.json.data.alertsTotal === warmEntry.json.data.alertsTotal)
  }
}

main().catch(async (e) => {
  console.error('FATAL', e instanceof Error ? e.message : e)
  try { await cleanupAnalyticsFixture(); console.error(`(נוקה לפי הקידומת ${FX_PREFIX})`) } catch { /* ignore */ }
  process.exitCode = 1
})
