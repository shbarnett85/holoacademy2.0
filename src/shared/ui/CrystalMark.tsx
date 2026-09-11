/* ── קריסטל HoloAcademy (הלוגו הרשמי) — גאומטריה אחת לכל המערכת ──
   הקואורדינטות לקוחות מילה-במילה מקובץ המאסטר (holo-transparent master):
   מחומש עם קודקוד עליון, כתפיים רחבות ותחתית שטוחה; 6 פאות (3 כתר ציאן,
   3 פביליון סגול-מגנטה), rails בהירים והילת ניאון ציאן→מגנטה.
   הקבועים מיוצאים כדי שהלוגו, שקעי הקריסטלים (CrystalGauge) ואנימציות הקנבס
   (fusion/rain/charge) יציירו את אותו קריסטל בדיוק — לא וריאציות. */

/* מרחב הקואורדינטות של המאסטר (הקריסטל עצמו, בלי ה-wordmark) */
export const CRYSTAL_VB = { x: 296, y: 217, w: 662, h: 546 }

type Pt = [number, number]
const T: Pt = [627, 247]   /* קודקוד עליון */
const L: Pt = [326, 399]   /* כתף שמאל */
const R: Pt = [928, 399]   /* כתף ימין */
const BL: Pt = [502, 733]  /* תחתית שמאל */
const BR: Pt = [752, 733]  /* תחתית ימין */
const GL: Pt = [480, 416]  /* חגורה פנימית שמאל */
const GR: Pt = [774, 416]  /* חגורה פנימית ימין */

export const CRYSTAL_OUTLINE: Pt[] = [T, R, BR, BL, L]
export const CRYSTAL_FACETS = {
  topLeft: [T, L, GL] as Pt[],
  topRight: [T, R, GR] as Pt[],
  topCenter: [T, GL, GR] as Pt[],
  lowerLeft: [L, GL, BL] as Pt[],
  lowerRight: [R, GR, BR] as Pt[],
  lowerCenter: [GL, GR, BR, BL] as Pt[],
}
/* קווי ה-rails (לציור קנבס): צלעות + מפרידי פאות + שני הקווים האופקיים */
export const CRYSTAL_RAILS: Pt[][] = [
  [T, L, BL, BR, R, T],
  [T, GL, BL],
  [T, GR, BR],
  [L, GL, GR, R],
  [[490.341, 565], [763.659, 565]],
  [[571.331, 311], [682.669, 311]],
]

/* פלטת הקריסטל (עצירות ביניים מהגרדיאנטים של המאסטר — לשימוש בקנבס/מצבים שטוחים) */
export const CRYSTAL_COLORS = {
  topCenter: '#00CEF0',
  topSide: '#00B7EE',
  lowerCenter: '#A400E9',
  lowerSide: '#AE00EC',
  rail: '#E9FBFF',
  haloTop: '#00F5FF',
  haloBottom: '#FF00E7',
  empty: '#2e3647',
}

const pts = (...p: Pt[]) => p.map(([x, y]) => `${x},${y}`).join(' ')

/* ── גאומטריה מנורמלת לקנבס (fusion/rain/charge): מרכז (0,0), חצי-רוחב 1 ── */
const CXm = 627
const CYm = (247 + 733) / 2
const HW = (928 - 326) / 2
const nm = ([x, y]: Pt): Pt => [(x - CXm) / HW, (y - CYm) / HW]
export const CRYSTAL_NORM = {
  outline: CRYSTAL_OUTLINE.map(nm),
  rails: CRYSTAL_RAILS.map((seg) => seg.map(nm)),
  crown: ([T, R, GR, GL, L] as Pt[]).map(nm),
  pavilion: ([L, GL, GR, R, BR, BL] as Pt[]).map(nm),
  /* חצי-גובה ביחס לחצי-רוחב */
  aspect: (733 - 247) / 2 / HW,
}

/* ציור קווי (line-art) של הקריסטל בקנבס — מתאר + rails, בסגנון holo-mono */
export function traceCrystalCanvas(ctx: CanvasRenderingContext2D, size: number): void {
  for (const seg of CRYSTAL_NORM.rails) {
    ctx.beginPath()
    seg.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * size, y * size) : ctx.lineTo(x * size, y * size)))
    ctx.stroke()
  }
}

