import { describe, expect, it } from 'vitest'
import { CLASS_SUMMARY_MIN_COMPLETED } from '../../../../src/shared/lib/analyticsConfig.js'
import {
  NO_RESULTS_YET, attentionReasonText, countNb, countOf, dateHe, detailAvailableLine, israelDay, israelDayKey,
  narrateClassSummary, narrateListSummary, narrateStudentSummary, type ClassSummaryInput,
} from '../../../../src/shared/lib/findingsNarrative.js'

/* משפטי הסיכום של טאב "תוצאות" (findingsNarrative): ניסוח כנה, "X מתוך Y" צמוד, תאריכים בשעון ישראל */
const base = (o: Partial<ClassSummaryInput> = {}): ClassSummaryInput =>
  ({ total: 30, completed: 30, inProgress: 0, notStarted: 0, avgSolvedShare: 0.9, totalChallenges: 5, hardest: null, ...o })
const hardest = (o: Partial<NonNullable<ClassSummaryInput['hardest']>> = {}): NonNullable<ClassSummaryInput['hardest']> =>
  ({ title: 'סדר האירועים', attempted: 20, wrong: 12, topErrorOptionText: 'התשובה השלישית', topErrorCount: 9, ...o })

describe('תאריכים בלוח השנה של ישראל', () => {
  it('19 באוקטובר 22:30Z הוא 20 באוקטובר בישראל', () => {
    expect(dateHe('2026-10-19T22:30:00.000Z')).toBe('20 באוקטובר 2026')
    expect(israelDayKey('2026-10-19T22:30:00.000Z')).toBe('2026-10-20')
    expect(israelDay('2026-10-19T22:30:00.000Z')).toEqual({ year: 2026, month: 10, day: 20 })
  })
  it('21:00Z (קיץ, UTC+3) הוא חצות; 20:59Z עדיין היום הקודם', () => {
    expect(israelDayKey('2026-10-19T20:59:59.000Z')).toBe('2026-10-19')
    expect(israelDayKey('2026-10-19T21:00:00.000Z')).toBe('2026-10-20')
  })
  it('אחרי החזרה לשעון חורף (25 באוקטובר 2026) ההיסט הוא UTC+2', () => {
    expect(israelDayKey('2026-10-25T21:59:00.000Z')).toBe('2026-10-25')
    expect(israelDayKey('2026-10-25T22:00:00.000Z')).toBe('2026-10-26')
    expect(dateHe('2026-12-31T22:30:00.000Z')).toBe('1 בינואר 2027')
  })
  it('השוואת מפתחות היום היא השוואת מחרוזות (גם חוצה שנה)', () => {
    expect(israelDayKey('2026-12-31T21:59:00Z')! < israelDayKey('2026-12-31T22:00:00Z')!).toBe(true)
  })
  it('תאריך לא תקין → ריק / null (בלי NaN בטקסט)', () => {
    expect(dateHe('לא תאריך')).toBe('')
    expect(israelDayKey('לא תאריך')).toBeNull()
  })
  it('"פירוט התשובות זמין" משתמש באותו יום', () => {
    expect(detailAvailableLine('2026-10-19T22:30:00.000Z')).toBe('פירוט התשובות זמין להדמיות שנשלחו מ-20 באוקטובר 2026')
  })
})

describe('"X מתוך Y"', () => {
  it('countNb צמוד ב-U+00A0; countOf (לממשק) נשאר עם רווחים רגילים', () => {
    expect(countNb(3, 6)).toBe('3\u00A0מתוך\u00A06')
    expect(countOf(3, 6)).toBe('3 מתוך 6')
  })
})

