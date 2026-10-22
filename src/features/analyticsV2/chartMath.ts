/* חישובי גרף טהורים (בלי DOM) — נבדקים ב-chartMath.test.ts. משמשים את charts.tsx. */

/* חודש מיוצג באמצע החודש: התאריך בחוזה הוא תחילת החודש (00:00 UTC ביום 1) */
export function plotIso(iso: string): string {
  const d = new Date(iso)
  return d.getUTCDate() === 1 && d.getUTCHours() === 0 ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 15)).toISOString() : iso
}

/* ציר ערכים נקי: מספרים שלמים בקפיצות 1/2/5 (כפול חזקת 10). תמיד lo < hi, וכל הערכים בתוך הטווח */
export function niceScale(min: number, max: number, target = 4): { lo: number; hi: number; ticks: number[] } {
  const span = Math.max(1, max - min)
  const raw = span / target
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * mag).find((c) => c >= raw) ?? 10 * mag)
  const lo = Math.floor(min / step) * step
  const hi = Math.max(lo + step, Math.ceil(max / step) * step)
  const ticks: number[] = []
  for (let t = lo; t <= hi + 1e-9; t += step) ticks.push(t)
  return { lo, hi, ticks }
}

/* מיקום (y של קו הבסיס של הטקסט) לשם הרצועה "הטווח המיועד": בתוך הרצועה, למעלה או למטה — מה שלא מתנגש בנקודות הסדרה ובערכים שמעליהן.
   נקודה תופסת תיבה: מ-30px מעליה (תווית הערך) ועד 8px מתחתיה, ברוחב 24px סביבה. אם שני המקומות תפוסים — העליון. */
export function pickBandLabelY({ top, bottom, fontPx, labelX, points }: { top: number; bottom: number; fontPx: number; labelX: [number, number]; points: { x: number; y: number }[] }): number {
  const topY = top + 6 + fontPx
  const bottomY = bottom - 6
  const hits = (baseline: number): boolean => {
    const y0 = baseline - fontPx
    const y1 = baseline + 3
    return points.some((p) => p.x + 24 >= labelX[0] && p.x - 24 <= labelX[1] && p.y - 30 <= y1 && p.y + 8 >= y0)
  }
  /* רצועה נמוכה מדי להכיל את הטקסט בתחתית — נשארים למעלה */
  const bottomFits = bottomY - fontPx > top + 2
  if (!hits(topY)) return topY
  if (bottomFits && !hits(bottomY)) return bottomY
  return topY
}

export interface PlacedMarker<T> { m: T; x: number; row: 0 | 1 }

/* סימוני אירועים על הציר: קרובים מדי זה לזה (פחות מ-minGap פיקסלים) עולים לשורה שנייה כדי שהמספרים לא יחפפו.
   הקלט ממוין לפי x. */
export function layoutMarkers<T>(items: { m: T; x: number }[], minGap = 34): PlacedMarker<T>[] {
  let prevX = -Infinity
  let prevRow: 0 | 1 = 1
  return items.map(({ m, x }) => {
    const row: 0 | 1 = x - prevX < minGap ? (prevRow === 0 ? 1 : 0) : 0
    prevX = x
    prevRow = row
    return { m, x, row }
  })
}

/* תוויות ערך על הקו (16px, כ-40px רוחב): כל נקודה כשיש מקום, אחרת כל שנייה/שלישית (האחרונה תמיד מוצגת בנפרד) */
export function labelEvery(xs: number[]): number {
  const minGap = xs.length > 1 ? Math.min(...xs.slice(1).map((x, i) => x - xs[i])) : Infinity
  return minGap >= 44 ? 1 : minGap >= 22 ? 2 : 3
}
