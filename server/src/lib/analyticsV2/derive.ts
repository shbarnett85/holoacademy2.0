/* ──────────────────────────────────────────────────────────────────────────
   derive — חישובי תצוגה טהורים מעל הניתוח (מגמה, מיקום מול הטווח המיועד, תחומים, ציר זמן).
   · מספרים וקטגוריות בלבד — **אין כאן טקסט בעברית** (כל ניסוח מגיע מ-findingsNarrative).
   · ספק ההדגמה והספק האמיתי העתידי משתמשים באותן פונקציות, כך שהמסכים מתנהגים זהה.
   ────────────────────────────────────────────────────────────────────────── */
import {
  AREA_MIN_DELTA, CLASS_AREA_MIN_STUDENTS, CONTENT_VECTOR_KINDS, GROUP_TREND_MIN_STUDENTS, TREND_LABEL_MIN_DELTA, TREND_LABEL_MIN_SESSIONS,
  type Position, type Trend,
} from '../../../../src/shared/lib/analyticsConfig.js'
import type { SubjectCode } from '../../../../src/shared/lib/subjects.js'
import type { Finding } from '../../../../src/shared/types/analyticsV2.js'
import type { Analysis, AgeNorm, SubjectAnalysis } from './engine.js'
import { mean } from './stats.js'

export type ReportedFinding = Extract<Finding, { status: 'reported' }>
export const isReported = (f: Finding): f is ReportedFinding => f.status === 'reported'
export const isAttention = (f: Finding): f is ReportedFinding => f.status === 'reported' && f.tone === 'attention'

const round1 = (v: number): number => Math.round(v * 10) / 10

/* ── השוואת רמות: נקודת ההשוואה היחידה לכל סף בין רמות ──
   רמות הן מספרים עם ספרה אחת אחרי הנקודה, והפרש של רמה שלמה יוצא בנקודה צפה קצת פחות מ-1
   (4.1 − 3.1 = 0.9999999999999996), ולכן "לפחות רמה אחת" נכשל על 8 זוגות בין 1 ל-20 ועל 4 זוגות ב"חצי רמה".
   כל סף (מגמה, תחום חזק/מאתגר, מיקום מול הטווח, צמיחה בתדריך ובמשוב) עובר דרך compareLevels —
   סבילות של 1e-9, לא עיגול לשתי ספרות (עיגול כזה היה מסווג 0.496 כחצי רמה). */
export const LEVEL_EPSILON = 1e-9
export function compareLevels(a: number, b: number): -1 | 0 | 1 {
  const d = a - b
  return d > LEVEL_EPSILON ? 1 : d < -LEVEL_EPSILON ? -1 : 0
}
export const levelAtLeast = (value: number, threshold: number): boolean => compareLevels(value, threshold) >= 0
export const levelAtMost = (value: number, threshold: number): boolean => compareLevels(value, threshold) <= 0

/* ── מגמה ── */
export function trendOfDelta(delta: number | null): Trend {
  if (delta === null || !Number.isFinite(delta)) return 'insufficient'
  return levelAtLeast(delta, TREND_LABEL_MIN_DELTA) ? 'improving' : levelAtMost(delta, -TREND_LABEL_MIN_DELTA) ? 'declining' : 'steady'
}
/* ספירות החלונות אופציונליות בקלט (בדיקות טהורות); כשהן ידועות — כל חלון חייב לעמוד בסף: שני משחקים בחלון אחד אינם מגמה */
type TrendInput = Pick<SubjectAnalysis, 'level60' | 'level90to150'> & Partial<Pick<SubjectAnalysis, 'level60N' | 'level90to150N'>>
const enoughSessions = (n: number | undefined): boolean => n === undefined || n >= TREND_LABEL_MIN_SESSIONS
export const trendDelta = (sa: TrendInput): number | null =>
  sa.level60 !== null && sa.level90to150 !== null && enoughSessions(sa.level60N) && enoughSessions(sa.level90to150N) ? sa.level60 - sa.level90to150 : null
export const studentTrend = (sa: TrendInput): Trend => trendOfDelta(trendDelta(sa))
/* מגמת קבוצה = ממוצע ההפרשים של מי שיש לו מגמה; פחות מ-GROUP_TREND_MIN_STUDENTS → אין עדיין מספיק נתונים */
export function groupTrend(sas: TrendInput[]): Trend {
  const diffs = sas.map(trendDelta).filter((d): d is number => d !== null)
  return diffs.length < GROUP_TREND_MIN_STUDENTS ? 'insufficient' : trendOfDelta(mean(diffs))
}

/* ── מיקום מול הטווח המיועד לשכבה ── */
export function positionOf(level: number | null, norm: AgeNorm): Position | null {
  if (level === null) return null
  return compareLevels(level, norm.high) > 0 ? 'above' : compareLevels(level, norm.low) < 0 ? 'below' : 'within'
}

/* ── תחומים (סוגי תוכן) חזקים / מאתגרים ── */
export interface AreaKeys { strong: string[]; challenging: string[] }
type VecInput = { key: string; level: number | null; status: 'reported' | 'insufficient' }
const orderOfKey = (k: string): number => CONTENT_VECTOR_KINDS.findIndex((v) => v.key === k)

