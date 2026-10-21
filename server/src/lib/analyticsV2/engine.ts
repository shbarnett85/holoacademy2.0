/* ──────────────────────────────────────────────────────────────────────────
   engine — זיהוי דפוסים וחישוב וקטורים מנתוני גלם (World). שלב D: "מנוע v0" שמזין את ספק ההדגמה.
   · כל ממצא עובר את אותה שרשרת: N מינימלי → p (או בדיקה מתאימה) → תיקון BH בתוך משפחת הסוג →
     גודל אפקט מינימלי. מי שלא עומד בכולם הופך ל"אין עדיין מספיק נתונים" (ולא נשלח כאירוע).
   · הטקסט נבנה רק ב-findingsNarrative.ts; כאן נשארים מספרים.
   · בשלב 5 הקלט (World) יוחלף בנתוני demoSim שנכתבו ל-DB, והפלט יגיע מהמנוע האמיתי — אותה צורת פלט.
   · הקטלוג (מושגים / תפיסות / יעדים) מוזרק: analyze(world, catalog). שכבות נלקחות מה-World, לא מקבועים.
   · עמיד לנתונים דלילים: אין שלוש חריגות על נתונים חסרים, p לא-סופי לא נכנס ל-BH, והבסיסים (קריאה / זיכרון) נגזרים
     רק כשיש מספיק תורמים (MIN_CELL_SIZE).
   ────────────────────────────────────────────────────────────────────────── */
import {
  BEHAVIOR_VECTOR_KINDS, CLASS_IMPROVEMENT_MIN_MEAN_DELTA, CLASS_IMPROVEMENT_WINDOW_DAYS, CONTENT_VECTOR_KINDS, CURRENT_LEVEL_SESSIONS, FDR_ALPHA, AGE_NORM, KIND_THRESHOLDS,
  LEVEL_TREND_BASIS, LIVE_TREND_RULE, MEMORY_ATTENTIVE_RATE, MIN_CELL_SIZE, MISCONCEPTION_RULE, TREND_WINDOWS, VECTOR_MIN_N, type FindingKind,
} from '../../../../src/shared/lib/analyticsConfig.js'
import { narrateFinding, narrateInsufficient } from '../../../../src/shared/lib/findingsNarrative.js'
import { subjectName, type SubjectCode } from '../../../../src/shared/lib/subjects.js'
import type { Evidence, Finding, InsufficientReason } from '../../../../src/shared/types/analyticsV2.js'
import { DEMO_CATALOG, type CatalogSnapshot, type MisconceptionDef } from './catalog.js'
import { levelAtLeast, positionOf } from './derive.js'
import type { McItem, SessionRec, StudentSubjectData, World, WorldClass, WorldStudent } from './demoWorld.js'
import { skey } from './demoWorld.js'
import { israelMonthKey } from './schoolCalendar.js'
import {
  benjaminiHochberg, binomialLowerTail, mean, median, pairedT, poissonBinomialUpper, posteriorBinomial, sd, tUpperTail, welch,
} from './stats.js'

type ContentVec = { key: string; level: number | null; deltaLevels: number | null; n: number; status: 'reported' | 'insufficient' }
type BehaviorVec = { key: string; value: number | null; classMedian: number | null; n: number; status: 'reported' | 'insufficient' }
export interface AgeNorm { gradeLabel: string; center: number; low: number; high: number }

export interface SubjectAnalysis {
  studentId: string
  subject: SubjectCode
  sessionsCount: number
  currentLevel: number | null
  levelSeries: { date: string; level: number; n: number }[]
  ageNorm: AgeNorm
  positionVsNorm: 'above' | 'within' | 'below' | null
  contentVectors: ContentVec[]
  behaviorVectors: BehaviorVec[]
  findings: Finding[]
  /* מדדים גולמיים שמשמשים תדריכים/כיתה */
  level60: number | null /* ממוצע רמה ב-60 ימי הלימוד האחרונים */
  level90to150: number | null
  /* כמה משחקים עומדים מאחורי כל אחד משני הממוצעים (סף תווית המגמה: TREND_LABEL_MIN_SESSIONS) */
  level60N: number
  level90to150N: number
  /* עולם חי בלבד: מגמה אישית לפי אותה בדיקה של הממצא (ההצלחה ביחס לכיתה, ראו LIVE_TREND_RULE) — ולא לפי הפרש ממוצעי הרמה, שהוא ברובו רעש.
     tested = היו מספיק הדמיות עם ציון יחסי בכל אחד משני החלונות; delta = שינוי הרמה (חתום) רק כשהממצא מדווח, אחרת null.
     חסר (הדגמה) = התוויות נגזרות מ-level60 / level90to150 כמו תמיד (ראו derive.trendDelta / studentTrend / groupTrend). */
  liveTrend?: { tested: boolean; delta: number | null }
}

/* משחק בעולם חי: SessionRec + מזהה ההדמיה. נדרש לציון ההצלחה היחסי (כל תלמידי הכיתה שסיימו את אותה הדמיה) */
export type LiveSessionRec = SessionRec & { questId?: string }

export interface MisStat {
  misconceptionId: string
  scopeId: string /* classId או `grade:<n>` */
  studentsExposed: number
  studentsShowing: number
  sharePct: number | null
  students: { id: string; hits: number; exposures: number }[] /* רק מציגי התפיסה */
}

