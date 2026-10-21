import { describe, expect, it } from 'vitest'
import { checkParagraph, nameRegexes } from './guard.js'
import { projectSource } from './inputs.js'
import { demoSources } from './testkit.js'

/* ניסוח נאמן של העובדות אינו נתפס: לכל מקור בעולם ההדגמה, כל שלוש עובדות רצופות מועתקות כלשונן לפסקה (עם סימון זהירות) והשומר חייב לעבור.
   מונע false-positive של בדיקות המספרים/הכמויות/הכיוון/המקצועות על טקסט שהמערכת עצמה מייצרת. */
describe('שומר הפלט: ציטוט נאמן של עובדות עובר (אפס false-positive על עולם ההדגמה)', () => {
  it('כל שלישיית עובדות רצופות, בכל היקף ועדשה', async () => {
    const sources = await demoSources()
    const bad: string[] = []
    let paragraphs = 0
    for (const { label, source } of sources) {
      const input = projectSource(source)
      const allFactsText = input.facts.map((f) => f.text).join(' ')
      for (let i = 0; i < input.facts.length; i += 3) {
        const chunk = input.facts.slice(i, i + 3)
        const text = `לפי הנתונים, ${chunk.map((f) => f.text).join(' ')}`
        paragraphs++
        const v = checkParagraph(text, 0, chunk, input.sampleSize, nameRegexes([]), { allFactsText }).filter((x) => x.code !== 'paragraph_length')
        if (v.length) bad.push(`${label} f${i + 1}: ${v.map((x) => `${x.code}:${x.detail}`).join(',')} | ${text.slice(0, 120)}`)
      }
    }
    expect(paragraphs).toBeGreaterThan(900)
    expect(bad.slice(0, 15)).toEqual([])
  })
})
