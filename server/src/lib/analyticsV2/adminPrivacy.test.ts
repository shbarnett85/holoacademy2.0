import { describe, expect, it } from 'vitest'
import { MIN_CELL_SIZE } from '../authz.js'
import {
  MIN_CELL_CLASSES, cellVerdict, contributingN, gradeVisible, publishableMean, publishableMonthlySeries, publishableTrend, shareDisplay, totalsPublishable,
} from './adminPrivacy.js'

/* PRNG דטרמיניסטי לבדיקות מאפיינים */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

describe('ספי הפרטיות', () => {
  it('הסף הוא MIN_CELL_SIZE=5 וכיתות מינימום 2', () => {
    expect(MIN_CELL_SIZE).toBe(5)
    expect(MIN_CELL_CLASSES).toBe(2)
  })
})

describe('תורמים, לא רשומים', () => {
  it('contributingN סופר רק ערכים סופיים', () => {
    expect(contributingN([1, null, undefined, NaN, Infinity, 2])).toBe(2)
    expect(contributingN([])).toBe(0)
  })
  it('regression: תא עם 6 רשומים ותורם אחד לא מפרסם את רמתו האישית של התורם', () => {
    const registered = 6
    const levels = [7.3, null, null, null, null, null]
    expect(registered).toBeGreaterThanOrEqual(MIN_CELL_SIZE) /* הסף הישן (רשומים) היה עובר */
    expect(publishableMean(levels)).toBeNull()
  })
  it('ממוצע מתפרסם מ-5 תורמים בדיוק, ולא מ-4', () => {
    expect(publishableMean([4, 5, 6, 7])).toBeNull()
    expect(publishableMean([4, 5, 6, 7, 8])).toBe(6)
    expect(publishableMean([4, 5, 6, 7, 8, null, null])).toBe(6)
  })
  it('כל n בטווח 0..12: ממוצע מתפרסם אם ורק אם n ≥ 5', () => {
    for (let n = 0; n <= 12; n++) expect(publishableMean(Array.from({ length: n }, (_, i) => i)) !== null, `n=${n}`).toBe(n >= MIN_CELL_SIZE)
  })
})

describe('מגמה (שינוי) — כל מספר עם ה-N שלו', () => {
  it('regression: שינוי של 1–4 תלמידים לא מתפרסם (היה trendDelta אישי)', () => {
    for (let n = 0; n < MIN_CELL_SIZE; n++) expect(publishableTrend(Array.from({ length: n }, () => 1.4)), `n=${n}`).toBeNull()
    expect(publishableTrend([1, 1, 1, 1, 1])).toEqual({ delta: 1, n: 5 })
    expect(publishableTrend([1, 2, 3, 4, 5, null])).toEqual({ delta: 3, n: 5 })
  })
})

describe('תא שכולו כיתה אחת = כיתה (ומורה) מזוהים', () => {
  it('קטן מדי → small_cell (גם אם הכל מכיתה אחת — הסיבה הראשונה היא הכמות)', () => {
    expect(cellVerdict(['a', 'a', 'a', 'a'])).toEqual({ show: false, reason: 'small_cell' })
    expect(cellVerdict([])).toEqual({ show: false, reason: 'small_cell' })
  })
  it('5 תורמים מכיתה אחת → single_class; מ-2 כיתות → מוצג', () => {
    expect(cellVerdict(['a', 'a', 'a', 'a', 'a'])).toEqual({ show: false, reason: 'single_class' })
    expect(cellVerdict(['a', 'a', 'a', 'a', 'b'])).toEqual({ show: true, contributors: 5, classes: 2 })
    expect(cellVerdict(['a', 'b', 'c', 'a', 'b'])).toMatchObject({ show: true, classes: 3 })
  })
})

