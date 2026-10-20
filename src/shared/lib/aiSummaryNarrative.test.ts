import { describe, expect, it } from 'vitest'
import { SUMMARY_SCOPES } from '../types/aiSummaryV1'
import {
  AI_SUMMARY_TEXT, CAVEAT_TREND, ERR_SUMMARY_BAD_REQUEST, ERR_SUMMARY_COOLDOWN, ERR_SUMMARY_DEMO_EDIT, ERR_SUMMARY_EMPTY_EDIT, ERR_SUMMARY_LIMIT_DAILY,
  ERR_SUMMARY_NOT_CONNECTED, ERR_SUMMARY_NOT_FOUND, aiFactAreas, aiFactAttentionCount, aiFactChallenge, aiFactClassAttention, aiFactClassLevel, aiFactCommonError,
  aiFactCompletion, aiFactError, aiFactLevel, aiFactMisconception, aiFactObjective, aiFactPositionSplit, aiFactSuccessBands, aiFactTrend, aiFactTrendSplit,
  aiSummaryBasis, aiSummaryGenerateHint, aiSummaryHowWritten, aiSummaryNotEnough, aiSummaryPrivacyNote, aiTemplateOpening,
} from './findingsNarrative'
import { FORBIDDEN_UI_TERMS, forbiddenHits } from './forbiddenTerms'

/* הטקסטים של הסיכום המילולי: עברית פשוטה, בלי אימוג'י ובלי מונחים טכניים, יחידות נכונות, ובלי שם תלמיד בעובדות */
const EMOJI = /\p{Extended_Pictographic}/u
function* strings(v: unknown): Generator<string> {
  if (typeof v === 'string') yield v
  else if (Array.isArray(v)) for (const x of v) yield* strings(x)
  else if (v && typeof v === 'object') for (const x of Object.values(v)) yield* strings(x)
}
const clean = (s: string): void => {
  expect(forbiddenHits(s, FORBIDDEN_UI_TERMS), s).toEqual([])
  expect(EMOJI.test(s), s).toBe(false)
}

describe('AI_SUMMARY_TEXT', () => {
  it('כל המחרוזות נקיות: אין מונחים טכניים ואין אימוג׳י; כל כפתור עם מילה', () => {
    let n = 0
    for (const s of strings(AI_SUMMARY_TEXT)) { clean(s); n++ }
    expect(n).toBeGreaterThan(30)
    for (const s of [ERR_SUMMARY_BAD_REQUEST, ERR_SUMMARY_COOLDOWN, ERR_SUMMARY_DEMO_EDIT, ERR_SUMMARY_EMPTY_EDIT, ERR_SUMMARY_LIMIT_DAILY, ERR_SUMMARY_NOT_CONNECTED, ERR_SUMMARY_NOT_FOUND]) { clean(s); expect(s.length).toBeGreaterThan(8) }
    for (const label of Object.values(AI_SUMMARY_TEXT.ui)) expect(label).toMatch(/[א-ת]/)
  })

  it('התווית "נכתב על ידי ד״ר הולו (בינה מלאכותית)" נושאת מילים, והתבנית מסומנת כאוטומטית', () => {
    expect(AI_SUMMARY_TEXT.label.ai).toBe('נכתב על ידי ד״ר הולו (בינה מלאכותית)')
    expect(AI_SUMMARY_TEXT.label.template).toBe('סיכום אוטומטי מהנתונים')
    expect(AI_SUMMARY_TEXT.notice.template).toContain('לא נכתב בבינה מלאכותית')
    expect(CAVEAT_TREND.length).toBeGreaterThan(20)
  })

  it('הערת הפרטיות והסבר הכפתור לפי היקף (יחיד/רבים)', () => {
    expect(aiSummaryPrivacyNote('student')).toBe('שם התלמיד/ה לא נשלח לבינה המלאכותית.')
    for (const s of ['class', 'class_subject', 'submission'] as const) expect(aiSummaryPrivacyNote(s)).toContain('שמות התלמידים')
    for (const s of SUMMARY_SCOPES) { expect(aiSummaryGenerateHint(s)).toContain('2-3 פסקאות'); clean(aiSummaryGenerateHint(s)) }
  })

  it('"מבוסס על": יחידה נכונה לכל היקף, ויחיד/רבים', () => {
    expect(aiSummaryBasis('student', 'sessions', 14)).toBe('מבוסס על 14 הדמיות')
    expect(aiSummaryBasis('student', 'sessions', 1)).toBe('מבוסס על הדמיה אחת')
    expect(aiSummaryBasis('class', 'students', 22)).toBe('מבוסס על 22 תלמידים')
    expect(aiSummaryBasis('class_subject', 'students', 1)).toBe('מבוסס על תלמיד/ה אחד/ת')
    expect(aiSummaryBasis('submission', 'students', 18)).toBe('מבוסס על 18 תלמידים שסיימו')
    expect(aiSummaryBasis('submission', 'students', 1)).toBe('מבוסס על תלמיד/ה אחד/ת שסיים/ה')
  })

  it('"איך נכתב": במילים פשוטות מה נשלח; מודל וגרסה רק כשנכתב ב-AI', () => {
    const ai = aiSummaryHowWritten({ scope: 'student', writtenBy: 'ai', demo: false, model: 'gemini-2.5-pro', promptVersion: 'ai-sum-v1' })
    expect(ai.join(' ')).toContain('שם התלמיד/ה לא נשלח')
    expect(ai.join(' ')).toContain('gemini-2.5-pro')
    expect(ai.join(' ')).toContain('ai-sum-v1')
    expect(aiSummaryHowWritten({ scope: 'class', writtenBy: 'ai', demo: false }).join(' ')).not.toContain('המודל שכתב')
    const tpl = aiSummaryHowWritten({ scope: 'student', writtenBy: 'template', demo: false, model: 'x' })
    expect(tpl.join(' ')).not.toContain('המודל')
    expect(aiSummaryHowWritten({ scope: 'student', writtenBy: 'template', demo: true })[0]).toContain('הדגמה')
    for (const s of [...ai, ...tpl]) clean(s)
  })

  it('פתיח התבנית כולל את גודל המדגם', () => {
    expect(aiTemplateOpening('student', 'sessions', 14)).toBe('מבוסס על 14 הדמיות. זה מה שעולה מהנתונים:')
    expect(aiTemplateOpening('submission', 'students', 9)).toContain('9 תלמידים שסיימו')
    expect(aiSummaryNotEnough('class', 3).text).toContain('הכיתה')
  })
})