describe('סיכום כיתה: כולם סיימו', () => {
  it('הניסוח הכיתתי לפי החלק', () => {
    expect(narrateClassSummary(base({ avgSolvedShare: 0.75 }))).toBe('רוב הכיתה הצליחה.')
    expect(narrateClassSummary(base({ avgSolvedShare: 0.5 }))).toBe('חלק מהכיתה התקשה.')
    expect(narrateClassSummary(base({ avgSolvedShare: 0.49 }))).toBe('הכיתה התקשתה בהדמיה.')
  })
  it('האתגר הקשה: "לא הצליחו", והאפשרות הנבחרת במרכאות', () => {
    const s = narrateClassSummary(base({ hardest: hardest() }))
    expect(s).toBe(`רוב הכיתה הצליחה. האתגר הקשה ביותר: סדר האירועים. ${countNb(12, 20)} לא הצליחו, ורובם בחרו ב״התשובה השלישית״.`)
  })
  it('אם הנבחרת אינה רוב מהמי שלא הצליחו: "ו-N מהם בחרו ב״…״"', () => {
    const s = narrateClassSummary(base({ hardest: hardest({ topErrorCount: 5 }) }))
    expect(s).toContain('ו-5 מהם בחרו ב״התשובה השלישית״.')
  })
  it('בלי אפשרות נבחרת חוזרת: רק הספירה', () => {
    expect(narrateClassSummary(base({ hardest: hardest({ topErrorCount: 1 }) }))).toMatch(/לא הצליחו\.$/)
    expect(narrateClassSummary(base({ hardest: hardest({ topErrorOptionText: null, topErrorCount: 0 }) }))).toMatch(/לא הצליחו\.$/)
  })
})

describe('סיכום כיתה: לא כולם סיימו — לא מכליל מעבר למי שסיימו', () => {
  it('מספיק מי שסיימו: "עד עכשיו סיימו X מתוך Y." ואז משפט רק עליהם', () => {
    expect(narrateClassSummary(base({ completed: 12, avgSolvedShare: 0.8 }))).toBe(`עד עכשיו סיימו ${countNb(12, 30)}. רובם הצליחו.`)
    expect(narrateClassSummary(base({ completed: 12, avgSolvedShare: 0.6 }))).toBe(`עד עכשיו סיימו ${countNb(12, 30)}. חלקם התקשו.`)
    expect(narrateClassSummary(base({ completed: 12, avgSolvedShare: 0.2 }))).toBe(`עד עכשיו סיימו ${countNb(12, 30)}. הם התקשו בהדמיה.`)
  })
  it(`פחות מ-${CLASS_SUMMARY_MIN_COMPLETED} שסיימו: רק כמה סיימו, בלי "רוב", ובלי "האתגר הקשה ביותר"`, () => {
    const s = narrateClassSummary(base({ completed: 1, avgSolvedShare: 1, hardest: hardest() }))
    expect(s).toBe(`עד עכשיו סיימו ${countNb(1, 30)}. עוד אין מספיק תוצאות כדי לסכם את הכיתה.`)
    expect(s).not.toMatch(/רוב|הצליחה|הקשה ביותר/)
  })
  it('האתגר הקשה מופיע רק כשיש מספיק תוצאות', () => {
    expect(narrateClassSummary(base({ completed: CLASS_SUMMARY_MIN_COMPLETED, avgSolvedShare: 0.5, hardest: hardest() }))).toContain('האתגר הקשה ביותר')
  })
  it('שורת הרשימה נושאת את אותו סייג', () => {
    expect(narrateListSummary(base({ completed: 12, avgSolvedShare: 0.8 }))).toBe('רוב מי שסיימו עד עכשיו הצליחו.')
    expect(narrateListSummary(base({ completed: 12, avgSolvedShare: 0.6 }))).toBe('חלק ממי שסיימו עד עכשיו התקשו.')
    expect(narrateListSummary(base({ completed: 12, avgSolvedShare: 0.2 }))).toBe('מי שסיימו עד עכשיו התקשו בהדמיה.')
    expect(narrateListSummary(base({ completed: 12, avgSolvedShare: 0.8, hardest: hardest() }))).toBe('רוב מי שסיימו עד עכשיו הצליחו. הקשה ביותר: סדר האירועים.')
    expect(narrateListSummary(base({ completed: 1, avgSolvedShare: 1 }))).toBe(`עד עכשיו סיימו ${countNb(1, 30)}.`)
    expect(narrateListSummary(base({ avgSolvedShare: 0.9 }))).toBe('רוב הכיתה הצליחה.')
  })
})

