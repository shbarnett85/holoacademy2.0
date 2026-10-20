/* ──────────────────────────────────────────────────────────────────────────
   adminPrivacy — כללי הפרטיות של תמונת המנהל (aggregate-only). טהור: מספרים וקטגוריות, בלי טקסט בעברית.
   המנהל לעולם לא רואה ברמת תלמיד, והתאים חייבים להיות כאלה שלא ניתן לשחזר מהם תלמיד, כיתה או מורה:
   1. ספירה לפי **תורמים** (מי שיש לו נתון בתא), לא לפי רשומים — אחרת ממוצע של תלמיד בודד היה מתפרסם בתא של "30 רשומים".
   2. לכל מספר מתפרסם ה-N שלו: ממוצע, מגמה ונקודת סדרה — כל אחד מהם צריך ≥ MIN_CELL_SIZE תורמים משלו.
   3. תא שכל תורמיו מכיתה אחת = כיתה מזוהה (ומורה מזוהה, חוק 9) → מוסתר (MIN_CELL_CLASSES).
   4. סכומים: כשיש שכבה קטנה מהסף שאינה מוצגת, סך התלמידים/הכיתות אינו מתפרסם — חיסור היה חושף אותה.
   5. אחוז של "מי שמציג תפיסה" מתפרסם כמספר רק כשגם המציגים וגם הלא-מציגים לפחות MIN_CELL_SIZE.
   אין כאן פרמטרים שהמנהל שולט בהם (חלון/סינון): כל צירוף כזה היה תא חדש וניתן לחיסור בין שתי בקשות.
   ────────────────────────────────────────────────────────────────────────── */
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

/* מגמה (ממוצע הפרשים) שמותר לפרסם: רק מ-≥ MIN_CELL_SIZE הפרשים. כך גם "שינוי אישי" של תלמיד בודד אינו מתפרסם */
export function publishableTrend(diffs: readonly (number | null | undefined)[]): { delta: number; n: number } | null {
  const xs = diffs.filter(finite)
  return xs.length >= MIN_CELL_SIZE ? { delta: mean(xs), n: xs.length } : null
}

/* ── החלטת תא: contributorClassIds = כיתה אחת לכל תורם ── */
export type CellVerdict = { show: true; contributors: number; classes: number } | { show: false; reason: 'small_cell' | 'single_class' }
export function cellVerdict(contributorClassIds: readonly string[]): CellVerdict {
  const contributors = contributorClassIds.length
  if (contributors < MIN_CELL_SIZE) return { show: false, reason: 'small_cell' }
  const classes = new Set(contributorClassIds).size
  if (classes < MIN_CELL_CLASSES) return { show: false, reason: 'single_class' }
  return { show: true, contributors, classes }
}

/* ── סדרה חודשית שמותר לפרסם: חודש מתפרסם רק אם תרמו לו ≥ MIN_CELL_SIZE תלמידים מ-≥ MIN_CELL_CLASSES כיתות ──
   כל פריט = תלמיד אחד עם כיתתו וסדרת הרמות החודשית שלו (נקודה לחודש). הממוצע החודשי הוא ממוצע על התלמידים. */
export interface MonthlyInput { classId: string; levelSeries: readonly { date: string; level: number }[] }
export function publishableMonthlySeries(items: readonly MonthlyInput[]): { date: string; level: number; n: number }[] {
  const byMonth = new Map<string, { date: string; levels: number[]; classIds: Set<string> }>()
  for (const it of items) for (const p of it.levelSeries) {
    const key = p.date.slice(0, 7)
    const slot = byMonth.get(key) ?? { date: p.date, levels: [], classIds: new Set<string>() }
    slot.levels.push(p.level)
    slot.classIds.add(it.classId)
    byMonth.set(key, slot)
  }
  return [...byMonth.entries()].sort(([x], [y]) => x.localeCompare(y))
    .filter(([, s]) => s.levels.length >= MIN_CELL_SIZE && s.classIds.size >= MIN_CELL_CLASSES)
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
