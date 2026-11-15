/* רקע העמוד: חזית של שרתים בארון (לבקשת המשתמש) — ארונות זה לצד זה, מסילות עם חורים, ובכל ארון יחידות:
   שרת (סורג אוורור, נוריות, מגשי דיסק), אחסון (שמונה מגשים) ולוח ניקוב. אריח אחד של 480×168 (שלוש יחידות של 56px), חוזר על עצמו.
   הצבעים נגזרים מהטוקנים (לילך, המכונה, לבן, הולו, אנושיות) בעצירה חדה, בלי מעבר צבע ובלי זוהר. הרקע לא זז.
   הקובץ מייצר את השורה --page-background ב-tokens.css (scripts/genServerBackground.ts), ו-serverBackground.test.ts בודק שהיא עדכנית. */

export const TILE = { width: 480, height: 168, unit: 56 } as const

export interface ServerPalette { bg: string; machine: string; surface: string; holo: string; human: string }

/* ערבוב של שני צבעי hex (p = החלק של a), כמו color-mix ב-srgb */
export function mixHex(a: string, b: string, p: number): string {
  const h = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16))
  const A = h(a), B = h(b)
  return '#' + A.map((v, i) => Math.round(v * p + B[i] * (1 - p)).toString(16).padStart(2, '0')).join('').toUpperCase()
}

export function serverColors(t: ServerPalette) {
  return {
    face: mixHex(t.surface, t.bg, 0.4),   // חזית היחידה: בהירה מהרקע, כך שהרווחים בין היחידות נראים כעומק
    rail: mixHex(t.machine, t.bg, 0.2),  // מסילות הארון
    line: mixHex(t.machine, t.bg, 0.42),  // קווי מתאר, אוורור, ברגים. הכהה ביותר ברקע: טקסט muted עליו עדיין 4.5:1
    holo: mixHex(t.holo, t.bg, 0.55),      // נוריות, מעט מעומעמות כדי שלא יתחרו בתוכן
    human: mixHex(t.human, t.bg, 0.55),
  }
}

export function serverTileSvg(t: ServerPalette): string {
  const C = serverColors(t)
  const { width: W, height: H, unit: U } = TILE
  const s: string[] = []
  const rect = (x: number, y: number, w: number, h: number, fill: string, extra = '') => s.push(`<rect x='${x}' y='${y}' width='${w}' height='${h}' fill='${fill}'${extra ? ' ' + extra : ''}/>`)
  const circ = (x: number, y: number, r: number, fill: string) => s.push(`<circle cx='${x}' cy='${y}' r='${r}' fill='${fill}'/>`)
  const outline = `rx='3' stroke='${C.line}' stroke-width='1.5'`
  /* רשתות נקודות כתבנית, כדי שהקובץ יישאר קטן */
  s.push(`<defs><pattern id='d' width='6' height='6' patternUnits='userSpaceOnUse'><circle cx='3' cy='3' r='1.4' fill='${C.line}'/></pattern>`
    + `<pattern id='p' width='8' height='16' patternUnits='userSpaceOnUse'><circle cx='4' cy='4' r='1.7' fill='${C.line}'/><circle cx='8' cy='12' r='1.7' fill='${C.line}'/><circle cx='0' cy='12' r='1.7' fill='${C.line}'/></pattern>`
    + `<pattern id='v' width='8' height='56' patternUnits='userSpaceOnUse'><rect x='2' y='0' width='3.2' height='56' rx='1.6' fill='${C.line}'/></pattern></defs>`)
  /* מסילות בשני הצדדים, עם חורים מרובעים */
  for (const x of [0, W - 16]) {
    rect(x, 0, 16, H, C.rail)
    for (let u = 0; u < 3; u++) for (const dy of [10, 28, 46]) rect(x + 5, u * U + dy - 3, 6, 6, C.line, "rx='1'")
  }
  const face = (y: number) => {
    rect(20, y + 3, W - 40, U - 6, C.face, `rx='4' stroke='${C.line}' stroke-width='1.5'`)
    for (const [x, yy] of [[30, 12], [30, 44], [W - 30, 12], [W - 30, 44]]) circ(x, y + yy, 2.6, C.line)
  }
  /* יחידה 1: שרת */
  let y = 0
  face(y)
  rect(44, y + 14, 200, 28, 'url(#v)')
  circ(262, y + 21, 3, C.holo); circ(262, y + 35, 3, C.human)
  for (let i = 0; i < 4; i++) { const x = 282 + i * 41; rect(x, y + 11, 35, 34, 'none', outline); rect(x + 6, y + 37, 16, 3, C.line, "rx='1.5'"); circ(x + 28, y + 18, 2, i === 2 ? C.human : C.holo) }
  /* יחידה 2: אחסון */
  y = U
  face(y)
  for (let i = 0; i < 8; i++) {
    const x = 42 + i * 50
    rect(x, y + 10, 44, 36, 'none', outline)
    rect(x + 5, y + 15, 30, 18, 'url(#d)')
    circ(x + 37, y + 18, 2, i % 3 === 1 ? C.human : C.holo)
    rect(x + 7, y + 38, 26, 3, C.line, "rx='1.5'")
  }
  /* יחידה 3: לוח ניקוב, תווית ונורית מתח */
  y = U * 2
  face(y)
  rect(44, y + 11, 296, 32, 'url(#p)')
  rect(352, y + 16, 64, 22, 'none', outline)
  rect(360, y + 23, 34, 3, C.line, "rx='1.5'"); rect(360, y + 30, 22, 3, C.line, "rx='1.5'")
  circ(434, y + 27, 3.2, C.holo)
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
