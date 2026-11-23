import { describe, expect, it } from 'vitest'
import { GEM_GRADIENT_MID, GEM_PATH, GEM_STROKE, GEM_VIEWBOX, gemFillY, gemSvgMarkup } from './gemShape'
import { readHexTokens } from '../../styles/readTokens'

/* הקובץ שסופק, כטקסט: הצורה, הקו והמילוי התכול שבקוד חייבים להיות זהים לו */
const FILE = (import.meta.glob('/public/holoacademy-crystal.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/public/holoacademy-crystal.svg']
const attr = (name: string) => new RegExp(`${name}="([^"]+)"`).exec(FILE)![1]
const T = readHexTokens()

describe('צורת הקריסטל זהה ל-holoacademy-crystal.svg', () => {
  it('אותו viewBox, אותו מסלול, אותו עובי קו ואותו צבע קו', () => {
    expect(attr('viewBox')).toBe(GEM_VIEWBOX)
    expect(attr(' d')).toBe(GEM_PATH)
    expect(Number(attr('stroke-width'))).toBe(GEM_STROKE)
    expect(attr('stroke-linejoin')).toBe('round')
    expect(attr('stroke').toLowerCase()).toBe(T['--color-holo-deep'])
  })
  it('המעבר התכול: אותם צבעים ואותן עצירות כמו בקובץ, באלכסון', () => {
    const stops = [...FILE.matchAll(/<stop offset="([^"]+)" stop-color="([^"]+)"/g)].map((m) => [Number(m[1]), m[2].toLowerCase()])
    expect(stops).toEqual([[0, T['--color-crystal-cyan-top']], [GEM_GRADIENT_MID, T['--color-crystal-cyan-mid']], [1, T['--color-crystal-cyan-bottom']]])
    expect(FILE).toContain('x1="0" y1="0" x2="1" y2="1"')
  })
  it('בצורה אין קווים פנימיים: מסלול סגור אחד', () => {
    expect((GEM_PATH.match(/M/g) ?? []).length).toBe(1)
    expect(GEM_PATH.trim().endsWith('Z')).toBe(true)
  })
  it('הגביש שעף מצויר מאותם קבועים', () => {
    const svg = gemSvgMarkup()
    expect(svg).toContain(`d="${GEM_PATH}"`)
    expect(svg).toContain(`viewBox="${GEM_VIEWBOX}"`)
    expect(svg).toContain(`stroke-width="${GEM_STROKE}"`)
  })
})

describe('קו המילוי של קריסטל חלקי (לפי שטח)', () => {
  it('ריק: מתחת לצורה; מלא: מעליה', () => {
    expect(gemFillY(0)).toBeGreaterThan(44)
    expect(gemFillY(1)).toBeLessThan(0)
  })
  it('עולה ככל שהחלק גדל, ונשאר בתוך הצורה', () => {
    let prev = 41
    for (let f = 0.05; f < 1; f += 0.05) {
      const y = gemFillY(f)
      expect(y).toBeLessThan(prev)
      expect(y).toBeGreaterThan(1.5)
      prev = y
    }
  })
  it('חצי קריסטל מתמלא עד קו הרוחב בערך (חצי מהשטח), ולא עד חצי מהגובה', () => {
    expect(gemFillY(0.5)).toBeGreaterThan(16.5)
    expect(gemFillY(0.5)).toBeLessThan(18.5)
  })
  it('השטח שמתחת לקו הוא החלק שהתבקש', () => {
    /* שטח הצורה מתחת ל-y, בחישוב ישיר */
    const width = (y: number) => (y >= 17.6 ? 45 * (41 - y) / 23.4 : 45 - (23.8 / 16.1) * (17.6 - y))
    const below = (y0: number) => { let a = 0; const step = 0.001; for (let y = y0; y < 41; y += step) a += width(y + step / 2) * step; return a }
    const total = below(1.5)
    for (const f of [0.1, 0.25, 0.5, 0.75, 0.9]) expect(below(gemFillY(f)) / total).toBeCloseTo(f, 2)
  })
})
