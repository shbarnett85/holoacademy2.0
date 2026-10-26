import { describe, expect, it } from 'vitest'
import { parseAndGuard, type ViolationCode } from './guard.js'
import type { SummaryInput } from './inputs.js'

/* ══════════════════════════════════════════════════════════════════════════
   הקשחה (סקירת R4): עקיפות שהסוקר הוכיח — ניסוחי סיבה/קליניים/שיפוטיים, מילות מספר וכמויות, ספרות מכל כתב, כיוון מגמה, שמות מקצוע,
   ניקוד ותווי אפס-רוחב, קישורים ואימייל. לכל עקיפה: נתפסת בקוד הנכון, והניסוח התקין הדומה לה עובר.
   ══════════════════════════════════════════════════════════════════════════ */
/* תווים בלתי-נראים נבנים מקוד התו (לא מוטמעים בקובץ) */
const CP200D = String.fromCodePoint(0x200d)
const CP200B = String.fromCodePoint(0x200b)
const CP202E = String.fromCodePoint(0x202e)
const CP202C = String.fromCodePoint(0x202c)
const rich: SummaryInput = {
  scope: 'submission', audience: 'full', gender: null, gradeLabel: null, sampleSize: 24, sampleUnit: 'students', counts: { completed: 24 },
  facts: [
    { id: 'f1', kind: 'count', tone: 'neutral', text: 'מתוך 24 תלמידים: 12 סיימו, 8 באמצע, 4 עוד לא התחילו.', numbers: [24, 12, 8, 4] },
    { id: 'f2', kind: 'distribution', tone: 'neutral', text: 'מבין 12 התלמידים שסיימו: 9 הצליחו ברוב האתגרים, 3 הצליחו במעט.', numbers: [12, 9, 3] },
    { id: 'f3', kind: 'trend', tone: 'positive', text: 'בעברית המגמה האחרונה: בעלייה.', numbers: [] },
    { id: 'f4', kind: 'trend', tone: 'neutral', text: 'בהיסטוריה המגמה האחרונה: יציבה.', numbers: [] },
    { id: 'f5', kind: 'challenge', tone: 'attention', text: 'אתגר 2 (חידת סדר, "השוואה בין שני אירועים"): 5 מתוך 20 הצליחו.', numbers: [2, 5, 20] },
    { id: 'f6', kind: 'level', tone: 'neutral', text: 'בהיסטוריה הרמה הנוכחית היא 8.5, על סמך 11 שיעורים.', numbers: [8.5, 11] },
  ],
}
const codesFor = (input: SummaryInput, text: string, facts: string[], names: string[] = []): ViolationCode[] =>
  [...new Set(parseAndGuard(JSON.stringify({ paragraphs: [{ text, facts }] }), input, { knownNames: names }).violations.map((v) => v.code))].sort()
const richCodes = (text: string, facts: string[], names: string[] = []): ViolationCode[] => codesFor(rich, text, facts, names)

