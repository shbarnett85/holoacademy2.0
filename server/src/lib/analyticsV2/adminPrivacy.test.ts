import { describe, expect, it } from 'vitest'
import { MIN_CELL_SIZE } from '../authz.js'
import { ADMIN_CELL_MIN_OUTSIDE_LARGEST_CLASS } from '../../../../src/shared/lib/analyticsConfig.js'
import {
  MIN_CELL_CLASSES, cellVerdict, contributingN, contributorsOutsideLargestClass, gradeVisible, publishableMean, publishableMonthlySeries, publishableTrend, shareDisplay, totalsPublishable,
} from './adminPrivacy.js'

/* n פריטים מכיתה אחת, עם אותו הפרש מגמה */
const diffs = (classId: string, n: number, delta: number | null = 1): { classId: string; delta: number | null }[] => Array.from({ length: n }, () => ({ classId, delta }))

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
    for (let n = 0; n < MIN_CELL_SIZE; n++) expect(publishableTrend([...diffs('A', n, 1.4), ...diffs('B', 0)]), `n=${n}`).toBeNull()
    /* 5 הפרשים מ-2 כיתות, ובלי הכיתה הגדולה נשארים 5 → מתפרסם */
    expect(publishableTrend([...diffs('A', 5, 1), ...diffs('B', 5, 1)])).toEqual({ delta: 1, n: 10 })
    expect(publishableTrend([...['A', 'A', 'A', 'A', 'A', 'B', 'B', 'B', 'B', 'B'].map((classId, i) => ({ classId, delta: i + 1 })), { classId: 'C', delta: null }]))
      .toEqual({ delta: 5.5, n: 10 })
  })
  it('regression: מגמה שרוב הפרשיה מכיתה אחת (בלעדיה נשארו פחות מ-5) אינה מתפרסם — היא בפועל מגמת הכיתה הזאת', () => {
    expect(publishableTrend([...diffs('A', 8, 2), ...diffs('B', 4, -2)])).toBeNull()
    expect(publishableTrend([...diffs('A', 8, 2), ...diffs('B', 5, -2)])).not.toBeNull()
    /* כיתה אחת בלבד */
    expect(publishableTrend(diffs('A', 9))).toBeNull()
  })
})

describe('דומיננטיות כיתה — תורם בודד מכיתה שנייה אינו "פותח" תא (חוק 9: אין דירוג / זיהוי מורים)', () => {
  it('הסף הוא MIN_CELL_SIZE: בלי הכיתה הגדולה ביותר נשארים לפחות 5', () => {
    expect(ADMIN_CELL_MIN_OUTSIDE_LARGEST_CLASS).toBe(MIN_CELL_SIZE)
  })
  it('contributorsOutsideLargestClass: מסיר את הכיתה הגדולה; בשוויון — אחת מהן', () => {
    expect(contributorsOutsideLargestClass([])).toBe(0)
    expect(contributorsOutsideLargestClass(['a', 'a', 'a'])).toBe(0)
    expect(contributorsOutsideLargestClass(['a', 'b', 'b', 'b', 'b', 'b'])).toBe(1)
    expect(contributorsOutsideLargestClass(['a', 'a', 'b', 'b'])).toBe(2)
    expect(contributorsOutsideLargestClass(['a', 'a', 'a', 'b', 'c'])).toBe(2)
  })
  it('regression: כיתה א׳ עם תורם בודד + כיתה ב׳ עם 5 → התא מוסתר (היה מוצג, והממוצע שלו = ממוצע כיתה ב׳ בחיסור התורם הבודד)', () => {
    const ids = ['A', 'B', 'B', 'B', 'B', 'B']
    expect(ids.length).toBeGreaterThanOrEqual(MIN_CELL_SIZE) /* הסף הישן (5 תורמים, 2 כיתות) היה עובר */
    expect(new Set(ids).size).toBeGreaterThanOrEqual(MIN_CELL_CLASSES)
    expect(cellVerdict(ids)).toEqual({ show: false, reason: 'dominant_class' })
  })
  it('תרחיש התקיפה: אילו התא היה מוצג, חיסור התורם הבודד היה מחזיר את ממוצע כיתה ב׳ במדויק — לכן מוסתר בכל מספר תורמים בודדים בכיתה האחרת', () => {
    const levelA = 9
    const classB = [5.5, 6, 6.5, 6, 6]
    const published = (levelA + classB.reduce((s, x) => s + x, 0)) / (1 + classB.length) /* מה שהמנהל היה רואה */
    const recoveredB = (published * 6 - levelA) / 5
    expect(recoveredB).toBeCloseTo(classB.reduce((s, x) => s + x, 0) / 5, 10) /* ההדגמה: החיסור מחזיר ממוצע כיתה בדיוק */
    for (let loneA = 1; loneA < ADMIN_CELL_MIN_OUTSIDE_LARGEST_CLASS; loneA++) {
      expect(cellVerdict([...Array.from({ length: loneA }, () => 'A'), ...Array.from({ length: 5 }, () => 'B')]), `A=${loneA}`).toMatchObject({ show: false, reason: 'dominant_class' })
    }
  })
  it('כשהכיתה הגדולה היא הרוב אך בלעדיה נשארים 5 → מוצג', () => {
    expect(cellVerdict(['A', 'A', 'A', 'A', 'A', 'A', 'B', 'B', 'B', 'B', 'B'])).toEqual({ show: true, contributors: 11, classes: 2 })
    expect(cellVerdict(['A', 'A', 'A', 'A', 'A', 'B', 'B', 'B', 'B'])).toEqual({ show: false, reason: 'dominant_class' }) /* 4 מחוץ ל-A */
    expect(cellVerdict(['A', 'A', 'A', 'A', 'A', 'B', 'B', 'B', 'B', 'C'])).toEqual({ show: true, contributors: 10, classes: 3 })
  })
  it('מאפיין (זרעים): בכל תא מוצג, לכל כיתה — בלעדיה נשארים ≥ 5 תורמים (חיסור כיתה אחת לעולם לא מבודד כיתה)', () => {
    const r = rng(23)
    let shown = 0, dominant = 0
    for (let trial = 0; trial < 600; trial++) {
      const classes = 1 + Math.floor(r() * 4)
      const ids = Array.from({ length: Math.floor(r() * 30) }, () => `c${Math.floor(r() * classes)}`)
      const v = cellVerdict(ids)
      if (v.show) {
        shown++
        for (const c of new Set(ids)) expect(ids.filter((x) => x !== c).length, JSON.stringify(ids)).toBeGreaterThanOrEqual(MIN_CELL_SIZE)
        expect(v.contributors).toBe(ids.length)
      } else if (v.reason === 'dominant_class') dominant++
    }
    expect(shown).toBeGreaterThan(20)
    expect(dominant).toBeGreaterThan(20) /* המאפיין באמת נבדק על תאים דומיננטיים */
  })
})

