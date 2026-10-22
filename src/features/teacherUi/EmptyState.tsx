/* מצב ריק / "אין עדיין מספיק נתונים" (עיקרון 9): אומר במילים מה קורה ומה יקרה. אופציונלית כפתור פעולה (CTA). */
import { Link } from 'react-router-dom'
import { Icon } from './icons'
import { FONT, MIN_TARGET, RADIUS, T } from './tokens'

interface EmptyStateProps {
  /** מה קורה עכשיו: "עוד לא שלחת הדמיות לתלמידים." */
  title: string
  /** מה יקרה / מה עושים: "התוצאות יופיעו כאן כשתלמידים יסיימו." */
  whatNext?: string
  /** כפתור פעולה — מילה ברורה. לניווט: ctaTo; לפעולה: onCta */
  ctaLabel?: string
  ctaTo?: string
  onCta?: () => void
}

const ctaStyle = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: MIN_TARGET, padding: '0 22px', borderRadius: RADIUS.md,
  fontFamily: FONT, fontSize: 17, fontWeight: 800, textDecoration: 'none', cursor: 'pointer',
  background: T.accentFill, color: T.text, border: `2px solid ${T.accent}`, boxShadow: `inset 0 -4px 0 ${T.accent}`,
} as const

export default function EmptyState({ title, whatNext, ctaLabel, ctaTo, onCta }: EmptyStateProps) {
  return (
    <section data-empty-state style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10, padding: '28px 20px', borderRadius: RADIUS.lg, background: T.surface, border: `1.5px dashed ${T.controlBorder}` }}>
      <span style={{ color: T.muted, display: 'inline-flex' }}><Icon name="inbox" size={36} strokeWidth={1.6} /></span>
      <p style={{ margin: 0, fontFamily: FONT, fontSize: 19, fontWeight: 800, color: T.text, lineHeight: 1.5 }}>{title}</p>
      {whatNext && <p style={{ margin: 0, fontFamily: FONT, fontSize: 16, color: T.textSoft, lineHeight: 1.6, maxWidth: 560 }}>{whatNext}</p>}
      {ctaLabel && ctaTo && !onCta && <Link to={ctaTo} data-tu-press style={{ ...ctaStyle, marginTop: 6 }}>{ctaLabel}</Link>}
      {ctaLabel && onCta && <button type="button" data-tu-press onClick={onCta} style={{ ...ctaStyle, marginTop: 6 }}>{ctaLabel}</button>}
    </section>
  )
}
