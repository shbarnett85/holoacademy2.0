/* מודל הגבישים: נקודה לאתגר, גבישים = נקודות ÷ אפשריות × 5, מילוי ברצף, סף סגירת הסיפור, משחק חוזר */
import { describe, expect, it } from 'vitest'
import {
  bestGems, buildJourney, challengePoints, CLEAN_SUCCESS, cleanRuleOf, classGemTarget, effectLevelOf, gemFill, gemsValue,
  hasSecondTry, storyClosed, storyState, wholeGems,
} from './gemModel'

describe('נקודות לאתגר', () => {
  it('בחירה מרובה ומבחן סיכום: ניסיון ראשון 1, שני 0.5, כישלון 0', () => {
    expect(challengePoints({ type: 'multipleChoice', solved: true, solvedOnAttempt: 1 })).toBe(1)
    expect(challengePoints({ type: 'multipleChoice', solved: true, solvedOnAttempt: 2 })).toBe(0.5)
    expect(challengePoints({ type: 'multipleChoice', solved: false })).toBe(0)
  })
  it('מבחן סיכום: ממוצע השאלות, ובסך הכול נקודה אחת לכל היותר', () => {
    expect(challengePoints({ type: 'finalQuiz', solved: true, quizAttempts: [1, 1, 1, 1] })).toBe(1)
    expect(challengePoints({ type: 'finalQuiz', solved: true, quizAttempts: [1, 2, 0, 1] })).toBe(0.625)
    expect(challengePoints({ type: 'finalQuiz', solved: false, quizAttempts: [0, 0] })).toBe(0)
    expect(challengePoints({ type: 'finalQuiz', solved: false, quizAttempts: [] })).toBe(0)
  })
  it('נכון/לא נכון: אין ניסיון שני', () => {
    expect(hasSecondTry('trueFalse')).toBe(false)
    expect(hasSecondTry('multipleChoice', true)).toBe(false)
    expect(hasSecondTry('multipleChoice')).toBe(true)
    expect(hasSecondTry('finalQuiz')).toBe(true)
    expect(challengePoints({ type: 'trueFalse', solved: true })).toBe(1)
    expect(challengePoints({ type: 'trueFalse', solved: false })).toBe(0)
  })
  it.each(['memory', 'matchPairs', 'hangman', 'wordCompletion', 'tileSwap'])('%s: עד מחצית מהטעויות המותרות 1, יותר 0.5, כישלון 0', (type) => {
    expect(challengePoints({ type, solved: true, mistakes: 0, allowed: 6 })).toBe(1)
    expect(challengePoints({ type, solved: true, mistakes: 3, allowed: 6 })).toBe(1)
    expect(challengePoints({ type, solved: true, mistakes: 4, allowed: 6 })).toBe(0.5)
    expect(challengePoints({ type, solved: false, mistakes: 6, allowed: 6 })).toBe(0)
  })
  it('סידור רצף: הגשה ראשונה 1, מאוחרת 0.5', () => {
    expect(challengePoints({ type: 'sequenceOrder', solved: true, mistakes: 0 })).toBe(1)
    expect(challengePoints({ type: 'sequenceOrder', solved: true, mistakes: 2 })).toBe(0.5)
  })
  it('תפזורת: הצלחה בזמן 1, הזמן נגמר 0', () => {
    expect(challengePoints({ type: 'wordSearch', solved: true })).toBe(1)
    expect(challengePoints({ type: 'wordSearch', solved: false })).toBe(0)
  })
  it('דילמה מוסרית: תמיד 1', () => {
    expect(challengePoints({ type: 'moralDilemma', solved: false })).toBe(1)
  })
  it('יש הגדרה מפורשת לכל סוג אתגר, וסוג לא מוכר הוא ניסיון אחד', () => {
    for (const t of ['multipleChoice', 'trueFalse', 'finalQuiz', 'memory', 'sequenceOrder', 'hangman', 'wordCompletion', 'tileSwap', 'wordSearch', 'moralDilemma']) {
      expect(CLEAN_SUCCESS[t], t).toBeDefined()
    }
    expect(cleanRuleOf('somethingNew')).toBe('single')
  })
})

