/* "X מתוך Y הצליחו" (עיקרון 6): הטקסט "11 מתוך 24" תמיד גלוי ליד הבר; אחוז רק בנוסף (showPercent), לא במקום. */
import { countOf } from '../../shared/lib/findingsNarrative'
import { FONT, T } from './tokens'
import type { Tone } from './tokens'

interface ProgressBarProps {
  /** כמה (ה-X) */
  done: number
  /** מתוך כמה (ה-Y) */
  total: number
  /** המילה שאחרי המספר: "הצליחו", "סיימו" */
  label?: string
  /** מציג גם אחוז משני בסוגריים */
  showPercent?: boolean
  /** נשמר לתאימות: הבר תמיד בצבע ההתקדמות (T.progress); המשמעות נמצאת בטקסט ובתג שלידו */
  tone?: Tone | 'accent'
  /** גובה הבר ב-px (ברירת מחדל 12) */
  barHeight?: number
}

export default function ProgressBar({ done, total, label, showPercent = false, barHeight = 12 }: ProgressBarProps) {
  const safeTotal = Math.max(0, total)
  const share = safeTotal > 0 ? Math.min(1, Math.max(0, done / safeTotal)) : 0
  const text = `${countOf(done, safeTotal)}${label ? ` ${label}` : ''}`
  return (
    <div data-progress style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
      {/* הטקסט ראשון (בימין ב-RTL) — "11 מתוך 24" תמיד גלוי, והבר ממלא מאותו צד */}
      <span style={{ fontFamily: FONT, fontSize: 16, fontWeight: 700, color: T.text, whiteSpace: 'nowrap' }}>
        {text}
        {showPercent && safeTotal > 0 && <span style={{ fontSize: 16, fontWeight: 500, color: T.textSoft }}> ({Math.round(share * 100)}%)</span>}
      </span>
      <div role="progressbar" aria-label={text} aria-valuemin={0} aria-valuemax={safeTotal} aria-valuenow={Math.min(done, safeTotal)} aria-valuetext={text}
        /* מסילה: רקע עדין וקו דיו; מילוי: צבע ההתקדמות. הגובה הכולל (כולל הקו) נשאר barHeight + 2 */
        style={{ flex: 1, minWidth: 60, height: barHeight + 2, boxSizing: 'border-box', borderRadius: barHeight, background: 'var(--color-ink-wash)', border: `2px solid ${T.controlBorder}`, overflow: 'hidden' }}>
        <div style={{ width: `${share * 100}%`, height: '100%', background: T.progress, transition: 'width .3s' }} />
      </div>
    </div>
  )
}
