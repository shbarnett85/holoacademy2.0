/* הצורה של הקריסטל: הצללית של public/holoacademy-crystal.svg, בלי קווים פנימיים.
   הקבועים כאן זהים לקובץ (gemShape.test.ts משווה), והרכיב shared/ui/Gem מצייר מהם. */

export const GEM_VIEW_W = 48
export const GEM_VIEW_H = 44
export const GEM_VIEWBOX = `0 0 ${GEM_VIEW_W} ${GEM_VIEW_H}`
export const GEM_PATH = 'M13.4 1.5 H34.6 L46.5 17.6 L24 41 L1.5 17.6 Z'
/* עובי קו המתאר ביחידות של ה-viewBox. אותו קו בכל המצבים */
export const GEM_STROKE = 2.5
/* עצירת האמצע של מעבר המילוי (התכול והמלא), לאורך האלכסון מהפינה השמאלית העליונה לימנית התחתונה */
export const GEM_GRADIENT_MID = 0.55

/* הגאומטריה של הצללית: כתר (טרפז, מהקו העליון עד קו הרוחב) ומתחתיו חוד (משולש) */
const TOP_Y = 1.5
const GIRDLE_Y = 17.6
const TIP_Y = 41
const TOP_W = 34.6 - 13.4
const GIRDLE_W = 46.5 - 1.5
const CROWN_AREA = ((TOP_W + GIRDLE_W) / 2) * (GIRDLE_Y - TOP_Y)
const TIP_AREA = (GIRDLE_W * (TIP_Y - GIRDLE_Y)) / 2

/* קריסטל חלקי מתמלא מלמטה. הגובה של קו המילוי נקבע לפי שטח ולא לפי גובה: הקריסטל מחודד למטה,
   ולכן חצי מהגובה הוא רק כשליש מהשטח, וחצי קריסטל היה נראה כמו שליש. מחזיר את ה-y של קו המילוי. */
export function gemFillY(fill: number): number {
  const f = Math.max(0, Math.min(1, fill))
  if (f <= 0) return GEM_VIEW_H + 8
  if (f >= 1 - 1e-6) return -8
  const area = f * (CROWN_AREA + TIP_AREA)
  if (area <= TIP_AREA) return TIP_Y - Math.sqrt((area * 2 * (TIP_Y - GIRDLE_Y)) / GIRDLE_W)
  /* בתוך הכתר: הרוחב קטן בקצב k ככל שעולים מקו הרוחב */
  const k = (GIRDLE_W - TOP_W) / (GIRDLE_Y - TOP_Y)
  const t = (GIRDLE_W - Math.sqrt(GIRDLE_W * GIRDLE_W - 2 * k * (area - TIP_AREA))) / k
  return GIRDLE_Y - t
}

/* קריסטל תכול מלא כמחרוזת SVG, לקוד שמצייר בלי React (הגביש שעף אל ה-HUD). אותה צורה, אותו קו ואותו מילוי כמו ברכיב */
export function gemSvgMarkup(id = 'holo-gem-fly'): string {
  const stop = (offset: number, token: string) => `<stop offset="${offset}" style="stop-color:var(--${token})"/>`
  return `<svg viewBox="${GEM_VIEWBOX}" aria-hidden="true" style="width:100%;height:100%;display:block;overflow:visible">`
    + `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">${stop(0, 'color-crystal-cyan-top')}${stop(GEM_GRADIENT_MID, 'color-crystal-cyan-mid')}${stop(1, 'color-crystal-cyan-bottom')}</linearGradient></defs>`
    + `<path d="${GEM_PATH}" fill="url(#${id})" stroke-width="${GEM_STROKE}" stroke-linejoin="round" style="stroke:var(--color-holo-deep)"/></svg>`
}
