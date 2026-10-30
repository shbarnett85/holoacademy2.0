/* הגביש של HoloAcademy: מקור אחד לשקעים, למונה, למעוף, למסך הסיום ולמסע.
   הגדרות ה-SVG נטענות פעם אחת (GemDefs) וכל השאר משתמש בהן דרך <use>.
   שקע ריק: אותו קו מתאר בצבע עמום. מילוי חלקי: clipPath שעולה מלמטה למעלה. */
import { useId, type CSSProperties } from 'react'

export function GemDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <symbol id="holo-gem" viewBox="24 34 152 132">
          <g stroke="#2B2D31" strokeWidth="9" strokeLinejoin="round" strokeLinecap="round">
            <path d="M66 40 L88 40 L88 82 L30 82 Z" fill="#DDF5FF" />
            <path d="M88 40 L112 40 L112 82 L88 82 Z" fill="#F4FCFF" />
            <path d="M112 40 L134 40 L170 82 L112 82 Z" fill="#BFEAFA" />
            <path d="M30 82 L88 82 L88 160 L82 160 Z" fill="#7FD6F2" />
            <path d="M88 82 L112 82 L112 160 L88 160 Z" fill="#45B6E2" />
            <path d="M112 82 L170 82 L118 160 L112 160 Z" fill="#1C6698" />
          </g>
        </symbol>
        <symbol id="holo-gem-slot" viewBox="24 34 152 132">
          <path d="M66 40 L134 40 L170 82 L118 160 L82 160 L30 82 Z" fill="currentColor" fillOpacity=".22" stroke="currentColor" strokeWidth="8" strokeLinejoin="round" />
          <path d="M30 82 L170 82 M88 40 L88 160 M112 40 L112 160" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" opacity=".75" />
        </symbol>
      </defs>
    </svg>
  )
}

const VIEW = '0 0 152 132'
/* צבע השקע הריק: עמום אבל נראה (3:1) על הרקע הכהה של מסכי התלמיד */
export const GEM_SLOT_COLOR = '#5D7BA8'

export function GemIcon({ size = 24, style }: { size?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={(size * 132) / 152} viewBox={VIEW} aria-hidden="true" style={{ display: 'block', overflow: 'visible', ...style }}>
      <use href="#holo-gem" />
    </svg>
  )
}

/* גובה ההתחלה של ה-clip: הגביש תופס y≈6..126 בתוך הריבוע של 152×132, והמילוי עולה מלמטה */
function gemClipY(fill: number): number {
  const f = Math.max(0, Math.min(1, fill))
  return f >= 1 - 1e-6 ? -10 : 128 - 122 * f
}

export function GemSocket({ fill, size = 34, className, style }: { fill: number; size?: number | string; className?: string; style?: CSSProperties }) {
  const id = `gc${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const y = gemClipY(fill)
  return (
    <svg
      className={className}
      viewBox={VIEW}
      aria-hidden="true"
      data-gem-fill={Math.round(Math.max(0, Math.min(1, fill)) * 100)}
      style={{ width: size, height: 'auto', display: 'block', overflow: 'visible', color: GEM_SLOT_COLOR, ...style }}
    >
      <defs>
        <clipPath id={id} clipPathUnits="userSpaceOnUse">
          <rect x="-10" y={y} width="172" height={Math.max(0, 150 - y)} />
        </clipPath>
      </defs>
      <use href="#holo-gem-slot" />
      <g clipPath={`url(#${id})`}><use href="#holo-gem" /></g>
    </svg>
  )
}
