/* רקע העמוד: חזית שרת, מופשטת (לבקשת המשתמש, לפי חזית של שרת עם מסגרת משושים): רשת של משושים גבוהים (קודקוד למעלה ולמטה),
   מוטות בהירים עם שפה דקה, ומאחוריהם שקעים כהים יותר ובהם מגשי דיסק — פסים אנכיים וטבעת קטנה בראש כל מגש, ומדי פעם נורית.
   אריח אחד חוזר על עצמו. הצבעים נגזרים מהטוקנים (לילך, המכונה, לבן, הולו, אנושיות), בלי מעבר צבע ובלי תנועה.
   הקובץ מייצר את השורה --page-background ב-tokens.css (scripts/genServerBackground.ts), ו-serverBackground.test.ts בודק שהיא עדכנית. */

/* משושה: רוחב (מצלע לצלע), גובה (מקודקוד לקודקוד), וגובה החוד. שורה כל height - point, ושורה שנייה מוזזת בחצי רוחב */
export const HEX = { width: 120, height: 172, point: 42 } as const
export const TILE = { width: HEX.width, height: 2 * (HEX.height - HEX.point) } as const

export interface ServerPalette { bg: string; machine: string; surface: string; holo: string; human: string }

/* ערבוב של שני צבעי hex (p = החלק של a), כמו color-mix ב-srgb */
export function mixHex(a: string, b: string, p: number): string {
  const h = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16))
  const A = h(a), B = h(b)
  return '#' + A.map((v, i) => Math.round(v * p + B[i] * (1 - p)).toString(16).padStart(2, '0')).join('').toUpperCase()
}

export function serverColors(t: ServerPalette) {
  return {
    bar: mixHex(t.surface, t.bg, 0.55),     // מוטות המשושים: בהירים מהרקע
    cavity: mixHex(t.machine, t.bg, 0.22),  // השקע שמאחורי המשושה
    line: mixHex(t.machine, t.bg, 0.42),    // שפת המוטות, מגשים וטבעות. הכהה ביותר בציור: טקסט muted עליו עדיין 4.5:1
    holo: mixHex(t.holo, t.bg, 0.55),       // נוריות, מעומעמות כדי שלא יתחרו בתוכן
    human: mixHex(t.human, t.bg, 0.55),
  }
}

/* הנקודות של משושה סביב מרכז */
function hexPoints(cx: number, cy: number): string {
  const { width: w, height: h, point: p } = HEX
  return [[0, -h / 2], [w / 2, -h / 2 + p], [w / 2, h / 2 - p], [0, h / 2], [-w / 2, h / 2 - p], [-w / 2, -h / 2 + p]]
    .map(([x, y]) => `${+(cx + x).toFixed(1)},${+(cy + y).toFixed(1)}`).join(' ')
}

export function serverTileSvg(t: ServerPalette): string {
  const C = serverColors(t)
  const { width: W, height: H } = TILE
  const step = HEX.height - HEX.point
  /* מגש דיסק כל 15px: קו מפריד, וטבעת בראש המגש; שורת מגשים בכל שורת משושים */
  const tray = 15
  const s: string[] = [
    `<defs><pattern id='t' width='${tray}' height='${step}' patternUnits='userSpaceOnUse'>`
      + `<rect x='0' y='0' width='1.4' height='${step}' fill='${C.line}'/>`
      + `<circle cx='${tray / 2 + 0.7}' cy='14' r='3.4' fill='none' stroke='${C.line}' stroke-width='1.6'/>`
      + `<rect x='${tray / 2 - 2.3}' y='${step - 30}' width='6' height='16' rx='1.5' fill='none' stroke='${C.line}' stroke-width='1.2'/>`
      + `</pattern></defs>`,
    `<rect width='${W}' height='${H}' fill='${C.cavity}'/>`,
    `<rect width='${W}' height='${H}' fill='url(%23t)'/>`.replace('%23', '#'),
  ]
  /* נוריות: מעט, במקומות קבועים באריח */
  for (const [x, y, c] of [[23, 22, C.holo], [83, 22 + step, C.human], [68, 22, C.holo]] as const) s.push(`<circle cx='${x}' cy='${y}' r='2.2' fill='${c}'/>`)
  /* המוטות: כל המשושים שנוגעים באריח, בשפה דקה (קו רחב בצבע השפה ומעליו קו צר בצבע המוט) */
  const centers: [number, number][] = []
  for (let r = -1; r <= 3; r++) for (let c = -1; c <= 2; c++) centers.push([c * W + (r % 2 ? W / 2 : 0), r * step])
  for (const [cx, cy] of centers) s.push(`<polygon points='${hexPoints(cx, cy)}' fill='none' stroke='${C.line}' stroke-width='18' stroke-linejoin='round'/>`)
  for (const [cx, cy] of centers) s.push(`<polygon points='${hexPoints(cx, cy)}' fill='none' stroke='${C.bar}' stroke-width='14.5' stroke-linejoin='round'/>`)
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}' viewBox='0 0 ${W} ${H}'>${s.join('')}</svg>`
}

/* ערך ה-CSS של --page-background: האריח, ומתחתיו צבע הרקע */
export function pageBackgroundCss(t: ServerPalette): string {
  const uri = serverTileSvg(t).replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E')
  return `url("data:image/svg+xml,${uri}") 0 0 / ${TILE.width}px ${TILE.height}px, var(--color-machine-bg)`
}

/* קריאת הטוקנים מתוך tokens.css */
export function paletteFromTokens(css: string): ServerPalette {
  const v = (name: string) => { const m = css.match(new RegExp(`--${name}:[ 	]*(#[0-9A-Fa-f]{6})`)); if (!m) throw new Error(`token --${name} missing`); return m[1].toUpperCase() }
  return { bg: v('color-machine-bg'), machine: v('color-machine'), surface: v('color-surface'), holo: v('color-holo'), human: v('color-human') }
}

export const PAGE_BG_LINE = /^ {2}--page-background: .*$/m