/* גרדיאנטים של המאסטר — מזהים פר-מופע (הקומפוננטה מופיעה כמה פעמים בעמוד) */
export function CrystalDefs({ uid }: { uid: string }) {
  return (
    <defs>
      <linearGradient id={`tc-${uid}`} gradientUnits="userSpaceOnUse" x1="627" y1="247" x2="627" y2="416"><stop stopColor="#00F4EC" /><stop offset="1" stopColor="#00A8F3" /></linearGradient>
      <linearGradient id={`ts-${uid}`} gradientUnits="userSpaceOnUse" x1="627" y1="250" x2="627" y2="416"><stop stopColor="#00F5EE" /><stop offset="0.5" stopColor="#00DBF0" /><stop offset="1" stopColor="#008EE8" /></linearGradient>
      <linearGradient id={`lc-${uid}`} gradientUnits="userSpaceOnUse" x1="627" y1="416" x2="627" y2="733"><stop stopColor="#3000FF" /><stop offset="0.48" stopColor="#A400E9" /><stop offset="1" stopColor="#F400E1" /></linearGradient>
      <linearGradient id={`ls-${uid}`} gradientUnits="userSpaceOnUse" x1="627" y1="399" x2="627" y2="733"><stop stopColor="#3900FF" /><stop offset="0.5" stopColor="#AE00EC" /><stop offset="1" stopColor="#FE00E8" /></linearGradient>
      <linearGradient id={`rl-${uid}`} gradientUnits="userSpaceOnUse" x1="627" y1="247" x2="627" y2="733"><stop stopColor="#A7FFFF" /><stop offset="0.32" stopColor="#D5FFFF" /><stop offset="0.65" stopColor="#FFFFFF" /><stop offset="1" stopColor="#FFE2FC" /></linearGradient>
      <linearGradient id={`hl-${uid}`} gradientUnits="userSpaceOnUse" x1="627" y1="247" x2="627" y2="733"><stop stopColor="#00F5FF" /><stop offset="0.28" stopColor="#00DFFF" /><stop offset="0.45" stopColor="#6920FF" /><stop offset="1" stopColor="#FF00E7" /></linearGradient>
    </defs>
  )
}

/* גוף הקריסטל המלא (פאות + rails + מסגרת הילה) — נאמן למאסטר */
export function CrystalBody({ uid, railWidth = 20 }: { uid: string; railWidth?: number }) {
  const F = CRYSTAL_FACETS
  return (
    <g>
      <polygon points={pts(...F.topLeft)} fill={`url(#ts-${uid})`} />
      <polygon points={pts(...F.topRight)} fill={`url(#ts-${uid})`} />
      <polygon points={pts(...F.topCenter)} fill={`url(#tc-${uid})`} />
      <polygon points={pts(...F.lowerLeft)} fill={`url(#ls-${uid})`} />
      <polygon points={pts(...F.lowerRight)} fill={`url(#ls-${uid})`} />
      <polygon points={pts(...F.lowerCenter)} fill={`url(#lc-${uid})`} />
      <polygon points={pts(...CRYSTAL_OUTLINE)} fill="none" stroke={`url(#hl-${uid})`} strokeWidth={railWidth * 1.15} strokeLinejoin="round" />
      <g fill="none" stroke={`url(#rl-${uid})`} strokeWidth={railWidth} strokeLinejoin="miter" strokeMiterlimit={3}>
        <polygon points={pts(...CRYSTAL_OUTLINE)} />
        <polyline points={pts(T, GL, BL)} />
        <polyline points={pts(T, GR, BR)} />
        <polyline points={pts(L, GL, GR, R)} />
        <line x1={490.341} y1={565} x2={763.659} y2={565} />
        <line x1={571.331} y1={311} x2={682.669} y2={311} strokeWidth={railWidth * 0.65} />
      </g>
    </g>
  )
}

/* סמל הלוגו העצמאי */
export default function CrystalMark({ size = 96, glow = true }: { size?: number; glow?: boolean }) {
  const uid = 'mark'
  return (
    <svg
      width={size}
      height={(size * CRYSTAL_VB.h) / CRYSTAL_VB.w}
      viewBox={`${CRYSTAL_VB.x} ${CRYSTAL_VB.y} ${CRYSTAL_VB.w} ${CRYSTAL_VB.h}`}
      role="img"
      aria-label="HoloAcademy"
      style={glow ? { filter: 'drop-shadow(0 0 10px rgba(0,245,255,.4)) drop-shadow(0 4px 14px rgba(255,0,231,.25))' } : undefined}
    >
      <CrystalDefs uid={uid} />
      <CrystalBody uid={uid} />
    </svg>
  )
}
