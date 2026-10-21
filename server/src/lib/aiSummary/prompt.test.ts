import { describe, expect, it } from 'vitest'
import { FORBIDDEN_CAUSAL } from '../../../../src/shared/lib/forbiddenTerms.js'
import { CAUTION_RE, GUARD_LIMITS, parseAndGuard, type Violation } from './guard.js'
import type { SummaryInput } from './inputs.js'
import { CAUSAL_PHRASES, CAUTION_PHRASES, MAX_CITED_FACTS, SUMMARY_PROMPT_VERSION, buildRetryNote, buildSummaryPrompt } from './prompt.js'

/* ══════════════════════════════════════════════════════════════════════════
   תיקון שנמדד בקבלה החיה (npm run ai-summary:accept): בלי הגבלה מפורשת המודל מצטט יותר מ-8 עובדות בפסקה ונפל על השומר ב-5 מ-7 קלטים,
   והודעת הניסיון החוזר ("מבנה שגוי") לא הסבירה מה לתקן. ההנחיה אומרת עכשיו כמה מותר, וההודעה החוזרת מפרטת.
   ══════════════════════════════════════════════════════════════════════════ */
const input = (): SummaryInput => ({
  scope: 'class', audience: 'full', gender: null, gradeLabel: 'ו׳', sampleSize: 20, sampleUnit: 'students', counts: { students: 20 },
  facts: Array.from({ length: 12 }, (_, i) => ({ id: `f${i + 1}`, kind: 'level' as const, tone: 'neutral' as const, text: `עובדה ${i + 1}`, numbers: [i + 1] })),
})
const v = (code: Violation['code'], detail = ''): Violation => ({ code, paragraph: 0, detail })

describe('הנחיה: תקרת הציטוטים מוצהרת למודל ועקבית עם השומר', () => {
  it('ההנחיה הקבועה אומרת כמה עובדות מותר לצטט בפסקה', () => {
    const { system, user } = buildSummaryPrompt(input())
    expect(system).toContain(`לכל היותר ${MAX_CITED_FACTS} מזהים בפסקה`)
    /* התקרה היא על הציטוט בלבד — כל העובדות עדיין מוצגות למודל */
    expect(user).toContain('"f12"')
  })

  it('התקרה בהנחיה נמוכה מהתקרה הקשיחה בשומר (שוליים), ופסקה שמצטטת פי-שניים מהתקרה נפסלת', () => {
    expect(MAX_CITED_FACTS).toBeLessThan(GUARD_LIMITS.maxFactsPerParagraph)
    const body = (ids: string[]): string => JSON.stringify({ paragraphs: [{ text: 'לפי הנתונים, עובדה 1.', facts: ids }] })
    const within = Array.from({ length: MAX_CITED_FACTS }, (_, i) => `f${i + 1}`)
    expect(parseAndGuard(body(within), input()).violations.map((x) => x.code)).not.toContain('shape')
    const over = Array.from({ length: GUARD_LIMITS.maxFactsPerParagraph + 1 }, (_, i) => `f${i + 1}`)
    expect(parseAndGuard(body(over), input()).violations).toContainEqual({ code: 'shape', paragraph: 0, detail: 'facts' })
  })

  it('הגרסה עודכנה (ההנחיה השתנתה) ונשמרת עם כל סיכום', () => {
    expect(SUMMARY_PROMPT_VERSION).toBe('ai-sum-v3')
  })
})