describe('סדרה חודשית שמותר לפרסם', () => {
  const student = (classId: string, months: [string, number][]) => ({ classId, levelSeries: months.map(([date, level]) => ({ date, level })) })
  it('חודש מתפרסם רק מ-5 תלמידים ומ-2 כיתות; חודש אחר באותה סדרה לא משפיע', () => {
    const items = [
      ...['a1', 'a2', 'a3'].map(() => student('A', [['2026-01-10T12:00:00.000Z', 5], ['2026-02-10T12:00:00.000Z', 6]])),
      ...['b1', 'b2'].map(() => student('B', [['2026-01-10T12:00:00.000Z', 7]])),
      ...['a4', 'a5'].map(() => student('A', [['2026-02-10T12:00:00.000Z', 6]])),
    ]
    const series = publishableMonthlySeries(items)
    /* ינואר: 5 תלמידים משתי כיתות → מוצג; פברואר: 5 תלמידים אבל כולם מכיתה A → מוסתר */
    expect(series).toEqual([{ date: '2026-01-10T12:00:00.000Z', level: 5.8, n: 5 }])
  })
  it('פחות מ-5 תלמידים בחודש → אין נקודה', () => {
    const items = [student('A', [['2026-03-01T12:00:00.000Z', 5]]), student('B', [['2026-03-01T12:00:00.000Z', 6]])]
    expect(publishableMonthlySeries(items)).toEqual([])
  })
})

describe('שכבות וסכומים: חיסור לא חושף שכבה מוסתרת', () => {
  it('שכבה מוצגת רק מ-5 תלמידים', () => {
    expect(gradeVisible(4)).toBe(false)
    expect(gradeVisible(5)).toBe(true)
  })
  it('הסך מתפרסם רק כשכל השכבות מוצגות', () => {
    expect(totalsPublishable([30, 28, 5])).toBe(true)
    expect(totalsPublishable([30, 28, 3])).toBe(false)
    expect(totalsPublishable([30, 0])).toBe(false)
  })
  it('מאפיין (זרעים): מהמידע שמתפרסם אי אפשר לשחזר את גודל שכבה מוסתרת — כל גודל קטן מהסף מתיישב עם אותה תמונה', () => {
    const r = rng(7)
    for (let trial = 0; trial < 300; trial++) {
      const grades = Array.from({ length: 1 + Math.floor(r() * 5) }, () => Math.floor(r() * 60))
      const visible = grades.filter(gradeVisible)
      const hiddenCount = grades.length - visible.length
      const published = { visibleSizes: visible, total: totalsPublishable(grades) ? grades.reduce((s, n) => s + n, 0) : null }
      if (hiddenCount === 0) continue
      /* יש שכבה מוסתרת → הסך לא מתפרסם, ולכן שום חיסור אינו אפשרי */
      expect(published.total, JSON.stringify(grades)).toBeNull()
      /* ולכל שכבה מוסתרת כל גודל 0..4 מתיישב עם המידע שפורסם (אותם visibleSizes, אותו total=null) */
      for (let alt = 0; alt < MIN_CELL_SIZE; alt++) {
        const altGrades = [...visible, ...Array.from({ length: hiddenCount }, () => alt)]
        expect(totalsPublishable(altGrades)).toBe(false)
        expect(altGrades.filter(gradeVisible)).toEqual(visible)
      }
    }
  })
  it('כשהסך מתפרסם אין שכבות מוסתרות (חיסור לא מגלה כלום)', () => {
    const r = rng(11)
    for (let trial = 0; trial < 300; trial++) {
      const grades = Array.from({ length: 1 + Math.floor(r() * 5) }, () => Math.floor(r() * 60))
      if (totalsPublishable(grades)) expect(grades.every(gradeVisible)).toBe(true)
    }
  })
})

describe('אחוז תפיסה שגויה — מספר רק כשגם המציגים וגם הלא-מציגים לפחות 5', () => {
  it.each([
    [1, 50, 'few'], [4, 50, 'few'], [5, 50, 'number'], [45, 50, 'number'], [46, 50, 'almost_all'], [50, 50, 'almost_all'],
    [0, 50, 'few'], [3, 4, 'hidden'], [0, 0, 'hidden'], [5, 10, 'number'], [5, 9, 'almost_all'],
  ] as const)('%i מתוך %i → %s', (showing, exposed, want) => {
    expect(shareDisplay(showing, exposed)).toBe(want)
  })
})
