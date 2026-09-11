import { describe, it, expect } from 'vitest'
import { crystalStepCounts } from './useGameEngine'

describe('crystalStepCounts — הקצאת אתגרים לקריסטלים (המכנה של המילוי החלקי)', () => {
  it('10 אתגרים שווי-משקל → 2 לכל קריסטל', () => {
    expect(crystalStepCounts(Array(10).fill(1))).toEqual([2, 2, 2, 2, 2])
  })

  it('5 אתגרים → 1 לכל קריסטל', () => {
    expect(crystalStepCounts(Array(5).fill(1))).toEqual([1, 1, 1, 1, 1])
  })

  it('סכום ההקצאות = מספר האתגרים (כשיש לפחות אתגר לקריסטל)', () => {
    for (const n of [5, 7, 10, 13, 20]) {
      const counts = crystalStepCounts(Array(n).fill(1))
      expect(counts.reduce((a, b) => a + b, 0)).toBe(n)
    }
  })

  it('מבחן סיכום (משקל קריסטל שלם) מקבל את הקריסטל האחרון לבדו', () => {
    /* 4 רגילים (משקל 1) + finalQuiz במשקל regularCount/4=1 → כל אחד קריסטל */
    expect(crystalStepCounts([1, 1, 1, 1, 1])).toEqual([1, 1, 1, 1, 1])
    /* 8 רגילים + quiz במשקל 2: הרגילים על 4 הקריסטלים הראשונים, ה-quiz באחרון */
    const counts = crystalStepCounts([...Array(8).fill(1), 2])
    expect(counts[4]).toBe(1)
    expect(counts.slice(0, 4).reduce((a, b) => a + b, 0)).toBe(8)
  })

  it('פחות מ-5 אתגרים — אין מכנה אפס (קריסטל בלי הקצאה מקבל 1)', () => {
    for (const n of [1, 2, 3, 4]) {
      const counts = crystalStepCounts(Array(n).fill(1))
      expect(Math.min(...counts)).toBeGreaterThanOrEqual(1)
    }
  })

  it('ללא אתגרים — כל המכנים 1 (בלי חלוקה באפס)', () => {
    expect(crystalStepCounts([])).toEqual([1, 1, 1, 1, 1])
  })
})