describe('aiFact*: עובדות אנונימיות, כל אחת משפט שמסתיים בנקודה, מספרים כ-"X מתוך Y"', () => {
  const facts: string[] = [
    aiFactLevel('מתמטיקה', 11.46, 'within', 46), aiFactLevel('עברית', 9, null, 1), aiFactTrend('היסטוריה', 'declining'), aiFactTrend('מדעים', 'improving', true),
    aiFactAreas('מתמטיקה', ['יישום והסקה'], ['ידע עובדתי']), aiFactAreas('מתמטיקה', [], ['ידע עובדתי']), aiFactError('היסטוריה', 'היפוך סדר', 5, 6),
    aiFactClassLevel('מתמטיקה', 12.84, 'above', 25), aiFactClassAttention('עברית', 1, 25), aiFactPositionSplit('מתמטיקה', 5, 12, 8, 25), aiFactPositionSplit('מתמטיקה', 0, 0, 3, 3),
    aiFactTrendSplit('מתמטיקה', 4, 15, 6, 25), aiFactMisconception('מתמטיקה', 'חיבור מכנים', '21 מתוך 50 תלמידים (42%)'),
    aiFactCompletion(25, 14, 6, 5), aiFactCompletion(25, 25, 0, 0), aiFactSuccessBands(14, 8, 4, 2), aiFactSuccessBands(14, 14, 0, 0),
    aiFactChallenge(3, 'רב-ברירה', 'שברים', 20, 14, 2), aiFactChallenge(1, 'זיכרון', '', 10, 10, 0), aiFactCommonError('טעות', 7, 20), aiFactObjective('להסביר שברים', 'למדו', 12, 15), aiFactAttentionCount(3, 25),
  ]

  it('כל עובדה: נקייה, מסתיימת בנקודה, בלי שורות חדשות', () => {
    for (const f of facts) { clean(f); expect(f.endsWith('.'), f).toBe(true); expect(f).not.toContain('\n') }
  })

  it('תוכן ספציפי: רמה מעוגלת לעשירית ומיקום מילולי; פיצולים בלי אפסים; "X מתוך Y"', () => {
    expect(facts[0]).toBe('במתמטיקה הרמה הנוכחית היא 11.5 (בתוך הטווח המיועד לשכבה), על סמך 46 הדמיות.')
    expect(facts[1]).toBe('בעברית הרמה הנוכחית היא 9, על סמך הדמיה אחת.')
    expect(facts[9]).toBe('במתמטיקה מתוך 25 תלמידים: 5 מעל הטווח המיועד, 12 בתוכו ו-8 מתחתיו.')
    expect(facts[10]).toBe('במתמטיקה מתוך 3 תלמידים: 3 מתחתיו.')
    expect(facts[13]).toBe('מתוך 25 תלמידים: 14 סיימו, 6 באמצע ו-5 עוד לא התחילו.')
    expect(facts[14]).toBe('מתוך 25 תלמידים: 25 סיימו.')
    expect(facts[15]).toBe('מבין 14 התלמידים שסיימו: 8 הצליחו ברוב האתגרים, 4 הצליחו בחלק מהאתגרים ו-2 הצליחו במעט.')
    expect(facts[17]).toBe('אתגר 3 (רב-ברירה, "שברים"): 14 מתוך 20 הצליחו, 2 ויתרו.')
    expect(facts[18]).toBe('אתגר 1 (זיכרון): 10 מתוך 10 הצליחו.')
    expect(facts[6]).toContain('5 מתוך 6 שאלות')
    expect(facts[19]).toContain('7 מתוך 20 תלמידים')
  })

  it('אין בעובדות אף שם פרטי/משפחה מעולם ההדגמה (הן בנויות מתבניות ללא קלט שמי)', () => {
    for (const f of facts) expect(f).not.toMatch(/\b(?:אלון|תמר|נועה)\b/)
  })
})
