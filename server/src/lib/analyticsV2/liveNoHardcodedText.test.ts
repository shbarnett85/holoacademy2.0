import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/* אין משפטים בעברית בקוד הטעינה החיה: כל טקסט שמוצג למשתמש חי ב-findingsNarrative.ts. הבדיקה סורקת מחרוזות (אחרי הסרת הערות). */
const here = (f: string): string => fileURLToPath(new URL(f, import.meta.url))
const strip = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const SENTENCE = /(['"`])(?:(?!\1)[^\n])*?[א-ת]{2,}[ ,][א-ת]{2,}(?:(?!\1)[^\n])*?\1/g

describe('אין טקסט קשיח בטעינה החיה', () => {
  const files = [
    './realWorld/assemble.ts', './realWorld/analyzeRaw.ts', './realWorld/catalog.ts', './realWorld/coverage.ts', './realWorld/fetchRaw.ts',
    './realWorld/loadWorld.ts', './realWorld/queryUtil.ts', './realWorld/rawTypes.ts', './analysisCache.ts', './analysisMerge.ts', './liveSource.ts',
  ]
  for (const file of files) {
    it(file, () => {
      const hits = strip(readFileSync(here(file), 'utf8')).match(SENTENCE) ?? []
      expect(hits, hits.join('\n')).toEqual([])
    })
  }
})
