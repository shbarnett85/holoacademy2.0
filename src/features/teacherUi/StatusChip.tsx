/* מצב תלמיד/ה בהדמיה: אייקון + מילה (הצבע משני). המילים הן תוויות ממשק קבועות. */
import { Icon } from './icons'
import type { IconName } from './icons'
import { FONT, SMALL, T } from './tokens'

export type StudentStatus = 'completed' | 'in_progress' | 'not_started' | 'attention'

export const STATUS_META: Record<StudentStatus, { word: string; icon: IconName; color: string }> = {
  completed: { word: 'סיים/ה', icon: 'check', color: T.good },
  in_progress: { word: 'באמצע', icon: 'half', color: T.accent },
  not_started: { word: 'עוד לא התחיל/ה', icon: 'circle', color: T.muted },
  attention: { word: 'לתשומת לב', icon: 'alert', color: T.warn },
}

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
      border: `1.5px solid ${m.color}`, fontFamily: FONT, fontSize: SMALL, fontWeight: 700, color: T.text, whiteSpace: 'nowrap', lineHeight: 1.5,
    }}>
      <span style={{ color: m.color, display: 'inline-flex' }}><Icon name={m.icon} size={16} /></span>
      {m.word}
      {detail && <span style={{ fontWeight: 500, color: T.textSoft }}>· {detail}</span>}
    </span>
  )
}