/* תחום חזק / מאתגר לפי הפער (תחום פחות רמת הייחוס) — מול AREA_MIN_DELTA, בהשוואת הרמות הבטוחה */
export function areaDirection(diff: number): 'strong' | 'challenging' | null {
  return levelAtLeast(diff, AREA_MIN_DELTA) ? 'strong' : levelAtMost(diff, -AREA_MIN_DELTA) ? 'challenging' : null
}
function splitAreas(entries: { key: string; diff: number }[]): AreaKeys {
  const byGap = (x: { diff: number }, y: { diff: number }): number => compareLevels(Math.abs(y.diff), Math.abs(x.diff))
  const strong = entries.filter((e) => areaDirection(e.diff) === 'strong').sort((x, y) => byGap(x, y) || orderOfKey(x.key) - orderOfKey(y.key))
  const challenging = entries.filter((e) => areaDirection(e.diff) === 'challenging').sort((x, y) => byGap(x, y) || orderOfKey(x.key) - orderOfKey(y.key))
  return { strong: strong.map((e) => e.key), challenging: challenging.map((e) => e.key) }
}
/* מפתחות הווקטורים (התוויות מתורגמות ב-provider דרך contentVectorLabel) */
export function studentAreaKeys(vectors: VecInput[], currentLevel: number | null): AreaKeys {
  if (currentLevel === null) return { strong: [], challenging: [] }
  return splitAreas(vectors.filter((v) => v.status === 'reported' && v.level !== null).map((v) => ({ key: v.key, diff: (v.level as number) - currentLevel })))
}
/* ברמת כיתה: התחום מדווח רק אם לפחות CLASS_AREA_MIN_STUDENTS תלמידים מדווחים אצלם */
export function classAreaKeys(sas: Pick<SubjectAnalysis, 'contentVectors'>[], classLevel: number | null): AreaKeys {
  if (classLevel === null) return { strong: [], challenging: [] }
  const byKey = new Map<string, number[]>()
  for (const sa of sas) for (const v of sa.contentVectors) if (v.status === 'reported' && v.level !== null) byKey.set(v.key, [...(byKey.get(v.key) ?? []), v.level])
  const entries: { key: string; diff: number }[] = []
  for (const [key, levels] of byKey) if (levels.length >= CLASS_AREA_MIN_STUDENTS) entries.push({ key, diff: mean(levels) - classLevel })
  return splitAreas(entries)
}

/* ── טעויות נפוצות של תלמיד/ה (לפי כלל התפיסה: מספיק חשיפות + פגיעות). הקטלוג והשכבה מגיעים מהניתוח (a.catalog), לא מקבועים ── */
export interface StudentCommonError { id: string; title: string; hits: number; exposures: number }
export function commonErrorsOf(a: Analysis, studentId: string, subject: SubjectCode): StudentCommonError[] {
  const st = a.studentById.get(studentId)
  if (!st) return []
  const out: StudentCommonError[] = []
  for (const m of a.catalog.misconceptions) {
    if (m.subject !== subject || !a.catalog.misconceptionAppliesTo(m, st.grade)) continue
    const mine = a.misByClass.get(`${st.classId}|${m.id}`)?.students.find((s) => s.id === studentId)
    if (mine) out.push({ id: m.id, title: m.titleHe, hits: mine.hits, exposures: mine.exposures })
  }
  return out.sort((x, y) => y.hits - x.hits || y.hits / y.exposures - x.hits / x.exposures || x.id.localeCompare(y.id))
}

/* ── ממצאים על ציר הזמן / התרעות ── */
/* התאריך שבו האירוע "קרה" (לא תאריך הזיהוי) */
export function eventDate(f: ReportedFinding): string {
  const e = f.evidence
  switch (e.kind) {
    case 'level_trend': return e.changeDate
    case 'class_concept_improvement': return e.sinceDate
    case 'cross_subject_dip': return e.startDate
    default: return f.window.end
  }
}
/* חשיבות להתרעה: 0 = ירידה בכמה מקצועות, 1 = ירידה במקצוע, 2 = שאר דפוסי תשומת הלב; בתוך הדרגה — גודל השינוי */
export function alertRank(f: ReportedFinding): [number, number] {
  const e = f.evidence
  const rank = e.kind === 'cross_subject_dip' ? 0 : e.kind === 'level_trend' && e.direction === 'down' ? 1 : 2
  return [rank, -Math.abs(f.effectSize)]
}
export const compareAlert = (x: ReportedFinding, y: ReportedFinding): number => {
  const [rx, mx] = alertRank(x)
  const [ry, my] = alertRank(y)
  return rx - ry || mx - my || x.id.localeCompare(y.id)
}

/* ── מיון שמות: א-ב (איסוף עברי), ובשוויון מלא — לפי המזהה, כך שהסדר קבוע בין קריאות ── */
const HEBREW_COLLATOR = new Intl.Collator('he')
export function compareHebrewNames(x: { displayName: string; id: string }, y: { displayName: string; id: string }): number {
  return HEBREW_COLLATOR.compare(x.displayName, y.displayName) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)
}

/* ממוצע רמה חודשי של הכיתה: לכל תלמיד/ה — ממוצע חודשי שלו/ה; לכל חודש — ממוצע על התלמידים (n = כמה תרמו) */
export function classMonthlySeries(sas: Pick<SubjectAnalysis, 'levelSeries'>[], minStudents = 1): { date: string; level: number; n: number }[] {
  const byMonth = new Map<string, { date: string; levels: number[] }>()
  for (const sa of sas) for (const p of sa.levelSeries) {
    const key = p.date.slice(0, 7)
    const slot = byMonth.get(key) ?? { date: p.date, levels: [] }
    slot.levels.push(p.level)
    byMonth.set(key, slot)
  }
  return [...byMonth.entries()].sort(([x], [y]) => x.localeCompare(y))
    .filter(([, s]) => s.levels.length >= minStudents)
    .map(([, s]) => ({ date: s.date, level: round1(mean(s.levels)), n: s.levels.length }))
}
