import { describe, it, expect } from 'vitest'
import { buildTrendBuckets, bucketIndexOf } from './trendBuckets.js'

const NOW = new Date(2026, 8, 11) /* 11.9.2026 */

describe('trendBuckets — דליי הזמן של גרף ההתקדמות', () => {
  it('term: ‏6 דליים חודשיים שמסתיימים בחודש הנוכחי', () => {
    const b = buildTrendBuckets('term', undefined, undefined, NOW)
    expect(b).toHaveLength(6)
    expect(b.at(-1)!.key).toBe('2026-09')
    expect(b[0].key).toBe('2026-04')
  })
  it('year: שנת לימודים ספט׳→יוני', () => {
    const b = buildTrendBuckets('year', undefined, undefined, NOW)
    expect(b).toHaveLength(10)
    expect(b[0].key).toBe('2026-09')
    expect(b.at(-1)!.key).toBe('2027-06')
  })
  it('month: ‏5 דליים שבועיים, האחרון כולל את היום', () => {
    const b = buildTrendBuckets('month', undefined, undefined, NOW)
    expect(b).toHaveLength(5)
    expect(bucketIndexOf(b, NOW)).toBe(4)
    expect(bucketIndexOf(b, new Date(2026, 7, 7))).toBe(-1) /* מעבר לחלון (35 יום = 5×7) */
    /* כל דלי בן 7 ימים בדיוק */
    for (const bk of b) expect(Math.round((bk.end.getTime() - bk.start.getTime()) / 86400000)).toBe(7)
  })
  it('custom קצר (≤45 יום) → דליים שבועיים; ארוך → חודשיים עם שנה בתווית', () => {
    const short = buildTrendBuckets('custom', '2026-08-20', '2026-09-10', NOW)
    expect(short.length).toBeGreaterThanOrEqual(3)
    expect(Math.round((short[0].end.getTime() - short[0].start.getTime()) / 86400000)).toBe(7)
    const long = buildTrendBuckets('custom', '2025-10-01', '2026-03-31', NOW)
    expect(long).toHaveLength(6)
    expect(long[0].key).toBe('2025-10')
    expect(long[0].label).toContain('25') /* חוצה שנים → שנה בתווית */
  })
  it('custom הפוך (עד לפני מ-) מתוקן, וטווח ארוך נחתם ל-24 חודשים', () => {
    const flipped = buildTrendBuckets('custom', '2026-03-31', '2025-10-01', NOW)
    expect(flipped[0].key).toBe('2025-10')
    const huge = buildTrendBuckets('custom', '2020-01-01', '2026-09-01', NOW)
    expect(huge).toHaveLength(24)
    expect(huge.at(-1)!.key).toBe('2026-09')
  })
  it('שיוך תאריך לדלי — עמיד לפברואר מעובר', () => {
    const b = buildTrendBuckets('custom', '2024-01-15', '2024-03-15', new Date(2024, 3, 1))
    const feb29 = new Date(2024, 1, 29)
    const idx = bucketIndexOf(b, feb29)
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(b[idx].key).toBe('2024-02')
  })
})
