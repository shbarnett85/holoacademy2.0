/* סגנונות משותפים למסכי התוצאות — רק טוקני הערכה (T), בלי צבע מוחלט. */
import type { CSSProperties } from 'react'
import { FONT, MIN_TARGET, RADIUS, T } from '../teacherUi'

export const card: CSSProperties = {
  background: T.surface, border: `1px solid ${T.border}`, borderRadius: RADIUS.lg, boxSizing: 'border-box',
}

/* כותרת פאנל (h2) — 17px, מודגשת */
export const panelTitle: CSSProperties = { margin: 0, fontFamily: FONT, fontSize: 17, fontWeight: 800, color: T.text, lineHeight: 1.4 }

/* כפתור רגיל (משני) */
export const secondaryButton: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: MIN_TARGET, padding: '0 16px', borderRadius: RADIUS.md,
  fontFamily: FONT, fontSize: 16, fontWeight: 700, cursor: 'pointer', color: T.text, background: T.surface, border: `2px solid ${T.controlBorder}`, textDecoration: 'none', whiteSpace: 'nowrap',
}

/* כפתור ראשי — מסגרת מבטא + פס תחתון (לא צבע בלבד: גם עובי ומילה) */
export const primaryButton: CSSProperties = {
  ...secondaryButton, fontWeight: 800, background: T.accentFill, border: `2px solid ${T.accent}`, boxShadow: `inset 0 -4px 0 ${T.accent}`,
}

/* שורת טקסט משנית (משפט, רמז, מספרים): 16px — גוף טקסט לא יורד מזה */
export const soft: CSSProperties = { fontFamily: FONT, fontSize: 16, color: T.textSoft, lineHeight: 1.6 }

/* כיתוב (תווית של עובדה, סוג אתגר): כמו שורת משנית אבל צפוף יותר. גם הוא 16px — בתוכן התוצאות שום טקסט לא קטן מזה */
export const caption: CSSProperties = { ...soft, lineHeight: 1.4 }

/* אזור גלילה פנימי */
export const scrollArea: CSSProperties = { flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' }
