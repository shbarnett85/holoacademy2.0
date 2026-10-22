/* דוגמות המילוי של הדונאט — מחוץ לקובץ הרכיב (DonutChart.tsx), כי קובץ רכיב מייצא רכיבים בלבד (רענון חם).
   כל נתח נבדל גם בדוגמה ולא בצבע בלבד: חמישה טונים, חמש דוגמאות שונות. */
import type { Tone } from './tokens'

export type DonutTone = Tone | 'accent'

export type PatternKind = 'solid' | 'horizontal' | 'diagonal' | 'dots' | 'cross'

export const DONUT_PATTERN: Record<DonutTone, PatternKind> = {
  positive: 'solid',
  accent: 'horizontal',
  attention: 'diagonal',
  neutral: 'dots',
  error: 'cross',
}