describe('הקשחה: ניסוחי סיבה, קליניים ושיפוטיים שעברו', () => {
  const cases: { text: string; code: ViolationCode }[] = [
    { text: 'נראה שהרמה בהיסטוריה ירדה כי התלמיד עייף.', code: 'causal' },
    { text: 'ייתכן שהתוצאות נמוכות מאחר שהמשימה קשה.', code: 'causal' },
    { text: 'ייתכן שהתוצאות נמוכות היות שהמשימה קשה.', code: 'causal' },
    { text: 'נראה שבעקבות שינוי בכיתה הרמה השתנתה.', code: 'causal' },
    { text: 'נראה שהשינוי גרם לירידה.', code: 'causal' },
    { text: 'לפי הנתונים, הודות לתרגול הרמה השתפרה.', code: 'causal' },
    { text: 'ייתכן שהסיבה טמונה בעייפות.', code: 'causal' },
    { text: 'נראה שהתוצאה באשמת הטקסט הארוך.', code: 'causal' },
    { text: 'ייתכן שהקושי הוביל להתייאשות.', code: 'causal' },
    { text: 'ייתכן שיש קשיי קשב וריכוז.', code: 'clinical' },
    { text: 'ייתכן שיש פיגור התפתחותי.', code: 'clinical' },
    { text: 'נראה שיש מצוקה נפשית.', code: 'clinical' },
    { text: 'ייתכן שיועיל טיפול פסיכולוגי.', code: 'clinical' },
    { text: 'נראה שהתלמיד מתעצל.', code: 'judgmental' },
    { text: 'נראה שהתלמידה חסרת מוטיבציה.', code: 'judgmental' },
    { text: 'נראה שהתלמיד לא משקיע.', code: 'judgmental' },
    { text: 'נראה שהתלמיד מצטיין.', code: 'judgmental' },
  ]
  for (const c of cases) it(c.text, () => expect(richCodes(c.text, ['f1'])).toContain(c.code))

  it('ניסוחים תקינים בקרבת מילים אלה לא נתפסים ("נראה כי", "הנתונים אינם מסבירים מה גרם לכך")', () => {
    for (const ok of [
      'נראה כי 12 תלמידים סיימו.',
      'לפי הנתונים, 8 תלמידים באמצע; הנתונים אינם מסבירים מה גרם לכך.',
      'ייתכן כי 4 תלמידים עוד לא התחילו.',
    ]) expect(richCodes(ok, ['f1']), ok).toEqual([])
  })
})

describe('הקשחה: ניקוד, תווי אפס-רוחב וכיוון, ושמות עם תחיליות', () => {
  it('"בַּגלל" מנוקד, "בג-ZWJ-לל" עם תו אפס-רוחב, כיוון, "מוּבהק" — נתפסים; הטקסט המוחזר מנורמל', () => {
    expect(richCodes('נראה שהרמה ירדה בַּגלל עייפות.', ['f1'])).toContain('causal')
    expect(richCodes(`נראה שהרמה ירדה בג${CP200D}לל עייפות.`, ['f1'])).toContain('causal')
    expect(richCodes('נראה שהשינוי מוּבהק מאוד.', ['f1'])).toContain('forbidden_ui')
    expect(richCodes(`נראה שהרמה ירדה בג${CP202E}לל${CP202C} עייפות.`, ['f1'])).toContain('causal')
    const g = parseAndGuard(JSON.stringify({ paragraphs: [{ text: `לפי הנתונים, 12 תלמידים סִיְּימוּ.${CP200B}`, facts: ['f1'] }] }), rich)
    expect(g.paragraphs[0]).toBe('לפי הנתונים, 12 תלמידים סיימו.')
  })
  it('שם עם ניקוד, ושם עם שלוש תחיליות ("וכשדנה"), נתפסים', () => {
    expect(richCodes('נראה שכשדנה סיימה, 12 תלמידים סיימו.', ['f1'], ['דנה כהן'])).toContain('name')
    expect(richCodes('נראה וכשדנה סיימה, 12 תלמידים סיימו.', ['f1'], ['דנה כהן'])).toContain('name')
    expect(richCodes('נראה שדָּנה סיימה, 12 תלמידים סיימו.', ['f1'], ['דנה כהן'])).toContain('name')
    expect(richCodes('נראה שדנה סיימה.', ['f1'], ['דָּנה'])).toContain('name')
  })
})

