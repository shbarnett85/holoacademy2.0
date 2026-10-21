/* סגנונות הפאנל של הסיכום המילולי — רק טוקני הערכה (T), בלי צבע מוחלט. גוף 16px לפחות, פסקאות הסיכום 17px, כפתורים 44px לפחות. */
import type { CSSProperties } from 'react'
import { FONT, MIN_TARGET, RADIUS, T } from '../teacherUi'

export const card: CSSProperties = {
  background: T.surface, border: `1px solid ${T.border}`, borderRadius: RADIUS.lg, boxSizing: 'border-box', padding: '14px 18px', minWidth: 0,
  fontFamily: FONT, color: T.text, display: 'flex', flexDirection: 'column', gap: 10,
}

/* הכרטיס המוטמע (בטאב "במבט אחד"): צפוף, ומביא איתו ריווח עליון משלו */
export const compactCard: CSSProperties = { ...card, padding: '6px 14px 8px', gap: 4, marginTop: 8 }

/* בתוך מסמך שהוא עצמו הכרטיס (שכבת-על): בלי מסגרת, רקע וריפוד נוספים */
export const plainCard: CSSProperties = { ...card, background: 'transparent', border: 'none', padding: 0 }

export const secondaryButton: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: MIN_TARGET, padding: '0 16px', borderRadius: RADIUS.md,
  fontFamily: FONT, fontSize: 16, fontWeight: 700, cursor: 'pointer', color: T.text, background: T.surface, border: `2px solid ${T.controlBorder}`, whiteSpace: 'nowrap', lineHeight: 1.3,
}

/* ראשי: מסגרת מבטא + פס תחתון (לא צבע בלבד: גם עובי ומילה) */
export const primaryButton: CSSProperties = {
  ...secondaryButton, fontWeight: 800, background: T.accentFill, border: `2px solid ${T.accent}`, boxShadow: `inset 0 -4px 0 ${T.accent}`,
}

export const disabledStyle: CSSProperties = { opacity: 0.55, cursor: 'not-allowed' }

export const heading: CSSProperties = { margin: 0, fontFamily: FONT, fontSize: 17, fontWeight: 800, color: T.text, lineHeight: 1.4 }

/* טקסט הסיכום עצמו: 17px, מרווח שורות נוח לקריאה */
export const paragraph: CSSProperties = { margin: 0, fontFamily: FONT, fontSize: 17, lineHeight: 1.7, color: T.text }

export const soft: CSSProperties = { margin: 0, fontFamily: FONT, fontSize: 16, lineHeight: 1.6, color: T.textSoft }

export const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 }