/* בסיסים חיצוניים (חציוני בית ספר / פלטפורמה) שדורסים את החישוב מנתוני העולם עצמו. חסר = נגזר מהעולם, ורק כשיש ≥ MIN_CELL_SIZE תורמים */
export interface Baselines {
  /* חציון מילי-שניות-למילה לפי `${grade}|${subject}` */
  readingMsPerWord?: ReadonlyMap<string, number>
  /* שיעור איתור זוג מוכר בקשב (נחתך ל-MEMORY_ATTENTIVE_RATE.min..max) */
  memoryAttentiveRate?: number
}
/* כיסוי הנתונים של העולם (נקבע ע"י הטוען החי; analyze לא ממלא) */
export interface AnalysisCoverage { unclassifiedSessions: number; detailAvailableFrom: string | null }

export interface Analysis {
  world: World
  /* הקטלוג שלפיו חושבו ווקטורי התוכן והתפיסות — derive קורא אותו מכאן */
  catalog: CatalogSnapshot
  coverage?: AnalysisCoverage
  ss: Map<string, SubjectAnalysis>
  /* התרעות מוקדמות חוצות-מקצועות (פר תלמיד) */
  crossSubject: Map<string, Finding[]>
  /* ממצאים כיתתיים: classId → ממצאים */
  classFindings: Map<string, { subject: SubjectCode; finding: Finding }[]>
  misByClass: Map<string, MisStat>
  misByGrade: Map<string, MisStat>
  /* עזרים */
  ageNormOf: (grade: number) => AgeNorm
  studentById: Map<string, WorldStudent>
  classById: Map<string, WorldClass>
  reportedKeys: Set<string>
}

const gradeLabelOf = (w: World, grade: number): string => w.classes.find((c) => c.grade === grade)?.gradeLabel ?? ''
/* חודש לפי היום הישראלי (עקבי עם israelDayKey); date הוא יום לימוד (12:00 UTC), ולכן זהה לחיתוך המחרוזת */
const monthKey = (iso: string): string => israelMonthKey(iso)
const monthStartIso = (key: string): string => `${key}-01T12:00:00.000Z`
const dayIso = (w: World, i: number): string => w.days[Math.min(i, w.days.length - 1)]

/* ── מועמד גנרי לממצא ── */
interface Candidate {
  kind: FindingKind
  scope: Finding['scope']
  entityId: string
  subject: SubjectCode | null
  n: number
  p: number | null /* גולמי (null כשלא נבדק) */
  effect: number
  /* effect > 0 = הכיוון המעניין לסוג (למשל ירידה / הטיה / אקראיות); level_trend: |d| */
  window: { start: string; end: string }
  build: (ctx: { pAdjusted: number }) => Evidence
  ctx: { studentName?: string | null; subjectName?: string | null; className?: string | null }
  tone: 'positive' | 'attention' | 'neutral'
  /* האם הגודל מעשי (למשל שיפור כיתתי ≥ רמה אחת) — false: לא מדווח גם אם מובהק */
  practical?: boolean
  /* סף אפקט ייעודי למועמד שהאפקט שלו ביחידה אחרת מזו של הסוג (למשל רמות במקום d של Cohen); חסר = KIND_THRESHOLDS */
  minEffect?: number
  toneOf?: (ev: Evidence) => 'positive' | 'attention' | 'neutral'
}

function classify(cands: Candidate[]): { cand: Candidate; finding: Finding }[] {
  const out: { cand: Candidate; finding: Finding }[] = []
  const byKind = new Map<FindingKind, Candidate[]>()
  for (const c of cands) byKind.set(c.kind, [...(byKind.get(c.kind) ?? []), c])
  for (const [kind, list] of byKind) {
    const th = KIND_THRESHOLDS[kind]
    /* משפחת הבדיקות = מועמדים שנבדקו (N מספיק) עם p סופי. p לא-סופי (NaN) לא נכנס: הוא היה מזהם את BH של כל המשפחה */
    const tested = list.filter((c) => c.n >= th.minN && c.p !== null && Number.isFinite(c.p))
    const adj = benjaminiHochberg(tested.map((c) => c.p as number))
    const adjOf = new Map(tested.map((c, i) => [c, adj[i]]))
    for (const c of list) {
      const id = `${kind}:${c.entityId}:${c.subject ?? 'all'}`
      const base = { id, kind, scope: c.scope, entityId: c.entityId, subjectCode: c.subject, n: c.n, minN: th.minN, window: c.window }
      const mkInsufficient = (reason: InsufficientReason, pAdj: number | null): Finding => ({
        ...base, status: 'insufficient', reason, pAdjusted: pAdj, effectSize: null, evidence: null, tone: 'neutral',
        text: narrateInsufficient(kind, reason, c.n, th.minN, c.ctx),
      })
      const minEffect = c.minEffect ?? th.minEffect
      if (c.n < th.minN) {
        if (c.n >= Math.ceil(th.minN / 3) && c.effect >= 1.5 * minEffect) out.push({ cand: c, finding: mkInsufficient('n_below_min', null) })
        continue
      }
      const pAdj = adjOf.get(c)
      if (pAdj === undefined || c.p === null) continue
      if (pAdj < FDR_ALPHA) {
        if (Math.abs(c.effect) >= minEffect && c.practical !== false) {
          const ev = c.build({ pAdjusted: pAdj })
          out.push({
            cand: c,
            finding: { ...base, status: 'reported', pAdjusted: pAdj, effectSize: c.effect, evidence: ev, tone: c.toneOf ? c.toneOf(ev) : c.tone, text: narrateFinding(ev, c.ctx) },
          })
        }
      } else if (c.p < 0.01 && Math.abs(c.effect) >= minEffect) {
        out.push({ cand: c, finding: mkInsufficient('not_significant', pAdj) })
      }
    }
  }
  return out
}

