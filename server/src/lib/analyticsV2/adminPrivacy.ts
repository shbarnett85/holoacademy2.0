/* ──────────────────────────────────────────────────────────────────────────
   adminPrivacy — כללי הפרטיות של תמונת המנהל (aggregate-only). טהור: מספרים וקטגוריות, בלי טקסט בעברית.
   המנהל לעולם לא רואה ברמת תלמיד, והתאים חייבים להיות כאלה שלא ניתן לשחזר מהם תלמיד, כיתה או מורה:
   1. ספירה לפי **תורמים** (מי שיש לו נתון בתא), לא לפי רשומים — אחרת ממוצע של תלמיד בודד היה מתפרסם בתא של "30 רשומים".
   2. לכל מספר מתפרסם ה-N שלו: ממוצע, מגמה ונקודת סדרה — כל אחד מהם צריך ≥ MIN_CELL_SIZE תורמים משלו.
   3. תא שכל תורמיו מכיתה אחת = כיתה מזוהה (ומורה מזוהה, חוק 9) → מוסתר (MIN_CELL_CLASSES).
      וגם תא שבו כיתה אחת דומיננטית: אם אחרי הסרת הכיתה הגדולה ביותר נשארים פחות מ-ADMIN_CELL_MIN_OUTSIDE_LARGEST_CLASS תורמים, תורם בודד מכיתה שנייה
      "פותח" את התא והממוצע שמתפרסם הוא בפועל ממוצע הכיתה הדומיננטית (וכשהמנהל יודע את הנתון של התורם הבודד — חיסור מחזיר אותו במדויק). הכלל חל על
      תא, על נקודה בסדרה חודשית ועל מגמה: בכל מספר שמתפרסם, גם בלי הכיתה הגדולה ביותר נשארים לפחות MIN_CELL_SIZE תורמים — לכל כיתה אחרת a fortiori.
   4. סכומים: כשיש שכבה קטנה מהסף שאינה מוצגת, סך התלמידים/הכיתות אינו מתפרסם — חיסור היה חושף אותה.
   5. אחוז של "מי שמציג תפיסה" מתפרסם כמספר רק כשגם המציגים וגם הלא-מציגים לפחות MIN_CELL_SIZE.
   אין כאן פרמטרים שהמנהל שולט בהם (חלון/סינון): כל צירוף כזה היה תא חדש וניתן לחיסור בין שתי בקשות.
   ────────────────────────────────────────────────────────────────────────── */
import { ADMIN_CELL_MIN_OUTSIDE_LARGEST_CLASS } from '../../../../src/shared/lib/analyticsConfig.js'
import { MIN_CELL_SIZE } from '../authz.js'
import { mean } from './stats.js'

/* מספר הכיתות השונות המינימלי שמהן תורמים לתא */
export const MIN_CELL_CLASSES = 2

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

/* כמה תורמים יש באמת (ערכים סופיים) */
export const contributingN = (values: readonly (number | null | undefined)[]): number => values.filter(finite).length

/* ממוצע שמותר לפרסם: רק מ-≥ MIN_CELL_SIZE תורמים, אחרת null */
export function publishableMean(values: readonly (number | null | undefined)[]): number | null {
  const xs = values.filter(finite)
  return xs.length >= MIN_CELL_SIZE ? mean(xs) : null
}

/* כמה תורמים נשארים אחרי הסרת הכיתה שיש בה הכי הרבה תורמים (כיתה אחת לכל תורם). בשוויון אין חשיבות — הגדולה ביותר היא אחת מהן */
export function contributorsOutsideLargestClass(contributorClassIds: readonly string[]): number {
  const counts = new Map<string, number>()
  for (const id of contributorClassIds) counts.set(id, (counts.get(id) ?? 0) + 1)
  let largest = 0
  for (const n of counts.values()) if (n > largest) largest = n
  return contributorClassIds.length - largest
}

/* מגמה (ממוצע הפרשים) שמותר לפרסם: רק מ-≥ MIN_CELL_SIZE הפרשים, וגם בלי הכיתה הגדולה ביותר נשארים ≥ ADMIN_CELL_MIN_OUTSIDE_LARGEST_CLASS.
   כך "שינוי אישי" של תלמיד בודד לא מתפרסם, וגם לא מגמה שהיא בפועל מגמת כיתה אחת. כל פריט = תלמיד/ה אחד/ת עם כיתתו/ה והפרש המגמה שלו/ה */
