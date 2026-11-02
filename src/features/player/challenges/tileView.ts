/* פאזל ההחלפות: חיתוך התמונה לריבוע בלי למעוך אותה, וזיהוי אריחים שנראים אותו דבר (שמיים שחורים, קיר אחיד).
   pure, ונבדק ב-tileView.test.ts. */

/* כמה מהאריח נדגם לכל ציר: 8×8 מספיק כדי להבדיל פרט, וכוכב קטן נעלם במיצוע */
export const TILE_SAMPLE = 8
/* הפרש ממוצע לערוץ צבע (0–255) שמתחתיו העין לא מבדילה בין שני אריחים */
const SAME_LOOK_DIFF = 7

/* background-size ו-background-position של אריח בלוח ריבועי: התמונה בגובה או ברוחב הלוח, והעודף נחתך מהצדדים שווה בשווה */
export function tileBackground(col: number, row: number, n: number, aspect: number): { size: string; position: string } {
  const w = n * Math.max(aspect, 1)
  const h = n * Math.max(1 / aspect, 1)
  const axis = (i: number, full: number) => (full <= 1 ? 0 : ((full - n) / 2 + i) / (full - 1)) * 100
  return { size: `${w * 100}% ${h * 100}%`, position: `${axis(col, w)}% ${axis(row, h)}%` }
}

/* pixels: RGBA של לוח ריבועי בגודל n*TILE_SAMPLE. מחזיר לכל אריח את האריחים שנראים כמוהו (כולל עצמו) */
export function sameLookTiles(pixels: ArrayLike<number>, n: number): Set<number>[] {
  const side = n * TILE_SAMPLE
  const diff = (a: number, b: number): number => {
    const [ar, ac, br, bc] = [Math.floor(a / n), a % n, Math.floor(b / n), b % n]
    let sum = 0
    for (let y = 0; y < TILE_SAMPLE; y++) {
      for (let x = 0; x < TILE_SAMPLE; x++) {
        const pa = ((ar * TILE_SAMPLE + y) * side + ac * TILE_SAMPLE + x) * 4
        const pb = ((br * TILE_SAMPLE + y) * side + bc * TILE_SAMPLE + x) * 4
        sum += Math.abs(pixels[pa] - pixels[pb]) + Math.abs(pixels[pa + 1] - pixels[pb + 1]) + Math.abs(pixels[pa + 2] - pixels[pb + 2])
      }
    }
    return sum / (TILE_SAMPLE * TILE_SAMPLE * 3)
  }
  const count = n * n
  const out = Array.from({ length: count }, (_, i) => new Set([i]))
  for (let a = 0; a < count; a++) {
    for (let b = a + 1; b < count; b++) {
      if (diff(a, b) < SAME_LOOK_DIFF) { out[a].add(b); out[b].add(a) }
    }
  }
  return out
}

/* אריח value יושב במקום טוב אם זה מקומו, או מקום של אריח שנראה בדיוק כמוהו */
export const tileFits = (value: number, pos: number, look: readonly Set<number>[] | null): boolean =>
  value === pos || !!look?.[value]?.has(pos)

export const tilesSolved = (order: readonly number[], look: readonly Set<number>[] | null): boolean =>
  order.every((value, pos) => tileFits(value, pos, look))