/* ── עזרי סשנים ── */
const inWindow = (s: { day: number }, from: number, to: number): boolean => s.day >= from && s.day < to

/* נקודת שינוי תיאורית בתוך 120 הימים האחרונים: הפיצול שממקסם |t| (min 4 בכל צד). */
function changePoint<T extends { day: number }>(sessions: T[], maxDay: number, valueOf: (s: T) => number): { splitDay: number; before: T[]; after: T[] } | null {
  const pool = sessions.filter((s) => s.day < maxDay).sort((a, b) => b.day - a.day) /* מהישן לחדש */
  const scored: { t: number; idx: number }[] = []
  for (let i = 4; i <= pool.length - 4; i++) {
    const r = welch(pool.slice(i).map(valueOf), pool.slice(0, i).map(valueOf))
    if (Number.isFinite(r.t)) scored.push({ t: r.t, idx: i })
  }
  if (!scored.length) return null
  /* מועד ההתחלה המוקדם ביותר שעדיין קרוב לפיצול הטוב ביותר (85% מ-|t| המרבי) — הפיצול המדויק רועש */
  const maxT = Math.max(...scored.map((x) => Math.abs(x.t)))
  const best = scored.find((x) => Math.abs(x.t) >= 0.85 * maxT)!
  return { splitDay: pool[best.idx].day, before: pool.slice(0, best.idx), after: pool.slice(best.idx) }
}

/* תלמיד×מקצוע בלי רשומת נתונים (למשל מקצוע מהרשאות הכיתה, בלי סשנים) = רשומה ריקה, לא חריגה */
const EMPTY_DATA: StudentSubjectData = Object.freeze({ sessions: [], mc: [], memory: [] }) as unknown as StudentSubjectData

/* ── עולם חי: הצלחה ביחס לשאר הכיתה באותה הדמיה ──────────────────────────────────────────────────────────────
   הרמה (כיול 60/80) תלויה בקודמתה ומגיבה גם לקושי ההדמיה שהמורה בחר, ולכן אי אפשר לזהות בה "שינוי של תלמיד/ה" בלי ממצאי שווא
   (נמדד: 4% עד 35% מהתלמידים מסומנים כשלא השתנה דבר). ציון יחסי = הצלחת התלמיד/ה פחות ממוצע ההצלחה של שאר התלמידים באותה הדמיה:
   קושי ההדמיה ושינוי קושי כיתתי (המורה העביר הדמיות קלות או קשות יותר) נעלמים מהחישוב.
   · רק ההשלמה הראשונה לכל (תלמיד/ה, הדמיה) — גם אם הקורא (assemble) כבר סינן; הגנה לעולמות שנבנו בדרך אחרת.
   · הדמיה שפחות מ-minPeers תלמידים אחרים סיימו אותה: אין לה ציון יחסי, והמשחק לא נספר במגמה.
   · מי שאין לו מזהה הדמיה (questId) לא נבדק. */
interface RelPoint { day: number; date: string; rel: number; success: number; level: number }
function peerRelativePoints(w: World, subject: SubjectCode, dataOf: (studentId: string, subject: SubjectCode) => StudentSubjectData): Map<string, RelPoint[]> {
  const firstByStudent = new Map<string, Map<string, SessionRec>>()
  const agg = new Map<string, { sum: number; n: number }>()
  for (const st of w.students) {
    if (!st.subjects.includes(subject)) continue
    const first = new Map<string, SessionRec>()
    for (const s of dataOf(st.id, subject).sessions) {
      const q = (s as LiveSessionRec).questId
      if (!q) continue
      const cur = first.get(q)
      if (!cur || s.day > cur.day) first.set(q, s) /* אינדקס יום גדול יותר = מוקדם יותר = ההשלמה הראשונה */
    }
    firstByStudent.set(st.id, first)
    for (const [q, s] of first) { const a = agg.get(q) ?? { sum: 0, n: 0 }; a.sum += s.success; a.n++; agg.set(q, a) }
  }
  const out = new Map<string, RelPoint[]>()
  for (const [studentId, first] of firstByStudent) {
    const pts: RelPoint[] = []
    for (const [q, s] of first) {
      const a = agg.get(q)!
      const peers = a.n - 1
      if (peers < LIVE_TREND_RULE.minPeers) continue
      pts.push({ day: s.day, date: s.date, rel: s.success - (a.sum - s.success) / peers, success: s.success, level: s.level })
    }
    out.set(studentId, pts.sort((x, y) => x.day - y.day || x.rel - y.rel))
  }
  return out
}

/* ההקשר הכיתתי של מגמה אישית בעולם חי: הנקודות היחסיות של כל התלמידים במקצוע, ופיזור השינוי היחסי ביניהם.
   פיזור = חציון ו-MAD של השינוי היחסי (חלון אחרון פחות קודם) בין התלמידים שנבדקו; ללא לפחות MIN_CELL_SIZE כאלה אין פיזור אמין ← spread=null,
   ולא מדווחים (ולא מסמנים "יציב"): בכיתה שבה כמעט אין מי שנבדק אי אפשר להבדיל שינוי של תלמיד/ה משונות רגילה בין תלמידים. */
