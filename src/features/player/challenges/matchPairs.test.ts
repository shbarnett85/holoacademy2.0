import { describe, expect, it } from 'vitest'
import { alignPair, shuffledPairOrder } from './matchPairs'

describe('shuffledPairOrder', () => {
  it('אף הסבר לא מתחיל מול המושג שלו, וכל ההסברים מופיעים פעם אחת', () => {
    for (let run = 0; run < 200; run++) {
      const rows = shuffledPairOrder(6)
      expect([...rows].sort()).toEqual([0, 1, 2, 3, 4, 5])
      expect(rows.every((pair, row) => pair !== row)).toBe(true)
    }
  })
  it('זוג אחד נשאר כמו שהוא', () => {
    expect(shuffledPairOrder(1)).toEqual([0])
  })
})

describe('alignPair', () => {
  it('ההסבר עובר לשורה של המושג, וזוג שכבר התיישר לא זז', () => {
    const rows = alignPair([1, 2, 0], 1)
    expect(rows).toEqual([0, 1, 2].map((r) => rows[r]))
    expect(rows[1]).toBe(1)
    const after = alignPair(rows, 0)
    expect(after[0]).toBe(0)
    expect(after[1]).toBe(1)
  })
})
