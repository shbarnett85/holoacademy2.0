import { describe, expect, it } from 'vitest'
import {
  FORBIDDEN_AI_OUTPUT, FORBIDDEN_CAUSAL, FORBIDDEN_CLINICAL, FORBIDDEN_COMPARISON, FORBIDDEN_JUDGMENTAL, FORBIDDEN_UI_TERMS, forbiddenHits,
  type ForbiddenTerm,
} from './forbiddenTerms'

const flags = (l: readonly ForbiddenTerm[]): boolean => l.every((t) => !t.re.global && !t.re.sticky)

describe('forbiddenTerms: מקור אמת יחיד לרשימות המונחים האסורים', () => {
  it('רשימת המונחים הטכניים כמות שהייתה ב-forbiddenWords.test.ts (22 מונחים, אותם שמות)', () => {
    expect(FORBIDDEN_UI_TERMS.map((t) => t.name)).toEqual([
      'וקטור', 'p (עצמאית)', 'מובהק', 'BH', 'Benjamini', 'אינדקס', 'קורלציה', 'הסתברות', 'גודל אפקט', 'אפקט',
      'סטטיסטי', 'פוסטריורי', 'השערה', 'מתוקן', 'N =', 'מסיח', 'נורמה', 'ריבוע', 'סטיית תקן', 'רגרסיה', 'אחוזון', 'חציון',
    ])
  })

  it('כל הביטויים בלי דגל g/y, כך ש-test() חסר מצב (בטוח לשימוש חוזר)', () => {
    for (const l of [FORBIDDEN_UI_TERMS, FORBIDDEN_CLINICAL, FORBIDDEN_JUDGMENTAL, FORBIDDEN_CAUSAL, FORBIDDEN_COMPARISON, FORBIDDEN_AI_OUTPUT]) expect(flags(l)).toBe(true)
    const t = FORBIDDEN_UI_TERMS[0]
    expect([t.re.test('וקטור'), t.re.test('וקטור'), t.re.test('וקטור')]).toEqual([true, true, true])
  })

  const table: { list: readonly ForbiddenTerm[]; name: string; bad: string[]; good: string[] }[] = [
    {
      list: FORBIDDEN_UI_TERMS, name: 'טכני',
      bad: ['גודל אפקט = 2.4', 'p מתוקן (BH) = 0.01', 'וקטור "הבנת מושגים"', 'מובהק סטטיסטית', 'אינדקס', 'קורלציה', 'הסתברות 90%', 'מסיח שגוי', 'מעל הנורמה', 'סטיית תקן', 'החציון הכיתתי'],
      good: ['נראה שהלחיצות היו מהירות', 'ב-5 מתוך 24 פעמים (21%)', 'פעם ראשונה', 'טעות נפוצה', 'תחום חזק'],
    },
    {
      list: FORBIDDEN_CLINICAL, name: 'קליני',
      bad: ['הפרעת קשב', 'ADHD', 'דיסלקציה', 'דיסגרפיה', 'דיכאון', 'חרדה', 'אובחן', 'אובחנה', 'אבחנה', 'אבחון', 'מאבחנת', 'תסמונת', 'ליקוי למידה', 'לקות למידה', 'אוטיזם', 'בעיית קשב', 'בעיות ריכוז'],
      good: ['קשב לקריאה', 'הבנת הנקרא', 'ריכוז הדמיות', 'הנתונים אינם מסבירים'],
    },
    {
      list: FORBIDDEN_JUDGMENTAL, name: 'שיפוטי',
      bad: ['עצלן', 'עצלנות', 'מפגר', 'טיפש', 'בעייתי', 'בעייתית', 'חלש', 'חלשה', 'חלשים', 'החלש בכיתה', 'לא מסוגל', 'אינה מסוגלת'],
      good: ['מחלשת את התמונה', 'בעיה אחת בשאלה', 'חלוקה לשלוש רמות', 'ההתקדמות איטית'],
    },
    {
      list: FORBIDDEN_CAUSAL, name: 'סיבתי',
      bad: ['בגלל חוסר מוטיבציה', 'ובגלל זה', 'עקב עייפות', 'ועקב כך', 'בשל קושי', 'כתוצאה מהשינוי', 'נובע מחוסר קשב', 'נגרם משינוי', 'הסיבה היא קושי', 'הסיבה לכך היא עייפות', 'מפני שהתקשה', 'משום שלא התאמץ', 'מכיוון שהיה לחוץ'],
      good: ['הנתונים אינם מסבירים את הסיבה', 'ייתכן שהסיבה אינה קשורה למקצוע', 'התלמיד עקבי', 'ההדמיה בשלה', 'פני השטח', 'עקבות'],
    },
    {
      list: FORBIDDEN_COMPARISON, name: 'השוואתי',
      bad: ['בהשוואה לשאר התלמידים', 'בהשוואה לשאר הכיתה', 'שאר התלמידים', 'התלמיד הטוב ביותר', 'הכיתה החלשה ביותר', 'המורה חלש', 'שהמורה טוב'],
      good: ['לעומת ההדמיות שלפניהן', 'המורה יכול לשוחח עם התלמיד', 'בשאר המקצועות'],
    },
  ]
  for (const t of table) {
    it(`${t.name}: נתפס / לא נתפס`, () => {
      for (const b of t.bad) expect(forbiddenHits(b, t.list).length, b).toBeGreaterThan(0)
      for (const g of t.good) expect(forbiddenHits(g, t.list), g).toEqual([])
    })
  }

  it('FORBIDDEN_AI_OUTPUT = איחוד כל הרשימות; forbiddenHits ברירת מחדל = הטכנית', () => {
    expect(FORBIDDEN_AI_OUTPUT.length).toBe([FORBIDDEN_UI_TERMS, FORBIDDEN_CLINICAL, FORBIDDEN_JUDGMENTAL, FORBIDDEN_CAUSAL, FORBIDDEN_COMPARISON].reduce((n, l) => n + l.length, 0))
    expect(forbiddenHits('וקטור')).toEqual(['וקטור'])
    expect(forbiddenHits('וקטור', FORBIDDEN_CLINICAL)).toEqual([])
    expect(forbiddenHits('נראה שהכול בסדר', FORBIDDEN_AI_OUTPUT)).toEqual([])
  })
})
