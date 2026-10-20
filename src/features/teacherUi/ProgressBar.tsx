/* "X מתוך Y הצליחו" (עיקרון 6): הטקסט "11 מתוך 24" תמיד גלוי ליד הבר; אחוז רק בנוסף (showPercent), לא במקום. */
import { countOf } from '../../shared/lib/findingsNarrative'
import { FONT, SMALL, T, TONE_META } from './tokens'
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
  /** צבע הבר. הטקסט תמיד נושא את המשמעות */
  tone?: Tone | 'accent'
  /** גובה הבר ב-px (ברירת מחדל 12) */
  barHeight?: number
}

export default function ProgressBar({ done, total, label, showPercent = false, tone = 'accent', barHeight = 12 }: ProgressBarProps) {
  const safeTotal = Math.max(0, total)
  const share = safeTotal > 0 ? Math.min(1, Math.max(0, done / safeTotal)) : 0
  const color = tone === 'accent' ? T.accent : TONE_META[tone].color
  const text = `${countOf(done, safeTotal)}${label ? ` ${label}` : ''}`
  return (
    <div data-progress style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
      {/* הטקסט ראשון (בימין ב-RTL) — "11 מתוך 24" תמיד גלוי, והבר ממלא מאותו צד */}
      <span style={{ fontFamily: FONT, fontSize: 16, fontWeight: 700, color: T.text, whiteSpace: 'nowrap' }}>
        {text}
        {showPercent && safeTotal > 0 && <span style={{ fontSize: SMALL, fontWeight: 500, color: T.textSoft }}> ({Math.round(share * 100)}%)</span>}
      </span>
      <div role="progressbar" aria-label={text} aria-valuemin={0} aria-valuemax={safeTotal} aria-valuenow={Math.min(done, safeTotal)} aria-valuetext={text}
        style={{ flex: 1, minWidth: 60, height: barHeight, borderRadius: barHeight, background: T.grid, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
        <div style={{ width: `${share * 100}%`, height: '100%', borderRadius: barHeight, background: color, transition: 'width .3s' }} />
      </div>
    </div>
  )
}
