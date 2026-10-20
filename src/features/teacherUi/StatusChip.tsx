/* מצב תלמיד/ה בהדמיה: אייקון + מילה (הצבע משני). המילים הן תוויות ממשק קבועות. */
import { Icon } from './icons'
import { STATUS_META } from './statusMeta'
import type { StudentStatus } from './statusMeta'
import { FONT, T } from './tokens'

interface StatusChipProps {
  status: StudentStatus
  /** טקסט עזר אחרי המילה, למשל הסיבה ("ויתר/ה על כמה אתגרים") — מ-findingsNarrative */
  detail?: string
}

export default function StatusChip({ status, detail }: StatusChipProps) {
  const m = STATUS_META[status]
  return (
    <span data-status={status} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 12px 3px 10px', borderRadius: 20,
      border: `1.5px solid ${m.color}`, fontFamily: FONT, fontSize: 16, fontWeight: 700, color: T.text, whiteSpace: 'nowrap', lineHeight: 1.5,
    }}>
      <span style={{ color: m.color, display: 'inline-flex' }}><Icon name={m.icon} size={16} /></span>
      {m.word}
      {detail && <span style={{ fontWeight: 500, color: T.textSoft }}>· {detail}</span>}
    </span>
  )
}
