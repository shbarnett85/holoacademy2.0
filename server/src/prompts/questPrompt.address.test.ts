/* "פנייה לתלמיד בלשון רבים אחידה": כל פרומפט יצירה מכיל את הכלל, בלי הוראות זכר/נקבה, ודוגמאות ה-few-shot
   שבתוכו (שהמודל מעתיק) נקיות מהפרות. */
import { describe, expect, it } from 'vitest'
import { scanStudentText } from '../lib/studentAddress.js'
import { STUDENT_ADDRESS_RULE, buildQuestPrompt, buildSkeletonPrompt, formOfAddressRule, type QuestGenerationParams } from './questPrompt.js'

const params = (extra: Partial<QuestGenerationParams> = {}): QuestGenerationParams => ({
  title: 'מצרים העתיקה', curriculum: 'הנילוס והפרעונים', questLength: 8, includeDrHolo: true,
  difficultySettings: { writingLevel: 10, puzzleDifficulty: 10 }, ...extra,
})

describe('פרומפט היצירה — לשון רבים', () => {
  const full = buildQuestPrompt(params())
  const text = `${full.system}\n${full.user}`

  it('מכיל את כלל הפנייה ואת 3 הדוגמאות', () => {
    expect(text).toContain(STUDENT_ADDRESS_RULE)
    expect(STUDENT_ADDRESS_RULE).toContain('✗ "אתה יוצא מהפורטל')
    expect(STUDENT_ADDRESS_RULE).toContain('✗ "בחר/י את התשובה הנכונה"')
    expect(STUDENT_ADDRESS_RULE).toContain('✗ "אני מוותר/ת על האתגר"')
    expect(formOfAddressRule()).toBe(STUDENT_ADDRESS_RULE)
  })
  it('אין הוראת יחיד/מגדר בשום פרומפט, גם אם הקליינט ביקש male/female (הטיפוס plural בלבד)', () => {
    const forced = buildQuestPrompt(params({ formOfAddress: 'male' as never }))
    for (const t of [text, `${forced.system}\n${forced.user}`, buildSkeletonPrompt(params())]) {
      expect(t).not.toContain('זכר יחיד')
      expect(t).not.toContain('נקבה יחידה')
      expect(t).not.toContain('פנה אל התלמידה')
    }
  })
  it('שדות ה-few-shot שבפרומפט (נרטיב/דיאלוג/שאלה/הסברים/סיומים) נקיים מהפרות פנייה', () => {
    const vals: string[] = []
    for (const m of text.matchAll(/"(?:narrative|drHoloDialog|question|explanationCorrect|explanationIncorrect|title|text)":\s*"([^"\n]*)"/g)) vals.push(m[1])
    expect(vals.length).toBeGreaterThan(10)
    const bad = vals.flatMap((v) => scanStudentText(v, false).map((x) => `${v.slice(0, 50)} → ${x.match}`))
    expect(bad).toEqual([])
  })
})
