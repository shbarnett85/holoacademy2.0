import { describe, it, expect } from 'vitest'
import {
  calibrate,
  normalizeProfile,
  defaultProfileForGrade,
  gradeNumberFromLabel,
  gradeToLevel,
  levelToGradeLabel,
  perTypeFromChallenges,
  clampLevel20,
  PROFILE_PUZZLE_TYPES,
  LEVEL_MIN,
  LEVEL_MAX,
  CALIBRATION,
  type DifficultyProfile,
} from './difficultyCalibration'

/* פרופיל בסיס לרמה אחידה */
function flatProfile(level: number): DifficultyProfile {
  return {
    textLevel: level,
    perPuzzleLevel: Object.fromEntries(PROFILE_PUZZLE_TYPES.map((t) => [t, level])) as DifficultyProfile['perPuzzleLevel'],
  }
}

describe('כלל 60/80 פר-סוג (calibrate)', () => {
  it('הצלחה מתחת ל-60% מורידה רמה ב-1', () => {
    const r = calibrate(flatProfile(10), { perType: { memory: { solved: 1, total: 2 } }, avgSceneMs: 10_000 })
    expect(r.profile.perPuzzleLevel.memory).toBe(9)
  })

  it('הצלחה מעל 80% מעלה רמה ב-1', () => {
    const r = calibrate(flatProfile(10), { perType: { memory: { solved: 9, total: 10 } }, avgSceneMs: 10_000 })
    expect(r.profile.perPuzzleLevel.memory).toBe(11)
  })

  it('הצלחה בטווח 60-80% לא משנה רמה (כולל הקצוות עצמם)', () => {
    for (const [solved, total] of [[3, 5], [4, 5], [7, 10]] as const) {
      const r = calibrate(flatProfile(10), { perType: { hangman: { solved, total } }, avgSceneMs: 10_000 })
      expect(r.profile.perPuzzleLevel.hangman).toBe(10)
    }
  })

  it('סוג ללא נתונים בסשן לא משתנה', () => {
    const r = calibrate(flatProfile(7), { perType: { memory: { solved: 0, total: 3 } }, avgSceneMs: 10_000 })
    expect(r.profile.perPuzzleLevel.wordSearch).toBe(7)
  })

  it('רצפה 1 ותקרה 20 נאכפות', () => {
    const low = calibrate(flatProfile(LEVEL_MIN), { perType: { memory: { solved: 0, total: 4 } }, avgSceneMs: 10_000 })
    expect(low.profile.perPuzzleLevel.memory).toBe(LEVEL_MIN)
    const high = calibrate(flatProfile(LEVEL_MAX), { perType: { memory: { solved: 4, total: 4 } }, avgSceneMs: 10_000 })
    expect(high.profile.perPuzzleLevel.memory).toBe(LEVEL_MAX)
  })
})

describe('רמת הטקסט (multipleChoice + finalQuiz משולבים)', () => {
  it('משוקללת משני הסוגים יחד', () => {
    /* 2/4 + 1/2 = 3/6 = 50% → ירידה */
    const r = calibrate(flatProfile(10), {
      perType: { multipleChoice: { solved: 2, total: 4 }, finalQuiz: { solved: 1, total: 2 } },
      avgSceneMs: 10_000,
    })
    expect(r.profile.textLevel).toBe(9)
  })

  it('קריאה איטית (מעל הסף) מורידה רמת טקסט נוספת', () => {
    const r = calibrate(flatProfile(10), {
      perType: { multipleChoice: { solved: 9, total: 10 } },
      avgSceneMs: CALIBRATION.SLOW_MS_PER_SCENE + 1,
    })
    /* 90% → +1, קריאה איטית → -1 = נטו 10 */
    expect(r.profile.textLevel).toBe(10)
    expect(r.readingAdjust).toBe('slow')
  })

  it('דילוג (מהיר מהסף) מדגל skipping בלי לשנות רמה', () => {
    const r = calibrate(flatProfile(10), {
      perType: {},
      avgSceneMs: CALIBRATION.SKIP_MS_PER_SCENE - 1,
    })
    expect(r.skipping).toBe(true)
    expect(r.readingAdjust).toBe('skip')
    expect(r.profile.textLevel).toBe(10)
  })

  it('avgSceneMs=0 (אין נתון) — ללא תיקון קריאה', () => {
    const r = calibrate(flatProfile(10), { perType: {}, avgSceneMs: 0 })
    expect(r.readingAdjust).toBe('none')
    expect(r.skipping).toBe(false)
  })
})

