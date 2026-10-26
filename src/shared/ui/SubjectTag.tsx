/* ──────────────────────────────────────────────────────────────────────────
   SubjectTag — תגית המקצוע של כרטיס השיעור: צבע המקצוע ברקע, ושם המקצוע כתוב עליה.
   כך הצבע לעולם לא מופיע לבד ואין צורך בסמל מקצוע נפרד (CLAUDE.md "שפה חזותית של מקצועות").
   · הצבע ממקור אחד — `subjectTagColors` (shared/lib/subjects.ts); טקסט לבן/כהה לפי הניגודיות הגבוהה יותר (AA, נאכף בבדיקה).
   · "לא סווג" = תגית אפורה עם המילים "לא סווג".
   · mode: 'auto' = לפי ערכת המורה הפעילה; 'dark' = מסכי תלמיד.
   · ring: טבעת בצבע המשטח סביב התגית כשהיא יושבת על תמונה — כדי שתיפרד מהתמונה בכל צבע.
   ────────────────────────────────────────────────────────────────────────── */
import type { CSSProperties } from 'react'
import { subjectTagColors, type SubjectVisualMode } from '../lib/subjects'
import { useTheme } from '../lib/useTheme'

/* משטח הטבעת: כמו הרקע הרגיל של כל מצב */
const RING: Record<SubjectVisualMode, string> = { light: '#ffffff', dark: '#0b1220' }

export interface SubjectTagProps {
  code: string | null | undefined
  mode?: 'auto' | SubjectVisualMode
  /** md = 16px (כרטיסים), sm = 14px (תמונות קטנות ברשימות) */
  size?: 'md' | 'sm'
  ring?: boolean
  style?: CSSProperties
}

export default function SubjectTag({ code, mode = 'auto', size = 'md', ring = true, style }: SubjectTagProps) {
  const light = useTheme()
  const resolved: SubjectVisualMode = mode === 'auto' ? (light ? 'light' : 'dark') : mode
  const c = subjectTagColors(code, resolved)
  const sm = size === 'sm'
  return (
    <span data-subject-tag={c.code} style={{
      display: 'inline-flex', alignItems: 'center', maxWidth: '100%', boxSizing: 'border-box',
      padding: sm ? '1px 8px' : '3px 12px', borderRadius: 999, lineHeight: 1.35,
      fontFamily: 'var(--font-display)', fontSize: sm ? 14 : 16, fontWeight: 800, whiteSpace: 'nowrap',
      background: c.bg, color: c.fg,
      boxShadow: ring ? `0 0 0 2px ${RING[resolved]}` : 'none',
      ...style,
    }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</span>
    </span>
  )
}
