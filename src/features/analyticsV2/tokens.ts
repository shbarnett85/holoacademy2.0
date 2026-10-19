/* פלטה סמנטית לאנליטיקה החדשה — רק טוקני הערכה הקיימים (var(--tN)), כך שמצב בהיר/כהה עובד אוטומטית.
   אותו צבע לעולם לא מסמן יותר ממשמעות אחת; הטון תמיד מלווה גם בטקסט/סמל (לא צבע בלבד). */
export const C = {
  text: 'var(--t68)',
  textSoft: 'var(--t12)',
  muted: 'var(--t6)',
  faint: 'var(--t22)',
  accent: 'var(--t15)',
  accentBright: 'var(--t1)',
  good: 'var(--t3)',
  warn: 'var(--t4)',
  bad: 'var(--t5)',
  violet: 'var(--t54)',
  grid: 'var(--t62)',
  axis: 'var(--t63)',
  surface: 'var(--t25)',
  surfaceSoft: 'var(--t70)',
  border: 'var(--t26)',
  pointFill: 'var(--t61)',
} as const

export type Tone = 'positive' | 'attention' | 'neutral'
export const TONE: Record<Tone, { color: string; icon: string; label: string }> = {
  positive: { color: C.good, icon: '▲', label: 'חיובי' },
  attention: { color: C.warn, icon: '●', label: 'לתשומת לב' },
  neutral: { color: C.muted, icon: '○', label: 'ללא שיפוט' },
}

/* צבעים לסדרות (עם סגנון קו נוסף, כדי לא להסתמך על צבע בלבד) */
export const SERIES = [
  { color: C.accent, dash: '' },
  { color: C.violet, dash: '7 4' },
  { color: C.good, dash: '2 4' },
  { color: C.warn, dash: '9 3 2 3' },
] as const
