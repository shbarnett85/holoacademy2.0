/* רקע העמוד: רשת פיקסלים (לבקשת המשתמש) — תאים מרובעים עם רווח דק ביניהם, כמו מסך שמגדילים עד שרואים את הפיקסלים.
   רוב התאים בצבע הרקע; חלק קטן, בפיזור קבוע (מחולל מספרים עם זרע קבוע), בהיר או כהה מעט, ומעטים בגוון עמום של הולו או אנושיות.
   אריח אחד חוזר על עצמו. הצבעים נגזרים מהטוקנים (לילך, המכונה, לבן, הולו, אנושיות), בלי מעבר צבע ובלי תנועה.
   הקובץ מייצר את השורה --page-background ב-tokens.css (scripts/genPageBackground.ts), ו-pageBackground.test.ts בודק שהיא עדכנית. */

/* תא של 12px: ריבוע של 11px ורווח של 1px. אריח של 24×24 תאים, כדי שהחזרה לא תבלוט */
export const PIXEL = { cell: 12, gap: 1, cells: 24 } as const
export const TILE = { width: PIXEL.cell * PIXEL.cells, height: PIXEL.cell * PIXEL.cells } as const

export interface ServerPalette { bg: string; machine: string; surface: string; holo: string; human: string }

/* ערבוב של שני צבעי hex (p = החלק של a), כמו color-mix ב-srgb */
export function mixHex(a: string, b: string, p: number): string {
  const h = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16))
  const A = h(a), B = h(b)
  return '#' + A.map((v, i) => Math.round(v * p + B[i] * (1 - p)).toString(16).padStart(2, '0')).join('').toUpperCase()
}

export function pixelColors(t: ServerPalette) {
  return {
    gap: mixHex(t.machine, t.bg, 0.3),      // הרווח בין התאים: קווי הרשת
    light: mixHex(t.surface, t.bg, 0.55),   // תא בהיר
    mid: mixHex(t.machine, t.bg, 0.16),     // תא כהה מעט
    dark: mixHex(t.machine, t.bg, 0.34),    // תא כהה. הכהה ביותר בציור: טקסט muted עליו עדיין 4.5:1
    holo: mixHex(t.holo, t.bg, 0.4),        // תאים צבעוניים, עמומים כדי שלא יתחרו בתוכן
    human: mixHex(t.human, t.bg, 0.4),
  }
}

/* מחולל מספרים עם זרע קבוע (mulberry32): אותו פיזור בכל יצירה */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

export function pageTileSvg(t: ServerPalette): string {
  const C = pixelColors(t)
  const { cell, gap, cells } = PIXEL
  const { width: W, height: H } = TILE
  const size = cell - gap
  const s: string[] = [
    `<defs><pattern id='c' width='${cell}' height='${cell}' patternUnits='userSpaceOnUse'><rect width='${size}' height='${size}' fill='${t.bg}'/></pattern></defs>`,
    `<rect width='${W}' height='${H}' fill='${C.gap}'/>`,
    `<rect width='${W}' height='${H}' fill='url(#c)'/>`,
  ]
  const r = rng(20261115)
  for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) {
    const v = r()
    const fill = v < 0.07 ? C.light : v < 0.13 ? C.mid : v < 0.16 ? C.dark : v < 0.168 ? C.holo : v < 0.174 ? C.human : null
    if (fill) s.push(`<rect x='${x * cell}' y='${y * cell}' width='${size}' height='${size}' fill='${fill}'/>`)
  }
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}' viewBox='0 0 ${W} ${H}'>${s.join('')}</svg>`
}

/* ערך ה-CSS של --page-background: האריח, ומתחתיו צבע הרקע */
export function pageBackgroundCss(t: ServerPalette): string {
  const uri = pageTileSvg(t).replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E')
  return `url("data:image/svg+xml,${uri}") 0 0 / ${TILE.width}px ${TILE.height}px, var(--color-machine-bg)`
}

/* קריאת הטוקנים מתוך tokens.css */
export function paletteFromTokens(css: string): ServerPalette {
  const v = (name: string) => { const m = css.match(new RegExp(`--${name}:[ 	]*(#[0-9A-Fa-f]{6})`)); if (!m) throw new Error(`token --${name} missing`); return m[1].toUpperCase() }
  return { bg: v('color-machine-bg'), machine: v('color-machine'), surface: v('color-surface'), holo: v('color-holo'), human: v('color-human') }
}

export const PAGE_BG_LINE = /^ {2}--page-background: .*$/m
