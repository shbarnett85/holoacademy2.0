import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/* חוק שלב D: אסור טקסט קשיח (משפטים בעברית) ב-fixtures. כל ניסוח ממצא/המלצה/תדריך/משוב/הודעה
   מגיע מ-findingsNarrative.ts. הבדיקה סורקת את קבצי הנתונים והספק אחרי הסרת הערות. */
const here = (f: string): string => fileURLToPath(new URL(f, import.meta.url))
const strip = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
/* מחרוזת עם שתי מילים עבריות ויותר = משפט. שמות (בית ספר) מותרים במפורש. */
const SENTENCE = /(['"`])(?:(?!\1)[^\n])*?[א-ת]{2,}[ ,][א-ת]{2,}(?:(?!\1)[^\n])*?\1/g
const ALLOWED = ['בית הספר "אופק" (הדגמה)']

describe('אין טקסט קשיח ב-fixtures', () => {
  for (const file of ['demoWorld.ts', 'engine.ts', 'demoProvider.ts', 'access.ts', 'derive.ts', 'provider.ts', 'viewer.ts']) {
    it(file, () => {
      const code = strip(readFileSync(here(`./${file}`), 'utf8'))
      const hits = (code.match(SENTENCE) ?? []).filter((m) => !ALLOWED.some((a) => m.includes(a)))
      expect(hits, hits.join('\n')).toEqual([])
    })
  }
})
