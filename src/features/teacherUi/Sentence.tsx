/* משפט הסיכום (עיקרון 2): קודם משפט אחד במילים, ורק אחר כך פירוט.
   גודל ≥18px. הטון מסומן באייקון + מילה (קריאת-מסך) ובפס צד — לא בצבע בלבד. */
import type { ReactNode } from 'react'
import { Icon } from './icons'
import type { IconName } from './icons'
import VisuallyHidden from './VisuallyHidden'
import { FONT, RADIUS, SENTENCE, T, TONE_META } from './tokens'
import type { Tone } from './tokens'

interface SentenceProps {
  /** המשפט עצמו — בעברית פשוטה, מ-findingsNarrative (לא נכתב ידנית במסכים) */
  children: ReactNode
  tone?: Tone
  /** כותרת-על קצרה אופציונלית מעל המשפט (UI label), למשל "במשפט אחד" */
  label?: string
}

const TONE_ICON: Record<Tone, IconName> = { positive: 'check', attention: 'alert', error: 'alert', neutral: 'info' }

export default function Sentence({ children, tone = 'neutral', label }: SentenceProps) {
  const meta = TONE_META[tone]
  return (
    <section data-sentence aria-label={label ?? 'סיכום במשפט אחד'}
      style={{
        display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 16px', borderRadius: RADIUS.md,
        background: T.surface, border: `1px solid ${T.border}`, borderInlineStart: `6px solid ${meta.color}`,
      }}>
      <span style={{ color: meta.color, marginTop: 4, display: 'inline-flex', position: 'relative' }}>
        <Icon name={TONE_ICON[tone]} size={24} />
        {/* מילת הטון לקוראי מסך — המשמעות לא נשענת על הצבע */}
        <VisuallyHidden>{meta.word}: </VisuallyHidden>
      </span>
      <div style={{ minWidth: 0 }}>
        {label && <div style={{ fontSize: 14, fontWeight: 700, color: T.muted, marginBottom: 2 }}>{label}</div>}
        <p style={{ margin: 0, fontFamily: FONT, fontSize: SENTENCE, lineHeight: 1.6, fontWeight: 600, color: T.text }}>{children}</p>
      </div>
    </section>
  )
}