describe('הקשחה: מספרים בכל צורה', () => {
  it('מילות מספר שאינן בעובדות נתפסות; כשהן בעובדות — עוברות', () => {
    expect(richCodes('לפי הנתונים, שבעה תלמידים סיימו.', ['f1'])).toContain('number_not_in_facts')
    expect(richCodes('לפי הנתונים, עשרים ושלושה תלמידים סיימו.', ['f1'])).toContain('number_not_in_facts')
    expect(richCodes('לפי הנתונים, שלוש עשרה תלמידים סיימו.', ['f1'])).toContain('number_not_in_facts')
    expect(richCodes('לפי הנתונים, תלמיד אחד סיים.', ['f1'])).toContain('number_not_in_facts')
    expect(richCodes('לפי הנתונים, ארבעה תלמידים עוד לא התחילו.', ['f1'])).toEqual([])
    expect(richCodes('לפי הנתונים, שנים עשר תלמידים סיימו.', ['f1'])).toEqual([]) /* 12 */
    expect(richCodes('לפי הנתונים, עשרים וארבעה תלמידים בכיתה.', ['f1'])).toEqual([]) /* 24 */
  })
  it('"אחד" כניסוח רגיל ("אחד התחומים") אינו מספר; "השני" סידורי אינו מספר', () => {
    expect(richCodes('לפי הנתונים, אחד התחומים בולט, ובמקום השני נמצא תחום אחר.', ['f3'])).toEqual([])
  })
  it('מילת מספר מצוטטת מכותרת בעובדה אינה המצאה ("שני אירועים")', () => {
    expect(richCodes('לפי הנתונים, באתגר "השוואה בין שני אירועים" 5 מתוך 20 הצליחו.', ['f5'])).toEqual([])
    expect(richCodes('לפי הנתונים, באתגר אחר השוואה בין שלושה אירועים הצליחה.', ['f5'])).toContain('number_not_in_facts')
  })
  it('ספרות full-width וערביות נתפסות (אחרי נרמול הן 12.5 ו-13)', () => {
    expect(richCodes('לפי הנתונים, הרמה היא １２.５.', ['f1'])).toContain('number_not_in_facts')
    expect(richCodes('לפי הנתונים, ١٢ תלמידים סיימו.', ['f1'])).toEqual([]) /* 12 הוא בעובדה f1 */
    expect(richCodes('לפי הנתונים, ١٣ תלמידים סיימו.', ['f1'])).toContain('number_not_in_facts')
  })
  it('ספרות עבריות (גימטריה) תקפות נתפסות, וקיצורים נפוצים לא', () => {
    expect(richCodes('לפי הנתונים, סיימו י״ג תלמידים.', ['f1'])).toContain('number_not_in_facts')
    expect(richCodes('לפי הנתונים, סיימו י״ב תלמידים.', ['f1'])).toEqual([])
    expect(richCodes('לפי הנתונים, 12 תלמידים סיימו (ע״י כל המשתתפים).', ['f1'])).toEqual([])
  })
  it('כמויות בלי מספר: "כחצי", "שליש", "כולם", "אף תלמיד" דורשות יחס בעובדה; "רוב" נתמך במילה בעובדה', () => {
    expect(richCodes('לפי הנתונים, כמחצית מהתלמידים סיימו.', ['f1'])).toEqual([]) /* 12 מתוך 24 */
    expect(richCodes('לפי הנתונים, כמחצית מהתלמידים הצליחו.', ['f2'])).toContain('quantity_not_in_facts') /* 9/12, 3/12 */
    expect(richCodes('לפי הנתונים, שליש מהתלמידים באמצע.', ['f1'])).toEqual([]) /* 8 מתוך 24 */
    expect(richCodes('לפי הנתונים, רק רבע מהתלמידים הצליחו במעט.', ['f2'])).toEqual([]) /* 3 מתוך 12 */
    expect(richCodes('לפי הנתונים, רוב התלמידים הצליחו.', ['f2'])).toEqual([]) /* "ברוב" בעובדה, ו-9 מתוך 12 */
    expect(richCodes('נראה שרוב התלמידים נמצאים ברמה גבוהה.', ['f6'])).toContain('quantity_not_in_facts')
    expect(richCodes('נראה שכולם סיימו.', ['f1'])).toContain('quantity_not_in_facts')
    expect(richCodes('נראה שאף תלמיד לא התקשה.', ['f1'])).toContain('quantity_not_in_facts')
  })
  it('כיוון מגמה: חייב להופיע בעובדה שצוטטה; שלילה אינה טענה', () => {
    expect(richCodes('נראה שבעברית נצפתה ירידה.', ['f3'])).toContain('trend_not_in_facts')
    expect(richCodes('נראה שבעברית נצפתה עלייה.', ['f3'])).toEqual([])
    expect(richCodes('נראה שבהיסטוריה נצפתה עלייה יפה.', ['f4'])).toContain('trend_not_in_facts')
    expect(richCodes('נראה שבהיסטוריה המגמה יציבה, ללא ירידה.', ['f4'])).toEqual([])
    expect(richCodes('נראה שבעברית המגמה משתפרת וגם יציבה.', ['f3'])).toContain('trend_not_in_facts')
  })
  it('"יציב": נפסל רק בסתירה (העובדות אומרות עלייה/ירידה ולא יציבות); בלי עובדת מגמה בכלל — עובר (ניסוח כללי נפוץ)', () => {
    expect(richCodes('נראה שהרמה בהיסטוריה יציבה.', ['f6'])).toEqual([]) /* f6: רמה בלבד, בלי מגמה */
    expect(richCodes('נראה שבעברית המגמה יציבה.', ['f3'])).toContain('trend_not_in_facts') /* f3 אומרת עלייה */
    expect(richCodes('נראה שבהיסטוריה המגמה יציבה.', ['f4'])).toEqual([]) /* f4 אומרת יציבה */
  })
  it('שלילה עד שלוש מילים לפני כיוון אינה טענה ("אינם מצביעים על ירידה", "אין תלמידים בירידה")', () => {
    expect(richCodes('הנתונים אינם מצביעים על ירידה בעברית, ונראה שהמגמה בעלייה.', ['f3'])).toEqual([])
    expect(richCodes('נראה שבהיסטוריה אין תלמידים בירידה, ו-9 מתוך 12 הצליחו ברוב האתגרים.', ['f2', 'f4'])).toEqual([])
    /* "אף כי" (למרות ש) אינו שלילה: ירידה שנטענת אחריו עדיין חייבת להיתמך */
    expect(richCodes('נראה שאף כי ההצלחה גבוהה, נצפתה ירידה בעברית.', ['f3'])).toContain('trend_not_in_facts')
  })
  it('שם מקצוע שאינו בעובדות הקלט נתפס; מקצוע שבעובדות עובר', () => {
    expect(richCodes('נראה שגם במתמטיקה נצפתה עלייה.', ['f3'])).toContain('subject_not_in_facts')
    expect(richCodes('נראה שבעברית נצפתה עלייה.', ['f3'])).toEqual([])
    expect(richCodes('נראה שבתנ"ך נצפתה עלייה.', ['f3'])).toContain('subject_not_in_facts')
  })
})

