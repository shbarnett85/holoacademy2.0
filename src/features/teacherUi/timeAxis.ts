/* ציר הזמן המשותף לכל הגרפים (עיקרון 11): אותם חודשים, באותם שמות עבריים, בכל גרף.
   pure — ללא DOM וללא Date.now(); התאריכים מגיעים מהקורא. החודשים בחישוב UTC (כמו findingsNarrative).
   הציר מתפרש על חודשים שלמים: מתחילת חודש `from` עד סוף חודש `to`. נקודות ממוקמות לפי תאריך אמיתי, לא לפי אינדקס.
   כיוון: ישן → חדש משמאל לימין (כמו LevelChart הקיים; המסגרת ChartFrame קובעת direction:ltr). */
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
  /** מציגים תווית לחודש הזה? (דילול כשצפוף; לעולם לא פחות מ-minLabelGap פיקסלים בין תוויות) */
  showLabel: boolean
  /** שנה, רק בחודש הראשון בציר ובכל ינואר — מוצגת כשורה שנייה מתחת לשם החודש */
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

export function buildTimeAxis({ from, to, x0, x1, minLabelGap = 64 }: TimeAxisOptions): TimeAxis {
  const f = Date.parse(from), t = Date.parse(to)
  const lo = startOfMonth(Math.min(f, t))
  const hi = addMonths(startOfMonth(Math.max(f, t)), 1)
  const span = hi - lo
  const x = (ms: number): number => x0 + ((ms - lo) / span) * (x1 - x0)

  const starts: number[] = []
  for (let m = lo; m < hi; m = addMonths(m, 1)) starts.push(m)
  const perMonth = (x1 - x0) / starts.length
  const step = STEPS.find((s) => s * perMonth >= minLabelGap) ?? 12

  const ticks: MonthTick[] = starts.map((m, i) => {
    const next = addMonths(m, 1)
    const iso = new Date(m).toISOString()
    const isJan = new Date(m).getUTCMonth() === 0
    return {
      iso, xStart: x(m), xEnd: x(next), xMid: (x(m) + x(next)) / 2, label: monthName(iso),
      showLabel: i % step === 0,
      year: i === 0 || isJan ? new Date(m).getUTCFullYear() : undefined,
    }
  })
  return { ticks, x0, x1, xOf: (iso) => x(Math.min(hi, Math.max(lo, Date.parse(iso)))) }
}
