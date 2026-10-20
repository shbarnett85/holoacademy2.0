/* חישוב טהור של גרף עוגה טבעתי (DonutChart): זוויות מצטברות, נתיב קשת וחלוקת אחוזים שמסתכמת ל-100.
   בלי DOM ובלי React — נבדק ב-donutMath.test.ts. הזוויות במעלות, מ-12 בשעון ובכיוון השעון. */

export interface DonutArc {
  index: number
  count: number
  /** מ-0 עד 360, מ-12 בשעון בכיוון השעון */
  startDeg: number
  endDeg: number
  sweepDeg: number
  /** החלק מכלל הגרף (0..1) */
  fraction: number
}

const FULL = 360
/* קשת של 360 מעלות אי אפשר לצייר בקשת SVG אחת (נקודת ההתחלה היא נקודת הסיום) — מ-FULL_EPS ומעלה מציירים טבעת שלמה */
const FULL_EPS = 0.001

const r2 = (n: number): number => Math.round(n * 100) / 100
const nonNeg = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 0)

/* הזוויות של כל נתח. `total` = מה שנחשב 100% (ברירת מחדל סכום הנתחים); אם הסכום קטן ממנו נשאר חלק ריק בטבעת. */
export function computeArcs(counts: readonly number[], total?: number): DonutArc[] {
  const safe = counts.map(nonNeg)
  const sum = safe.reduce((a, b) => a + b, 0)
  const base = Math.max(nonNeg(total ?? sum), sum)
  /* הזווית נגזרת מהספירה המצטברת (לא מסכום של זוויות), כדי שאין סחף עשרוני והנתח האחרון נסגר בדיוק על 360° */
  const angleAt = (cum: number): number => (base > 0 ? (cum === base ? FULL : (cum / base) * FULL) : 0)
  let cum = 0
  return safe.map((count, index) => {
    const startDeg = angleAt(cum)
    cum += count
    const endDeg = angleAt(cum)
    return { index, count, startDeg, endDeg, sweepDeg: endDeg - startDeg, fraction: base > 0 ? count / base : 0 }
  })
}

/* נקודה על מעגל. 0° = 12 בשעון, כיוון השעון */
export function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180
  return { x: r2(cx + r * Math.sin(rad)), y: r2(cy - r * Math.cos(rad)) }
}

/* נתיב נתח טבעתי בין שני רדיוסים. נתח של ~360° הופך לטבעת שלמה (שני מעגלים, למילוי evenodd). נתח ריק → '' */
export function arcPath(cx: number, cy: number, rOuter: number, rInner: number, startDeg: number, endDeg: number): string {
  const sweep = endDeg - startDeg
  if (!(sweep > 0)) return ''
  if (sweep >= FULL - FULL_EPS) {
    const circle = (r: number, dir: 0 | 1): string =>
      `M ${r2(cx + r)} ${r2(cy)} A ${r} ${r} 0 1 ${dir} ${r2(cx - r)} ${r2(cy)} A ${r} ${r} 0 1 ${dir} ${r2(cx + r)} ${r2(cy)} Z`
    return `${circle(rOuter, 1)} ${circle(rInner, 0)}`
  }
  const large = sweep > 180 ? 1 : 0
  const o1 = polar(cx, cy, rOuter, startDeg)
  const o2 = polar(cx, cy, rOuter, endDeg)
  const i2 = polar(cx, cy, rInner, endDeg)
  const i1 = polar(cx, cy, rInner, startDeg)
  return [
    `M ${o1.x} ${o1.y}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${o2.x} ${o2.y}`,
    `L ${i2.x} ${i2.y}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${i1.x} ${i1.y}`,
    'Z',
  ].join(' ')
}

/* אחוזים שלמים לכל נתח, כך שהסכום שווה בדיוק לאחוז הכולל של הנתחים מתוך `total` (100 כשהנתחים מלאים).
   שיטת השארית הגדולה ביותר: כל נתח מקבל את הרצפה, והיתרה לפי גודל השארית (שוויון → הנתח המוקדם). */
export function roundPercents(counts: readonly number[], total?: number): number[] {
  const safe = counts.map(nonNeg)
  const sum = safe.reduce((a, b) => a + b, 0)
  const base = Math.max(nonNeg(total ?? sum), sum)
  if (base <= 0) return safe.map(() => 0)
  const exact = safe.map((c) => (c / base) * 100)
  const floors = exact.map(Math.floor)
  let left = Math.round((sum / base) * 100) - floors.reduce((a, b) => a + b, 0)
  const order = exact.map((e, i) => ({ i, rem: e - floors[i] })).sort((a, b) => b.rem - a.rem || a.i - b.i)
  const out = [...floors]
  for (const { i } of order) {
    if (left <= 0) break
    /* נתח ריק לא מקבל אחוז מהיתרה */
    if (safe[i] === 0) continue
    out[i] += 1
    left -= 1
  }
  return out
}
