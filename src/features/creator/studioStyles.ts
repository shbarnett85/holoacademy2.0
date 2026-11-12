/* סגנונות משותפים לאולפן היוצר (Claude Design) — כדי לא לשכפל בין המסכים */

/* משטח במסכי המורה: לבן, קו דיו 2px, צל קשיח 3px, רדיוס 12 (השם glass נשאר מהעיצוב הקודם) */
export const glass: React.CSSProperties = {
  background: 'var(--color-surface)', color: 'var(--color-ink)',
  border: 'var(--border-staff)', borderRadius: 'var(--radius-staff)', boxShadow: 'var(--shadow-staff)',
}

export const micro: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--color-muted)' }
