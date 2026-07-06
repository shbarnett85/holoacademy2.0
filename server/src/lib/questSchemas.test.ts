import { describe, it, expect } from 'vitest'
import {
  assertedTrueFalseAnswer,
  markedTrueFalseAnswer,
  mcExplanationMismatch,
  checkAnswerConsistency,
  healStaleFactCheck,
  collectOpenWarnings,
  FACT_CHECK_STALE_MS,
  type FactCheckMeta,
  type GameData,
} from './questSchemas.js'

/* בונה GameData מינימלי עם סצנה-חידה אחת */
function gdWith(puzzle: Record<string, unknown>): GameData {
  return { scenes: [{ id: 's1', title: 'בדיקה', puzzle }], entrySceneId: 's1' } as unknown as GameData
}
const tf = (correctIsTrue: boolean, ec?: string, ei?: string, question = 'היגד כלשהו.') => ({
  type: 'trueFalse', question,
  choices: [
    { id: 'a', text: 'נכון', isCorrect: correctIsTrue },
    { id: 'b', text: 'לא נכון', isCorrect: !correctIsTrue },
  ],
  explanationCorrect: ec, explanationIncorrect: ei,
})

describe('markedTrueFalseAnswer', () => {
  it('מסומן נכון → true, לא נכון → false', () => {
    expect(markedTrueFalseAnswer([{ text: 'נכון', isCorrect: true }, { text: 'לא נכון', isCorrect: false }])).toBe('true')
    expect(markedTrueFalseAnswer([{ text: 'נכון', isCorrect: false }, { text: 'לא נכון', isCorrect: true }])).toBe('false')
  })
  it('אין isCorrect / טקסט לא-סטנדרטי → null', () => {
    expect(markedTrueFalseAnswer([{ text: 'נכון', isCorrect: false }, { text: 'לא נכון', isCorrect: false }])).toBeNull()
    expect(markedTrueFalseAnswer([{ text: 'אולי', isCorrect: true }, { text: 'בכלל לא', isCorrect: false }])).toBeNull()
  })
})

describe('assertedTrueFalseAnswer — "לא נכון" לא נקרא בטעות כ"נכון"', () => {
  it('explanationIncorrect "התשובה הנכונה היא לא נכון" → false', () => {
    expect(assertedTrueFalseAnswer(undefined, 'התשובה הנכונה היא לא נכון. כי...')).toBe('false')
  })
  it('explanationIncorrect "התשובה הנכונה היא נכון" → true', () => {
    expect(assertedTrueFalseAnswer(undefined, 'התשובה הנכונה היא נכון. כי...')).toBe('true')
  })
  it('explanationCorrect "נכון מאוד שזה לא נכון" → false', () => {
    expect(assertedTrueFalseAnswer('נכון מאוד שזה לא נכון! השמש היא כוכב', undefined)).toBe('false')
  })
  it('ללא תבנית מזוהה → null (אפס false-positive)', () => {
    expect(assertedTrueFalseAnswer('הסבר כללי בלי הצהרת תשובה', 'עוד הסבר')).toBeNull()
    expect(assertedTrueFalseAnswer(undefined, undefined)).toBeNull()
  })
})

