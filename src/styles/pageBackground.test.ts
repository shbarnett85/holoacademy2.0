import { describe, expect, it } from 'vitest'
import { TOKENS_CSS, readHexTokens } from './readTokens'
import { contrastRatio } from '../shared/lib/subjects'
import { CIRCUIT, PAGE_BG_LINE, circuitColors, circuitTraces, pageBackgroundCss, paletteFromTokens } from './pageBackground'

describe('רקע העמוד: מעגל מודפס', () => {
  const palette = paletteFromTokens(TOKENS_CSS)
  it('השורה ב-tokens.css נוצרה מהטוקנים הנוכחיים (אחרת: npx tsx scripts/genPageBackground.ts)', () => {
    expect(TOKENS_CSS.match(PAGE_BG_LINE)?.[0]).toBe(`  --page-background: ${pageBackgroundCss(palette)};`)
  })
  it('טקסט שיושב ישר על הרקע נשאר קריא גם על הצבע הכהה ביותר בציור', () => {
    const T = readHexTokens()
    const C = circuitColors(palette)
    for (const bg of [C.trace, C.pad, palette.bg]) {
      expect(contrastRatio(T['--color-ink'], bg.toLowerCase()), `ink על ${bg}`).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(T['--color-muted'], bg.toLowerCase()), `muted על ${bg}`).toBeGreaterThanOrEqual(4.5)
      /* כותרות (machine-deep) גדולות: 3:1 */
      expect(contrastRatio(T['--color-machine-deep'], bg.toLowerCase()), `machine-deep על ${bg}`).toBeGreaterThanOrEqual(3)
    }
  })
  it('המסלולים: מספר קבוע, בתוך האריח (בלי תפר), ובלי שני מסלולים באותה נקודה', () => {
    const traces = circuitTraces()
    expect(traces).toHaveLength(CIRCUIT.traces)
    const seen = new Set<string>()
    for (const pts of traces) {
      expect(pts.length).toBeGreaterThanOrEqual(3)
      for (const [x, y] of pts) {
        expect(x).toBeGreaterThanOrEqual(1); expect(x).toBeLessThanOrEqual(CIRCUIT.cols - 1)
        expect(y).toBeGreaterThanOrEqual(1); expect(y).toBeLessThanOrEqual(CIRCUIT.rows - 1)
        expect(seen.has(`${x},${y}`), `נקודה ${x},${y} בשני מסלולים`).toBe(false)
        seen.add(`${x},${y}`)
      }
    }
    /* אותו פיזור בכל יצירה */
    expect(circuitTraces()).toEqual(traces)
  })
})
