import { describe, it, expect } from 'vitest'
import {
  clampLevel,
  SCALE_MIN,
  SCALE_MAX,
  FAIL_BUDGET,
  maxSentenceWords,
  typingDelayMs,
  TYPING_MS_SLOW,
  TYPING_MS_FAST,
  scaleMultipleChoice,
  scaleTileSwap,
  scaleWordSearch,
  scaleMemory,
  scaleWordCompletion,
  scaleSequenceOrder,
  scaleMoralDilemma,
  scaleHangman,
  moralDilemmaDepth,
} from './difficultyScaling'

const ALL_LEVELS = Array.from({ length: SCALE_MAX }, (_, i) => i + 1)

describe('clampLevel', () => {
  it('תוחם לטווח 1-20, ברירת מחדל 10 לקלט לא-מספרי', () => {
    expect(clampLevel(0)).toBe(SCALE_MIN)
    expect(clampLevel(99)).toBe(SCALE_MAX)
    expect(clampLevel(undefined)).toBe(10)
    expect(clampLevel(NaN)).toBe(10)
  })
})

describe('עקרון המנעד הענק — קצוות רחוקים ומורגשים', () => {
  it('tileSwap: רשת 2x2 ברמה 1 → 6x6 ברמה 20, מונוטוני לא-יורד', () => {
    expect(scaleTileSwap(1).gridSize).toBe(2)
    expect(scaleTileSwap(20).gridSize).toBe(6)
    let prev = 0
    for (const l of ALL_LEVELS) {
      const g = scaleTileSwap(l).gridSize
      expect(g).toBeGreaterThanOrEqual(prev)
      prev = g
    }
  })

  it('wordSearch: רשת 6→18, מילים 3→14, זמן 300→45ש׳ (יורד), decoy 0→0.85', () => {
    const lo = scaleWordSearch(1)
    const hi = scaleWordSearch(20)
    expect(lo.gridSize).toBe(6)
    expect(hi.gridSize).toBe(18)
    expect(lo.wordCount).toBe(3)
    expect(hi.wordCount).toBe(14)
    expect(lo.timeSec).toBe(300)
    expect(hi.timeSec).toBe(45)
    expect(lo.decoyBias).toBe(0)
    expect(hi.decoyBias).toBe(0.85)
  })

  it('wordSearch: כיוונים מתרחבים עם הרמה (אופקי בלבד → כל הארבעה)', () => {
    expect(scaleWordSearch(1).directions).toEqual(['horizontal'])
    expect(scaleWordSearch(20).directions).toContain('diagonal')
    /* מונוטוני: מספר הכיוונים לא קטן */
    let prev = 0
    for (const l of ALL_LEVELS) {
      const n = scaleWordSearch(l).directions.length
      expect(n).toBeGreaterThanOrEqual(prev)
      prev = n
    }
  })

  it('memory: זוגות 2→14, פסילות קבועות (FAIL_BUDGET)', () => {
    expect(scaleMemory(1).pairCount).toBe(2)
    expect(scaleMemory(20).pairCount).toBe(14)
    for (const l of ALL_LEVELS) expect(scaleMemory(l).maxMistakes).toBe(FAIL_BUDGET.memoryMistakes)
  })

  it('wordCompletion: בנק 8→ללא, חללים 1→3', () => {
    const lo = scaleWordCompletion(1)
    const hi = scaleWordCompletion(20)
    expect(lo.wordBankSize).toBe(8)
    expect(hi.wordBankSize).toBe(0)
    expect(lo.blankCount).toBe(1)
    expect(hi.blankCount).toBe(3)
  })

  it('sequenceOrder: פריטים 3→9', () => {
    expect(scaleSequenceOrder(1).itemCount).toBe(3)
    expect(scaleSequenceOrder(20).itemCount).toBe(9)
  })

  it('multipleChoice: מספר תשובות עולה עם הרמה (3 → 6)', () => {
    expect(scaleMultipleChoice(1).optionCount).toBe(3)
    expect(scaleMultipleChoice(20).optionCount).toBe(6)
  })

  it('תקציבי הכישלון קבועים בכל הרמות (הוגנות נתפסת)', () => {
    for (const l of ALL_LEVELS) {
      expect(scaleHangman(l).maxWrong).toBe(FAIL_BUDGET.hangmanWrong)
      expect(scaleTileSwap(l).maxBadSwaps).toBe(FAIL_BUDGET.tileSwapBadSwaps)
      expect(scaleWordCompletion(l).maxAttempts).toBe(FAIL_BUDGET.wordCompletionAttempts)
      expect(scaleSequenceOrder(l).maxAttempts).toBe(FAIL_BUDGET.sequenceOrderAttempts)
    }
  })
})

describe('moralDilemma — עומק לפי min(גיל, טקסט), עקיפת מורה גוברת', () => {
  it('הנמוך מבין הגיל והטקסט קובע', () => {
    expect(moralDilemmaDepth(7, 15)).toBe(7)
    expect(moralDilemmaDepth(15, 7)).toBe(7)
  })

  it('override גובר על שני הצירים', () => {
    expect(moralDilemmaDepth(5, 5, 18)).toBe(18)
  })

  it('ברירות מחדל כשחסר נתון (גיל→8, טקסט→10)', () => {
    expect(moralDilemmaDepth(undefined, undefined)).toBe(8)
  })

  it('מספר האפשרויות עולה עם העומק: 2 → 4', () => {
    expect(scaleMoralDilemma(1).choiceCount).toBe(2)
    expect(scaleMoralDilemma(10).choiceCount).toBe(3)
    expect(scaleMoralDilemma(20).choiceCount).toBe(4)
  })
})

describe('פרמטרי קריאה', () => {
  it('maxSentenceWords מונוטוני לא-יורד: 8 (רמה 1) → 40 (רמה 20)', () => {
    expect(maxSentenceWords(1)).toBe(8)
    expect(maxSentenceWords(20)).toBe(40)
    let prev = 0
    for (const l of ALL_LEVELS) {
      const w = maxSentenceWords(l)
      expect(w).toBeGreaterThanOrEqual(prev)
      prev = w
    }
  })

  it('typingDelayMs: איטי ברמה 1, מהיר ברמה 20', () => {
    expect(typingDelayMs(1)).toBe(TYPING_MS_SLOW)
    expect(typingDelayMs(20)).toBe(TYPING_MS_FAST)
  })
})