describe('הקשחה: קישורים, אימייל ומילים לטיניות', () => {
  for (const [name, text] of [
    ['אימייל', 'לפי הנתונים, 12 סיימו; לפרטים כתבו ל-evil@phish.example'],
    ['דומיין חשוף', 'לפי הנתונים, 12 סיימו; ראו phish.example/info'],
    ['קישור קצר', 'לפי הנתונים, 12 סיימו; הצטרפו ב-wa.me/join'],
    ['קישור Markdown', 'לפי הנתונים, 12 סיימו [כאן](phish.example)'],
  ] as const) it(name, () => expect(richCodes(text, ['f1'])).toContain('link'))
  it('מילה לטינית בטקסט עברי נתפסת, אלא אם היא מצוטטת בעובדה', () => {
    expect(richCodes('לפי הנתונים, 12 תלמידים סיימו את Minecraft.', ['f1'])).toContain('language')
    const withEnglish: SummaryInput = { ...rich, facts: [{ id: 'f1', kind: 'challenge', tone: 'neutral', text: 'אתגר 1 (זיכרון, "Past tense"): 7 מתוך 12 הצליחו.', numbers: [1, 7, 12] }] }
    expect(codesFor(withEnglish, 'לפי הנתונים, באתגר "Past tense" 7 מתוך 12 הצליחו.', ['f1'])).toEqual([])
  })
})
