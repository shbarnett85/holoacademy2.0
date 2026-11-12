/* מילויים, קווים ומחלקות משותפים לשפה החזותית של מסכי המורה. הצבעים עצמם מגיעים מהטוקנים (tokens.ts / styles/tokens.css).
   · כפתור: המחלקה `holo-button holo-button--staff` (index.css) נותנת רקע, קו דיו, צל קשיח ומצב לחוץ; נבחר = is-selected.
   · תג מצב: קו מתאר בדיו + מילוי עדין לפי המשמעות. הצבע לעולם לא לבד: תמיד אייקון ומילה.
   · ממצא על תלמיד/ה: רקע findingFill + טקסט findingText. */
import type { CSSProperties } from 'react'
import { T } from './tokens'
import type { Tone } from './tokens'

/** מחלקת הכפתור במסכי צוות */
export const BTN = 'holo-button holo-button--staff'
/** כפתור שיכול להיות נבחר / פתוח */
export const btnClass = (selected?: boolean): string => (selected ? `${BTN} is-selected` : BTN)
/** כפתור קטן בתוך שורה צפופה (צל של 2px) */
export const BTN_SM = `${BTN} holo-button--sm`

/** מילוי עדין לתג או לתיבה */
export const FILL = {
  good: 'var(--color-correct-tint)',
  bad: 'var(--color-wrong-tint)',
  attention: T.findingFill,
  neutral: 'var(--color-ink-wash)',
} as const

export const TONE_FILL: Record<Tone, string> = { positive: FILL.good, attention: FILL.attention, error: FILL.bad, neutral: FILL.neutral }

/** קו המתאר של תג מצב */
export const CHIP_LINE = `1.5px solid ${T.controlBorder}`
/** קו של תיבה שיושבת בתוך משטח (בלי צל) */
export const NESTED_LINE = `1px solid ${T.border}`

/** ממצא על תלמיד/ה בתוך שורת טקסט (לא משנה את גובה השורה) */
export const findingInline: CSSProperties = {
  background: T.findingFill, color: T.findingText, borderRadius: 6, padding: '0 6px', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone',
}