describe('תא שכולו כיתה אחת = כיתה (ומורה) מזוהים', () => {
  it('קטן מדי → small_cell (גם אם הכל מכיתה אחת — הסיבה הראשונה היא הכמות)', () => {
    expect(cellVerdict(['a', 'a', 'a', 'a'])).toEqual({ show: false, reason: 'small_cell' })
    expect(cellVerdict([])).toEqual({ show: false, reason: 'small_cell' })
  })
  it('5 תורמים מכיתה אחת → single_class; מ-2 כיתות → מוצג רק כשבלי הכיתה הגדולה נשארים 5 (דומיננטיות: ראו למעלה)', () => {
    expect(cellVerdict(['a', 'a', 'a', 'a', 'a'])).toEqual({ show: false, reason: 'single_class' })
    /* שינוי מכוון: 4+1 היה מוצג, אך בפועל הוא ממוצע כיתה אחת (וניתן לחיסור) → dominant_class */
    expect(cellVerdict(['a', 'a', 'a', 'a', 'b'])).toEqual({ show: false, reason: 'dominant_class' })
    expect(cellVerdict(['a', 'b', 'c', 'a', 'b'])).toEqual({ show: false, reason: 'dominant_class' })
    expect(cellVerdict(['a', 'a', 'a', 'a', 'a', 'b', 'b', 'b', 'b', 'b'])).toEqual({ show: true, contributors: 10, classes: 2 })
    expect(cellVerdict(['a', 'b', 'c', 'a', 'b', 'c', 'a', 'b', 'c', 'a'])).toMatchObject({ show: true, classes: 3 })
  })
})

describe('סדרה חודשית שמותר לפרסם', () => {
  const student = (classId: string, months: [string, number][]) => ({ classId, levelSeries: months.map(([date, level]) => ({ date, level })) })
  it('חודש מתפרסם רק מ-5 תלמידים משתי כיתות ובלי הכיתה הגדולה ≥ 5; חודש אחר באותה סדרה לא משפיע', () => {
    const items = [
      ...['a1', 'a2', 'a3', 'a4', 'a5'].map(() => student('A', [['2026-01-10T12:00:00.000Z', 5], ['2026-02-10T12:00:00.000Z', 6]])),
      ...['b1', 'b2', 'b3', 'b4', 'b5'].map(() => student('B', [['2026-01-10T12:00:00.000Z', 7]])),
    ]
    const series = publishableMonthlySeries(items)
    /* ינואר: 10 תלמידים, 5 בכל כיתה → מוצג; פברואר: 5 תלמידים אבל כולם מכיתה A → מוסתר */
    expect(series).toEqual([{ date: '2026-01-10T12:00:00.000Z', level: 6, n: 10 }])
  })
  it('regression: חודש שנשען על כיתה אחת (בלעדיה פחות מ-5) מוסתר, גם כשיש בו 6 תלמידים משתי כיתות', () => {
    const month = '2026-04-10T12:00:00.000Z'
    const oneLone = [student('A', [[month, 9]]), ...Array.from({ length: 5 }, () => student('B', [[month, 6]]))]
    expect(publishableMonthlySeries(oneLone)).toEqual([])
    const fourOutside = [...Array.from({ length: 5 }, () => student('A', [[month, 9]])), ...Array.from({ length: 4 }, () => student('B', [[month, 6]]))]
    expect(publishableMonthlySeries(fourOutside)).toEqual([])
    const fiveOutside = [...Array.from({ length: 5 }, () => student('A', [[month, 9]])), ...Array.from({ length: 5 }, () => student('B', [[month, 6]]))]
    expect(publishableMonthlySeries(fiveOutside)).toEqual([{ date: month, level: 7.5, n: 10 }])
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
