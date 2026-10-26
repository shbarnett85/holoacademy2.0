/* שכבות הגיל של שיעור — לתגית "שכבות" בכרטיס השיעור (תלמיד, ספריית המורה, הספרייה הציבורית).
   · שיעור עם מטא שכבות (grade_min/grade_max — שיעורי הספרייה הרשמית): הטווח כמו שהוא.
   · אחרת: שכבת היעד שהמורה בחר ביצירה — `difficulty_settings.writingLevel` (סולם 1–20, א׳=5 … י״ב=16), כלומר שכבה = רמה − 4.
   · גן / תואר / ערך חסר → אין תגית (לא ממציאים שכבה).
   מספרי שכבה 1–12 (א׳=1 … י״ב=12) — כמו `classes.grade_level` (shared/lib/gradeLevels). */
import { GRADE_LAYER_NAMES } from './gradeLevels'

export interface LessonGradeRange { gradeMin: number; gradeMax: number }

const LEVEL_OF_FIRST_GRADE = 5 /* א׳ בסולם הרמות */

function validGrade(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 12
}

export function lessonGradeRange(row: { grade_min?: number | null; grade_max?: number | null; difficulty_settings?: unknown }): LessonGradeRange | null {
  const a = row.grade_min
  const b = row.grade_max
  if (validGrade(a) || validGrade(b)) {
    const lo = validGrade(a) ? a : (b as number)
    const hi = validGrade(b) ? b : (a as number)
    return { gradeMin: Math.min(lo, hi), gradeMax: Math.max(lo, hi) }
  }
  const level = (row.difficulty_settings as { writingLevel?: unknown } | null | undefined)?.writingLevel
  if (typeof level === 'number' && Number.isFinite(level)) {
    const g = Math.round(level) - LEVEL_OF_FIRST_GRADE + 1
    if (validGrade(g)) return { gradeMin: g, gradeMax: g }
  }
  return null
}

/* "שכבה ז׳" · "שכבות ה׳–ו׳"; אין טווח → null */
export function gradeLayersLabel(min: number | null | undefined, max: number | null | undefined): string | null {
  const lo = validGrade(min) ? min : validGrade(max) ? max : null
  if (lo === null) return null
  const hi = validGrade(max) ? max : lo
  const a = Math.min(lo, hi)
  const z = Math.max(lo, hi)
  return a === z ? `שכבה ${GRADE_LAYER_NAMES[a]}` : `שכבות ${GRADE_LAYER_NAMES[a]}–${GRADE_LAYER_NAMES[z]}`
}
