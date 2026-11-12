/* מצב שורת הקריסטלים, לפי מספר הקריסטלים השלמים (ראו shared/ui/Gem.tsx):
   base = פחות מ-3 (בלי זוהר), warm = 3 ומעלה (פעימה כתומה), full = 5 מלאים (מילוי אפרסק והבזקים). */
export type GemTier = 'base' | 'warm' | 'full'

export function gemTier(whole: number): GemTier {
  return whole >= 5 ? 'full' : whole >= 3 ? 'warm' : 'base'
}
