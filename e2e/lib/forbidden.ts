/* ──────────────────────────────────────────────────────────────────────────
   מילים אסורות בטקסט הגלוי של מסכי מורה (CLAUDE.md, עיקרון 5): בלי ז'רגון סטטיסטי בממשק.
   סריקה על document.body.innerText בלבד (לא title/aria), ללא [data-how-we-calc].
   טהור (ללא דפדפן) — נבדק ב-selftest. סימון "גזע" בעברית כדי לתפוס ריבוי/סמיכות/קידומות.
   ────────────────────────────────────────────────────────────────────────── */
import type { ForbiddenHit } from './types.ts'

interface Rule { word: string; re: RegExp }

/* word = התווית שמוצגת בדוח (כפי שנוסחה בדרישה) */
export const FORBIDDEN_RULES: readonly Rule[] = [
  { word: 'וקטור', re: /וקטור/g },
  { word: 'p-value', re: /\bp[\s\-–]?value\b/gi },
  { word: 'p מתוקן', re: /\bp[\s\-–]*מתוקן/gi },
  { word: 'מובהק', re: /מובהק/g },
  { word: 'BH', re: /\bBH\b/g },
  { word: 'Benjamini', re: /benjamini/gi },
  { word: 'אינדקס', re: /אינדקס/g },
  { word: 'קורלציה', re: /קורלצי/g },
  { word: 'גודל אפקט', re: /גודל[י]?\s+ה?אפקט/g },
  { word: 'הסתברות', re: /הסתברו/g },
]

const CTX = 28

export function scanForbidden(text: string, perWordLimit = 6): ForbiddenHit[] {
  const hits: ForbiddenHit[] = []
  for (const { word, re } of FORBIDDEN_RULES) {
    re.lastIndex = 0
    let n = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const start = Math.max(0, m.index - CTX)
      const end = Math.min(text.length, m.index + m[0].length + CTX)
      const context = (start > 0 ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ').trim() + (end < text.length ? '…' : '')
      hits.push({ word, match: m[0], context })
      if (++n >= perWordLimit) break
      if (m[0].length === 0) re.lastIndex++
    }
  }
  return hits
}
