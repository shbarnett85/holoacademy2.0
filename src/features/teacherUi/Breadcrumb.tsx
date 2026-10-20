/* נתיב חזרה גלוי עם שמות (עיקרון 4): תוצאות › המהפכה הצרפתית › ו2.
   כל פריט שאינו אחרון הוא קישור אמיתי (to) או כפתור (onClick); האחרון הוא העמוד הנוכחי (aria-current, לא לחיץ). */
import { Link } from 'react-router-dom'
import { Icon } from './icons'
import { FONT, MIN_TARGET, SMALL, T } from './tokens'

export interface BreadcrumbItem {
  label: string
  /** יעד ניווט (קישור). מושמט בפריט האחרון */
  to?: string
  /** חלופה ל-to: פעולה (למשל מעבר מצב בתוך אותו עמוד) */
  onClick?: () => void
}

interface BreadcrumbProps {
  /** הנתיב מהשורש אל העמוד הנוכחי. הפריט האחרון = העמוד הנוכחי */
  items: BreadcrumbItem[]
}

const itemStyle = {
  display: 'inline-flex', alignItems: 'center', minHeight: MIN_TARGET, padding: '0 8px', borderRadius: 10,
  fontFamily: FONT, fontSize: SMALL + 1, lineHeight: 1.3,
} as const

export default function Breadcrumb({ items }: BreadcrumbProps) {
  if (items.length === 0) return null
  const last = items.length - 1
  return (
    <nav aria-label="נתיב" data-breadcrumb>
      {/* margin שלילי: הטקסט של הפריט הראשון מיושר לקצה הכותרת, ואזור הלחיצה (עם ה-padding) נשאר 44px */}
      <ol style={{ listStyle: 'none', margin: 0, marginInlineStart: -8, padding: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        {items.map((it, i) => {
          const current = i === last
          return (
            <li key={`${i}-${it.label}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              {current ? (
                <span aria-current="page" style={{ ...itemStyle, color: T.text, fontWeight: 800, minHeight: 32 }}>{it.label}</span>
              ) : it.to ? (
                <Link to={it.to} data-tu-press style={{ ...itemStyle, color: T.accentStrong, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 }}>{it.label}</Link>
              ) : (
                <button type="button" data-tu-press onClick={it.onClick} style={{ ...itemStyle, color: T.accentStrong, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3, background: 'transparent', border: 'none', cursor: 'pointer' }}>{it.label}</button>
              )}
              {!current && <span aria-hidden="true" style={{ color: T.muted, display: 'inline-flex' }}><Icon name="chevLeft" size={16} /></span>}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
