/* שורת אתגר קומפקטית — אותה שורה בשני המצבים (כל הכיתה / לפי תלמיד): מספר, שם האתגר וסוגו, תקציר (בר "X מתוך Y" או תג התוצאה),
   וכפתור "פירוט" שפותח את הפרטים מתחת לשורה. שורה אחת לאתגר (≈52px), כך שכל האתגרים נכנסים במסך בלי גלילה.
   footer = שורה נוספת שתמיד גלויה (למשל "טעות נפוצה"); children = הפירוט שנפתח. */
import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { FONT, Icon, RADIUS, T, VisuallyHidden } from '../teacherUi'
import { secondaryButton } from './styles'
import { UI } from './text'

export function NumberBadge({ n }: { n: number }) {
  return (
    <span aria-hidden="true" style={{ display: 'inline-grid', placeItems: 'center', width: 32, height: 32, borderRadius: '50%', flexShrink: 0, border: `2px solid ${T.controlBorder}`, fontFamily: FONT, fontSize: 16, fontWeight: 800, color: T.text, background: T.surfaceSoft }}>{n}</span>
  )
}

interface ChallengeRowShellProps {
  sceneId: string
  order: number
  title: string
  typeLabel: string
  /** הצד המסכם של השורה (בר / תג תוצאה) */
  summary: ReactNode
  /** true = הצד המסכם הוא בר שגדל לרוחב (class); false = תג בגודלו */
  summaryGrows?: boolean
  /** יש מה לפתוח? אחרת אין כפתור "פירוט" */
  canExpand: boolean
  /** שורה שתמיד גלויה מתחת לשורה הראשית */
  footer?: ReactNode
  /** הפירוט שנפתח */
  children?: ReactNode
  /** מאפיין data נוסף (למשל data-outcome) */
  dataOutcome?: string
}

export default function ChallengeRowShell({ sceneId, order, title, typeLabel, summary, summaryGrows = true, canExpand, footer, children, dataOutcome }: ChallengeRowShellProps) {
  const [open, setOpen] = useState(false)
  const detailId = useId()
  return (
    <li data-challenge={sceneId} data-outcome={dataOutcome} style={{ listStyle: 'none', padding: '2px 12px', borderRadius: RADIUS.md, border: `1.5px solid ${T.border}`, background: T.surface, display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px 14px', flexWrap: 'wrap' }}>
        <NumberBadge n={order} />
        <div style={{ flex: '1 1 150px', minWidth: 0, fontFamily: FONT, lineHeight: 1.35, overflowWrap: 'anywhere' }}>
          <span style={{ fontSize: 17, fontWeight: 800, color: T.text }}><VisuallyHidden>{UI.challengeWord} {order}: </VisuallyHidden>{title}</span>
          <span style={{ fontSize: 16, color: T.textSoft }}> · {typeLabel}</span>
        </div>
        <div style={summaryGrows ? { flex: '0 1 290px', minWidth: 230, display: 'flex', alignItems: 'center' } : { flex: '0 0 auto', display: 'flex', alignItems: 'center' }}>{summary}</div>
        {canExpand ? (
          <button type="button" data-tu-press aria-expanded={open} aria-controls={detailId} onClick={() => setOpen((o) => !o)}
            style={{ ...secondaryButton, padding: '0 12px', background: open ? T.accentFill : T.surface, borderColor: open ? T.accent : T.controlBorder }}>
            {UI.detail}
            <span style={{ display: 'inline-flex', transform: open ? 'rotate(180deg)' : undefined }}><Icon name="chevDown" size={18} /></span>
          </button>
        ) : (
          /* בלי כפתור: שומרים את אותו רוחב, כדי שהעמודות של כל השורות יישרו */
          <span aria-hidden="true" style={{ width: 96 }} />
        )}
      </div>
      {footer}
      {open && children && <div id={detailId} data-challenge-detail style={{ margin: '2px 0 6px' }}>{children}</div>}
    </li>
  )
}
