import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MSG_RESULTS_NOT_FOR_ROLE } from './realResults.js'

/* חוק שלב UX/D: אסור משפטים בעברית בקוד הספקים. כל טקסט שמוצג למשתמש מגיע מ-findingsNarrative.ts.
   היוצא מן הכלל היחיד: הודעת ה-403 לתפקיד ללא תוצאות (קבוע בקובץ הספק). */
const here = (f: string): string => fileURLToPath(new URL(f, import.meta.url))
const strip = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
/* מחרוזת עם שתי מילים עבריות ויותר = משפט */
const SENTENCE = /(['"`])(?:(?!\1)[^\n])*?[א-ת]{2,}[ ,][א-ת]{2,}(?:(?!\1)[^\n])*?\1/g
const ALLOWED = [MSG_RESULTS_NOT_FOR_ROLE]

describe('אין משפטים קשיחים בקבצי ספק התוצאות', () => {
  for (const file of ['./core.ts', './realResults.ts', '../../routes/results.ts']) {
    it(file, () => {
      const code = strip(readFileSync(here(file), 'utf8'))
      const hits = (code.match(SENTENCE) ?? []).filter((m) => !ALLOWED.some((a) => m.includes(a)))
      expect(hits, hits.join('\n')).toEqual([])
    })
  }

  it('הודעת ה-403 היא קבוע יחיד ואינה ריקה', () => {
    expect(MSG_RESULTS_NOT_FOR_ROLE.length).toBeGreaterThan(10)
  })
})
