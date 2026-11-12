/* מצב תלמיד/ה בהדמיה: מילה + אייקון + צבע (הצבע משני). המילים הן תוויות ממשק קבועות. */
import type { IconName } from './icons'
import { FILL } from './fills'
import { T } from './tokens'

export type StudentStatus = 'completed' | 'in_progress' | 'not_started' | 'attention'

export const STATUS_META: Record<StudentStatus, { word: string; icon: IconName; color: string; fill: string }> = {
  completed: { word: 'סיים/ה', icon: 'check', color: T.good, fill: FILL.good },
  in_progress: { word: 'באמצע', icon: 'half', color: T.accent, fill: FILL.neutral },
  not_started: { word: 'עוד לא התחיל/ה', icon: 'circle', color: T.muted, fill: FILL.neutral },
  attention: { word: 'לתשומת לב', icon: 'alert', color: T.warn, fill: FILL.attention },
}
