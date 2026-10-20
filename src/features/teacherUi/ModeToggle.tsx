/* מתג מצבים גדול: [כל הכיתה] [לפי תלמיד]. כפתורים מקובצים (radiogroup), כל אחד עם מילה, 48px גובה.
   גנרי — מערך options. חיצים במקלדת מזיזים את הבחירה (כמו כפתורי רדיו).
   compact: אותו מתג בגובה כולל של 44px בדיוק (הכפתורים הם כל הגובה; הטבעת היא box-shadow) — לשורות צפופות (ראש מסך, בורר עדשות). */
import { useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { Icon } from './icons'
import { FONT, MIN_TARGET, RADIUS, T } from './tokens'

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
      style={{
        display: 'inline-flex', borderRadius: RADIUS.md, background: T.surface, maxWidth: '100%',
        /* compact: הטבעת מציורית (box-shadow) ולא border, כך שהגובה הכולל הוא בדיוק 44px — כמו הכפתורים שבתוכו */
        ...(compact ? { boxShadow: `0 0 0 2px ${T.controlBorder}` } : { border: `2px solid ${T.controlBorder}`, padding: 3, gap: 3 }),
      }}>
      {options.map((o) => {
        const on = o.id === value
        return (
          <button key={o.id} type="button" role="radio" data-tu-press data-option-id={o.id} aria-checked={on} tabIndex={on ? 0 : -1} onClick={() => onChange(o.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: compact ? MIN_TARGET : 48, padding: compact ? '0 16px' : '0 22px', borderRadius: compact ? RADIUS.md - 2 : RADIUS.md - 4,
              fontFamily: FONT, fontSize: compact ? 16 : 17, fontWeight: on ? 800 : 600, cursor: on ? 'default' : 'pointer', whiteSpace: 'nowrap',
              background: on ? T.accentFill : 'transparent', color: T.text, border: compact ? 'none' : `2px solid ${on ? T.accent : 'transparent'}`,
              boxShadow: on ? `inset 0 -4px 0 ${T.accent}` : 'none',
            }}>
            {/* הנבחר מסומן גם בוי, לא רק בצבע */}
            {on ? <span style={{ color: T.accent, display: 'inline-flex' }}><Icon name="check" size={18} strokeWidth={2.6} /></span> : o.icon ? <span aria-hidden="true" style={{ display: 'inline-flex' }}>{o.icon}</span> : null}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
