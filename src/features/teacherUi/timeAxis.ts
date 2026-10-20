/* ציר הזמן המשותף לכל הגרפים (עיקרון 11): אותם חודשים, באותם שמות עבריים, בכל גרף.
   pure — ללא DOM וללא Date.now(); התאריכים מגיעים מהקורא. החודשים בחישוב UTC (כמו findingsNarrative).
   הציר מתפרש על חודשים שלמים: מתחילת חודש `from` עד סוף חודש `to`. נקודות ממוקמות לפי תאריך אמיתי, לא לפי אינדקס.
   כיוון: ישן → חדש משמאל לימין (כמו LevelChart הקיים; המסגרת ChartFrame קובעת direction:ltr).
   · sharedAxisRange: הטווח (from/to) של כל הגרפים במסך — לפחות 12 החודשים האחרונים, ומתרחב אחורה רק אם יש נתונים מוקדמים יותר;
     כל הגרפים באותו מסך מקבלים את אותו טווח (לא טווח לפי הסדרה של כל גרף).
   · תוויות: הדילול מעוגן לחודש האחרון — הוא תמיד מסומן; השנה מודפסת בתווית המסומנת הראשונה ובכל תווית מסומנת שהשנה בה שונה
     מזו שלפניה (גם כשינואר עצמו לא מסומן בגלל הדילול). */
import { monthName } from '../../shared/lib/findingsNarrative'

export interface MonthTick {
  /** תחילת החודש (ISO, UTC) */
  iso: string
  /** גבולות החודש בציר ה-x */
  xStart: number
  xEnd: number
  /** מרכז החודש — כאן מוצבת התווית */
  xMid: number
  /** שם החודש בעברית ("פברואר") */
  label: string
  /** מציגים תווית לחודש הזה? (דילול כשצפוף; לעולם לא פחות מ-minLabelGap פיקסלים בין תוויות; החודש האחרון תמיד מסומן) */
  showLabel: boolean
  /** שנה: רק בתווית מסומנת — הראשונה, ובכל תווית מסומנת שהשנה בה שונה מהתווית המסומנת הקודמת. מוצגת כשורה שנייה מתחת לשם החודש */
  year?: number
}

export interface TimeAxis {
  ticks: MonthTick[]
  /** תאריך ISO → מיקום x (חסום לטווח הציר) */
  xOf: (iso: string) => number
  x0: number
  x1: number
}

export interface TimeAxisOptions {
  /** תחילת הטווח (ISO) — מתיישר לתחילת החודש */
  from: string
  /** סוף הטווח (ISO) — הציר כולל את כל החודש הזה */
  to: string
  /** גבולות ה-x בפיקסלים */
  x0: number
  x1: number
  /** רווח מינימלי בין תוויות (px). "ספטמבר" ב-14px ≈ 52px. ברירת מחדל 64 */
  minLabelGap?: number
}

const startOfMonth = (t: number): number => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) }
const addMonths = (t: number, n: number): number => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1) }
const STEPS = [1, 2, 3, 4, 6, 12]

/* כמה חודשים לפחות מכסה ציר משותף */
export const MIN_AXIS_MONTHS = 12

export interface AxisRangeOptions {
  /** "עכשיו" (ISO). כשנתון — הציר מגיע לפחות עד החודש הזה (גרף בלי חודשים אחרונים עדיין מראה אותם ריקים) */
  now?: string
  /** מינימום חודשים בציר (ברירת מחדל 12) */
  minMonths?: number
}

/* הטווח המשותף: to = החודש המאוחר מבין התאריכים האחרונים ו-now; from = המוקדם מבין התאריך הראשון לבין minMonths חודשים אחורה מ-to.
   בלי תאריכים וללא now — מחזיר null (אין מה לצייר). הערכים הם תחילת חודש (ISO, UTC). */
export function sharedAxisRange(dates: readonly string[], { now, minMonths = MIN_AXIS_MONTHS }: AxisRangeOptions = {}): { from: string; to: string } | null {
  const ts = dates.map((d) => Date.parse(d)).filter((t) => Number.isFinite(t))
  if (now !== undefined && Number.isFinite(Date.parse(now))) ts.push(Date.parse(now))
  if (ts.length === 0) return null
  const last = startOfMonth(Math.max(...ts))
  const first = startOfMonth(Math.min(...ts))
  const floor = addMonths(last, -(Math.max(1, minMonths) - 1))
  return { from: new Date(Math.min(first, floor)).toISOString(), to: new Date(last).toISOString() }
}

export function buildTimeAxis({ from, to, x0, x1, minLabelGap = 64 }: TimeAxisOptions): TimeAxis {
  const f = Date.parse(from), t = Date.parse(to)
  const lo = startOfMonth(Math.min(f, t))
  const hi = addMonths(startOfMonth(Math.max(f, t)), 1)
  const span = hi - lo
  const x = (ms: number): number => x0 + ((ms - lo) / span) * (x1 - x0)

  const starts: number[] = []
  for (let m = lo; m < hi; m = addMonths(m, 1)) starts.push(m)
  const n = starts.length
  const perMonth = (x1 - x0) / n
  const step = STEPS.find((s) => s * perMonth >= minLabelGap) ?? 12

  let prevYear: number | null = null
  const ticks: MonthTick[] = starts.map((m, i) => {
    const next = addMonths(m, 1)
    const iso = new Date(m).toISOString()
    /* דילול מעוגן לחודש האחרון: הוא תמיד מסומן, וכל השאר במרווחים קבועים ממנו אחורה */
    const showLabel = (n - 1 - i) % step === 0
    const yr = new Date(m).getUTCFullYear()
    let year: number | undefined
    if (showLabel) {
      if (prevYear === null || yr !== prevYear) year = yr
      prevYear = yr
    }
    return { iso, xStart: x(m), xEnd: x(next), xMid: (x(m) + x(next)) / 2, label: monthName(iso), showLabel, year }
  })
  return { ticks, x0, x1, xOf: (iso) => x(Math.min(hi, Math.max(lo, Date.parse(iso)))) }
}
