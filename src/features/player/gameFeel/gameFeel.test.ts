/* שכבת התחושה: הרמז לניסיון השני, משפטי הצמיחה, מדידת FPS, והטקסט לתלמיד. סריקת הקוד לניסוחים אסורים: server/src/lib/gameFeelWording.test.ts */
import { describe, expect, it } from 'vitest'
import { averageFps, FPS_PROBE_MS, LEVELS, LOW_FPS, medianFrameMs, probeVerdict, shouldLowerLevel, THROTTLED_FRAME_MS } from './engine'
import { growthCounts } from './points'
import { END_TEXT, HUD_TEXT, JOURNEY_TEXT, retryHint, RETRY_TEXT } from './text'

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
  it('ספירה נפרדת: הצלחה מלאה / ניסו שוב והצליחו; דילמה לא נספרת', () => {
    expect(growthCounts([r('a', 1), r('b', 0.5), r('c', 0), r('m', 1), r('d', 0.75)], new Set(['m']))).toEqual({ firstTry: 1, retried: 2 })
  })
  it('אין אחוזים, רמת קושי או השוואה לאחרים בטקסט של שכבת המשחק', () => {
    const lines = [
      HUD_TEXT.barLabel(3), HUD_TEXT.streak(4), HUD_TEXT.bigChallenge, ...Object.values(RETRY_TEXT),
      END_TEXT.gemsCount(3, true), END_TEXT.firstTry(4), END_TEXT.retried(2), END_TEXT.classLine(40, 3, 72),
      END_TEXT.kickerClosed, END_TEXT.kickerOpen, END_TEXT.chapterEnd, END_TEXT.back, END_TEXT.narrativeOpen, JOURNEY_TEXT.done(3), JOURNEY_TEXT.classClosed,
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
  it('ההכרעה לפי הפריים הטיפוסי: עצירה בזמן הטעינה לא הופכת מחשב מהיר לחלש', () => {
    const frames = (gaps: number[]) => gaps.reduce<number[]>((acc, g) => [...acc, acc[acc.length - 1] + g], [0])
    /* 3 שניות ב-60, עם עצירה אחת של 1.5 שניות: הממוצע מתחת ל-40, אבל המחשב מהיר */
    const stalled = frames([...Array(100).fill(1000 / 60), 1500, ...Array(70).fill(1000 / 60)])
    expect(averageFps(stalled)).toBeLessThan(LOW_FPS)
    expect(probeVerdict(stalled)).toBe('ok')
    /* מחשב חלש: 28 פריימים בשנייה לאורך כל המדידה */
    expect(probeVerdict(frames(Array(84).fill(1000 / 28)))).toBe('slow')
    expect(medianFrameMs(frames([10, 30, 20]))).toBe(20)
  })
  it('דפדפן שכמעט לא מצייר (חלון מכוסה) או לשונית מוסתרת: אין מסקנה', () => {
    const frames = (gaps: number[]) => gaps.reduce<number[]>((acc, g) => [...acc, acc[acc.length - 1] + g], [0])
    expect(probeVerdict(frames([1000, 1000, 1000]))).toBe('throttled')
    expect(probeVerdict(frames(Array(180).fill(1000 / 60)), false)).toBe('throttled')
    expect(THROTTLED_FRAME_MS).toBeGreaterThan(1000 / 20)
  })
  it('כמויות האפקטים עולות עם העוצמה', () => {
    expect(LEVELS.gentle.confetti).toBeLessThan(LEVELS.medium.confetti)
    expect(LEVELS.medium.confetti).toBeLessThan(LEVELS.full.confetti)
  })
})
