/* מצב תלמיד/ה בהדמיה: מילה + אייקון + צבע (הצבע משני). המילים הן תוויות ממשק קבועות. */
import type { IconName } from './icons'
import { T } from './tokens'

export type StudentStatus = 'completed' | 'in_progress' | 'not_started' | 'attention'

export const STATUS_META: Record<StudentStatus, { word: string; icon: IconName; color: string }> = {
  completed: { word: 'סיים/ה', icon: 'check', color: T.good },
  in_progress: { word: 'באמצע', icon: 'half', color: T.accent },
  not_started: { word: 'עוד לא התחיל/ה', icon: 'circle', color: T.muted },
  attention: { word: 'לתשומת לב', icon: 'alert', color: T.warn },
}
