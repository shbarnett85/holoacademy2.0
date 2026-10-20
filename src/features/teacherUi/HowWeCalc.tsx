/* "איך חישבנו?" — המקום היחיד בממשק שבו מותר פירוט חישובי/סטטיסטי (עיקרון 5).
   <details> אמיתי: נפתח בלחיצה/Enter, בלי JS ובלי hover. התוכן: lines (מ-findingsNarrative, למשל howWeCalcResultsLines()) ו/או children. */
import type { ReactNode } from 'react'
import { RESULTS_TEXT } from '../../shared/lib/findingsNarrative'
import { Icon } from './icons'
import { FONT, MIN_TARGET, RADIUS, T } from './tokens'

interface HowWeCalcProps {
  /** שורות הסבר (כל אחת פסקה קצרה). עדיף מ-howWeCalcResultsLines() */
  lines?: string[]
  /** תוכן חופשי נוסף (למשל טבלת פרטים) */
  children?: ReactNode
  /** מחליף את התווית "איך חישבנו?" רק אם יש סיבה */
  label?: string
}

export default function HowWeCalc({ lines, children, label = RESULTS_TEXT.howWeCalcLabel }: HowWeCalcProps) {
  return (
    <details data-how-we-calc style={{ borderRadius: RADIUS.md, background: T.surface, border: `1px solid ${T.border}` }}>
      <summary data-tu-press style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: MIN_TARGET, padding: '0 16px', cursor: 'pointer', fontFamily: FONT, fontSize: 16, fontWeight: 700, color: T.accentStrong, borderRadius: RADIUS.md }}>
        <Icon name="info" size={18} />
        <span style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>{label}</span>
        <span data-tu-chev style={{ display: 'inline-flex', marginInlineStart: 'auto' }}><Icon name="chevDown" size={18} /></span>
      </summary>
      <div style={{ padding: '4px 16px 14px', display: 'flex', flexDirection: 'column', gap: 8, fontFamily: FONT, fontSize: 15, lineHeight: 1.7, color: T.textSoft }}>
        {lines?.map((l, i) => <p key={i} style={{ margin: 0 }}>{l}</p>)}
        {children}
      </div>
    </details>
  )
}
