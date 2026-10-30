/* שכבת התחושה: נקודות מהטלמטריה, הרמז לניסיון השני, משפטי הצמיחה, מדידת FPS, והטקסט לתלמיד. סריקת הקוד לניסוחים אסורים: server/src/lib/gameFeelWording.test.ts */
import { describe, expect, it } from 'vitest'
import { averageFps, FPS_PROBE_MS, LEVELS, LOW_FPS, shouldLowerLevel } from './engine'
import { allowedMistakes, countMistakes, growthCounts, pointsFromTelemetry } from './points'
import { END_TEXT, HUD_TEXT, JOURNEY_TEXT, retryHint, RETRY_TEXT } from './text'
import { scaleMemory, scaleWordCompletion } from '../../../shared/lib/difficultyScaling'

describe('נקודות מהטלמטריה (קריאה בלבד)', () => {
  const pair = (match: boolean) => ({ k: 'pair', t: 1, match })
  it('זיכרון: הטעויות המותרות כמו באתגר עצמו, ועד מחציתן נקי', () => {
    const allowed = scaleMemory(5).maxMistakes
    expect(allowedMistakes({ type: 'memory', difficulty: 5 })).toBe(allowed)
    const half = Math.floor(allowed / 2)
    expect(pointsFromTelemetry({ type: 'memory', difficulty: 5 }, true, Array.from({ length: half }, () => pair(false)))).toBe(1)
    expect(pointsFromTelemetry({ type: 'memory', difficulty: 5 }, true, Array.from({ length: half + 1 }, () => pair(false)))).toBe(0.5)
    expect(pointsFromTelemetry({ type: 'memory', difficulty: 5 }, false, [])).toBe(0)
  })
  it('השלמת מילים: לפי הניסיונות המותרים', () => {
    expect(allowedMistakes({ type: 'wordCompletion', difficulty: 3 })).toBe(scaleWordCompletion(3).maxAttempts)
  })
  it('פיצוח קוד: רק אותיות שגויות נספרות', () => {
    const ev = [{ k: 'letter', t: 1, correct: true }, { k: 'letter', t: 2, correct: false }]
    expect(countMistakes('hangman', ev)).toBe(1)
    expect(pointsFromTelemetry({ type: 'hangman', maxWrong: 6 }, true, ev)).toBe(1)
  })
  it('סידור רצף: הגשה שגויה אחת כבר 0.5', () => {
    expect(pointsFromTelemetry({ type: 'sequenceOrder' }, true, [])).toBe(1)
    expect(pointsFromTelemetry({ type: 'sequenceOrder' }, true, [{ k: 'submit', t: 1, correct: false }])).toBe(0.5)
  })
  it('החלפת אריחים: רק החלפה גרועה נספרת', () => {
    expect(countMistakes('tileSwap', [{ k: 'swap', t: 1, bad: true }, { k: 'swap', t: 2, bad: false }])).toBe(1)
  })
})

describe('הרמז לניסיון השני לא מגלה את התשובה', () => {
  it('הסבר שנפתח ב"התשובה הנכונה" מוחלף ברמז כללי', () => {
    expect(retryHint('התשובה הנכונה היא נילוס, כי…', 'נילוס')).toBe(RETRY_TEXT.neutralHint)
  })
  it('הסבר שמצטט את התשובה מוחלף ברמז כללי', () => {
    expect(retryHint('הנהר הזה הוא הנילוס שעובר במצרים', 'הנילוס')).toBe(RETRY_TEXT.neutralHint)
  })
  it('הסבר שלא מגלה מוצג כמו שהוא; בלי הסבר — רמז כללי', () => {
    expect(retryHint('חשבו על המקום שבו זרמו המים.', 'הנילוס')).toBe('חשבו על המקום שבו זרמו המים.')
    expect(retryHint('', 'הנילוס')).toBe(RETRY_TEXT.neutralHint)
    expect(retryHint(null, null)).toBe(RETRY_TEXT.neutralHint)
  })
})

describe('משפטי צמיחה', () => {
  const r = (sceneId: string, gemPoints: number) => ({ sceneId, sceneTitle: sceneId, correct: gemPoints === 1, score: gemPoints === 1 ? 1 : 0, gemPoints })
  it('ספירה נפרדת: ניסיון ראשון / ניסו שוב והצליחו; דילמה לא נספרת', () => {
    expect(growthCounts([r('a', 1), r('b', 0.5), r('c', 0), r('m', 1), r('d', 0.75)], new Set(['m']))).toEqual({ firstTry: 1, retried: 2 })
  })
  it('אין אחוזים, רמת קושי או השוואה לאחרים בטקסט של שכבת המשחק', () => {
    const lines = [
      HUD_TEXT.barLabel(3), HUD_TEXT.streak(4), HUD_TEXT.bigChallenge, ...Object.values(RETRY_TEXT),
      END_TEXT.gemsCount(3, true), END_TEXT.firstTry(4), END_TEXT.retried(2), END_TEXT.classLine(40, 3, 72),
      END_TEXT.kickerClosed, END_TEXT.kickerOpen, END_TEXT.titleClosed, END_TEXT.titleOpen, END_TEXT.narrativeOpen, JOURNEY_TEXT.done(3), JOURNEY_TEXT.classClosed,
    ]
    for (const t of lines) {
      expect(t).not.toMatch(/%|אחוז|דרג|רמה|מקום ה|ממוצע|יותר מ/)
    }
  })
})

describe('מדידת FPS', () => {
  it('ממוצע מזמני פריימים', () => {
    expect(averageFps(Array.from({ length: 60 }, (_, i) => i * (1000 / 60)))).toBeCloseTo(60, 0)
    expect(averageFps([])).toBe(Infinity)
  })
  it('מתחת ל-40 יורדים לעדין; 40 ומעלה לא', () => {
    expect(LOW_FPS).toBe(40)
    expect(shouldLowerLevel(39.9)).toBe(true)
    expect(shouldLowerLevel(40)).toBe(false)
    expect(FPS_PROBE_MS).toBeGreaterThan(0)
  })
  it('כמויות האפקטים עולות עם העוצמה', () => {
    expect(LEVELS.gentle.confetti).toBeLessThan(LEVELS.medium.confetti)
    expect(LEVELS.medium.confetti).toBeLessThan(LEVELS.full.confetti)
  })
})