describe('גבישים', () => {
  it('שיעור של 5 אתגרים: כל אתגר הוא גביש', () => {
    expect([0, 1, 2, 3, 4, 5].map((p) => wholeGems(p, 5))).toEqual([0, 1, 2, 3, 4, 5])
  })
  it('שיעור של 10 אתגרים: שני אתגרים לגביש', () => {
    expect(wholeGems(5.5, 10)).toBe(2)
    expect(wholeGems(6, 10)).toBe(3)
    expect(wholeGems(10, 10)).toBe(5)
  })
  it('שיעור של 13 אתגרים: בלי שבר, ובלי שגיאת עיגול בסף', () => {
    expect(wholeGems(7.5, 13)).toBe(2)
    expect(wholeGems(7.8, 13)).toBe(3) /* 7.8÷13×5 = 3 בדיוק, אף שבנקודה צפה זה 2.9999… */
    expect(wholeGems(13, 13)).toBe(5)
    expect(Number.isInteger(wholeGems(9.5, 13))).toBe(true)
  })
  it('הצלחה אחרי טעות שווה חצי', () => {
    expect(gemsValue(0.5, 5)).toBeCloseTo(0.5)
    expect(wholeGems(0.5, 5)).toBe(0)
    expect(wholeGems(0.5 + 0.5, 5)).toBe(1)
  })
  it('מתמלאים ברצף: הראשון עד הסוף, ואז השני', () => {
    const v = gemsValue(1.5, 5)
    expect([0, 1, 2, 3, 4].map((i) => gemFill(v, i))).toEqual([1, 0.5, 0, 0, 0])
  })
  it('אין יותר מ-5, ואין חלוקה באפס', () => {
    expect(gemsValue(9, 5)).toBe(5)
    expect(gemsValue(1, 0)).toBe(0)
    expect(gemsValue(-1, 5)).toBe(0)
  })
})

describe('סוף השיעור', () => {
  it('הסף: פחות מ-3 פתוח, 3–4 נסגר, 5 נסגר עם זוהר', () => {
    expect([0, 1, 2, 3, 4, 5].map((g) => storyState(g))).toEqual(['open', 'open', 'open', 'closed', 'closed', 'radiant'])
    expect(storyClosed(2)).toBe(false)
    expect(storyClosed(3)).toBe(true)
    expect(storyClosed(5)).toBe(true)
  })
  it('שיעור בלי אתגרים: אין מה לאסוף, והסיפור נסגר', () => {
    expect(storyState(0, 0)).toBe('closed')
  })
  it('13 אתגרים, הכול אחרי טעות: 2 גבישים והסיפור פתוח', () => {
    const points = 13 * 0.5
    expect(wholeGems(points, 13)).toBe(2)
    expect(storyClosed(wholeGems(points, 13))).toBe(false)
  })
})

describe('משחק חוזר: המשחק הטוב ביותר', () => {
  it('שיפור נספר, והרעה לא מורידה', () => {
    expect(bestGems([{ gems: 2 }, { gems: 4 }])).toBe(4)
    expect(bestGems([{ gems: 4 }, { gems: 1 }])).toBe(4)
  })
  it('משחק בלי גבישים לא נספר; אין משחקים — null', () => {
    expect(bestGems([{ gems: null }, {}])).toBeNull()
    expect(bestGems([])).toBeNull()
    expect(bestGems([{ gems: 0 }])).toBe(0)
  })
})

describe('גבישי הכיתה, עוצמה ומסע', () => {
  it('היעד: 3 לתלמיד', () => {
    expect(classGemTarget(24)).toBe(72)
    expect(classGemTarget(0)).toBe(0)
  })
  it('עוצמה לא מוכרת: בינוני', () => {
    expect(effectLevelOf('full')).toBe('full')
    expect(effectLevelOf('blinding')).toBe('medium')
    expect(effectLevelOf(null)).toBe('medium')
  })
  it('מסע לכל מקצוע, לפי סדר הקבלה, עם שלושת המצבים', () => {
    const j = buildJourney([
      { id: 'b', title: 'ב', subjectCode: 'math', assignedAt: '2026-10-02', gems: null },
      { id: 'a', title: 'א', subjectCode: 'math', assignedAt: '2026-10-01', gems: 4 },
      { id: 'c', title: 'ג', subjectCode: 'math', assignedAt: '2026-10-03', gems: null, inProgress: true },
      { id: 'h', title: 'ה', subjectCode: 'history', assignedAt: '2026-10-01', gems: 0, classClosed: true },
    ])
    const math = j.find((s) => s.subjectCode === 'math')!
    expect(math.stations.map((s) => [s.id, s.state])).toEqual([['a', 'done'], ['b', 'open'], ['c', 'now']])
    expect(math.stations[0].gems).toBe(4)
    expect(j.find((s) => s.subjectCode === 'history')!.stations[0]).toMatchObject({ state: 'done', gems: 0, classClosed: true })
  })
  it('השיעור הנוכחי מסומן "עכשיו" גם אם כבר הושלם בעבר', () => {
    const j = buildJourney([{ id: 'a', title: 'א', subjectCode: null, gems: 3 }], 'a')
    expect(j[0].stations[0].state).toBe('now')
    expect(j[0].stations[0].gems).toBe(3)
  })
})
