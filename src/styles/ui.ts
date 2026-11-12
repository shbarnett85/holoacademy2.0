/* אבני הבניין של השפה החזותית ("הספרייה ההולוגרפית"), כ-style מוכן. הצבעים מגיעים מ-`tokens.css` בלבד.
   כפתורים: לא מכאן אלא מהמחלקה `.holo-button` ב-index.css (כדי שמצב הלחיצה יעבוד). */
import type { CSSProperties } from 'react'

/* משטח תוכן במסך התלמיד: לבן, קו דיו 3px, צל קשיח 6px */
export const panelStudent: CSSProperties = {
  background: 'var(--color-surface)', color: 'var(--color-ink)',
  border: 'var(--border-student)', boxShadow: 'var(--shadow-student)', borderRadius: 'var(--radius-student)',
}
/* משטח במסכי מורה ומנהל: לבן, קו דיו 2px, צל קשיח 3px, רדיוס 12 */
export const panelStaff: CSSProperties = {
  background: 'var(--color-surface)', color: 'var(--color-ink)',
  border: 'var(--border-staff)', boxShadow: 'var(--shadow-staff)', borderRadius: 'var(--radius-staff)',
}
/* משטח בתוך משטח: בלי צל, קו דק */
export const panelInner: CSSProperties = {
  background: 'var(--color-surface)', color: 'var(--color-ink)',
  border: '1px solid var(--color-line-strong)', borderRadius: 10,
}
/* אזור שבו ה-AI מציע משהו */
export const panelAi: CSSProperties = {
  background: 'var(--color-machine-tint)', color: 'var(--color-ink)',
  border: 'var(--border-staff)', borderRadius: 'var(--radius-staff)',
}
/* ממצא על תלמיד/ה (למשל "טעות חוזרת") */
export const panelFinding: CSSProperties = {
  background: 'var(--color-human-tint)', color: 'var(--color-human-deep)',
  border: '2px solid var(--color-human-deep)', borderRadius: 'var(--radius-staff)',
}
/* פאנל משוב (תמיד יחד עם סימן ומילה) */
export const panelCorrect: CSSProperties = { background: 'var(--color-correct-tint)', color: 'var(--color-ink)', border: '2px solid var(--color-correct)', borderRadius: 12 }
export const panelWrong: CSSProperties = { background: 'var(--color-wrong-tint)', color: 'var(--color-ink)', border: '2px solid var(--color-wrong)', borderRadius: 12 }

/* שם או אווטאר של אדם (תלמיד/ה, מורה) */
export const nameChip: CSSProperties = {
  background: 'var(--color-human-soft)', color: 'var(--color-ink)', border: '2px solid var(--color-ink)',
}
/* תג מידע שאינו לחיץ */
export const infoChip: CSSProperties = {
  background: 'var(--color-surface)', color: 'var(--color-ink)', border: '1.5px solid var(--color-ink)',
}
/* שדה קלט */
export const fieldStyle: CSSProperties = {
  background: 'var(--color-surface)', color: 'var(--color-ink)', border: '2px solid var(--color-ink)', borderRadius: 10,
}
/* פס התקדמות: מסילה ומילוי */
export const progressTrack: CSSProperties = {
  background: 'var(--color-ink-wash)', border: '2px solid var(--color-ink)', borderRadius: 999, overflow: 'hidden',
}
export const progressFill: CSSProperties = { background: 'var(--color-human)', height: '100%' }
/* מסך כהה מאחורי חלון קופץ */
export const modalBackdrop: CSSProperties = { background: 'var(--color-scrim)' }
/* כותרת */
export const headingStyle: CSSProperties = { color: 'var(--color-machine-deep)' }
/* פס כותרת / סרגל ניווט */
export const barStyle: CSSProperties = { background: 'var(--color-machine)', color: 'var(--color-ink)', borderBottom: 'var(--border-staff)' }
/* טבעת פוקוס */
export const focusRing: CSSProperties = { outline: '3px solid var(--color-machine-deep)', outlineOffset: 2 }
