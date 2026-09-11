/* ── דליי-זמן לגרף ההתקדמות (pure, משותף ל-analytics ול-demoAnalytics) ──
   ארבעה טווחים:
   · year  — שנת לימודים ספט׳→יוני, דלי חודשי (ההתנהגות המקורית).
   · term  — 6 חודשים אחרונים, דלי חודשי (המקורית).
   · month — 30 הימים האחרונים, דלי שבועי (5 דליים שמסתיימים היום).
   · custom — מתאריך-עד-תאריך: טווח ≤45 יום → דלי שבועי; ארוך יותר → חודשי
     (נחתם ל-24 חודשים מהסוף כדי שהגרף יישאר קריא).
   כל דלי נושא [start, end) אמיתיים — השיוך נעשה לפי טווח ולא לפי מפתח-חודש,
   ולכן דלי שבועי ודלי חודשי חיים באותו צינור. */

export interface TrendBucket {
  key: string
  label: string
  start: Date
  end: Date /* בלעדי */
}

const HE_MONTHS = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳']
const DAY = 86_400_000

const monthBucket = (y: number, m0: number, withYear = false): TrendBucket => ({
  key: `${y}-${String(m0 + 1).padStart(2, '0')}`,
  label: withYear ? `${HE_MONTHS[((m0 % 12) + 12) % 12]} ${String(y).slice(2)}` : HE_MONTHS[((m0 % 12) + 12) % 12],
  start: new Date(y, m0, 1),
  end: new Date(y, m0 + 1, 1),
})

const weekLabel = (d: Date) => `${d.getDate()}.${d.getMonth() + 1}`

export function buildTrendBuckets(range: string, fromQ?: string, toQ?: string, now = new Date()): TrendBucket[] {
  const out: TrendBucket[] = []

  if (range === 'term') {
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      out.push(monthBucket(d.getFullYear(), d.getMonth()))
    }
    return out
  }

  if (range === 'month') {
    /* 5 דליים בני 7 ימים שמסתיימים מחר-בבוקר (כולל היום) — התווית = יום הפתיחה */
    const end0 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    for (let i = 4; i >= 0; i--) {
      const start = new Date(end0.getTime() - (i + 1) * 7 * DAY)
      const end = new Date(end0.getTime() - i * 7 * DAY)
      out.push({ key: `w-${start.toISOString().slice(0, 10)}`, label: weekLabel(start), start, end })
    }
    return out
  }

  if (range === 'custom') {
    let from = fromQ ? new Date(fromQ + 'T00:00:00') : null
    let to = toQ ? new Date(toQ + 'T00:00:00') : null
    if (!from || isNaN(from.getTime())) from = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
    if (!to || isNaN(to.getTime())) to = now
    if (to < from) [from, to] = [to, from]
    const endExcl = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1)
    const spanDays = Math.max(1, Math.round((endExcl.getTime() - from.getTime()) / DAY))
    if (spanDays <= 45) {
      /* דלי שבועי מהסוף אחורה — הדלי האחרון מסתיים בתאריך "עד" */
      const weeks = Math.min(12, Math.ceil(spanDays / 7))
      for (let i = weeks - 1; i >= 0; i--) {
        const start = new Date(endExcl.getTime() - (i + 1) * 7 * DAY)
        const end = new Date(endExcl.getTime() - i * 7 * DAY)
        out.push({ key: `w-${start.toISOString().slice(0, 10)}`, label: weekLabel(start), start, end })
      }
      return out
    }
    /* דלי חודשי; טווח שחוצה שנים מקבל תווית עם שנה. נחתם ל-24 חודשים מהסוף. */
    const months: [number, number][] = []
    let cy = from.getFullYear(), cm = from.getMonth()
    while (cy < to.getFullYear() || (cy === to.getFullYear() && cm <= to.getMonth())) {
      months.push([cy, cm])
      cm++; if (cm > 11) { cm = 0; cy++ }
    }
    const crossYear = from.getFullYear() !== to.getFullYear()
    for (const [y, m] of months.slice(-24)) out.push(monthBucket(y, m, crossYear))
    return out
  }

  /* year (ברירת מחדל) — שנת לימודים ספט׳→יוני */
  const startY = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1
  const seq: [number, number][] = [[startY, 8], [startY, 9], [startY, 10], [startY, 11], [startY + 1, 0], [startY + 1, 1], [startY + 1, 2], [startY + 1, 3], [startY + 1, 4], [startY + 1, 5]]
  for (const [y, m] of seq) out.push(monthBucket(y, m))
  return out
}

/* אינדקס הדלי שתאריך נופל בו (או -1) — סריקה פשוטה; מספר הדליים קטן */
export function bucketIndexOf(buckets: TrendBucket[], d: Date): number {
  for (let i = 0; i < buckets.length; i++) if (d >= buckets[i].start && d < buckets[i].end) return i
  return -1
}
