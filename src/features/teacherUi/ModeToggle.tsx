/* מתג מצבים גדול: [כל הכיתה] [לפי תלמיד]. כפתורים מקובצים (radiogroup), כל אחד עם מילה, 48px גובה.
   גנרי — מערך options. חיצים במקלדת מזיזים את הבחירה (כמו כפתורי רדיו). */
import { useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { Icon } from './icons'
import { FONT, RADIUS, T } from './tokens'

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
}

export default function ModeToggle({ options, value, onChange, ariaLabel }: ModeToggleProps) {
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
      style={{ display: 'inline-flex', borderRadius: RADIUS.md, border: `2px solid ${T.controlBorder}`, background: T.surface, padding: 3, gap: 3, maxWidth: '100%' }}>
      {options.map((o) => {
        const on = o.id === value
        return (
          <button key={o.id} type="button" role="radio" data-tu-press data-option-id={o.id} aria-checked={on} tabIndex={on ? 0 : -1} onClick={() => onChange(o.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, padding: '0 22px', borderRadius: RADIUS.md - 4,
              fontFamily: FONT, fontSize: 17, fontWeight: on ? 800 : 600, cursor: on ? 'default' : 'pointer',
              background: on ? T.accentFill : 'transparent', color: T.text, border: `2px solid ${on ? T.accent : 'transparent'}`,
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
