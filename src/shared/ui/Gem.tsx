/* הקריסטל של HoloAcademy: מקור אחד לשקעים, למונה, למעוף, למסך הסיום ולמסע.
   הגדרות ה-SVG נטענות פעם אחת (GemDefs) וכל השאר משתמש בהן דרך <use>. כל הצבעים מקובץ הטוקנים.

   מצבי הקריסטל (5 בכל שיעור, אפשר גם חלקי):
     · שקע ריק        מילוי crystal-empty עם קו מתאר בדיו.
     · חלקי           מתמלא מלמטה לפי השבר (clipPath); השאר crystal-empty.
     · tier="base"    פחות מ-3 שלמים: מילוי holo, בלי זוהר ובלי הבזקים.
     · tier="warm"    3 ומעלה: אותו מילוי holo, ופעימה כל 1.6 שניות: הזוהר שמסביב כתום, והקריסטל מתבהר לכתום-לבן וחוזר.
     · tier="full"    5 מלאים: מילוי במעבר לבן → אפרסק, זוהר אפרסק-לבן קבוע, והבזקים כתומים חזקים יותר כל 1.2 שניות.
   animated=false (וגם prefers-reduced-motion): בלי פעימות; זוהר כתום קבוע שעדיין מבחין בין המצבים.
   האנימציות עצמן ב-index.css (.gem…). אף הבזק לא מהיר מפעם בשנייה. */
import { useId, type CSSProperties } from 'react'
import type { GemTier } from '../lib/gemTier'

const OUTLINE = 'M66 40 L134 40 L170 82 L118 160 L82 160 L30 82 Z'
const FACET_LINES = 'M30 82 L170 82 M88 40 L88 160 M112 40 L112 160'
const ink: CSSProperties = { stroke: 'var(--color-ink)' }
/* פאות הקריסטל: גוונים של צבע הבסיס (--gem-base, ברירת מחדל holo), בהירים למעלה וכהים למטה */
const facet = (pctBase: number, withToken: 'surface' | 'ink'): CSSProperties => ({
  fill: `color-mix(in srgb, var(--gem-base, var(--color-holo)) ${pctBase}%, var(--color-${withToken}))`,
})

export function GemDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="holo-gem-full-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--color-crystal-full-top)' }} />
          <stop offset="0.5" style={{ stopColor: 'var(--color-crystal-full-mid)' }} />
          <stop offset="1" style={{ stopColor: 'var(--color-crystal-full-bottom)' }} />
        </linearGradient>
        <symbol id="holo-gem" viewBox="24 34 152 132">
          <g strokeWidth="9" strokeLinejoin="round" strokeLinecap="round" style={ink}>
            <path d="M66 40 L88 40 L88 82 L30 82 Z" style={facet(45, 'surface')} />
            <path d="M88 40 L112 40 L112 82 L88 82 Z" style={facet(22, 'surface')} />
            <path d="M112 40 L134 40 L170 82 L112 82 Z" style={facet(60, 'surface')} />
            <path d="M30 82 L88 82 L88 160 L82 160 Z" style={facet(82, 'surface')} />
            <path d="M88 82 L112 82 L112 160 L88 160 Z" style={facet(100, 'surface')} />
            <path d="M112 82 L170 82 L118 160 L112 160 Z" style={facet(78, 'ink')} />
          </g>
        </symbol>
        <symbol id="holo-gem-full" viewBox="24 34 152 132">
          <path d={OUTLINE} fill="url(#holo-gem-full-grad)" strokeWidth="9" strokeLinejoin="round" style={ink} />
          <path d={FACET_LINES} fill="none" strokeWidth="5" strokeLinecap="round" opacity=".28" style={ink} />
        </symbol>
        <symbol id="holo-gem-slot" viewBox="24 34 152 132">
          <path d={OUTLINE} strokeWidth="9" strokeLinejoin="round" style={{ ...ink, fill: 'var(--color-crystal-empty)' }} />
          <path d={FACET_LINES} fill="none" strokeWidth="5" strokeLinecap="round" opacity=".3" style={ink} />
        </symbol>
        <symbol id="holo-gem-shape" viewBox="24 34 152 132">
          <path d={OUTLINE} />
        </symbol>
      </defs>
    </svg>
  )
}

const VIEW = '0 0 152 132'

/* קריסטל מלא בודד (מונה, מסע, תגים) */
export function GemIcon({ size = 24, style }: { size?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={(size * 132) / 152} viewBox={VIEW} aria-hidden="true" style={{ display: 'block', overflow: 'visible', ...style }}>
      <use href="#holo-gem" />
    </svg>
  )
}

/* גובה ההתחלה של ה-clip: הקריסטל תופס y≈6..126 בתוך הריבוע של 152×132, והמילוי עולה מלמטה */
function gemClipY(fill: number): number {
  const f = Math.max(0, Math.min(1, fill))
  return f >= 1 - 1e-6 ? -10 : 128 - 122 * f
}

export function GemSocket({ fill, size = 34, tier = 'base', animated = true, className, style }: {
  fill: number; size?: number | string
  /** מצב השורה כולה: לפי מספר הקריסטלים השלמים (gemTier) */
  tier?: GemTier
  /** false = בלי פעימות (זוהר קבוע). ב-HUD בזמן קריאה שום דבר לא זז */
  animated?: boolean
  className?: string; style?: CSSProperties
}) {
  const id = `gc${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const y = gemClipY(fill)
  const whole = fill >= 1 - 1e-6
  /* המצב החם והמלא חלים רק על קריסטל שלם; חלקי וריק נשארים שקטים */
  const lit: GemTier = whole ? tier : 'base'
  const cls = ['gem', `gem--${lit}`, animated && lit !== 'base' ? 'gem--animated' : '', className ?? ''].filter(Boolean).join(' ')
  return (
    <svg
      className={cls}
      viewBox={VIEW}
      aria-hidden="true"
      data-gem-fill={Math.round(Math.max(0, Math.min(1, fill)) * 100)}
      data-gem-tier={lit}
      style={{ width: size, height: 'auto', display: 'block', overflow: 'visible', ...style }}
    >
      <defs>
        <clipPath id={id} clipPathUnits="userSpaceOnUse">
          <rect x="-10" y={y} width="172" height={Math.max(0, 150 - y)} />
        </clipPath>
      </defs>
      {lit !== 'base' && <use href="#holo-gem-shape" className="gem__glow" />}
      {lit === 'full' && <use href="#holo-gem-shape" className="gem__flash" />}
      <use href="#holo-gem-slot" />
      <g clipPath={`url(#${id})`}><use href={lit === 'full' ? '#holo-gem-full' : '#holo-gem'} /></g>
      {lit === 'warm' && <use href="#holo-gem" className="gem__pulse" />}
    </svg>
  )
}
