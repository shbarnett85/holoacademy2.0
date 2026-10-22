/* סינון בכפתורים (לא רשימה נפתחת): "כיתה: [כל הכיתות] [ו׳1] [ו׳2]". הכפתור הנבחר מסומן בוי, במסגרת עבה ובמשקל כבד — לא בצבע בלבד.
   כל כפתור ≥44px; הקבוצה כולה מוכרזת לקוראי מסך (role=group). */
import type { ReactNode } from 'react'
import { FONT, Icon, MIN_TARGET, RADIUS, T } from '../teacherUi'

export interface FilterOption { id: string; label: string; icon?: ReactNode }

interface FilterButtonsProps {
  /** שם הקבוצה: "כיתה" / "מקצוע" */
  label: string
  /** הכפתור הראשון — "כל הכיתות" */
  allLabel: string
  options: FilterOption[]
  /** הערך הנבחר; null = הכול */
  value: string | null
  onChange: (id: string | null) => void
}

export default function FilterButtons({ label, allLabel, options, value, onChange }: FilterButtonsProps) {
  const all: FilterOption[] = [{ id: '', label: allLabel }, ...options]
  return (
    <div role="group" aria-label={`סינון לפי ${label}`} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontFamily: FONT, fontSize: 16, fontWeight: 700, color: T.textSoft }}>{label}:</span>
      {all.map((o) => {
        const on = (value ?? '') === o.id
        return (
          <button key={o.id || 'all'} type="button" data-tu-press aria-pressed={on} onClick={() => onChange(o.id || null)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: MIN_TARGET, padding: '0 14px', borderRadius: RADIUS.md,
              fontFamily: FONT, fontSize: 16, fontWeight: on ? 800 : 600, cursor: on ? 'default' : 'pointer', color: T.text,
              background: on ? T.accentFill : T.surface, border: `2px solid ${on ? T.accent : T.controlBorder}`,
              boxShadow: on ? `inset 0 -4px 0 ${T.accent}` : 'none',
            }}>
            {on && <span style={{ color: T.accent, display: 'inline-flex' }}><Icon name="check" size={18} strokeWidth={2.6} /></span>}
            {o.icon && <span aria-hidden="true" style={{ display: 'inline-flex' }}>{o.icon}</span>}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
