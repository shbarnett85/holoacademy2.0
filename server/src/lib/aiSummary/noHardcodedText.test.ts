import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/* חוק שלב UX/D: אסור משפטים בעברית בקוד השירות והנתיב. כל טקסט שמוצג למשתמש (תוויות, הודעות, התבנית הדטרמיניסטית, העובדות) חי ב-findingsNarrative.ts,
   והעברית החופשית היחידה בשירות היא הפרומפט למודל (prompt.ts). */
const here = (f: string): string => fileURLToPath(new URL(f, import.meta.url))
const strip = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
/* מחרוזת עם שתי מילים עבריות ויותר = משפט */
const SENTENCE = /(['"`])(?:(?!\1)[^\n])*?[א-ת]{2,}[ ,][א-ת]{2,}(?:(?!\1)[^\n])*?\1/g
const ANY_HEBREW = /(['"`])[^'"`\n]*[א-ת][^'"`\n]*\1/g

const SERVICE_FILES = ['./inputs.ts', './guard.ts', './fallback.ts', './service.ts', './store.ts', './llm.ts', '../../routes/aiSummary.ts']

describe('שירות הסיכום: אין טקסט קשיח', () => {
  for (const file of SERVICE_FILES) {
    it(`${file.replace('../../', '')}: אין משפטים ואין אף מחרוזת עברית`, () => {
      const code = strip(readFileSync(here(file), 'utf8'))
      expect(code.match(SENTENCE) ?? [], 'משפטים').toEqual([])
      expect(code.match(ANY_HEBREW) ?? [], 'מחרוזות עבריות').toEqual([])
    })
  }

  it('prompt.ts הוא הקובץ היחיד עם עברית חופשית — והיא הנחיה למודל, לא טקסט ממשק', () => {
    const code = readFileSync(here('./prompt.ts'), 'utf8')
    expect(code).toMatch(/[א-ת]{2,} [א-ת]{2,}/)
    expect(code).toContain("SUMMARY_PROMPT_VERSION = 'ai-sum-v1'")
  })

  it('השירות והנתיב אינם תלויים בספקי v2/תוצאות (ההרשאה והטעינה מוזרקות) ואינם מייבאים מנוע מודל חי', () => {
    for (const f of ['./inputs.ts', './guard.ts', './prompt.ts', './fallback.ts', './llm.ts', './store.ts', './service.ts', '../../routes/aiSummary.ts']) {
      const code = strip(readFileSync(here(f), 'utf8'))
      expect(code, f).not.toMatch(/from\s+['"][^'"]*\/(analyticsV2|results)\/[^'"]*(provider|Provider|viewer|access|demoResults|realResults|demoWorld|engine|core)[^'"]*['"]/)
      expect(code, f).not.toMatch(/resolveV2Context|liveProvider|demoProvider|realProvider/)
    }
  })

  it('הקבצים טהורים מ-Date.now / Math.random בלוגיקה (השעון מוזרק)', () => {
    for (const f of ['./inputs.ts', './guard.ts', './fallback.ts']) {
      const code = strip(readFileSync(here(f), 'utf8'))
      expect(code, f).not.toMatch(/Date\.now\s*\(|Math\.random\s*\(|new Date\(\s*\)/)
    }
  })
})