describe('הודעת הניסיון החוזר', () => {
  it('shape על facts: אומרת שיש לצטט פחות עובדות ואת התקרה; shape אחר: ההודעה הכללית', () => {
    const tooMany = buildRetryNote([v('shape', 'facts')])
    expect(tooMany).toContain('יותר מדי עובדות')
    expect(tooMany).toContain(String(MAX_CITED_FACTS))
    const generic = buildRetryNote([v('shape', 'text')])
    expect(generic).not.toContain('יותר מדי עובדות')
    expect(generic).toContain('מבנה הפלט שגוי')
  })

  it('הפרות כפולות מוצגות פעם אחת, והודעה לא מצטטת את הטקסט שנפסל', () => {
    const note = buildRetryNote([v('shape', 'facts'), v('shape', 'facts'), v('causal', 'ZQXLEAK1'), v('causal', 'ZQXLEAK2')])
    expect(note.match(/יותר מדי עובדות/g)).toHaveLength(1)
    expect(note.match(/הסבר סיבתי/g)).toHaveLength(1)
    expect(note).not.toMatch(/ZQXLEAK/)
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   ai-sum-v3 — תיקון להפרות שנותרו בקבלה החיה של v2: "בשל" בסיכום כיתה (causal), ופסקת הצעדים בלי ביטוי זהיר (no_caution).
   ההנחיה והודעת הניסיון החוזר אומרות במפורש מה אסור ומה מותר, והרשימות מסונכרנות עם השומר (השומר לא הוחלש).
   ══════════════════════════════════════════════════════════════════════════ */
describe('v3: הביטויים הסיבתיים האסורים נאמרים למודל במפורש', () => {
  it('כל ביטוי ש-FORBIDDEN_CAUSAL פוסל מופיע בהנחיה הקבועה', () => {
    const { system } = buildSummaryPrompt(input())
    for (const t of FORBIDDEN_CAUSAL) expect(system, t.name).toContain(t.name)
    for (const p of CAUSAL_PHRASES) expect(system, p).toContain(p)
  })
  it('כל ביטוי ברשימת ההנחיה נתפס אכן ע"י השומר (הרשימה לא מבטיחה יותר ממה שהשומר אוכף, ולא פחות)', () => {
    const para = (phrase: string): string => `לפי הנתונים, ${phrase} הרמה נמוכה יותר.`
    for (const p of CAUSAL_PHRASES) {
      const body = JSON.stringify({ paragraphs: [{ text: para(p), facts: ['f1'] }] })
      expect(parseAndGuard(body, input()).violations.map((x) => x.code), p).toContain('causal')
    }
  })
  it('ההנחיה מתארת מה לעשות במקום (מה נצפה ומתי) ואוסרת גם ניחוש כוונות', () => {
    const { system } = buildSummaryPrompt(input())
    expect(system).toContain('מה נצפה ומתי')
    expect(system).toContain('לנחש כוונות')
  })
})

describe('v3: ניסוח זהיר חובה בכל פסקה, כולל פסקת הצעדים', () => {
  it('ההנחיה אומרת "בכל פסקה… וגם בפסקה האחרונה" ומציגה את כל הביטויים בכתיבם המדויק', () => {
    const { system } = buildSummaryPrompt(input())
    expect(system).toMatch(/חובה בכל פסקה[^\n]*וגם בפסקה האחרונה/)
    for (const p of CAUTION_PHRASES) expect(system, p).toContain(`"${p}"`)
  })
  it('דוגמאות הפתיחה שבהנחיה לפסקת הצעדים עוברות את בדיקת הניסוח הזהיר של השומר', () => {
    const { system } = buildSummaryPrompt(input())
    const examples = [...system.matchAll(/למשל "([^"]+)"|או "([^"]+)"/g)].map((m) => m[1] ?? m[2]).filter((x) => /ייתכן|לפי הנתונים/.test(x))
    expect(examples.length).toBeGreaterThanOrEqual(2)
    for (const e of examples) expect(CAUTION_RE.test(e), e).toBe(true)
  })
  it('סעיף הבדיקה העצמית מופיע לפני הפלט', () => {
    const { system } = buildSummaryPrompt(input())
    expect(system.indexOf('בדיקה עצמית')).toBeGreaterThan(0)
    expect(system.indexOf('בדיקה עצמית')).toBeLessThan(system.indexOf('## פלט'))
  })
})

describe('v3: הודעת הניסיון החוזר מפרטת ומציינת את הביטויים המותרים', () => {
  it('no_caution: כל הביטויים המותרים, וההדגשה "כולל פסקת הצעדים"', () => {
    const note = buildRetryNote([v('no_caution')])
    for (const p of CAUTION_PHRASES) expect(note, p).toContain(`"${p}"`)
    expect(note).toContain('כולל פסקת הצעדים')
    expect(note).toContain('חסר ביטוי זהיר')
  })
  it('causal: רשימת הביטויים האסורים; לא מצטטת את הטקסט שנפסל', () => {
    const note = buildRetryNote([v('causal', 'בשל')])
    for (const p of CAUSAL_PHRASES) expect(note, p).toContain(p)
    expect(note.match(/הסבר סיבתי/g)).toHaveLength(1)
  })
  it('number_not_in_facts: מצוין המספר שנפסל (לא טקסט), ופעמיים אותו מספר = שורה אחת', () => {
    const note = buildRetryNote([v('number_not_in_facts', '17'), v('number_not_in_facts', '17'), v('number_not_in_facts', '4')])
    expect(note.match(/המספר 17 הופיע/g)).toHaveLength(1)
    expect(note).toContain('המספר 4 הופיע')
    /* detail שאינו מספר לא נכנס להודעה */
    expect(buildRetryNote([v('number_not_in_facts', 'ZQXLEAK')])).not.toContain('ZQXLEAK')
  })
  it('הודעות אחרות לא השתנו: language / no_facts', () => {
    const note = buildRetryNote([v('language'), v('no_facts')])
    expect(note).toContain('הטקסט חייב להיות בעברית')
    expect(note).toContain('לצטט לפחות עובדה אחת')
  })
})
