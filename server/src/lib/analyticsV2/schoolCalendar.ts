/* ──────────────────────────────────────────────────────────────────────────
   schoolCalendar — לוח "ימי לימוד" משותף לעולם ההדגמה ולעולם החי (טהור, ללא DB וללא תלות בשעון המערכת).
   · יום לימוד = ראשון–חמישי, ללא יולי–אוגוסט, מיוצג כ-ISO של 12:00 UTC (אותו תאריך בישראל בכל עונה).
   · days[0] = היום האחרון, ומשם אחורה. אינדקס יום = "כמה ימי לימוד אחורה".
   · סשן אמיתי (כל שעה, גם שישי/שבת/חופשה) ממופה ליום הלימוד האחרון שאינו מאוחר ממנו — לפי היום הישראלי (Asia/Jerusalem), לא UTC.
   ────────────────────────────────────────────────────────────────────────── */
import { CLASS_IMPROVEMENT_WINDOW_DAYS } from '../../../../src/shared/lib/analyticsConfig.js'
import { israelDayKey, latestTermStart, termOf, type Term } from '../../../../src/shared/lib/findingsNarrative.js'

/* המחצית שלפיה נמדד "שיפור מאז תחילת המחצית"; idx = אינדקס יום הלימוד הראשון שלה ב-days */
export interface SchoolTerm { kind: Term; startIso: string; idx: number }

/* מינימום ימי לימוד שחלפו במחצית כדי למדוד בה שיפור כיתתי: חלון התחלה + חלון סיום + מרווח */
export const TERM_MIN_SCHOOL_DAYS = 2 * CLASS_IMPROVEMENT_WINDOW_DAYS + 10

/* ── ימי לימוד אחורה מתאריך הייחוס. endOffsetDays=1 (ברירת מחדל, עולם ההדגמה) = מתחילים מאתמול;
   0 = מתחילים מהיום (אם הוא יום לימוד). הפלט לברירת המחדל זהה בדיוק למימוש המקורי ב-demoWorld. ── */
export function buildSchoolDays(now: Date, count: number, endOffsetDays = 1): string[] {
  const out: string[] = []
  let t = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - endOffsetDays, 12)
  while (out.length < count) {
    const d = new Date(t)
    const dow = d.getUTCDay()
    const month = d.getUTCMonth()
    if (dow <= 4 && month !== 6 && month !== 7) out.push(d.toISOString())
    t -= 86400000
  }
  return out
}

/* ── אינדקס יום הלימוד של רגע בזמן ──
   · הרגע נקרא לפי היום הישראלי (israelDayKey): שליחה ב-01:30 שעון ישראל ביום ראשון שייכת לראשון, גם אם ב-UTC זה עדיין שבת.
   · floor: שישי/שבת/חג/קיץ → יום הלימוד האחרון שלפניהם (קיץ → סוף יוני). רגע מאוחר מ-days[0] → 0.
   · רגע שקדם ליום הלימוד העתיק ביותר (מחוץ לאופק) או תאריך לא תקין → null. */
export function dayIndexOf(days: readonly string[], iso: string): number | null {
  const key = israelDayKey(iso)
  if (!key || !days.length) return null
  /* days יורד (0 = החדש). מחפשים את האינדקס הקטן ביותר שתאריכו ≤ המפתח */
  let lo = 0, hi = days.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (days[mid].slice(0, 10) <= key) hi = mid
    else lo = mid + 1
  }
  return lo < days.length ? lo : null
}

/* ── מפתח חודש (YYYY-MM) לפי היום הישראלי — עקבי עם israelDayKey; cache כי הקריאה יקרה ביחס לחיתוך מחרוזת ── */
const MONTH_CACHE = new Map<string, string>()
export function israelMonthKey(iso: string): string {
  const hit = MONTH_CACHE.get(iso)
  if (hit !== undefined) return hit
  const key = (israelDayKey(iso) ?? iso).slice(0, 7)
  if (MONTH_CACHE.size > 5000) MONTH_CACHE.clear()
  MONTH_CACHE.set(iso, key)
  return key
}

/* ── המחצית הנוכחית לעולם חי ──
   null כשחלפו פחות מ-TERM_MIN_SCHOOL_DAYS ימי לימוד במחצית (אין ממה למדוד שיפור) — ואין "נסיגה" למחצית הקודמת
   (בניגוד ל-pickTerm של ההדגמה, שנעול בטסטים ונשאר כמו שהוא). null גם כשאופק הימים אינו מגיע לתחילת המחצית. */
export function liveTerm(now: Date, days: readonly string[]): SchoolTerm | null {
  if (!days.length) return null
  const kind = termOf(`${israelDayKey(now.toISOString()) ?? now.toISOString().slice(0, 10)}T12:00:00Z`)
  const start = latestTermStart(kind, now)
  const startMs = start.getTime()
  if (Date.parse(days[days.length - 1]) > startMs) return null
  const elapsed = days.filter((d) => Date.parse(d) >= startMs).length
  if (elapsed < TERM_MIN_SCHOOL_DAYS) return null
  return { kind, startIso: start.toISOString(), idx: elapsed - 1 }
}
