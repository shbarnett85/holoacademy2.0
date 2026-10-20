import { describe, expect, it } from 'vitest'
import { arcPath, computeArcs, polar, roundPercents } from './donutMath'

describe('computeArcs — זוויות מצטברות', () => {
  it('נתחים שונים: ההתחלה של כל נתח היא הסוף של הקודם, והסכום 360°', () => {
    const arcs = computeArcs([14, 6, 5])
    expect(arcs.map((a) => a.startDeg)).toEqual([0, arcs[0].endDeg, arcs[1].endDeg])
    expect(arcs[0].sweepDeg).toBeCloseTo((14 / 25) * 360, 9)
    expect(arcs[2].endDeg).toBe(360)
    expect(arcs.reduce((s, a) => s + a.sweepDeg, 0)).toBeCloseTo(360, 9)
    expect(arcs.reduce((s, a) => s + a.fraction, 0)).toBeCloseTo(1, 9)
  })

  it('נתח יחיד של 100%: 0° עד 360° בדיוק', () => {
    const [a] = computeArcs([7])
    expect(a).toMatchObject({ startDeg: 0, endDeg: 360, sweepDeg: 360, fraction: 1 })
  })

  it('נתחי אפס: אין סחף, ואפס בין נתחים לא משנה את הנתחים האחרים', () => {
    const arcs = computeArcs([0, 3, 0, 1])
    expect(arcs.map((a) => a.sweepDeg)).toEqual([0, 270, 0, 90])
    expect(arcs[1].startDeg).toBe(0)
    expect(arcs[3].endDeg).toBe(360)
  })

  it('הכול אפס / ריק / ערכים לא תקינים: אף נתח לא תופס זווית', () => {
    expect(computeArcs([0, 0, 0]).every((a) => a.sweepDeg === 0 && a.fraction === 0)).toBe(true)
    expect(computeArcs([])).toEqual([])
    expect(computeArcs([-3, Number.NaN, 2]).map((a) => a.sweepDeg)).toEqual([0, 0, 360])
  })

  it('סכום קטן מה-total משאיר חלק ריק בטבעת', () => {
    const arcs = computeArcs([1, 1], 4)
    expect(arcs[1].endDeg).toBe(180)
    expect(arcs.reduce((s, a) => s + a.sweepDeg, 0)).toBe(180)
  })

  it('אין סחף עשרוני בחלוקות שאינן שלמות (שלושים ושלושה שלישים נסגרים על 360° בדיוק)', () => {
    for (const parts of [[1, 1, 1], [7, 7, 7, 7, 7, 7, 7], [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3], [13, 17, 19]]) {
      const arcs = computeArcs(parts)
      expect(arcs[arcs.length - 1].endDeg).toBe(360)
      for (let i = 1; i < arcs.length; i++) expect(arcs[i].startDeg).toBe(arcs[i - 1].endDeg)
    }
  })
})

describe('polar', () => {
  it('0° = 12 בשעון, 90° = 3 בשעון, 180° = 6, 270° = 9', () => {
    expect(polar(100, 100, 50, 0)).toEqual({ x: 100, y: 50 })
    expect(polar(100, 100, 50, 90)).toEqual({ x: 150, y: 100 })
    expect(polar(100, 100, 50, 180)).toEqual({ x: 100, y: 150 })
    expect(polar(100, 100, 50, 270)).toEqual({ x: 50, y: 100 })
  })
})

describe('arcPath', () => {
  it('רבע טבעת: קשת חיצונית קצרה (large=0) בכיוון השעון וחזרה פנימית נגד השעון', () => {
    const d = arcPath(100, 100, 50, 30, 0, 90)
    expect(d).toBe('M 100 50 A 50 50 0 0 1 150 100 L 130 100 A 30 30 0 0 0 100 70 Z')
  })

  it('נתח גדול מ-180° מסומן large=1', () => {
    expect(arcPath(100, 100, 50, 30, 0, 270)).toContain('A 50 50 0 1 1')
    expect(arcPath(100, 100, 50, 30, 0, 180)).toContain('A 50 50 0 0 1')
  })

  it('נתח של 360° הוא טבעת שלמה: שני מעגלים (חיצוני וכיווני-נגד פנימי), בלי קשת מנוונת', () => {
    const d = arcPath(100, 100, 50, 30, 0, 360)
    expect(d.match(/M /g)).toHaveLength(2)
    expect(d).toContain('M 150 100 A 50 50 0 1 1 50 100 A 50 50 0 1 1 150 100 Z')
    expect(d).toContain('M 130 100 A 30 30 0 1 0 70 100 A 30 30 0 1 0 130 100 Z')
  })

  it('נתח ריק או הפוך → מחרוזת ריקה', () => {
    expect(arcPath(100, 100, 50, 30, 90, 90)).toBe('')
    expect(arcPath(100, 100, 50, 30, 90, 45)).toBe('')
  })
})

describe('roundPercents — אחוזים שלמים שמסתכמים ל-100', () => {
  it('דוגמה מהמסך: 14, 6, 5 מתוך 25', () => {
    const p = roundPercents([14, 6, 5])
    expect(p).toEqual([56, 24, 20])
    expect(p.reduce((a, b) => a + b, 0)).toBe(100)
  })

  it('שלושה שלישים: 34 + 33 + 33 (ולא 99)', () => {
    expect(roundPercents([1, 1, 1])).toEqual([34, 33, 33])
  })

  it('הסכום תמיד 100 כשהנתחים מלאים — על מגוון חלוקות', () => {
    const cases = [[1, 2, 3], [1, 1, 1, 1, 1, 1, 1], [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5], [97, 1, 1, 1], [2, 0, 1], [24, 1, 0], [11, 13, 17]]
    for (const c of cases) expect(roundPercents(c).reduce((a, b) => a + b, 0), c.join()).toBe(100)
  })

  it('נתח בודד = 100; נתח אפס לא מקבל אחוז מהיתרה', () => {
    expect(roundPercents([9])).toEqual([100])
    expect(roundPercents([2, 0, 1])).toEqual([67, 0, 33])
    expect(roundPercents([0, 0])).toEqual([0, 0])
  })

  it('סכום קטן מה-total: הסכום הוא האחוז שהנתחים תופסים בפועל', () => {
    const p = roundPercents([1, 1], 4)
    expect(p).toEqual([25, 25])
    expect(p.reduce((a, b) => a + b, 0)).toBe(50)
  })
})
