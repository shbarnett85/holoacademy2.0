/* גישה לטוקני העיצוב מתוך TypeScript. הערכים עצמם נמצאים רק ב-`tokens.css`.
   · `tk('color-ink')`            → 'var(--color-ink)' לשימוש ב-style.
   · `alpha('color-ink', 12)`     → הטוקן בשקיפות (color-mix), בלי rgba קשיח.
   · `mix('color-correct', 20)`   → הטוקן מעורבב עם המשטח הלבן (גוון אטום).
   · `tokenValue('--color-holo')` → הערך המחושב בפועל, לקוד שמצייר ב-canvas / WebGL.
   · `tokenRgb('--color-holo')`   → [r, g, b] בטווח 0 עד 255. */
export type ColorToken =
  | 'color-machine-bg' | 'color-machine' | 'color-machine-deep' | 'color-machine-tint' | 'color-crystal-empty'
  | 'color-holo' | 'color-holo-deep' | 'color-action' | 'color-action-pressed'
  | 'color-human' | 'color-human-soft' | 'color-human-tint' | 'color-human-deep'
  | 'color-ink' | 'color-surface' | 'color-muted' | 'color-correct' | 'color-wrong'
  | 'color-crystal-cyan-top' | 'color-crystal-cyan-mid' | 'color-crystal-cyan-bottom'
  | 'color-crystal-pulse' | 'color-crystal-full-top' | 'color-crystal-full-mid' | 'color-crystal-full-bottom'
  | 'color-line' | 'color-line-strong' | 'color-ink-wash' | 'color-scrim' | 'color-correct-tint' | 'color-wrong-tint' | 'color-correct-text' | 'color-wrong-text' | 'color-disabled'

export const tk = (name: ColorToken | `subject-${string}`): string => `var(--${name})`

/* הטוקן בשקיפות: pct = אחוז האטימות (0 עד 100) */
export const alpha = (name: ColorToken | `subject-${string}`, pct: number): string =>
  `color-mix(in srgb, var(--${name}) ${pct}%, transparent)`

/* הטוקן מעורבב עם צבע אחר (ברירת מחדל: המשטח הלבן). pct = חלקו של הטוקן */
export const mix = (name: ColorToken | `subject-${string}`, pct: number, withToken: ColorToken = 'color-surface'): string =>
  `color-mix(in srgb, var(--${name}) ${pct}%, var(--${withToken}))`

/* קו וצל: מחרוזות מוכנות ל-style */
export const LINE = {
  student: 'var(--border-student)',
  staff: 'var(--border-staff)',
  soft: '1px solid var(--color-line)',
} as const
export const SHADOW = {
  student: 'var(--shadow-student)',
  button: 'var(--shadow-button)',
  staff: 'var(--shadow-staff)',
} as const
export const RADIUS_PX = { student: 18, button: 12, staff: 12 } as const

/* הערך המחושב של טוקן (למשל '#3AB0F2'). מחוץ לדפדפן מחזיר מחרוזת ריקה */
export function tokenValue(cssVar: `--${string}`): string {
  if (typeof document === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim()
}

/* '#RRGGBB' / '#RGB' → [r, g, b]. ערך לא מזוהה → דיו כהה (לא שחור טהור) */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.trim().replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  if (!/^[0-9a-f]{6}$/i.test(full)) return [30, 24, 48]
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number]
}
export function tokenRgb(cssVar: `--${string}`): [number, number, number] {
  return hexToRgb(tokenValue(cssVar))
}
/* 'rgba(r,g,b,a)' מטוקן, לציור ב-canvas */
export function tokenRgba(cssVar: `--${string}`, a: number): string {
  const [r, g, b] = tokenRgb(cssVar)
  return `rgba(${r},${g},${b},${a})`
}
