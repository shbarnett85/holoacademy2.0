/* מתג מצבים גדול: [כל הכיתה] [לפי תלמיד]. כפתורים מקובצים (radiogroup), כל אחד עם מילה, 48px גובה.
   גנרי — מערך options. חיצים במקלדת מזיזים את הבחירה (כמו כפתורי רדיו).
   compact: אותו מתג בגובה כולל של 44px בדיוק (הכפתורים הם כל הגובה) — לשורות צפופות (ראש מסך, בורר עדשות).
   כל אפשרות היא כפתור (holo-button): קו דיו וצל קשיח; הנבחרת ברקע דיו עם וי (is-selected) — לא בצבע בלבד. */
import { useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { Icon } from './icons'
import { btnClass } from './fills'
import { FONT, MIN_TARGET, RADIUS } from './tokens'

export interface ModeOption {
  id: string
  label: string
  icon?: ReactNode
}

interface ModeToggleProps {
  options: ModeOption[]
  value: string
  onChange: (id: string) => void
  /** שם הקבוצה לקוראי מסך, למשל "אופן התצוגה" */
  ariaLabel: string
  /** גרסה צפופה: 48px גובה כולל במקום 58px */
  compact?: boolean
}

export default function ModeToggle({ options, value, onChange, ariaLabel, compact = false }: ModeToggleProps) {
  const ref = useRef<HTMLDivElement>(null)

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    const idx = Math.max(0, options.findIndex((o) => o.id === value))
    const rtl = ref.current ? getComputedStyle(ref.current).direction === 'rtl' : true
    let next: number
    if (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight') || e.key === 'ArrowDown') next = (idx + 1) % options.length
    else if (e.key === (rtl ? 'ArrowRight' : 'ArrowLeft') || e.key === 'ArrowUp') next = (idx - 1 + options.length) % options.length
    else return
    e.preventDefault()
    onChange(options[next].id)
    ref.current?.querySelector<HTMLElement>(`[data-option-id="${CSS.escape(options[next].id)}"]`)?.focus()
  }

  return (
    <div ref={ref} role="radiogroup" aria-label={ariaLabel} onKeyDown={onKeyDown} data-mode-toggle
      style={{ display: 'inline-flex', flexWrap: 'wrap', maxWidth: '100%', gap: compact ? 6 : 8 }}>
      {options.map((o) => {
        const on = o.id === value
        return (
          <button key={o.id} type="button" role="radio" data-tu-press className={btnClass(on)} data-option-id={o.id} aria-checked={on} tabIndex={on ? 0 : -1} onClick={() => onChange(o.id)}
            style={{
              /* compact: הריפוד קטן ב-2px מכל צד — במקום הקו של 2px שהכפתור קיבל (הרוחב נשאר) */
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: compact ? MIN_TARGET : 48, padding: compact ? '0 14px' : '0 22px', borderRadius: RADIUS.md,
              fontFamily: FONT, fontSize: compact ? 16 : 17, fontWeight: on ? 800 : 600, cursor: on ? 'default' : 'pointer', whiteSpace: 'nowrap',
            }}>
            {/* הנבחר מסומן גם בוי, לא רק בצבע */}
            {on ? <span style={{ display: 'inline-flex' }}><Icon name="check" size={18} strokeWidth={2.6} /></span> : o.icon ? <span aria-hidden="true" style={{ display: 'inline-flex' }}>{o.icon}</span> : null}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
