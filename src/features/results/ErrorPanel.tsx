/* שגיאה במילים פשוטות + כפתור שמחזיר למקום בטוח (עיקרון 9 וסעיף 2.3 בהגדרה: 403/404 לא נראים כתקלה טכנית). */
import { Link } from 'react-router-dom'
import { Icon, MIN_TARGET, RADIUS, T } from '../teacherUi'
import { errorMessage } from './resultsApi'
import type { ResultsError } from './resultsApi'
import { UI } from './text'

const button = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: MIN_TARGET, padding: '0 22px', borderRadius: RADIUS.md,
  fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 800, textDecoration: 'none', cursor: 'pointer',
  background: T.accentFill, color: T.text, border: `2px solid ${T.accent}`, boxShadow: `inset 0 -4px 0 ${T.accent}`,
} as const

interface ErrorPanelProps {
  error: ResultsError
  scope: 'list' | 'submission'
  /** קישור "חזרה לתוצאות" (שומר את העדשה של האורח) */
  backTo: string
  onRetry?: () => void
  /** בעמוד הרשימה עצמו אין לאן "לחזור" — מציעים מעבר לאנליטיקה במקום */
  altTo?: string
}

export default function ErrorPanel({ error, scope, backTo, onRetry, altTo }: ErrorPanelProps) {
  const retryable = error.status !== 403 && error.status !== 404
  return (
    <section role="alert" data-error-panel style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12, padding: '28px 20px', borderRadius: RADIUS.lg, background: T.surface, border: `1.5px solid ${T.controlBorder}` }}>
      <span style={{ color: T.warn, display: 'inline-flex' }}><Icon name="alert" size={36} strokeWidth={1.8} /></span>
      <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 800, color: T.text, lineHeight: 1.5, maxWidth: 620 }}>{errorMessage(error, scope)}</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        {scope === 'submission' && <Link to={backTo} data-tu-press style={button}>{UI.backToResults}</Link>}
        {altTo && <Link to={altTo} data-tu-press style={button}>{UI.toAnalytics}</Link>}
        {retryable && onRetry && <button type="button" data-tu-press onClick={onRetry} style={button}>{UI.retry}</button>}
      </div>
    </section>
  )
}
