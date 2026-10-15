/* ── שכבה (א׳–י״ב) כמספר 1–12 — מקור יחיד לקליינט ולשרת ─────────────────────────
   classes.grade_level = מספר השכבה (א׳=1 … י״ב=12), nullable. משמש לקידום שכבה ולהשוואה
   לנורמת גיל (שלב 5). לא להתבלבל עם סולם הרמות 1–20 (גן=4 … י״ג=17). */
import { gradeNumberFromLabel } from './difficultyCalibration'

export const GRADE_LAYER_NAMES = ['', 'א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ז׳', 'ח׳', 'ט׳', 'י׳', 'י״א', 'י״ב'] as const

export const GRADE_LEVEL_MIN = 1
export const GRADE_LEVEL_MAX = 12

export function isValidGradeLevel(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= GRADE_LEVEL_MIN && n <= GRADE_LEVEL_MAX
}

/* תווית ("ז׳3", "כיתה ח", "י״א2") → 1–12. גן / תואר / לא מזוהה → null. */
export function gradeLevelFromLabel(label?: string | null): number | null {
  const g = gradeNumberFromLabel(label ?? null)
  return g !== null && g >= GRADE_LEVEL_MIN && g <= GRADE_LEVEL_MAX ? g : null
}

/* מחליף את שם השכבה בתווית (שומר את מספר הכיתה): "ז׳3" + 8 → "ח׳3". תווית לא מזוהה → שם השכבה בלבד. */
export function labelWithLevel(oldLabel: string | null | undefined, level: number): string {
  const name = GRADE_LAYER_NAMES[level] ?? ''
  const digits = (oldLabel ?? '').match(/(\d+)\s*$/)?.[1] ?? ''
  return digits ? `${name}${digits}` : name
}

/* קידום שכבה: +1, תקרה י״ב. מחזיר null כשכבר י״ב (אין לאן לקדם) */
export function nextGradeLevel(level: number | null | undefined): number | null {
  if (!isValidGradeLevel(level)) return null
  return level >= GRADE_LEVEL_MAX ? null : level + 1
}
