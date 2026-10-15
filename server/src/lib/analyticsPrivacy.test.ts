import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/* רגרסיית פרטיות (חוק 12): שם תלמיד לעולם לא נשלח ל-LLM חיצוני — רק כינוי, והשם חוזר בשרת.
   בדיקת מקור: ה-label של הסיכום האישי משתמש בכינוי, ושם התלמיד נוגע רק בהחלפה שאחרי התשובה. */
const src = readFileSync(resolve(__dirname, '../routes/analytics.ts'), 'utf8')

describe('סיכום פדגוגי — כינוי במקום שם תלמיד', () => {
  it('ה-label של scope=student בנוי מהכינוי, לא מהשם', () => {
    const m = src.match(/label: `\$\{STUDENT_ALIAS\} · כיתה/)
    expect(m).not.toBeNull()
    expect(src).not.toMatch(/label: `תלמיד\/ה: \$\{/)
  })
  it('שם התלמיד לא נכנס לפרומפט: buildPedagogicalPrompt מקבל רק label + data', () => {
    const fn = src.slice(src.indexOf('function buildPedagogicalPrompt'), src.indexOf('async function callSonnetSummary'))
    expect(fn).not.toMatch(/studentName|\.name\b/)
  })
  it('השם האמיתי משמש רק להחלפת הכינוי בתשובה (split/join), אחרי קריאת ה-LLM', () => {
    const uses = [...src.matchAll(/studentName/g)].length
    expect(src).toContain('rawContent.split(STUDENT_ALIAS).join(studentName)')
    expect(uses).toBeGreaterThan(0)
    const idxCall = src.indexOf('await callSonnetSummary(')
    const idxJoin = src.indexOf('rawContent.split(STUDENT_ALIAS)')
    expect(idxJoin).toBeGreaterThan(idxCall)
  })
})
