import { beforeEach, describe, expect, it } from 'vitest'
import { discussionFallback } from '../../../../src/shared/lib/findingsNarrative.js'
import { checkDiscussionQuestions, DISCUSSION_LIMITS, discussionQuestions, resetDiscussionState, type DiscussionDeps, type DiscussionInput } from './discussion.js'

const FRACTIONS: DiscussionInput = { question: 'כמה זה ½ + ⅓ ?', wrongText: '⅖', correctText: '⅚', subject: 'מתמטיקה', grade: 'ו׳' }
const BIGGER: DiscussionInput = { question: 'איזה שבר גדול יותר: ⅛ או ¼ ?', wrongText: 'שניהם שווים', correctText: '¼' }
const json = (...questions: string[]) => JSON.stringify({ questions })
const GOOD = json(
  'ציירו עוגה וחלקו אותה לחתיכות שוות. איך תסמנו עליה ½ ועוד ⅓ ?',
  'במה המכנה של ⅖ שונה מהמכנים של ½ ושל ⅓ ?',
  'אם מחברים ½ ועוד ¼ , האם המכנה של התוצאה יכול להיות 2 ?',
)

describe('checkDiscussionQuestions — הבדיקה של השאלות שהמודל כתב', () => {
  it('שלוש שאלות לפי התוכן עוברות, גם כשסביב ה-JSON יש טקסט', () => {
    const r = checkDiscussionQuestions(`הנה השאלות:\n${GOOD}\nבהצלחה`, FRACTIONS)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.questions).toHaveLength(3)
  })
  it('שורה לכל שאלה, עם מספור ועם מירכאות בתוך הטקסט (ס"מ): נקראות כמו שהן', () => {
    const square: DiscussionInput = { question: 'מה שטח ריבוע שצלעו 4 ס"מ?', wrongText: '8', correctText: '16' }
    const lines = ['1. ציירו ריבוע שצלעו 4 ס"מ על דף משבצות. כמה משבצות יש בתוכו?', '2) במה שונה היקף הריבוע משטח הריבוע?', '- ואם צלע הריבוע היא 5 ס"מ, כמה משבצות יהיו בתוכו? הסבירו.']
    const r = checkDiscussionQuestions(lines.join('\n'), square)
    expect(r.ok).toBe(true)
    if (r.ok) { expect(r.questions).toHaveLength(3); expect(r.questions[0].startsWith('ציירו')).toBe(true); expect(r.questions[2].startsWith('ואם')).toBe(true) }
  })
  it('שאלות כלליות, שמתאימות לכל שאלה, נדחות', () => {
    const r = checkDiscussionQuestions(json('איך לדעתכם הגיעו לתשובה הזאת?', 'מה הייתם אומרים למי שבחר בה?', 'איך אפשר לבדוק את זה אחרת?'), FRACTIONS)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.problems.join(' ')).toContain('generic')
  })
  it('שאלה שכותבת את התשובה הנכונה נדחית; כשהתשובה הנכונה כתובה בשאלה של השיעור, מותר', () => {
    const reveal = checkDiscussionQuestions(json('ציירו עוגה: האם ½ ועוד ⅓ יוצא ⅚ ?', 'במה המכנה של ⅖ שונה מהמכנים של ½ ושל ⅓ ?', 'אם מחברים ½ ועוד ¼ , מה המכנה?'), FRACTIONS)
    expect(reveal.ok).toBe(false)
    if (!reveal.ok) expect(reveal.problems.join(' ')).toContain('correct answer')
    const shown = checkDiscussionQuestions(json('ציירו שתי פיצות שוות: אחת חתוכה ל-8 ואחת ל-4. איזו חתיכה גדולה יותר, ⅛ או ¼ ?', 'במה ⅛ ו-¼ דומים, ובמה הם שונים?', 'ומה לגבי ⅛ מול 1/16 ? נסו לנחש ואז לבדוק בציור?'), BIGGER)
    expect(shown.ok).toBe(true)
  })
  it('פנייה ביחיד, שאלה בלי סימן שאלה, שאלה ארוכה מדי ופחות משלוש שאלות נדחות', () => {
    const singular = checkDiscussionQuestions(json('צייר עוגה וחלק אותה. איפה ½ ואיפה ⅓ ?', 'במה המכנה של ⅖ שונה מהמכנים של ½ ושל ⅓ ?', 'אם מחברים ½ ועוד ¼ , מה המכנה?'), FRACTIONS)
    expect(singular.ok).toBe(false)
    const noMark = checkDiscussionQuestions(json('ציירו עוגה וסמנו עליה ½ ועוד ⅓', 'במה המכנה של ⅖ שונה מהמכנים של ½ ושל ⅓ ?', 'אם מחברים ½ ועוד ¼ , מה המכנה?'), FRACTIONS)
    expect(noMark.ok).toBe(false)
    const long = checkDiscussionQuestions(json(`${'ציירו עוגה עם ½ ועוד ⅓ '.repeat(8)}?`, 'במה המכנה של ⅖ שונה מהמכנים של ½ ושל ⅓ ?', 'אם מחברים ½ ועוד ¼ , מה המכנה?'), FRACTIONS)
    expect(long.ok).toBe(false)
    expect(checkDiscussionQuestions(json('במה המכנה של ⅖ שונה מהמכנים של ½ ושל ⅓ ?'), FRACTIONS).ok).toBe(false)
    expect(checkDiscussionQuestions('אין כאן שאלות', FRACTIONS).ok).toBe(false)
  })
  it('מילה מתוכן השיעור שאסורה במסכי המורה (ריבוע) מותרת כאן; מילה ששופטת תלמידים לא', () => {
    const square: DiscussionInput = { question: 'מה שטח ריבוע שצלעו 4 ס״מ?', wrongText: '8', correctText: '16' }
    expect(checkDiscussionQuestions(json('ציירו ריבוע שצלעו 4 על דף משבצות. כמה משבצות יש בתוכו?', 'במה שונה היקף הריבוע משטח הריבוע?', 'ואם צלע הריבוע היא 5 , כמה משבצות יהיו בתוכו?'), square).ok).toBe(true)
  })
})

