/* ──────────────────────────────────────────────────────────────────────────
   הערת כיסוי במסכי כיתה / מקצוע / תלמיד/ה: כשיש משחקים בהדמיות בלי מקצוע, הם אינם נכנסים לתוצאות — והמצב הריק שמתחת היה אומר "עוד לא שיחקו",
   וזה לא נכון. השורה הזאת אומרת מה חסר באמת, ומובילה לספרייה המסוננת ל"הדמיות בלי מקצוע" (שם משייכים מקצוע).
   המשפט עצמו מגיע מהחוזה (coverageNote, נבנה ב-findingsNarrative בשרת); כאן רק הצגה. שדה אופציונלי: חסר/null = אין הערה.
   ────────────────────────────────────────────────────────────────────────── */
import { V2_CLIENT_TEXT } from '../../shared/lib/findingsNarrative'
import { LIBRARY_NOSUBJECT_HREF } from '../../shared/lib/libraryLinks'
import { Icon, RADIUS, T } from '../teacherUi'
import { LinkButton, Note } from './ui'

export function CoverageNote({ note }: { note: string | null }) {
  if (!note) return null
  return (
    <section data-coverage-note aria-label={V2_CLIENT_TEXT.entry.assignSubjects}
      style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '6px 16px', borderRadius: RADIUS.md, background: T.surface, border: `1px solid ${T.border}`, minWidth: 0 }}>
      <span style={{ color: T.accent, display: 'inline-flex' }}><Icon name="info" size={22} /></span>
      <Note style={{ flex: '1 1 320px', color: T.text }}>{note}</Note>
      <LinkButton to={LIBRARY_NOSUBJECT_HREF}>{V2_CLIENT_TEXT.entry.assignSubjects}</LinkButton>
    </section>
  )
}