describe('checkAnswerConsistency — נכון/לא-נכון (חוסם)', () => {
  it('חידה עקבית (מסומן נכון + הסבר מצהיר נכון) — אין חסימה', () => {
    const r = checkAnswerConsistency(gdWith(tf(true, 'נכון מאוד!', 'התשובה הנכונה היא נכון.')))
    expect(r.blocking).toHaveLength(0)
  })
  it('הבאג האמיתי (הדפוס): מסומן "לא נכון" אך ההסבר מצהיר "נכון" → חסימה', () => {
    const r = checkAnswerConsistency(gdWith(tf(false, "נכון מאוד שבחרתם 'נכון'!", 'התשובה הנכונה היא נכון. תנך גוטנברג...')))
    expect(r.blocking).toHaveLength(1)
    expect(r.blocking[0]).toContain('סותרת את ההסבר')
  })
  it('היפוך הפוך: מסומן "נכון" אך ההסבר מצהיר "לא נכון" → חסימה', () => {
    const r = checkAnswerConsistency(gdWith(tf(true, undefined, 'התשובה הנכונה היא לא נכון.')))
    expect(r.blocking).toHaveLength(1)
  })
  it('כשאי-אפשר לחלץ תשובה מההסבר — לא חוסם (שמרני)', () => {
    const r = checkAnswerConsistency(gdWith(tf(false, 'הסבר יפה', 'הסבר אחר')))
    expect(r.blocking).toHaveLength(0)
  })
  it('היגד נכון/לא-נכון המנוסח כשאלת WH ("מה…?") → אזהרה (הבאג של מערכת השמש)', () => {
    const r = checkAnswerConsistency(gdWith(tf(false, undefined, 'התשובה הנכונה היא לא נכון.', 'מה ההבדל בין כוכב לכוכב לכת?')))
    expect(r.warnings.some((w) => w.includes('מנוסח כשאלת'))).toBe(true)
  })
  it('שאלת כן/לא לגיטימית ("…נכון או לא נכון?" / "האם…?") — לא מדגל', () => {
    expect(checkAnswerConsistency(gdWith(tf(true, undefined, 'התשובה הנכונה היא נכון.', 'האם שמינית קטנה מרבע?'))).warnings).toHaveLength(0)
    expect(checkAnswerConsistency(gdWith(tf(true, undefined, 'התשובה הנכונה היא נכון.', '25% מ-200 שווה חצי מ-100. נכון או לא נכון?'))).warnings).toHaveLength(0)
  })
})

describe('checkAnswerConsistency — רב-ברירה + מבחן (אזהרה)', () => {
  it('MC שבו ההסבר מצטט אפשרות אחרת בדיוק → אזהרה', () => {
    const r = checkAnswerConsistency(gdWith({
      type: 'multipleChoice', question: 'ש?',
      choices: [
        { id: 'a', text: 'ברלין', isCorrect: true },
        { id: 'b', text: 'פריז', isCorrect: false },
      ],
      explanationIncorrect: 'התשובה הנכונה היא פריז.',
    }))
    expect(r.warnings).toHaveLength(1)
    expect(r.warnings[0]).toContain('השונה מהאפשרות המסומנת')
  })
  it('MC עקבי (ההסבר מצטט את המסומנת) — אין אזהרה', () => {
    const r = checkAnswerConsistency(gdWith({
      type: 'multipleChoice', question: 'ש?',
      choices: [
        { id: 'a', text: 'ברלין', isCorrect: true },
        { id: 'b', text: 'פריז', isCorrect: false },
      ],
      explanationIncorrect: 'התשובה הנכונה היא ברלין.',
    }))
    expect(r.warnings).toHaveLength(0)
  })
  it('MC עם פרפרזה חלקית בהסבר — לא מדגל (דיוק גבוה, לא recall)', () => {
    const r = checkAnswerConsistency(gdWith({
      type: 'multipleChoice', question: 'ש?',
      choices: [
        { id: 'a', text: 'בגלל חום השמש שמאדה את המים', isCorrect: true },
        { id: 'b', text: 'בגלל הרוח', isCorrect: false },
      ],
      explanationIncorrect: 'התשובה הנכונה היא שהשמש מחממת.',
    }))
    expect(r.warnings).toHaveLength(0)
  })
})

describe('mcExplanationMismatch', () => {
  it('null כשאין תבנית "התשובה הנכונה היא"', () => {
    expect(mcExplanationMismatch([{ text: 'א', isCorrect: true }, { text: 'ב', isCorrect: false }], 'סתם הסבר')).toBeNull()
  })
})