describe('discussionFallback — שאלות הגיבוי', () => {
  it('שלוש שאלות שונות, בלשון רבים, כולן שאלות, והתשובה שנבחרה משובצת בהן', () => {
    const q = discussionFallback(FRACTIONS)
    expect(q).toHaveLength(3)
    expect(new Set(q).size).toBe(3)
    for (const s of q) expect(s.endsWith('?')).toBe(true)
    expect(q.join(' ')).toContain('⅖')
  })
  it('לטעויות שונות יוצאות שאלות שונות, ולאותה טעות תמיד אותן שאלות', () => {
    const sets = new Set(['⅖', '²⁄₇', '⁴⁄₉', '3,450', 'שניהם שווים', 'הירדן', '1492', 'פוטוסינתזה'].map((w) => discussionFallback({ question: `שאלה על ${w}`, wrongText: w }).map((s) => s.replace(w, '_')).join('|')))
    expect(sets.size).toBeGreaterThanOrEqual(4)
    expect(discussionFallback(FRACTIONS)).toEqual(discussionFallback(FRACTIONS))
  })
})

describe('discussionQuestions — כתיבה, מטמון, מכסה וגיבוי', () => {
  beforeEach(() => { resetDiscussionState(); delete process.env.DISCUSSION_AI })
  const deps = (answers: (string | Error)[]): DiscussionDeps & { calls: string[] } => {
    const calls: string[] = []
    let i = 0
    return { calls, now: () => 1_700_000_000_000, ask: async (_system, user) => { calls.push(user); const a = answers[Math.min(i++, answers.length - 1)]; if (a instanceof Error) throw a; return a } }
  }

  it('שאלות שעברו את הבדיקה מוחזרות כ-ai, ופעם שנייה לא נשאלים שוב (מטמון)', async () => {
    const d = deps([GOOD])
    const a = await discussionQuestions(FRACTIONS, { userKey: 'u1' }, d)
    const b = await discussionQuestions(FRACTIONS, { userKey: 'u2' }, d)
    expect(a.source).toBe('ai')
    expect(b).toEqual(a)
    expect(d.calls).toHaveLength(1)
  })
  it('למודל נשלח רק תוכן השיעור: השאלה, התשובות, המקצוע והשכבה', async () => {
    const d = deps([GOOD])
    await discussionQuestions({ ...FRACTIONS, lessonTitle: 'קרב השברים', challengeTitle: 'ראש בראש' }, { userKey: 'teacher-7' }, d)
    expect(d.calls[0]).toContain('כמה זה ½ + ⅓ ?')
    expect(d.calls[0]).toContain('קרב השברים')
    expect(d.calls[0]).not.toContain('teacher-7')
  })
  it('בדיקה שנכשלה מקבלת ניסיון אחד נוסף עם הבעיות; שני כישלונות: שאלות הגיבוי', async () => {
    const retry = deps([json('איך הגיעו לזה?', 'מה תגידו?', 'למה?'), GOOD])
    expect((await discussionQuestions(FRACTIONS, { userKey: 'u' }, retry)).source).toBe('ai')
    expect(retry.calls[1]).toContain('broke these rules')
    resetDiscussionState()
    const bad = deps([json('איך הגיעו לזה?', 'מה תגידו?', 'למה?')])
    const r = await discussionQuestions(FRACTIONS, { userKey: 'u' }, bad)
    expect(r).toEqual({ questions: discussionFallback(FRACTIONS), source: 'template' })
    expect(bad.calls).toHaveLength(2)
  })
  it('מודל שלא זמין, או כיבוי ב-DISCUSSION_AI=0: שאלות הגיבוי', async () => {
    expect((await discussionQuestions(FRACTIONS, { userKey: 'u' }, deps([new Error('down')]))).source).toBe('template')
    process.env.DISCUSSION_AI = '0'
    const off = deps([GOOD])
    expect((await discussionQuestions(FRACTIONS, { userKey: 'u' }, off)).source).toBe('template')
    expect(off.calls).toHaveLength(0)
  })
  it('"שאלות אחרות": נשאלים שוב, והשאלות שכבר הוצגו נשלחות כדי לקבל אחרות', async () => {
    const other = json('קחו סרגל וציירו קטע. איך תסמנו עליו ½ וגם ⅓ ?', 'במה ½ ו-⅓ דומים, ובמה הם שונים?', 'אם מחברים ⅓ ועוד ¼ , האם המכנה יכול להיות 7 ?')
    const d = deps([GOOD, other])
    const a = await discussionQuestions(FRACTIONS, { userKey: 'u' }, d)
    const b = await discussionQuestions(FRACTIONS, { userKey: 'u', fresh: true }, d)
    expect(b.questions).not.toEqual(a.questions)
    expect(d.calls[1]).toContain('wants different ones')
    expect((await discussionQuestions(FRACTIONS, { userKey: 'u' }, d)).questions).toEqual(b.questions)
  })
  it('מכסה לדקה לכל משתמש: מעבר לה מוחזר מה שכבר נכתב, או שאלות הגיבוי', async () => {
    const d = deps([GOOD])
    for (let i = 0; i < DISCUSSION_LIMITS.perUserPerMinute; i++) await discussionQuestions({ ...FRACTIONS, question: `כמה זה ½ + ⅓ ? (${i})` }, { userKey: 'u' }, d)
    const over = await discussionQuestions({ ...FRACTIONS, question: 'כמה זה ½ + ⅓ ? (עוד אחת)' }, { userKey: 'u' }, d)
    expect(over.source).toBe('template')
    expect(d.calls).toHaveLength(DISCUSSION_LIMITS.perUserPerMinute)
    expect((await discussionQuestions({ ...FRACTIONS, question: 'כמה זה ½ + ⅓ ? (משתמש אחר)' }, { userKey: 'other' }, d)).source).toBe('ai')
  })
})
