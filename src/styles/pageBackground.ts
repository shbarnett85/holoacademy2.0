/* רקע העמוד: מעגל מודפס (המשתמש בחר מתוך שש אפשרויות, במקום רשת הפיקסלים) — מסלולים דקים עם פינות של 45 ו-90 מעלות,
   ובקצה של כל מסלול נקודת חיבור עגולה, כמו לוח של מחשב. דליל: רוב האריח רקע נקי.
   הפיזור קבוע (מחולל מספרים עם זרע קבוע), ואריח אחד חוזר על עצמו; המסלולים לא נוגעים בקצה האריח, ולכן אין תפר.
   האריח גדול (960×720), כדי שבמסך פתוח לא יראו את אותו ציור חוזר כמה פעמים.
   הצבעים נגזרים מהטוקנים (לילך והמכונה), בלי מעבר צבע ובלי תנועה.
   הקובץ מייצר את השורה --page-background ב-tokens.css (scripts/genPageBackground.ts), ו-pageBackground.test.ts בודק שהיא עדכנית. */

/* סריג של 40×30 נקודות במרחק 24px; המסלולים עוברים רק בין נקודות הסריג. 33 מסלולים: אותה צפיפות כמו בהצעה שנבחרה (11 ל-20×20) */
export const CIRCUIT = { cell: 24, cols: 40, rows: 30, traces: 33, seed: 77120 } as const
export const TILE = { width: CIRCUIT.cell * CIRCUIT.cols, height: CIRCUIT.cell * CIRCUIT.rows } as const

export interface PagePalette { bg: string; machine: string }

/* ערבוב של שני צבעי hex (p = החלק של a), כמו color-mix ב-srgb */
export function mixHex(a: string, b: string, p: number): string {
  const h = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16))
  const A = h(a), B = h(b)
  return '#' + A.map((v, i) => Math.round(v * p + B[i] * (1 - p)).toString(16).padStart(2, '0')).join('').toUpperCase()
}

export function circuitColors(t: PagePalette) {
  return {
    trace: mixHex(t.machine, t.bg, 0.24),   // המסלולים
    pad: mixHex(t.machine, t.bg, 0.34),     // הטבעת של נקודת החיבור. הכהה ביותר בציור: טקסט muted עליו עדיין 4.5:1
  }
}

/* מחולל מספרים עם זרע קבוע (mulberry32): אותו פיזור בכל יצירה */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

/* שמונה כיוונים: ארבעה ישרים ואחריהם ארבעה אלכסונים */
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const

/* המסלולים: כל אחד רשימה של נקודות סריג. מסלול לא עובר בנקודה תפוסה, לא חוצה אלכסון של מסלול אחר (נקודות האמצע),
   ונשאר במרחק של תא אחד לפחות מקצה האריח. סביב כל נקודת חיבור נשמר מרווח */
export function circuitTraces(): [number, number][][] {
  const { cols, rows } = CIRCUIT
  const r = rng(CIRCUIT.seed)
  const used = new Set<string>()
  const key = (x: number, y: number) => `${x * 2},${y * 2}`
  const out: [number, number][][] = []
  for (let attempt = 0; attempt < 3000 && out.length < CIRCUIT.traces; attempt++) {
    let x = 2 + Math.floor(r() * (cols - 3)), y = 2 + Math.floor(r() * (rows - 3))
    if (used.has(key(x, y))) continue
    const pts: [number, number][] = [[x, y]]
    const mine = new Set<string>([key(x, y)])
    let dir: readonly [number, number] = DIRS[Math.floor(r() * 4)]
    const segs = 3 + Math.floor(r() * 4)
    for (let s = 0; s < segs; s++) {
      const len = 2 + Math.floor(r() * 4)
      let ok = true
      const step: string[] = []
      let cx = x, cy = y
      for (let i = 0; i < len; i++) {
        const nx = cx + dir[0], ny = cy + dir[1]
        const mid = `${cx * 2 + dir[0]},${cy * 2 + dir[1]}`
        if (nx < 1 || ny < 1 || nx > cols - 1 || ny > rows - 1 || used.has(key(nx, ny)) || mine.has(key(nx, ny)) || used.has(mid)) { ok = false; break }
        step.push(key(nx, ny), mid); cx = nx; cy = ny
      }
      if (!ok) break
      step.forEach((k) => mine.add(k))
      x = cx; y = cy; pts.push([x, y])
      /* פנייה של 45 או 90 מעלות */
      const idx = DIRS.findIndex((q) => q[0] === dir[0] && q[1] === dir[1])
      const from = dir
      const turns = idx < 4
        ? [DIRS[(idx + 1) % 4], DIRS[(idx + 3) % 4], ...DIRS.slice(4).filter((q) => q[0] === from[0] || q[1] === from[1])]
        : DIRS.slice(0, 4).filter((q) => q[0] === from[0] || q[1] === from[1])
      dir = turns[Math.floor(r() * turns.length)]
    }
    if (pts.length < 3) continue
    mine.forEach((k) => used.add(k))
    for (const [px, py] of [pts[0], pts[pts.length - 1]]) for (const [dx, dy] of DIRS) used.add(key(px + dx, py + dy))
    out.push(pts)
  }
  return out
}

export function pageTileSvg(t: PagePalette): string {
  const C = circuitColors(t)
  const { cell } = CIRCUIT
  const { width: W, height: H } = TILE
  let traces = '', pads = ''
  for (const pts of circuitTraces()) {
    traces += `<path d='M${pts.map(([x, y]) => `${x * cell} ${y * cell}`).join('L')}' fill='none' stroke='${C.trace}' stroke-width='2' stroke-linejoin='round'/>`
    for (const [x, y] of [pts[0], pts[pts.length - 1]]) pads += `<circle cx='${x * cell}' cy='${y * cell}' r='4.5' fill='${t.bg}' stroke='${C.pad}' stroke-width='2'/>`
  }
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}' viewBox='0 0 ${W} ${H}'>${traces}${pads}</svg>`
}

/* ערך ה-CSS של --page-background: האריח, ומתחתיו צבע הרקע */
export function pageBackgroundCss(t: PagePalette): string {
  const uri = pageTileSvg(t).replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E')
  return `url("data:image/svg+xml,${uri}") 0 0 / ${TILE.width}px ${TILE.height}px, var(--color-machine-bg)`
}

/* קריאת הטוקנים מתוך tokens.css */
export function paletteFromTokens(css: string): PagePalette {
  const v = (name: string) => { const m = css.match(new RegExp(`--${name}:[ 	]*(#[0-9A-Fa-f]{6})`)); if (!m) throw new Error(`token --${name} missing`); return m[1].toUpperCase() }
  return { bg: v('color-machine-bg'), machine: v('color-machine') }
}

export const PAGE_BG_LINE = /^ {2}--page-background: .*$/m