interface LiveTrendContext { byStudent: Map<string, RelPoint[]>; spread: { center: number; scale: number } | null }
function liveTrendContext(w: World, subject: SubjectCode, dataOf: (studentId: string, subject: SubjectCode) => StudentSubjectData): LiveTrendContext {
  const { recentDays: R, priorDays: P } = TREND_WINDOWS
  const minN = KIND_THRESHOLDS.level_trend.minN
  const byStudent = peerRelativePoints(w, subject, dataOf)
  const deltas: number[] = []
  for (const pts of byStudent.values()) {
    const recent = pts.filter((p) => inWindow(p, 0, R)), prior = pts.filter((p) => inWindow(p, R, R + P))
    if (recent.length >= minN && prior.length >= minN) deltas.push(mean(recent.map((p) => p.rel)) - mean(prior.map((p) => p.rel)))
  }
  if (deltas.length < MIN_CELL_SIZE) return { byStudent, spread: null }
  const center = median(deltas)
  const mad = median(deltas.map((x) => Math.abs(x - center)))
  return { byStudent, spread: { center, scale: Math.max(LIVE_TREND_RULE.outlierMinScale, 1.4826 * mad) } }
}

export function analyze(w: World, catalog: CatalogSnapshot = DEMO_CATALOG, baselines?: Baselines): Analysis {
  const studentById = new Map(w.students.map((s) => [s.id, s]))
  const classById = new Map(w.classes.map((c) => [c.id, c]))
  const ageNormOf = (grade: number): AgeNorm => {
    const center = grade + 4
    return { gradeLabel: gradeLabelOf(w, grade), center, low: center - AGE_NORM.bandHalfWidth, high: center + AGE_NORM.bandHalfWidth }
  }
  const { recentDays: R, priorDays: P } = TREND_WINDOWS
  const cands: Candidate[] = []
  const dataOf = (studentId: string, subject: SubjectCode): StudentSubjectData => w.data.get(skey(studentId, subject)) ?? EMPTY_DATA
  /* שכבות העולם (ולא [4,6] קשיח), בסדר עולה */
  const grades = [...new Set([...w.classes.map((c) => c.grade), ...w.students.map((s) => s.grade)])].sort((a, b) => a - b)
  /* עולם חי: מגמה אישית נבדקת על ההצלחה ביחס לכיתה באותה הדמיה (ראו peerRelativePoints / LIVE_TREND_RULE); בהדגמה על ההצלחה הגולמית, כמו תמיד */
  const levelBasis = w.live === true
  const liveCtx = new Map<SubjectCode, LiveTrendContext>()
  const liveTested = new Set<string>() /* תלמיד×מקצוע שיש בו מספיק הדמיות עם ציון יחסי בכל אחד משני החלונות */

  /* ── בסיסי כיתה/שכבה לקריאה וזיכרון ── */
  const msPerWordMedianOf = new Map<string, number>() /* `${grade}|${subject}` → חציון של חציוני התלמידים */
  const perStudentMsw = new Map<string, number>()
  for (const st of w.students) for (const sub of st.subjects) {
    const d = dataOf(st.id, sub)
    const vals = d.sessions.filter((s) => s.words > 0).map((s) => s.closedMs / s.words)
    if (vals.length >= 6) perStudentMsw.set(skey(st.id, sub), median(vals))
  }
  /* בסיס קריאה לשכבה×מקצוע: רק כשיש ≥ MIN_CELL_SIZE תלמידים תורמים; חיצוני (baselines) גובר. בלי בסיס אין מועמד "דילוג קריאה". */
  for (const grade of grades) for (const sub of new Set(w.students.filter((s) => s.grade === grade).flatMap((s) => s.subjects))) {
    const key = `${grade}|${sub}`
    const injected = baselines?.readingMsPerWord?.get(key)
    if (injected !== undefined && Number.isFinite(injected) && injected > 0) { msPerWordMedianOf.set(key, injected); continue }
    const vals = w.students.filter((s) => s.grade === grade && s.subjects.includes(sub)).map((s) => perStudentMsw.get(skey(s.id, sub))).filter((v): v is number => v !== undefined)
    if (vals.length >= MIN_CELL_SIZE) msPerWordMedianOf.set(key, median(vals))
  }
  /* בסיס הקשב במשחק הזיכרון: חציון התלמידים (≥ MIN_CELL_SIZE תלמידים שונים), אחרת קבוע; תמיד בתוך [min, max] */
  const memRates: number[] = []
  const memContributors = new Set<string>()
  for (const st of w.students) for (const sub of st.subjects) {
    const turns = dataOf(st.id, sub).memory.flatMap((g) => g.turns).filter((t) => t.avail)
    if (turns.length >= 15) { memRates.push(turns.filter((t) => t.hit).length / turns.length); memContributors.add(st.id) }
  }
  const clampRate = (v: number): number => Math.min(MEMORY_ATTENTIVE_RATE.max, Math.max(MEMORY_ATTENTIVE_RATE.min, v))
  const injectedRate = baselines?.memoryAttentiveRate
  const attentiveRate = clampRate(
    injectedRate !== undefined && Number.isFinite(injectedRate) ? injectedRate
      : memContributors.size >= MIN_CELL_SIZE ? median(memRates) : MEMORY_ATTENTIVE_RATE.fallback,
  )

  /* ── מועמדים פר תלמיד×מקצוע ── */
  for (const st of w.students) for (const sub of st.subjects) {
    const d = dataOf(st.id, sub)
    const ctx = { studentName: st.displayName, subjectName: subjectName(sub) }
    const entity = st.id

    if (!levelBasis) {
      /* הדגמה — מגמת רמה: חלון אחרון מול החלון שקדם לו, Welch על ההצלחה (ללא שינוי) */
      const recent = d.sessions.filter((s) => inWindow(s, 0, R))
      const prior = d.sessions.filter((s) => inWindow(s, R, R + P))
      if (recent.length >= 3 && prior.length >= 3) {
        const valueOf = (s: SessionRec): number => s.success
        const r = welch(recent.map(valueOf), prior.map(valueOf))
        const cp = changePoint(d.sessions, R + P, valueOf)
        const direction: 'up' | 'down' = r.d >= 0 ? 'up' : 'down'
        cands.push({
          kind: 'level_trend', scope: 'student', entityId: entity, subject: sub,
          n: Math.min(recent.length, prior.length), p: r.pTwoSided, effect: Math.abs(r.d),
          window: { start: dayIso(w, R + P - 1), end: dayIso(w, 0) },
          ctx, tone: direction === 'up' ? 'positive' : 'attention',
          build: () => {
            const afterGroup = cp && cp.after.length >= 4 ? cp.after : recent
            const beforeGroup = cp && cp.before.length >= 4 ? cp.before : prior
            const changeDate = cp ? w.days[cp.splitDay] : w.days[R]
            const fromLevel = mean(beforeGroup.map((s) => s.level)), toLevel = mean(afterGroup.map((s) => s.level))
            return {
              kind: 'level_trend', direction, fromLevel: round1(fromLevel), toLevel: round1(toLevel), deltaLevels: round1(toLevel - fromLevel),
              changeDate, sessionsBefore: beforeGroup.length, sessionsAfter: afterGroup.length,
              successBefore: round3(mean(beforeGroup.map((s) => s.success))), successAfter: round3(mean(afterGroup.map((s) => s.success))),
            }
          },
        })
      }
    } else {
      /* עולם חי — מגמה אישית: ההצלחה ביחס לשאר הכיתה באותה הדמיה, חלון אחרון מול החלון שקדם לו (ראו peerRelativePoints).
         מדווחים רק אם גם ההצלחה הגולמית וגם הרמה זזו באותו כיוון, וההפרש היחסי לפחות LIVE_TREND_RULE.minRelativeShift. */
      let ctxOfSubject = liveCtx.get(sub)
      if (!ctxOfSubject) { ctxOfSubject = liveTrendContext(w, sub, dataOf); liveCtx.set(sub, ctxOfSubject) }
      const { spread } = ctxOfSubject
      const pts = ctxOfSubject.byStudent.get(st.id) ?? []
      const recentP = pts.filter((p) => inWindow(p, 0, R))
      const priorP = pts.filter((p) => inWindow(p, R, R + P))
      const minN = KIND_THRESHOLDS.level_trend.minN
      if (spread && recentP.length >= minN && priorP.length >= minN) liveTested.add(skey(st.id, sub))
      if (recentP.length >= 3 && priorP.length >= 3) {
        const relOf = (p: RelPoint): number => p.rel
        const r = welch(recentP.map(relOf), priorP.map(relOf))
        const dRel = mean(recentP.map(relOf)) - mean(priorP.map(relOf))
        const dRaw = mean(recentP.map((p) => p.success)) - mean(priorP.map((p) => p.success))
        const dLevel = mean(recentP.map((p) => p.level)) - mean(priorP.map((p) => p.level))
        const sign = dRel >= 0 ? 1 : -1
        const direction: 'up' | 'down' = sign > 0 ? 'up' : 'down'
        const outlier = spread !== null && Math.abs(dRel - spread.center) >= LIVE_TREND_RULE.outlierK * spread.scale
        const confirmed = outlier && levelAtLeast(sign * dRel, LIVE_TREND_RULE.minRelativeShift) && levelAtLeast(sign * dRaw, LIVE_TREND_RULE.minRawShift)
          && levelAtLeast(sign * dLevel, LEVEL_TREND_BASIS.minDeltaLevels)
        const cp = changePoint(pts, R + P, relOf)
        cands.push({
          kind: 'level_trend', scope: 'student', entityId: entity, subject: sub,
          n: Math.min(recentP.length, priorP.length), p: r.pTwoSided, effect: Math.abs(r.d), practical: confirmed,
          window: { start: dayIso(w, R + P - 1), end: dayIso(w, 0) },
          ctx, tone: direction === 'up' ? 'positive' : 'attention',
          build: () => {
            /* המספרים מהחלונות שנבדקו (לא מנקודת שינוי); נקודת השינוי נותנת רק את התאריך, ורק אם היא מצביעה לאותו כיוון */
            const cpAgrees = cp && cp.after.length >= 4 && cp.before.length >= 4 && sign * (mean(cp.after.map(relOf)) - mean(cp.before.map(relOf))) > 0
            const changeDate = cpAgrees && cp ? w.days[cp.splitDay] : w.days[R]
            const fromLevel = mean(priorP.map((p) => p.level)), toLevel = mean(recentP.map((p) => p.level))
            return {
              kind: 'level_trend', direction, fromLevel: round1(fromLevel), toLevel: round1(toLevel), deltaLevels: round1(toLevel - fromLevel),
              changeDate, sessionsBefore: priorP.length, sessionsAfter: recentP.length,
              successBefore: round3(mean(priorP.map((p) => p.success))), successAfter: round3(mean(recentP.map((p) => p.success))),
            }
          },
        })
      }
    }

    /* הטיית מיקום */
    if (d.mc.length >= 5) {
      const first = d.mc.filter((m) => m.selectedPos === 0).length
      const ps = d.mc.map((m) => 1 / m.k)
      const expected = mean(ps)
      cands.push({
        kind: 'position_bias', scope: 'student', entityId: entity, subject: sub,
        n: d.mc.length, p: poissonBinomialUpper(first, ps), effect: first / d.mc.length - expected,
        window: { start: dayIso(w, Math.max(...d.mc.map((m) => m.day))), end: dayIso(w, Math.min(...d.mc.map((m) => m.day))) },
        ctx, tone: 'attention',
        build: () => ({ kind: 'position_bias', items: d.mc.length, firstChoices: first, observedShare: round3(first / d.mc.length), expectedShare: round3(expected) }),
      })
    }

    /* דפוס זיכרון */
    const turns = d.memory.flatMap((g) => g.turns).filter((t) => t.avail)
    if (turns.length >= 8) {
      const hits = turns.filter((t) => t.hit).length
      const rate = hits / turns.length
      const pRand = mean(turns.map((t) => t.pRandom))
      cands.push({
        kind: 'memory_random_pattern', scope: 'student', entityId: entity, subject: sub,
        n: d.memory.length, p: binomialLowerTail(hits, turns.length, attentiveRate), effect: attentiveRate - rate,
        window: { start: dayIso(w, Math.max(...d.memory.map((g) => g.day))), end: dayIso(w, Math.min(...d.memory.map((g) => g.day))) },
        ctx, tone: 'attention',
        build: () => ({
          kind: 'memory_random_pattern', games: d.memory.length, turns: turns.length, observedRate: round3(rate),
          attentiveRate: round3(attentiveRate), randomRate: round3(pRand), randomLikelihood: round3(posteriorBinomial(hits, turns.length, pRand, attentiveRate)),
        }),
      })
    }

    /* דילוג קריאה */
    const msw = perStudentMsw.get(skey(st.id, sub))
    const refMsw = msPerWordMedianOf.get(`${st.grade}|${sub}`)
    if (msw !== undefined && refMsw !== undefined) {
      const xs = d.sessions.filter((s) => s.words > 0).map((s) => Math.log((s.closedMs / s.words) / refMsw))
      const mu = mean(xs), s = sd(xs)
      const t = mu / ((s || 1e-9) / Math.sqrt(xs.length))
      const scenes = d.sessions.reduce((a, x) => a + x.scenes, 0)
      cands.push({
        kind: 'reading_skip', scope: 'student', entityId: entity, subject: sub,
        n: scenes, p: tUpperTail(-t, xs.length - 1), effect: 1 - Math.exp(mu),
        window: { start: dayIso(w, Math.max(...d.sessions.map((x) => x.day))), end: dayIso(w, 0) },
        ctx, tone: 'attention',
        build: () => ({ kind: 'reading_skip', scenes, msPerWord: msw, classMedianMsPerWord: refMsw, ratio: round3(msw / refMsw) }),
      })
    }
  }

  /* ── שיפור כיתתי במושג (רק כשיש מחצית שחלפו בה מספיק ימי לימוד: term=null ← אין מה למדוד) ── */
  const Wd = CLASS_IMPROVEMENT_WINDOW_DAYS
  const term = w.term
  const startWin: [number, number] = term ? [term.idx - Wd, term.idx] : [0, 0]
  const endWin: [number, number] = [0, Wd]
  const conceptKeys = term ? [...new Set(catalog.concepts.map((c) => c.key))] : []
  for (const cls of w.classes) {
    for (const key of conceptKeys) {
      const concept = catalog.conceptByKey(key)!
      const diffs: number[] = []
      for (const sid of cls.studentIds) {
        const d = w.data.get(skey(sid, concept.subject))
        if (!d) continue
        const a = d.sessions.filter((s) => s.day >= startWin[0] && s.day <= startWin[1] && s.concepts[key] !== undefined).map((s) => s.concepts[key])
        const b = d.sessions.filter((s) => s.day >= endWin[0] && s.day <= endWin[1] && s.concepts[key] !== undefined).map((s) => s.concepts[key])
        if (a.length && b.length) diffs.push(mean(b) - mean(a))
      }
      if (diffs.length < 3) continue
      const r = pairedT(diffs)
      cands.push({
        kind: 'class_concept_improvement', scope: 'class', entityId: cls.id, subject: concept.subject,
        n: diffs.length, p: r.pTwoSided, effect: r.dz, practical: levelAtLeast(Math.abs(r.meanDiff), CLASS_IMPROVEMENT_MIN_MEAN_DELTA),
        window: { start: term!.startIso, end: dayIso(w, 0) },
        ctx: { subjectName: subjectName(concept.subject), className: cls.name }, tone: 'positive',
        toneOf: (ev) => (ev.kind === 'class_concept_improvement' && ev.meanDelta < 0 ? 'attention' : 'positive'),
        build: () => ({
          kind: 'class_concept_improvement', conceptKey: key, conceptTitle: concept.titleHe, sinceDate: term!.startIso, term: term!.kind,
          meanDelta: round1(r.meanDiff), studentsCount: diffs.length, improvedCount: diffs.filter((x) => x > 0).length,
        }),
      })
    }
  }

  /* ── סיווג (BH לכל משפחת סוג) ── */
  const classified = classify(cands)
  const ss = new Map<string, SubjectAnalysis>()
  const classFindings = new Map<string, { subject: SubjectCode; finding: Finding }[]>()
  const reportedKeys = new Set<string>()

  /* ניתוח תיאורי פר תלמיד×מקצוע (רמות, וקטורים, נורמה) */
  const baselineBehavior = new Map<string, number[]>() /* `${grade}|${sub}|${key}` → values */
  const pending: { st: WorldStudent; sub: SubjectCode; sa: SubjectAnalysis; raw: Record<string, number | null> }[] = []
  for (const st of w.students) for (const sub of st.subjects) {
    const d = dataOf(st.id, sub)
    const sess = [...d.sessions].sort((a, b) => b.day - a.day) /* מהישן לחדש */
    const series = new Map<string, number[]>()
    for (const s of sess) series.set(monthKey(s.date), [...(series.get(monthKey(s.date)) ?? []), s.level])
    const levelSeries = [...series.entries()].map(([k, v]) => ({ date: monthStartIso(k), level: round1(mean(v)), n: v.length }))
    const lastN = [...sess].slice(-CURRENT_LEVEL_SESSIONS).map((s) => s.level)
    const currentLevel = lastN.length ? round1(mean(lastN)) : null
    const norm = ageNormOf(st.grade)

    const recentC = (vec: string): number[] => d.sessions.filter((s) => s.day < R).flatMap((s) => Object.entries(s.concepts).filter(([k]) => catalog.conceptByKey(k)?.vector === vec).map(([, v]) => v))
    const priorC = (vec: string): number[] => d.sessions.filter((s) => s.day >= R && s.day < R + P).flatMap((s) => Object.entries(s.concepts).filter(([k]) => catalog.conceptByKey(k)?.vector === vec).map(([, v]) => v))
    const contentVectors: ContentVec[] = []
    for (const v of CONTENT_VECTOR_KINDS) {
      const rec = recentC(v.key), pri = priorC(v.key)
      const present = catalog.conceptsOfSubject(sub).some((c) => c.vector === v.key)
      if (!present) continue /* וקטור מוצג רק במקצוע שבו יש לו פריטים */
      contentVectors.push({
        key: v.key, level: rec.length ? round1(mean(rec)) : null,
        deltaLevels: rec.length >= 3 && pri.length >= 3 ? round1(mean(rec) - mean(pri)) : null,
        n: rec.length, status: rec.length >= VECTOR_MIN_N ? 'reported' : 'insufficient',
      })
    }
    const fails = d.sessions.reduce((a, s) => a + s.retries.afterFail + s.retries.giveUps, 0)
    const after = d.sessions.reduce((a, s) => a + s.retries.afterFail, 0)
    const msv = perStudentMsw.get(skey(st.id, sub))
    const refMsw = msPerWordMedianOf.get(`${st.grade}|${sub}`)
    const raw: Record<string, number | null> = {
      persistence: fails >= 10 ? after / fails : null,
      reading_attention: msv !== undefined && refMsw ? Math.min(1, Math.max(0, msv / (2 * refMsw))) : null,
      consistency: d.sessions.length >= 8 ? Math.max(0, 1 - Math.min(1, sd(d.sessions.map((s) => s.success)) / 0.25)) : null,
    }
    for (const [k, v] of Object.entries(raw)) if (v !== null) {
      const key = `${st.grade}|${sub}|${k}`
      baselineBehavior.set(key, [...(baselineBehavior.get(key) ?? []), v])
    }
    const in60 = d.sessions.filter((s) => s.day < R)
    const in90 = d.sessions.filter((s) => s.day >= 90 && s.day < 150)
    const level60 = mean(in60.map((s) => s.level))
    const level90 = mean(in90.map((s) => s.level))
    const sa: SubjectAnalysis = {
      studentId: st.id, subject: sub, sessionsCount: d.sessions.length, currentLevel, levelSeries, ageNorm: norm,
      positionVsNorm: positionOf(currentLevel, norm),
      contentVectors, behaviorVectors: [], findings: [],
      level60: Number.isFinite(level60) ? round1(level60) : null, level90to150: Number.isFinite(level90) ? round1(level90) : null,
      level60N: in60.length, level90to150N: in90.length,
    }
    ss.set(skey(st.id, sub), sa)
    pending.push({ st, sub, sa, raw })
  }
  for (const { st, sub, sa, raw } of pending) {
    sa.behaviorVectors = BEHAVIOR_VECTOR_KINDS.map((b) => {
      const v = raw[b.key]
      const base = baselineBehavior.get(`${st.grade}|${sub}|${b.key}`) ?? []
      const n = dataOf(st.id, sub).sessions.length
      return {
        key: b.key, value: v === null || v === undefined ? null : round3(v), classMedian: base.length ? round3(median(base)) : null,
        n, status: v === null || v === undefined ? 'insufficient' : 'reported',
      } satisfies BehaviorVec
    })
  }

  for (const { cand, finding } of classified) {
    if (finding.status === 'reported') reportedKeys.add(finding.id)
    if (cand.scope === 'student' && cand.subject) {
      ss.get(skey(cand.entityId, cand.subject))!.findings.push(finding)
    } else if (cand.scope === 'class' && cand.subject) {
      classFindings.set(cand.entityId, [...(classFindings.get(cand.entityId) ?? []), { subject: cand.subject, finding }])
    }
  }
  /* עולם חי: תווית המגמה האישית נגזרת מאותה בדיקה של הממצא (ורק כשהממצא מדווח) — לא מהפרש ממוצעי הרמה */
  if (levelBasis) {
    for (const [key, sa] of ss) {
      const reported = sa.findings.find((f) => f.kind === 'level_trend' && f.status === 'reported')
      const delta = reported && reported.status === 'reported' && reported.evidence.kind === 'level_trend' ? reported.evidence.deltaLevels : null
      sa.liveTrend = { tested: liveTested.has(key), delta }
    }
  }

  /* ── התרעה מוקדמת חוצת-מקצועות: ≥2 מקצועות עם ירידה מדווחת ששינוי התחיל בטווח של 45 ימי לימוד ── */
  const crossSubject = new Map<string, Finding[]>()
  for (const st of w.students) {
    const downs = st.subjects
      .map((sub) => ({ sub, f: ss.get(skey(st.id, sub))!.findings.find((f) => f.kind === 'level_trend' && f.status === 'reported') }))
      .filter((x): x is { sub: SubjectCode; f: Extract<Finding, { status: 'reported' }> } => !!x.f && x.f.status === 'reported' && x.f.evidence.kind === 'level_trend' && x.f.evidence.direction === 'down')
    if (downs.length < KIND_THRESHOLDS.cross_subject_dip.minN) continue
    const dates = downs.map((d) => new Date((d.f.evidence as Extract<Evidence, { kind: 'level_trend' }>).changeDate).getTime())
    if ((Math.max(...dates) - Math.min(...dates)) / 86400000 > 45) continue
    const startDate = new Date(Math.min(...dates)).toISOString()
    const subjects = downs.map((d) => ({ code: d.sub, deltaLevels: (d.f.evidence as Extract<Evidence, { kind: 'level_trend' }>).deltaLevels }))
    const ev: Evidence = { kind: 'cross_subject_dip', startDate, subjects }
    const f: Finding = {
      id: `cross_subject_dip:${st.id}`, kind: 'cross_subject_dip', scope: 'student', entityId: st.id, subjectCode: null,
      status: 'reported', tone: 'attention', n: downs.length, minN: KIND_THRESHOLDS.cross_subject_dip.minN,
      pAdjusted: Math.max(...downs.map((d) => d.f.pAdjusted)), effectSize: Math.min(...downs.map((d) => Math.abs(d.f.effectSize))),
      window: { start: downs[0].f.window.start, end: downs[0].f.window.end }, evidence: ev,
      text: narrateFinding(ev, { studentName: st.displayName }),
    }
    crossSubject.set(st.id, [f])
    reportedKeys.add(f.id)
  }

  /* ── תפיסות שגויות: פר כיתה ופר שכבה ── */
  const misByClass = new Map<string, MisStat>()
  const misByGrade = new Map<string, MisStat>()
  const rule = MISCONCEPTION_RULE
  const statFor = (m: MisconceptionDef, studentIds: string[], scopeId: string): MisStat => {
    let exposed = 0
    const showing: MisStat['students'] = []
    for (const sid of studentIds) {
      const items: McItem[] = w.data.get(skey(sid, m.subject))?.mc.filter((i) => i.exposure === m.id) ?? []
      if (items.length < rule.minExposuresPerStudent) continue
      exposed++
      const hits = items.filter((i) => i.tag === m.id).length
      if (hits >= rule.minHitsPerStudent && hits / items.length >= rule.minHitShare) showing.push({ id: sid, hits, exposures: items.length })
    }
    return {
      misconceptionId: m.id, scopeId, studentsExposed: exposed, studentsShowing: showing.length,
      sharePct: exposed >= MIN_CELL_SIZE ? Math.round((100 * showing.length) / exposed) : null, students: showing,
    }
  }
  for (const m of catalog.misconceptions) {
    for (const c of w.classes) {
      if (!catalog.misconceptionAppliesTo(m, c.grade)) continue
      misByClass.set(`${c.id}|${m.id}`, statFor(m, c.studentIds, c.id))
    }
    for (const grade of grades) {
      if (!catalog.misconceptionAppliesTo(m, grade)) continue
      misByGrade.set(`${grade}|${m.id}`, statFor(m, w.students.filter((s) => s.grade === grade).map((s) => s.id), `grade:${grade}`))
    }
  }

  return { world: w, catalog, ss, crossSubject, classFindings, misByClass, misByGrade, ageNormOf, studentById, classById, reportedKeys }
}

const round1 = (v: number): number => Math.round(v * 10) / 10
const round3 = (v: number): number => Math.round(v * 1000) / 1000
