import { describe, expect, it } from 'vitest'
import { LEVEL_COMPARISON } from './analyticsConfig'
import { compareToPeers, levelBandsOf, type PeerPlay } from './levelComparison'

const peers = (levels: number[], solved: boolean | boolean[] = true): PeerPlay[] => levels.map((level, i) => ({ level, solved: Array.isArray(solved) ? solved[i] : solved }))

describe('compareToPeers — השוואה הוגנת רק מול מי ששיחק ברמה דומה', () => {
  it('המקרה המרכזי: תלמיד/ה בדרגה 14 שנכשל/ה, מול כיתה בדרגה 6 שהצליחה — אין השוואה (לא מוצג/ת כחלש/ה מהם)', () => {
    const classAtSix = peers([6, 6, 6, 6, 7, 6, 5, 6], true)
    expect(compareToPeers(14, classAtSix)).toEqual({ kind: 'not_enough' })
  })

  it('אותו/ה תלמיד/ה בדרגה 14 מול שלושה תלמידים בדרגות 13–15 — משווים, והדרגות מוצגות', () => {
    const r = compareToPeers(14, [...peers([6, 6, 6, 6, 6]), ...peers([13, 15, 14], [true, false, true])])
    expect(r).toEqual({ kind: 'compared', peers: 3, solved: 2, levelFrom: 13, levelTo: 15 })
  })

  it('הגבול: בדיוק maxGap דרגות — נכלל; maxGap+1 — לא', () => {
    const g = LEVEL_COMPARISON.maxGap
    const inside = peers([10 + g, 10 - g, 10], true)
    expect(compareToPeers(10, inside).kind).toBe('compared')
    const outside = peers([10 + g + 1, 10 - g - 1, 10], true)
    expect(compareToPeers(10, outside)).toEqual({ kind: 'not_enough' })
  })

  it('מתחת ל-minPeers תלמידים דומים — "אין מספיק" (גם אם כולם הצליחו)', () => {
    expect(compareToPeers(8, peers(new Array(LEVEL_COMPARISON.minPeers - 1).fill(8), true))).toEqual({ kind: 'not_enough' })
    expect(compareToPeers(8, peers(new Array(LEVEL_COMPARISON.minPeers).fill(8), true)).kind).toBe('compared')
  })

  it('בלי נתון רמה לשחקן/ית: no_level; עמיתים בלי נתון רמה לא נספרים', () => {
    expect(compareToPeers(null, peers([5, 5, 5, 5]))).toEqual({ kind: 'no_level' })
    const noLevel: PeerPlay[] = [{ level: null, solved: true }, { level: null, solved: true }, { level: null, solved: true }, { level: 5, solved: true }]
    expect(compareToPeers(5, noLevel)).toEqual({ kind: 'not_enough' })
  })
})

describe('levelBandsOf — פירוק לפי טווחי דרגות', () => {
  it('רק טווחים עם תלמידים, בסדר עולה; מי שאין לו רמה לא נספר', () => {
    const plays: PeerPlay[] = [...peers([6, 7, 8, 9], [true, true, true, false]), ...peers([14], false), { level: null, solved: true }]
    expect(levelBandsOf(plays)).toEqual([
      { from: 6, to: 10, attempted: 4, solved: 3 },
      { from: 11, to: 15, attempted: 1, solved: 0 },
    ])
  })
  it('אין נתוני רמה בכלל → ריק', () => {
    expect(levelBandsOf([{ level: null, solved: true }])).toEqual([])
  })
})
