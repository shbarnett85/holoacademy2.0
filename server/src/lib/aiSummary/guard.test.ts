import { describe, expect, it } from 'vitest'
import { CAUTION_RE, GUARD_LIMITS, nameRegexes, parseAndGuard, type ViolationCode } from './guard.js'
import type { SummaryInput } from './inputs.js'
import { CAUTION_PHRASES } from './prompt.js'

/* טבלת מקרים לשומר הפלט (חוקים 1, 2, 6, 7, 12): טוב עובר, כל הפרה נתפסת בקוד הנכון, וניסוחים תקינים בקרבת מילים אסורות לא נתפסים */
const input: SummaryInput = {
  scope: 'student', audience: 'full', gender: null, gradeLabel: 'ו׳', sampleSize: 46, sampleUnit: 'sessions', counts: { sessions: 46 },
  facts: [
    { id: 'f1', kind: 'level', tone: 'neutral', text: 'בעברית הרמה הנוכחית היא 11.5 (בתוך הטווח המיועד לשכבה), על סמך 46 הדמיות.', numbers: [11.5, 46] },
    { id: 'f2', kind: 'trend', tone: 'attention', text: 'בהיסטוריה המגמה האחרונה: בירידה.', numbers: [] },
    { id: 'f3', kind: 'finding', tone: 'attention', text: 'ההצלחה הממוצעת ב-8 ההדמיות האחרונות — 49%, לעומת 74% ב-23 ההדמיות שלפניהן.', numbers: [8, 49, 74, 23] },
  ],
}

const resp = (...paragraphs: { text: string; facts?: string[] }[]): string =>
  JSON.stringify({ paragraphs: paragraphs.map((p) => ({ text: p.text, facts: p.facts ?? ['f1'] })) })
const GOOD_TEXT = 'לפי הנתונים, הרמה הנוכחית בעברית היא 11.5 והיא בתוך הטווח המיועד לשכבה.'
const codes = (raw: string, names: string[] = []): ViolationCode[] => [...new Set(parseAndGuard(raw, input, { knownNames: names }).violations.map((v) => v.code))].sort()

describe('שומר הפלט: פלט תקין עובר', () => {
  it('שתי פסקאות עם עובדות, מספרים מהעובדות המצוטטות וסימון זהירות', () => {
    const g = parseAndGuard(resp({ text: GOOD_TEXT }, { text: 'נראה שבהיסטוריה יש ירידה אחרונה, ואפשר לקיים שיחה קצרה ולעקוב שוב בעוד כמה שבועות.', facts: ['f2'] }), input)
    expect(g.violations).toEqual([])
    expect(g.ok).toBe(true)
    expect(g.paragraphs).toHaveLength(2)
    expect(g.cited).toEqual([['f1'], ['f2']])
  })

  it('גודל המדגם מותר גם בלי ציטוט עובדה שמכילה אותו', () => {
    expect(codes(resp({ text: 'הנתונים מראים שהסיכום מבוסס על 46 הדמיות בעברית, ללא שינוי בולט.', facts: ['f2'] }))).toEqual([])
  })

  it('גדרות קוד וטקסט פתיחה מסביב ל-JSON אינם מפילים (כמו extractJson)', () => {
    expect(parseAndGuard('```json\n' + resp({ text: GOOD_TEXT }) + '\n```', input).ok).toBe(true)
    expect(parseAndGuard('בטח, הנה הסיכום: ' + resp({ text: GOOD_TEXT }) + ' בהצלחה!', input).ok).toBe(true)
  })

  it('ניסוחים תקינים בקרבת מילים אסורות לא נתפסים', () => {
    for (const ok of [
      'הנתונים אינם מסבירים את הסיבה, ולכן נראה ש-11.5 הוא נקודת ייחוס בלבד.',
      'נראה שההצלחה עקבית: 49% מול 74% בהדמיות שלפניהן, לפי הנתונים בלבד.',
      'לפי הנתונים, חלק מההדמיות מאתגרות יותר, ו-8 מהן נצפו לאחרונה.',
      'ייתכן שהתמונה חלקית: מבוסס על 46 הדמיות בלבד.',
    ]) expect(codes(resp({ text: ok, facts: ['f1', 'f3'] })), ok).toEqual([])
  })
})