export function publishableTrend(items: readonly { classId: string; delta: number | null | undefined }[]): { delta: number; n: number } | null {
  const xs = items.filter((x): x is { classId: string; delta: number } => finite(x.delta))
  if (xs.length < MIN_CELL_SIZE) return null
  if (contributorsOutsideLargestClass(xs.map((x) => x.classId)) < ADMIN_CELL_MIN_OUTSIDE_LARGEST_CLASS) return null
  return { delta: mean(xs.map((x) => x.delta)), n: xs.length }
}

/* ── החלטת תא: contributorClassIds = כיתה אחת לכל תורם ── */
export type CellVerdict = { show: true; contributors: number; classes: number } | { show: false; reason: 'small_cell' | 'single_class' | 'dominant_class' }
export function cellVerdict(contributorClassIds: readonly string[]): CellVerdict {
  const contributors = contributorClassIds.length
  if (contributors < MIN_CELL_SIZE) return { show: false, reason: 'small_cell' }
  const classes = new Set(contributorClassIds).size
  if (classes < MIN_CELL_CLASSES) return { show: false, reason: 'single_class' }
  if (contributorsOutsideLargestClass(contributorClassIds) < ADMIN_CELL_MIN_OUTSIDE_LARGEST_CLASS) return { show: false, reason: 'dominant_class' }
  return { show: true, contributors, classes }
}

/* ── סדרה חודשית שמותר לפרסם: חודש מתפרסם רק אם תרמו לו ≥ MIN_CELL_SIZE תלמידים מ-≥ MIN_CELL_CLASSES כיתות, ובלי הכיתה הגדולה ביותר נשארו ≥ ADMIN_CELL_MIN_OUTSIDE_LARGEST_CLASS ──
   כל פריט = תלמיד אחד עם כיתתו וסדרת הרמות החודשית שלו (נקודה לחודש). הממוצע החודשי הוא ממוצע על התלמידים. */
export interface MonthlyInput { classId: string; levelSeries: readonly { date: string; level: number }[] }
export function publishableMonthlySeries(items: readonly MonthlyInput[]): { date: string; level: number; n: number }[] {
  const byMonth = new Map<string, { date: string; levels: number[]; classIds: string[] }>()
  for (const it of items) for (const p of it.levelSeries) {
    const key = p.date.slice(0, 7)
    const slot = byMonth.get(key) ?? { date: p.date, levels: [], classIds: [] }
    slot.levels.push(p.level)
    slot.classIds.push(it.classId)
    byMonth.set(key, slot)
  }
  return [...byMonth.entries()].sort(([x], [y]) => x.localeCompare(y))
    .filter(([, s]) => cellVerdict(s.classIds).show)
    .map(([, s]) => ({ date: s.date, level: Math.round(mean(s.levels) * 10) / 10, n: s.levels.length }))
}

/* ── שכבות וסכומים ── */
/* שכבה מוצגת רק אם יש בה ≥ MIN_CELL_SIZE תלמידים */
export const gradeVisible = (studentCount: number): boolean => studentCount >= MIN_CELL_SIZE
/* סך (תלמידים / כיתות) מתפרסם רק אם כל השכבות מוצגות — אחרת סך פחות סכום השכבות המוצגות = גודל שכבה מוסתרת */
export const totalsPublishable = (gradeStudentCounts: readonly number[]): boolean => gradeStudentCounts.every(gradeVisible)

/* ── אחוז תפיסה שגויה: מספר רק כשגם המציגים וגם הלא-מציגים לפחות MIN_CELL_SIZE ── */
export type ShareDisplay = 'number' | 'few' | 'almost_all' | 'hidden'
export function shareDisplay(showing: number, exposed: number): ShareDisplay {
  if (exposed < MIN_CELL_SIZE) return 'hidden'
  const rest = exposed - showing
  if (showing < MIN_CELL_SIZE) return 'few'
  if (rest < MIN_CELL_SIZE) return 'almost_all'
  return 'number'
}