describe('אף אחד לא סיים', () => {
  it('אותו משפט "מה יקרה" בכיתה, ברשימה ובתלמיד/ה', () => {
    expect(NO_RESULTS_YET).toBe('התוצאות יופיעו כאן כשיסיימו.')
    expect(narrateClassSummary(base({ completed: 0, avgSolvedShare: null }))).toBe(`עוד אף תלמיד לא התחיל את ההדמיה. ${NO_RESULTS_YET}`)
    expect(narrateClassSummary(base({ completed: 0, inProgress: 3, avgSolvedShare: null }))).toBe(`3 תלמידים באמצע ההדמיה. ${NO_RESULTS_YET}`)
    expect(narrateClassSummary(base({ completed: 0, inProgress: 1, avgSolvedShare: null }))).toBe(`אחד התלמידים באמצע ההדמיה. ${NO_RESULTS_YET}`)
    expect(narrateListSummary(base({ completed: 0, avgSolvedShare: null }))).toBe(`עוד לא התחילו. ${NO_RESULTS_YET}`)
    expect(narrateStudentSummary({ firstName: 'דנה', status: 'not_started', totalChallenges: 4, attempted: 0, solved: 0, gaveUp: 0 })).toBe(`דנה עוד לא התחיל/ה את ההדמיה. ${NO_RESULTS_YET}`)
    expect(narrateStudentSummary({ firstName: 'דנה', status: 'in_progress', totalChallenges: 4, attempted: 0, solved: 0, gaveUp: 0 })).toBe(`דנה באמצע ההדמיה. ${NO_RESULTS_YET}`)
  })
})

describe('הדמיה בלי אתגרים שאפשר למדוד', () => {
  it('כיתה: "X מתוך Y סיימו את ההדמיה; אין בה אתגרים שאפשר למדוד" — גם כש-avgSolvedShare ריק', () => {
    const s = narrateClassSummary(base({ completed: 4, total: 30, avgSolvedShare: null, totalChallenges: 0 }))
    expect(s).toBe(`${countNb(4, 30)} סיימו את ההדמיה; אין בה אתגרים שאפשר למדוד.`)
  })
  it('רשימה', () => {
    expect(narrateListSummary(base({ completed: 4, avgSolvedShare: null, totalChallenges: 0 }))).toBe(`${countNb(4, 30)} סיימו את ההדמיה.`)
  })
  it('אף אחד לא סיים → ההודעה הרגילה (גם בהדמיה בלי אתגרים)', () => {
    expect(narrateClassSummary(base({ completed: 0, avgSolvedShare: null, totalChallenges: 0 }))).toContain('עוד אף תלמיד לא התחיל')
  })
  it('תלמיד/ה: בלא סעיף "פתר/ה"', () => {
    expect(narrateStudentSummary({ firstName: 'דנה', status: 'completed', totalChallenges: 0, attempted: 0, solved: 0, gaveUp: 0 })).toBe('דנה סיים/ה את ההדמיה; אין בה אתגרים שאפשר למדוד.')
  })
  it('totalChallenges לא ידוע (חסר) → ההתנהגות הרגילה', () => {
    expect(narrateClassSummary(base({ totalChallenges: undefined, avgSolvedShare: 0.8 }))).toBe('רוב הכיתה הצליחה.')
  })
})

describe('סיכום תלמיד/ה', () => {
  const s = (o: Partial<Parameters<typeof narrateStudentSummary>[0]> = {}) =>
    narrateStudentSummary({ firstName: 'אבי', status: 'completed', totalChallenges: 4, attempted: 4, solved: 3, gaveUp: 0, ...o })
  it('יחיד / רבים', () => {
    expect(s({ totalChallenges: 1, solved: 1 })).toBe(`אבי פתר/ה ${countNb(1, 1)} אתגר.`)
    expect(s({ totalChallenges: 4 })).toBe(`אבי פתר/ה ${countNb(3, 4)} אתגרים.`)
    expect(s({ status: 'in_progress', attempted: 1, solved: 1 })).toBe(`אבי באמצע ההדמיה: פתר/ה ${countNb(1, 1)} אתגר עד עכשיו.`)
    expect(s({ status: 'in_progress', attempted: 2, solved: 1 })).toBe(`אבי באמצע ההדמיה: פתר/ה ${countNb(1, 2)} אתגרים עד עכשיו.`)
  })
  it('סיבות תשומת לב במילים (לפי attentionReasonText), ללא "עוד לא התחיל/ה" כפול', () => {
    expect(s({ gaveUp: 2, solved: 1, attentionReasons: ['gave_up_often', 'low_success'] }))
      .toBe(`אבי פתר/ה ${countNb(1, 4)} אתגרים. ויתר/ה על 2. לתשומת לב: ${attentionReasonText('gave_up_often')}, ${attentionReasonText('low_success')}.`)
    expect(s({ attentionReasons: [] })).toBe(`אבי פתר/ה ${countNb(3, 4)} אתגרים.`)
    expect(s({ status: 'not_started', attentionReasons: ['not_started'] })).toBe(`אבי עוד לא התחיל/ה את ההדמיה. ${NO_RESULTS_YET}`)
  })
})