describe('שומר הפלט: כל הפרה נתפסת בקוד שלה', () => {
  const bad: { name: string; raw: string; code: ViolationCode }[] = [
    { name: 'לא JSON', raw: 'מצטער, אין לי תשובה', code: 'json' },
    { name: 'JSON בלי paragraphs', raw: '{"text":"x"}', code: 'shape' },
    { name: 'מערך ריק', raw: '{"paragraphs":[]}', code: 'shape' },
    { name: 'פסקה בלי text', raw: '{"paragraphs":[{"facts":["f1"]}]}', code: 'shape' },
    { name: '5 פסקאות', raw: resp(...Array.from({ length: 5 }, () => ({ text: GOOD_TEXT }))), code: 'paragraph_count' },
    { name: 'בלי עובדות', raw: JSON.stringify({ paragraphs: [{ text: GOOD_TEXT, facts: [] }] }), code: 'no_facts' },
    { name: 'מזהה עובדה לא קיים', raw: resp({ text: GOOD_TEXT, facts: ['f1', 'f99'] }), code: 'unknown_fact' },
    { name: 'מספר שאינו בעובדות', raw: resp({ text: 'לפי הנתונים, הרמה היא 12.5.' }), code: 'number_not_in_facts' },
    { name: 'מספר מעובדה שלא צוטטה', raw: resp({ text: 'לפי הנתונים, ההצלחה הייתה 74%.', facts: ['f1'] }), code: 'number_not_in_facts' },
    { name: 'מספר מחושב (עיגול)', raw: resp({ text: 'לפי הנתונים, הרמה היא כמעט 12.', facts: ['f1'] }), code: 'number_not_in_facts' },
    { name: 'מונח טכני', raw: resp({ text: 'לפי הנתונים, השינוי מובהק מבחינה סטטיסטית.' }), code: 'forbidden_ui' },
    { name: 'וקטור', raw: resp({ text: 'לפי הנתונים, הווקטור של הבנת מושגים גבוה.' }), code: 'forbidden_ui' },
    { name: 'שפה קלינית: הפרעה', raw: resp({ text: 'נראה שיש הפרעת קשב.' }), code: 'clinical' },
    { name: 'שפה קלינית: דיסלקציה', raw: resp({ text: 'ייתכן שיש דיסלקציה.' }), code: 'clinical' },
    { name: 'שפה קלינית: אבחנה', raw: resp({ text: 'נראה שהתלמיד אובחן בעבר.' }), code: 'clinical' },
    { name: 'תיוג שיפוטי: עצלן', raw: resp({ text: 'נראה שהתלמיד עצלן.' }), code: 'judgmental' },
    { name: 'תיוג שיפוטי: חלש', raw: resp({ text: 'נראה שהתלמיד חלש בעברית.' }), code: 'judgmental' },
    { name: 'תיוג שיפוטי: בעייתי', raw: resp({ text: 'נראה שיש התנהגות בעייתית.' }), code: 'judgmental' },
    { name: 'סיבתי: בגלל', raw: resp({ text: 'נראה שהרמה ירדה בגלל חוסר מוטיבציה.' }), code: 'causal' },
    { name: 'סיבתי: עקב', raw: resp({ text: 'נראה שהרמה ירדה עקב עייפות.' }), code: 'causal' },
    { name: 'סיבתי: הסיבה היא', raw: resp({ text: 'ייתכן שהסיבה לכך היא קושי בקריאה.' }), code: 'causal' },
    { name: 'סיבתי: נגרם', raw: resp({ text: 'נראה שהשינוי נגרם משינוי בכיתה.' }), code: 'causal' },
    { name: 'השוואה לתלמידים אחרים', raw: resp({ text: 'לפי הנתונים, הרמה נמוכה בהשוואה לשאר התלמידים.' }), code: 'comparison' },
    { name: 'השוואה: הטוב ביותר', raw: resp({ text: 'נראה שזה התלמיד הטוב ביותר בכיתה.' }), code: 'comparison' },
    { name: 'הערכת מורה', raw: resp({ text: 'נראה שהמורה חלש בהוראת הנושא.' }), code: 'comparison' },
    { name: 'בלי סימון זהירות', raw: resp({ text: 'הרמה הנוכחית בעברית היא 11.5.' }), code: 'no_caution' },
    { name: 'Markdown: כוכביות', raw: resp({ text: 'לפי הנתונים, **הרמה** עלתה.' }), code: 'markdown' },
    { name: 'Markdown: כותרת', raw: resp({ text: '# סיכום\nלפי הנתונים, הרמה יציבה.' }), code: 'markdown' },
    { name: 'Markdown: רשימה', raw: resp({ text: 'לפי הנתונים:\n- הרמה יציבה\n- אין ירידה' }), code: 'markdown' },
    { name: 'קישור', raw: resp({ text: 'לפי הנתונים, הרמה יציבה, ראו https://example.com.' }), code: 'markdown' },
    { name: 'אימוג׳י', raw: resp({ text: 'לפי הנתונים, הרמה יציבה ✅' }), code: 'emoji' },
    { name: 'placeholder', raw: resp({ text: 'לפי הנתונים, [[שם]] השתפר.' }), code: 'placeholder' },
    { name: 'לא בעברית', raw: resp({ text: 'According to the data, the level is stable overall.' }), code: 'language' },
    { name: 'פסקה ארוכה מדי', raw: resp({ text: `לפי הנתונים, ${'הרמה יציבה '.repeat(90)}` }), code: 'paragraph_length' },
  ]
  for (const c of bad) {
    it(c.name, () => {
      expect(codes(c.raw)).toContain(c.code)
      expect(parseAndGuard(c.raw, input).ok).toBe(false)
    })
  }

  it('שמות מוכרים: שם מלא, שם פרטי עם תחילית (ל/ה/ב/ו), אבל לא תת-מחרוזת של מילה אחרת', () => {
    const names = ['דנה כהן']
    expect(codes(resp({ text: 'נראה שדנה כהן השתפרה.' }), names)).toContain('name')
    expect(codes(resp({ text: 'נראה שלדנה קשה יותר בהיסטוריה.' }), names)).toContain('name')
    expect(codes(resp({ text: 'נראה שבכיתה של כהן יש שיפור.' }), names)).toContain('name')
    expect(codes(resp({ text: 'נראה שהמדנהים אינם קשורים, והרמה יציבה.' }), names)).not.toContain('name')
    expect(nameRegexes(['גל']).length).toBe(0) /* אסימונים קצרים מ-3 אותיות לא נבדקים */
  })

  it('כל ההפרות מתועדות עם אינדקס פסקה; פסקה תקינה לצד פסקה פסולה לא מכשירה את המסמך', () => {
    const g = parseAndGuard(resp({ text: GOOD_TEXT }, { text: 'לפי הנתונים, הרמה ירדה בגלל עייפות.' }), input)
    expect(g.ok).toBe(false)
    expect(g.violations.every((v) => v.paragraph === 1)).toBe(true)
    expect(g.paragraphs).toHaveLength(2)
  })
})

describe('שומר הפלט: סימון הזהירות תואם להנחיה שהמודל מקבל', () => {
  it('כל ביטוי שמוצג למודל ב-prompt עובר את CAUTION_RE', () => {
    for (const p of CAUTION_PHRASES) expect(CAUTION_RE.test(`${p}`), p).toBe(true)
    expect(CAUTION_RE.test('הרמה יציבה.')).toBe(false)
    expect(GUARD_LIMITS.maxParagraphs).toBe(4)
  })
})
