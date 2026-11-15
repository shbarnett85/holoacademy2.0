import { describe, expect, it } from 'vitest'
import { TOKENS_CSS, readHexTokens } from './readTokens'
import { contrastRatio } from '../shared/lib/subjects'
import { PAGE_BG_LINE, pageBackgroundCss, paletteFromTokens, pixelColors } from './pageBackground'

describe('רקע העמוד: רשת פיקסלים', () => {
  const palette = paletteFromTokens(TOKENS_CSS)
  it('השורה ב-tokens.css נוצרה מהטוקנים הנוכחיים (אחרת: npx tsx scripts/genPageBackground.ts)', () => {
    expect(TOKENS_CSS.match(PAGE_BG_LINE)?.[0]).toBe(`  --page-background: ${pageBackgroundCss(palette)};`)
  })
  it('טקסט שיושב ישר על הרקע נשאר קריא גם על הצבע הכהה ביותר בציור', () => {
    const T = readHexTokens()
    const C = pixelColors(palette)
    for (const bg of [C.gap, C.light, C.mid, C.dark, C.holo, C.human, palette.bg]) {
      expect(contrastRatio(T['--color-ink'], bg.toLowerCase()), `ink על ${bg}`).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(T['--color-muted'], bg.toLowerCase()), `muted על ${bg}`).toBeGreaterThanOrEqual(4.5)
      /* כותרות (machine-deep) גדולות: 3:1 */
      expect(contrastRatio(T['--color-machine-deep'], bg.toLowerCase()), `machine-deep על ${bg}`).toBeGreaterThanOrEqual(3)
    }
  })
})
