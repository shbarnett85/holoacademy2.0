/* אייקוני SVG קטנים לערכת מסכי המורה. תמיד aria-hidden — המשמעות נמסרת במילים לידם (עיקרון 7).
   currentColor: הצבע נקבע בהקשר. קו 2, קצוות מעוגלים. */
import type { ReactElement } from 'react'

const PATHS = {
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  /* עיגול חצי מלא — "באמצע" */
  half: <><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v17a8.5 8.5 0 0 1 0-17z" fill="currentColor" stroke="none" /></>,
  circle: <circle cx="12" cy="12" r="8.5" />,
  alert: <><path d="M12 3.5L22 20.5H2z" /><path d="M12 10v4.5" /><path d="M12 17.6v.1" /></>,
  /* חץ שמאלה = "הלאה" ב-RTL */
  chevLeft: <path d="M14.5 6l-6 6 6 6" />,
  chevDown: <path d="M6 9.5l6 6 6-6" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5" /><path d="M12 7.6v.1" /></>,
  /* ריק / אין נתונים */
  inbox: <><path d="M3 13l2.5-7.5h13L21 13" /><path d="M3 13v6h18v-6h-5.5a3.5 3.5 0 0 1-7 0z" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>,
  /* משוב לתלמיד/ה: צמיחה (חץ עולה) · התמדה (חזרה במעגל) · הצעד הבא (דגל) — תמיד לצד מילים */
  growth: <><path d="M4 17l5.5-5.5 4 4L21 8" /><path d="M15 8h6v6" /></>,
  streak: <><path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5" /><path d="M20 4v4.5h-4.5" /><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5" /><path d="M4 20v-4.5h4.5" /></>,
  /* מצב שיעור: פעיל עכשיו · פתוח · הסתיים · תאריך */
  pulse: <><circle cx="12" cy="12" r="3" fill="currentColor" /><circle cx="12" cy="12" r="8.5" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  ended: <><circle cx="12" cy="12" r="8.5" /><path d="M8 12h8" /></>,
  calendar: <><rect x="4" y="5.5" width="16" height="14.5" rx="2" /><path d="M4 10h16" /><path d="M9 3.5v4" /><path d="M15 3.5v4" /></>,
  step: <><path d="M6 21V4" /><path d="M6 5h11l-2.5 4 2.5 4H6" /></>,
} satisfies Record<string, ReactElement>

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 18, strokeWidth = 2 }: { name: IconName; size?: number; strokeWidth?: number }) {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, display: 'block' }}>
      {PATHS[name]}
    </svg>
  )
}
