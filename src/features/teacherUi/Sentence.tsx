/* משפט הסיכום (עיקרון 2): קודם משפט אחד במילים, ורק אחר כך פירוט.
   גודל ≥18px. הטון מסומן באייקון + מילה (קריאת-מסך) ובפס צד — לא בצבע בלבד.
   compact: ריפוד קטן — שורה אחת במסכים צפופים (1366×768). aside: פעולות בקצה השורה (למשל הקודם/הבא). */
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
  /** ריפוד קטן (מסכים שצריכים להיכנס בגובה אחד) */
  compact?: boolean
  /** חריץ בקצה השורה: כפתורים הקשורים למשפט (למשל מעבר בין תלמידים) */
  aside?: ReactNode
}

const TONE_ICON: Record<Tone, IconName> = { positive: 'check', attention: 'alert', error: 'alert', neutral: 'info' }

export default function Sentence({ children, tone = 'neutral', label, compact = false, aside }: SentenceProps) {
  const meta = TONE_META[tone]
  return (
    <section data-sentence aria-label={label ?? 'סיכום במשפט אחד'}
      style={{
        /* משטח: לבן, קו דיו וצל קשיח. הריפוד קטן ב-1px (הקו עבה ב-1px), ובצד ההתחלה גדול ב-4px (במקום פס הצבע של 6px) — המידות נשארות */
        display: 'flex', gap: 12, alignItems: 'center', padding: compact ? '3px 13px' : '11px 15px', paddingInlineStart: compact ? 18 : 20, borderRadius: RADIUS.md,
        background: T.surface, border: T.line, boxShadow: T.shadow,
      }}>
      <span style={{ color: meta.color, display: 'inline-flex', position: 'relative', alignSelf: compact ? 'center' : 'flex-start', marginTop: compact ? 0 : 4 }}>
        <Icon name={TONE_ICON[tone]} size={compact ? 22 : 24} />
        {/* מילת הטון לקוראי מסך — המשמעות לא נשענת על הצבע */}
        <VisuallyHidden>{meta.word}: </VisuallyHidden>
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        {label && <div style={{ fontSize: 16, fontWeight: 700, color: T.muted, marginBottom: 2 }}>{label}</div>}
        <p style={{ margin: 0, fontFamily: FONT, fontSize: SENTENCE, lineHeight: compact ? 1.45 : 1.6, fontWeight: 600, color: T.text }}>{children}</p>
      </div>
      {aside && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>{aside}</div>}
    </section>
  )
}
