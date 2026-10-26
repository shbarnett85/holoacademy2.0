import { describe, expect, it } from 'vitest'
import { AI_SUMMARY_TEXT } from '../../../../src/shared/lib/findingsNarrative.js'
import { FORBIDDEN_AI_OUTPUT, FORBIDDEN_UI_TERMS, forbiddenHits } from '../../../../src/shared/lib/forbiddenTerms.js'
import { templateParagraphs } from './fallback.js'
import { numbersIn, projectSource, type SummaryInput } from './inputs.js'
import { demoIdentifiers, demoSources } from './testkit.js'

/* התבנית הדטרמיניסטית (fallback + חשבון הדגמה): אותו קלט → אותו טקסט; נקייה ממונחים טכניים ושפה אסורה; מספרים רק מהעובדות; בלי שמות */
describe('fallback: תבנית דטרמיניסטית', () => {
  it('לכל מקור בעולם ההדגמה: דטרמיניסטית, 1-3 פסקאות בגודל סביר, נקייה (FORBIDDEN_UI_TERMS + קליני/שיפוטי/סיבתי/השוואתי)', async () => {
    const sources = await demoSources()
    const ids = demoIdentifiers()
    const bad: string[] = []
    let paragraphs = 0
    for (const { label, source } of sources) {
      const input = projectSource(source)
      const a = templateParagraphs(input)
      expect(templateParagraphs(input), label).toEqual(a)
      expect(a.length, label).toBeGreaterThanOrEqual(1)
      expect(a.length, label).toBeLessThanOrEqual(3)
      const allowed = new Set<number>([input.sampleSize, ...input.facts.flatMap((f) => f.numbers)])
      for (const p of a) {
        paragraphs++
        if (p.trim().length === 0 || p.length > 900) bad.push(`${label}: אורך ${p.length}`)
        const hits = forbiddenHits(p, FORBIDDEN_AI_OUTPUT)
        if (hits.length) bad.push(`${label}: [${hits.join(',')}] ${p.slice(0, 80)}`)
        for (const n of numbersIn(p)) if (!allowed.has(n)) bad.push(`${label}: מספר ${n} לא בעובדות`)
        for (const name of ids.names) if (p.includes(name)) bad.push(`${label}: שם ${name}`)
        for (const id of [...ids.ids, ...ids.classNames, ...ids.teachers]) if (p.includes(id)) bad.push(`${label}: מזהה ${id}`)
      }
    }
    expect(paragraphs).toBeGreaterThan(600)
    expect(bad.slice(0, 10)).toEqual([])
  })

  it('כל המחרוזות הקבועות של התבנית עוברות את FORBIDDEN_UI_TERMS', () => {
    const t = AI_SUMMARY_TEXT.template
    for (const s of [t.openingTail, t.strengthsLead, t.attentionLead, t.nothingToCheck, ...Object.values(t.step)]) expect(forbiddenHits(s, FORBIDDEN_UI_TERMS), s).toEqual([])
  })

  it('מבנה: פתיח עם גודל המדגם ביחידה הנכונה, "מה שבולט לטובה" רק כשיש חיובי, וצעד אחד בסוף', () => {
    const input: SummaryInput = {
      scope: 'student', audience: 'full', gender: null, gradeLabel: 'ו׳', sampleSize: 14, sampleUnit: 'sessions', counts: { sessions: 14 },
      facts: [
        { id: 'f1', kind: 'level', tone: 'neutral', text: 'במתמטיקה הרמה הנוכחית היא 9.5.', numbers: [9.5] },
        { id: 'f2', kind: 'area', tone: 'positive', text: 'במתמטיקה התחומים החזקים: יישום והסקה.', numbers: [] },
        { id: 'f3', kind: 'error', tone: 'attention', text: 'במתמטיקה טעות נפוצה: "דוגמה" — 3 מתוך 4 שאלות.', numbers: [3, 4] },
      ],
    }
    const out = templateParagraphs(input)
    expect(out).toHaveLength(3)
    expect(out[0]).toContain('מבוסס על 14 שיעורים')
    expect(out[0]).toContain('במתמטיקה הרמה הנוכחית היא 9.5.')
    expect(out[1].startsWith(AI_SUMMARY_TEXT.template.strengthsLead)).toBe(true)
    expect(out[2].startsWith(AI_SUMMARY_TEXT.template.attentionLead)).toBe(true)
    expect(out[2].endsWith(AI_SUMMARY_TEXT.template.step.student)).toBe(true)

    /* בלי חיובי ובלי תשומת לב: שתי פסקאות; ובהגשה היחידה היא תלמידים שסיימו */
    const quiet = templateParagraphs({ ...input, scope: 'submission', sampleUnit: 'students', sampleSize: 18, facts: [input.facts[0]] })
    expect(quiet).toHaveLength(2)
    expect(quiet[0]).toContain('מבוסס על 18 תלמידים שסיימו')
    expect(quiet[1]).toBe(`${AI_SUMMARY_TEXT.template.nothingToCheck} ${AI_SUMMARY_TEXT.template.step.submission}`)
  })

  it('פסקה ארוכה מדי מקוצרת מהסוף (דטרמיניסטי) ונשארת עד 900 תווים', () => {
    const long = 'ב'.repeat(280) + '.'
    const facts = [0, 1, 2].map((i) => ({ id: `f${i + 1}`, kind: 'level' as const, tone: 'neutral' as const, text: long, numbers: [] }))
    const out = templateParagraphs({ scope: 'class', audience: 'full', gender: null, gradeLabel: null, sampleSize: 25, sampleUnit: 'students', counts: { students: 25 }, facts })
    for (const p of out) expect(p.length).toBeLessThanOrEqual(900)
  })
})