describe('מיפוי שכבות (gradeNumberFromLabel / gradeToLevel)', () => {
  it('שכבות הליבה ממופות נכון (גן=0, א=1 ... יב=12)', () => {
    expect(gradeNumberFromLabel('גן')).toBe(0)
    expect(gradeNumberFromLabel('א׳')).toBe(1)
    expect(gradeNumberFromLabel('ג׳2')).toBe(3)
    expect(gradeNumberFromLabel('ז׳1')).toBe(7)
    expect(gradeNumberFromLabel('יא')).toBe(11)
    expect(gradeNumberFromLabel('י״ב')).toBe(12)
    expect(gradeNumberFromLabel('יג')).toBe(13)
  })

  it('קלט לא מזוהה מחזיר null', () => {
    expect(gradeNumberFromLabel('')).toBeNull()
    expect(gradeNumberFromLabel(null)).toBeNull()
    expect(gradeNumberFromLabel('123')).toBeNull()
  })

  it('gradeToLevel = מספר שכבה + 4 (ג׳→7, י״ב→16)', () => {
    expect(gradeToLevel('ג׳')).toBe(7)
    expect(gradeToLevel('י״ב')).toBe(16)
    expect(gradeToLevel('גן')).toBe(4)
  })

  it('levelToGradeLabel מחזיר את השכבה הקרובה ביותר', () => {
    expect(levelToGradeLabel(7)).toBe('ג׳')
    expect(levelToGradeLabel(1)).toBe('גן') /* מתחת לגן → הקיצון */
    expect(levelToGradeLabel(20)).toBe('תואר ראשון')
  })
})

describe('defaultProfileForGrade (שיעור ראשון)', () => {
  it('כל המדדים מתחילים מרמת השכבה', () => {
    const p = defaultProfileForGrade('ג׳')
    expect(p.textLevel).toBe(7)
    for (const t of PROFILE_PUZZLE_TYPES) expect(p.perPuzzleLevel[t]).toBe(7)
  })

  it('שכבה לא מזוהה → רמה 10 (אמצע)', () => {
    expect(defaultProfileForGrade('???').textLevel).toBe(10)
  })
})

describe('perTypeFromChallenges', () => {
  it('סופר solved/total פר סוג', () => {
    const out = perTypeFromChallenges([
      { puzzleType: 'memory', correct: true },
      { puzzleType: 'memory', correct: false },
      { puzzleType: 'hangman', correct: true },
    ])
    expect(out.memory).toEqual({ solved: 1, total: 2 })
    expect(out.hangman).toEqual({ solved: 1, total: 1 })
  })

  it('slidingPuzzle (alias היסטורי) נספר כ-tileSwap; סוג זר מתעלם', () => {
    const out = perTypeFromChallenges([
      { puzzleType: 'slidingPuzzle', correct: true },
      { puzzleType: 'moralDilemma', correct: true } /* מוחרג מהכיול */,
    ])
    expect(out.tileSwap).toEqual({ solved: 1, total: 1 })
    expect(Object.keys(out)).toEqual(['tileSwap'])
  })
})

describe('normalizeProfile / clampLevel20', () => {
  it('ממזג פרופיל חלקי עם fallback', () => {
    const fallback = flatProfile(7)
    const p = normalizeProfile({ textLevel: 12, perPuzzleLevel: { memory: 3 } as DifficultyProfile['perPuzzleLevel'] }, fallback)
    expect(p.textLevel).toBe(12)
    expect(p.perPuzzleLevel.memory).toBe(3)
    expect(p.perPuzzleLevel.hangman).toBe(7)
  })

  it('null → fallback כמו-שהוא', () => {
    expect(normalizeProfile(null, flatProfile(9)).textLevel).toBe(9)
  })

  it('clampLevel20: תוחם לטווח, NaN → 10', () => {
    expect(clampLevel20(0)).toBe(1)
    expect(clampLevel20(25)).toBe(20)
    expect(clampLevel20(NaN)).toBe(10)
    expect(clampLevel20(7.6)).toBe(8)
  })
})
