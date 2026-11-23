/* הקריסטל של HoloAcademy: רכיב אחד לכל מקום שבו מופיעים קריסטלים (ה-HUD, מסך הסיום, הבית של התלמיד, המסע).
   הצורה היא הצללית של holoacademy-crystal.svg (shared/lib/gemShape), בלי קווים פנימיים. כל הצבעים מקובץ הטוקנים.
   קו המתאר: holo-deep בעובי 2.5 (ביחידות של ה-viewBox), פינות מעוגלות. אותו קו בכל המצבים.

   הרכיב מקבל את החלק המלא (fill, 0 עד 1) ואת מצב השורה (tier, לפי מספר הקריסטלים השלמים: gemTier):
     · fill=0         מקום ריק: מילוי אחיד crystal-empty.
     · 0<fill<1       חלקי: המעבר התכול ממלא את החלק התחתון לפי החלק שהושג, והשאר crystal-empty.
     · tier="base"    פחות מ-3 שלמים: מעבר תכול אלכסוני (לבן → תכלת → holo), בלי זוהר ובלי הבזקים.
     · tier="warm"    3 ומעלה: אותו מילוי, ופעימה כל 1.6 שניות: הזוהר שמסביב כתום, והקריסטל מתבהר לכתום-לבן וחוזר.
     · tier="full"    5 מלאים: מעבר אלכסוני לבן → אפרסק, זוהר אפרסק-לבן קבוע, והבזקים כתומים חזקים יותר כל 1.2 שניות.
   המצב החם והמלא חלים רק על קריסטל שלם; חלקי וריק נשארים שקטים.
   animated=false (וגם prefers-reduced-motion): בלי פעימות; זוהר כתום קבוע שעדיין מבחין בין המצבים.
   האנימציות עצמן ב-index.css (.gem…). אף הבזק לא מהיר מפעם בשנייה. */
import { useId, type CSSProperties } from 'react'
import type { GemTier } from '../lib/gemTier'
import { GEM_GRADIENT_MID, GEM_PATH, GEM_STROKE, GEM_VIEWBOX, GEM_VIEW_H, GEM_VIEW_W, gemFillY } from '../lib/gemShape'

const GRADIENT: Record<'cyan' | 'full', [string, string, string]> = {
  cyan: ['var(--color-crystal-cyan-top)', 'var(--color-crystal-cyan-mid)', 'var(--color-crystal-cyan-bottom)'],
  full: ['var(--color-crystal-full-top)', 'var(--color-crystal-full-mid)', 'var(--color-crystal-full-bottom)'],
}

export function Gem({ fill = 1, tier = 'base', animated = true, size = 24, className, style }: {
  /** החלק המלא של הקריסטל, 0 עד 1. ברירת המחדל: קריסטל מלא */
  fill?: number
  /** מצב השורה כולה: לפי מספר הקריסטלים השלמים (gemTier) */
  tier?: GemTier
  /** false = בלי פעימות (זוהר קבוע). ב-HUD בזמן קריאה שום דבר לא זז */
  animated?: boolean
  /** הרוחב: פיקסלים או ערך CSS. הגובה לפי הפרופורציות של הצורה */
  size?: number | string
  className?: string
  style?: CSSProperties
}) {
  const id = `gem${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const f = Math.max(0, Math.min(1, fill))
  const whole = f >= 1 - 1e-6
  const lit: GemTier = whole ? tier : 'base'
  const stops = GRADIENT[lit === 'full' ? 'full' : 'cyan']
  const y = gemFillY(f)
  const cls = ['gem', `gem--${lit}`, animated && lit !== 'base' ? 'gem--animated' : '', className ?? ''].filter(Boolean).join(' ')
  return (
    <svg
      className={cls}
      viewBox={GEM_VIEWBOX}
      aria-hidden="true"
      data-gem-fill={Math.round(f * 100)}
      data-gem-tier={lit}
      style={{ width: size, height: 'auto', aspectRatio: `${GEM_VIEW_W} / ${GEM_VIEW_H}`, display: 'block', flex: 'none', overflow: 'visible', ...style }}
    >
      {f > 0 && (
        <defs>
          <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: stops[0] }} />
            <stop offset={GEM_GRADIENT_MID} style={{ stopColor: stops[1] }} />
            <stop offset="1" style={{ stopColor: stops[2] }} />
          </linearGradient>
          {!whole && (
            <clipPath id={`${id}c`} clipPathUnits="userSpaceOnUse">
              <rect x={-8} y={y} width={GEM_VIEW_W + 16} height={GEM_VIEW_H + 16 - y} />
            </clipPath>
          )}
        </defs>
      )}
      {lit !== 'base' && <path d={GEM_PATH} className="gem__glow" />}
      {lit === 'full' && <path d={GEM_PATH} className="gem__flash" />}
      {!whole && <path d={GEM_PATH} className="gem__empty" />}
      {f > 0 && <path d={GEM_PATH} fill={`url(#${id}g)`} clipPath={whole ? undefined : `url(#${id}c)`} />}
      {lit === 'warm' && <path d={GEM_PATH} className="gem__pulse" />}
      <path d={GEM_PATH} fill="none" strokeWidth={GEM_STROKE} strokeLinejoin="round" style={{ stroke: 'var(--color-holo-deep)' }} />
    </svg>
  )
}
