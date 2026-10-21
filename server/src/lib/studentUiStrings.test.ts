/* כלל "פנייה לתלמיד בלשון רבים": כל מחרוזות הממשק שהתלמיד רואה (מסך המשחק, האתגרים, בית התלמיד, כניסת תלמיד)
   עוברות את אותה בדיקה דטרמיניסטית כמו הטקסט שנוצר. הערות קוד לא נבדקות. */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { scanStudentText } from './studentAddress.js'

const SRC = path.resolve(__dirname, '../../../src')
const FILES = [
  ...walk(path.join(SRC, 'features/player')),
  path.join(SRC, 'features/auth/ClassEntry.tsx'),
  path.join(SRC, 'features/auth/PinScreen.tsx'),
].filter((f) => /\.(tsx?|ts)$/.test(f) && !/\.test\.|Dev(Gallery|Harness)/.test(f))

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => { const p = path.join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p] })
}

/* מחרוזות עבריות מתוך קוד: literal-ים וטקסט JSX, בלי הערות */
export function hebrewStrings(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, ' ').split(/\r?\n/).map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n')
  const out: string[] = []
  for (const m of code.matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) if (/[א-ת]/.test(m[2])) out.push(m[2])
  for (const m of code.matchAll(/>([^<>{}]*[א-ת][^<>{}]*)</g)) out.push(m[1].trim())
  return out
}

describe('מחרוזות ממשק התלמיד — לשון רבים', () => {
  it('הקבצים נמצאו (בדיקת בריאות של הסורק)', () => {
    expect(FILES.length).toBeGreaterThan(15)
    expect(FILES.reduce((n, f) => n + hebrewStrings(readFileSync(f, 'utf8')).length, 0)).toBeGreaterThan(120)
  })
  it('אפס הפרות', () => {
    const bad: string[] = []
    for (const f of FILES) {
      for (const s of hebrewStrings(readFileSync(f, 'utf8'))) {
        for (const v of scanStudentText(s, true)) bad.push(`${path.relative(SRC, f)}: "${s.slice(0, 60)}" → ${v.kind} (${v.match})`)
      }
    }
    expect(bad).toEqual([])
  })
  it('הסורק באמת תופס (מונע מבחן ריק): מחרוזות ישנות מסומנות', () => {
    for (const old of ['אני מוותר/ת 🏳️', 'בחר/י את השם שלך', 'פתרת את האתגר', 'מה הקוד הסודי שלך?', 'השער נעול! חסר לך: מפתח']) {
      expect(scanStudentText(old, true).length, old).toBeGreaterThan(0)
    }
  })
})
