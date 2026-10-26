import { describe, expect, it } from 'vitest'
import { TERM_RE, overlap, slotProblem, termCount, termSlots } from './lessonTermRewrite.js'

describe('TERM — רק צורות המילה "הדמיה"', () => {
  it('תופס הדמיה / הדמיות / הדמיית, עם תחיליות ובכתיב עם שתי יודים', () => {
    for (const s of ['הדמיה', 'ההדמיה', 'בהדמיה', 'להדמיות', 'הדמיות', 'הדמיית חזרה', 'וההדמיה', 'שהדמייה', 'מהדמיות']) expect(TERM_RE.test(s), s).toBe(true)
  })
  it('לא תופס מילים אחרות שמתחילות באותן אותיות: דמיון, דמים, דמיונית', () => {
    for (const s of ['הדמיון', 'הדמיונית', 'הדמיונות', 'מרי הדמים', 'דמיון', 'הדמיה'.slice(0, 4)]) expect(TERM_RE.test(s), s).toBe(false)
  })
  it('termCount סופר מופעים', () => { expect(termCount('ההדמיה והדמיות ועוד הדמיון')).toBe(2) })
})

describe('termSlots — מחרוזות עם המונח בתוך game_data', () => {
  const gd = {
    entrySceneId: 's0',
    objectives: [{ id: 'obj_1', text: 'להבין את ההדמיה' }],
    scenes: [
      { id: 's0', narrative: 'ברוכים הבאים להדמיה', imagePrompt: 'a hall of simulation הדמיה' },
      { id: 's1', puzzle: { type: 'multipleChoice', question: 'מה קורה בהדמיה?', choices: [{ id: 'a', text: 'כלום', isCorrect: true }] } },
    ],
    endingBad: { narrative: 'זו רק הדמיה' },
    factCheck: { warnings: ['נמצאה בעיה בהדמיה'] },
  }
  it('מוצא את כולן עם נתיב ומזהה סצנה; מתעלם ממזהים ומהנחיות תמונה', () => {
    const slots = termSlots(gd)
    expect(slots.map((s) => s.key).sort()).toEqual(['endingBad.narrative', 'factCheck.warnings.0', 'objectives.0.text', 'scenes.0.narrative', 'scenes.1.puzzle.question'].sort())
    expect(slots.find((s) => s.key === 'scenes.1.puzzle.question')!.sceneId).toBe('s1')
    expect(slots.find((s) => s.key === 'endingBad.narrative')!.sceneId).toBe('__endingBad__')
    expect(slots.find((s) => s.key === 'objectives.0.text')!.sceneId).toBeNull()
  })
  it('set כותב למקום הנכון ולא נוגע בשאר', () => {
    const copy = JSON.parse(JSON.stringify(gd)) as typeof gd
    termSlots(copy).find((s) => s.key === 'scenes.0.narrative')!.set('ברוכים הבאים לשיעור')
    expect(copy.scenes[0].narrative).toBe('ברוכים הבאים לשיעור')
    expect(copy.scenes[0].imagePrompt).toBe(gd.scenes[0].imagePrompt)
    expect(termSlots(copy)).toHaveLength(4)
  })
})

describe('slotProblem — אימות מחרוזת שנכתבה מחדש', () => {
  const before = 'ההדמיה נשלחה לכיתה ו׳2 ב-12 ביוני, והיא כוללת 5 אתגרים חדשים.'
  it('כתיבה תקינה (התאמה בזכר) עוברת', () => {
    expect(slotProblem(before, 'השיעור נשלח לכיתה ו׳2 ב-12 ביוני, והוא כולל 5 אתגרים חדשים.')).toBeNull()
  })
  it('נדחה: מונח שנשאר, ספרות ששונו, סוגריים/קווים תחתונים, ריק, חסר', () => {
    expect(slotProblem(before, 'ההדמיה נשלחה לכיתה ו׳2 ב-12 ביוני, והיא כוללת 5 אתגרים חדשים.')).toMatch(/נשאר/)
    expect(slotProblem(before, 'השיעור נשלח לכיתה ו׳2 ב-13 ביוני, והוא כולל 5 אתגרים חדשים.')).toMatch(/ספרות/)
    expect(slotProblem('השלימו ___ במשפט {DR_HOLO} של ההדמיה', 'השלימו במשפט {DR_HOLO} של השיעור')).toMatch(/סוגריים/)
    expect(slotProblem(before, '   ')).toMatch(/ריקה/)
    expect(slotProblem(before, undefined)).toMatch(/לא החזיר/)
  })
  it('נדחה: התרחקות מהמקור (כתיבה חופשית) או אורך שונה בהרבה', () => {
    const plain = 'ההדמיה נשלחה לכיתה והמורים רבים בחרו בה היום בבוקר'
    expect(slotProblem(plain, 'מורה יקר זהו שיעור מרתק שכדאי לנסות עם הכיתה בהקדם האפשרי השבוע')).toMatch(/התרחק|אורך/)
    expect(slotProblem(plain, 'שיעור')).toMatch(/אורך/)
  })
  it('מחרוזת קצרה (פחות מ-5 מילים) לא נבדקת בחפיפה', () => {
    expect(slotProblem('הדמיה חדשה:', 'שלב חדש:')).toBeNull()
  })
  it('overlap', () => {
    expect(overlap('א ב ג ד', 'א ב ג ד')).toBe(1)
    expect(overlap('א ב ג ד', 'ה ו ז ח')).toBe(0)
    expect(overlap('א ב ג ד', 'א ב ו ז')).toBe(0.5)
  })
})
