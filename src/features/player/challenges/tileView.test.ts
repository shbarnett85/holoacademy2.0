import { describe, expect, it } from 'vitest'
import { TILE_SAMPLE, sameLookTiles, tileBackground, tilesSolved } from './tileView'

/* לוח 2×2: צבע אחיד לכל אריח, עם פרט קטן אופציונלי */
function board(colors: number[], dot?: { tile: number; value: number }): Uint8ClampedArray {
  const n = 2
  const side = n * TILE_SAMPLE
  const px = new Uint8ClampedArray(side * side * 4)
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const tile = Math.floor(y / TILE_SAMPLE) * n + Math.floor(x / TILE_SAMPLE)
      const v = colors[tile]
      const i = (y * side + x) * 4
      px[i] = px[i + 1] = px[i + 2] = v
      px[i + 3] = 255
    }
  }
  if (dot) {
    const i = (Math.floor(dot.tile / n) * TILE_SAMPLE * side + (dot.tile % n) * TILE_SAMPLE) * 4
    px[i] = px[i + 1] = px[i + 2] = dot.value
  }
  return px
}

describe('tileBackground', () => {
  it('תמונה ריבועית: כל התמונה נכנסת, בלי חיתוך', () => {
    expect(tileBackground(0, 0, 4, 1)).toEqual({ size: '400% 400%', position: '0% 0%' })
    expect(tileBackground(3, 3, 4, 1)).toEqual({ size: '400% 400%', position: '100% 100%' })
  })
  it('תמונה רחבה: הגובה מלא, היחס נשמר והעודף נחתך שווה בשווה מהצדדים', () => {
    const t = tileBackground(0, 0, 4, 2)
    expect(t.size).toBe('800% 400%')
    /* רוחב 8 אריחים, 4 מוצגים: 2 נחתכים מכל צד, ולכן האריח הראשון מתחיל ב-2/7 */
    expect(parseFloat(t.position)).toBeCloseTo((2 / 7) * 100)
    expect(parseFloat(tileBackground(3, 0, 4, 2).position)).toBeCloseTo((5 / 7) * 100)
  })
  it('תמונה גבוהה: אותו דבר בציר השני', () => {
    const t = tileBackground(1, 0, 2, 0.5)
    expect(t.size).toBe('200% 400%')
    expect(t.position.split(' ')[1]).toBe(`${(1 / 3) * 100}%`)
  })
})

describe('sameLookTiles', () => {
  it('שני אריחי שמיים שחורים נחשבים זהים, גם עם כוכב קטן', () => {
    const look = sameLookTiles(board([0, 0, 200, 90], { tile: 1, value: 255 }), 2)
    expect(look[0].has(1)).toBe(true)
    expect(look[1].has(0)).toBe(true)
    expect(look[2].has(3)).toBe(false)
  })
  it('אריחים שונים לא מתערבבים', () => {
    const look = sameLookTiles(board([10, 80, 150, 220]), 2)
    expect(look.every((s) => s.size === 1)).toBe(true)
  })
})

describe('tilesSolved', () => {
  const look = sameLookTiles(board([0, 0, 200, 90]), 2)
  it('החלפה בין שני אריחים זהים עדיין פתורה', () => {
    expect(tilesSolved([1, 0, 2, 3], look)).toBe(true)
  })
  it('אריח שונה במקום לא נכון אינו פתור', () => {
    expect(tilesSolved([0, 1, 3, 2], look)).toBe(false)
    expect(tilesSolved([2, 1, 0, 3], look)).toBe(false)
  })
  it('בלי ניתוח תמונה: רק הסדר המדויק', () => {
    expect(tilesSolved([1, 0, 2, 3], null)).toBe(false)
    expect(tilesSolved([0, 1, 2, 3], null)).toBe(true)
  })
})