describe('collectOpenWarnings — שער האיכות לשיתוף', () => {
  const withMeta = (gd: GameData, meta: Record<string, unknown>): GameData => Object.assign(gd as object, meta) as GameData

  it('הדמיה נקייה → אין אזהרות', () => {
    expect(collectOpenWarnings(gdWith(tf(true, undefined, 'התשובה הנכונה היא נכון.')))).toHaveLength(0)
  })
  it('fact-check שעדיין רץ → אזהרת "טרם הסתיימה"', () => {
    const gd = withMeta(gdWith(tf(true)), { factCheck: { status: 'pending', startedAt: new Date().toISOString() } })
    expect(collectOpenWarnings(gd).some((w) => w.includes('טרם הסתיימה'))).toBe(true)
  })
  it('אזהרות fact-check + genMeta נאספות ומאוחדות (dedup)', () => {
    const gd = withMeta(gdWith(tf(true)), {
      factCheck: { status: 'done', warnings: ['אזהרה א', 'אזהרה משותפת'] },
      genMeta: { warnings: ['אזהרה משותפת', 'אזהרה ב'] },
    })
    const out = collectOpenWarnings(gd)
    expect(out).toContain('אזהרה א')
    expect(out).toContain('אזהרה ב')
    expect(out.filter((w) => w === 'אזהרה משותפת')).toHaveLength(1)
  })
  it('אזהרת עקביות חיה (עריכת מורה שיצרה ציטוט-אפשרות-אחרת) נתפסת בזמן השיתוף', () => {
    const gd = gdWith({
      type: 'multipleChoice', question: 'ש?',
      choices: [{ id: 'a', text: 'ברלין', isCorrect: true }, { id: 'b', text: 'פריז', isCorrect: false }],
      explanationIncorrect: 'התשובה הנכונה היא פריז.',
    })
    expect(collectOpenWarnings(gd).some((w) => w.includes('השונה מהאפשרות המסומנת'))).toBe(true)
  })
})

describe('healStaleFactCheck — watchdog ל-pending תקוע', () => {
  const NOW = Date.parse('2026-07-06T12:00:00Z')
  const gdWithMeta = (factCheck?: FactCheckMeta): GameData => {
    const gd = { scenes: [{ id: 's1', title: 'בדיקה' }], entrySceneId: 's1' } as unknown as GameData
    if (factCheck) (gd as unknown as { factCheck?: FactCheckMeta }).factCheck = factCheck
    return gd
  }
  const metaOf = (gd: GameData) => (gd as unknown as { factCheck?: FactCheckMeta }).factCheck

  it('pending טרי (בתוך חלון הריצה) — לא נוגע', () => {
    const gd = gdWithMeta({ status: 'pending', startedAt: new Date(NOW - 60_000).toISOString() })
    expect(healStaleFactCheck(gd, NOW)).toBe(false)
    expect(metaOf(gd)?.status).toBe('pending')
  })
  it('pending בן יותר מ-10 דקות (ריסטרט באמצע) → done+stale+אזהרה', () => {
    const gd = gdWithMeta({ status: 'pending', startedAt: new Date(NOW - FACT_CHECK_STALE_MS - 1000).toISOString() })
    expect(healStaleFactCheck(gd, NOW)).toBe(true)
    const m = metaOf(gd)
    expect(m?.status).toBe('done')
    expect(m?.stale).toBe(true)
    expect(m?.warnings?.some((w) => w.includes('לא הושלמה'))).toBe(true)
  })
  it('pending ללא startedAt (רשומה מלפני השדה) → נרפא מיד', () => {
    const gd = gdWithMeta({ status: 'pending' })
    expect(healStaleFactCheck(gd, NOW)).toBe(true)
    expect(metaOf(gd)?.status).toBe('done')
  })
  it('done / ללא מטא — לא נוגע', () => {
    const done = gdWithMeta({ status: 'done', warnings: ['קיים'] })
    expect(healStaleFactCheck(done, NOW)).toBe(false)
    expect(metaOf(done)?.warnings).toEqual(['קיים'])
    expect(healStaleFactCheck(gdWithMeta(undefined), NOW)).toBe(false)
  })
  it('אזהרות שנצברו לפני הריצה נשמרות בריפוי', () => {
    const gd = gdWithMeta({ status: 'pending', warnings: ['אזהרת יצירה קודמת'] })
    healStaleFactCheck(gd, NOW)
    expect(metaOf(gd)?.warnings?.[0]).toBe('אזהרת יצירה קודמת')
    expect(metaOf(gd)?.warnings).toHaveLength(2)
  })
})
