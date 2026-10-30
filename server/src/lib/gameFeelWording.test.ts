/* "דרגה" לא מופיעה בקוד של ממשק התלמיד, ו"סיום טוב/רע" לא מופיעים בשום מקום (CLAUDE.md "תחושת משחק: כללים", כללים 4–5) */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { endingProblem, FORBIDDEN_ENDING_RE, needsEndingRewrite } from './openEnding.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = path.join(dir, f)
  if (f === 'node_modules' || f === 'dist') return []
  return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|json|html|css)$/.test(f) ? [p] : []
})
/* הקבצים האלה מגדירים את האיסור עצמו */
const DEFINES_RULE = /openEnding(Library)?\.ts$|gameFeelWording\.test\.ts$/

describe('ניסוחים אסורים (סריקת קוד)', () => {
  it('אפס "סיום טוב/רע" בקוד, בפרומפטים ובתוכן הזרע', () => {
    const files = [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'server/src')), ...walk(path.join(ROOT, 'server/seed')), ...walk(path.join(ROOT, 'public'))]
    expect(files.length).toBeGreaterThan(200)
    const hits = files.filter((f) => !DEFINES_RULE.test(f)).filter((f) => FORBIDDEN_ENDING_RE.test(readFileSync(f, 'utf8')))
    expect(hits).toEqual([])
  })
  it('אפס "דרגה" בקוד של ממשק התלמיד', () => {
    const files = [...walk(path.join(ROOT, 'src/features/player')), path.join(ROOT, 'src/shared/ui/LessonCard.tsx')]
    const hits = files.filter((f) => !/\.test\.tsx?$/.test(f)).filter((f) => /דרג[הות]/.test(readFileSync(f, 'utf8')))
    expect(hits).toEqual([])
  })
})

describe('סצנת "הסיפור נשאר פתוח"', () => {
  const ok = { title: 'הסיפור עוד פתוח', narrative: 'מצאתם את המפה, אבל חסרות עוד תובנות כדי לפתוח את השער.', drHoloDialog: 'בואו נחזור ונגלה מה עוד מסתתר שם.' }
  it('טקסט תקין עובר, ולא צריך המרה', () => {
    expect(endingProblem(ok)).toBeNull()
    expect(needsEndingRewrite(ok)).toBe(false)
  })
  it.each([
    ['ניסוח של כישלון', { ...ok, narrative: 'נכשלתם במשימה, וחסרות עוד תובנות.' }],
    ['ביטוי אסור', { ...ok, title: 'הסיום הרע' }],
    ['מנגנון המשחק', { ...ok, narrative: 'אספתם רק שני גבישים, וחסרות עוד תובנות.' }],
  ])('%s: נדחה וצריך המרה', (_n, e) => {
    expect(endingProblem(e)).not.toBeNull()
    expect(needsEndingRewrite(e)).toBe(true)
  })
  it('צירוף שגוי ("בואו ת…"): נדחה', () => {
    expect(endingProblem({ ...ok, drHoloDialog: 'בואו תחזרו שוב ותגלו את השאר.' })).not.toBeNull()
  })
  it('טקסט ישן בלי תובנות והזמנה: צריך המרה', () => {
    expect(needsEndingRewrite({ title: 'כמעט', narrative: 'הדוקטור מחייך: זה לא נורא.' })).toBe(true)
    expect(needsEndingRewrite(null)).toBe(false)
  })
  it('חסרים "תובנות" או הזמנה לשחק, או ארוך מדי: נדחה', () => {
    expect(endingProblem({ ...ok, narrative: 'מצאתם את המפה.', drHoloDialog: 'בואו ננסה שוב.' })).not.toBeNull()
    expect(endingProblem({ title: 'פתוח', narrative: 'חסרות עוד תובנות.', drHoloDialog: 'להתראות.' })).not.toBeNull()
    expect(endingProblem({ ...ok, narrative: `${'מילה '.repeat(36)} תובנות` })).not.toBeNull()
  })
})
