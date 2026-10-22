/* מקצועות בסדר הקבוע של המערכת (shared/lib/subjects) — אותו סדר בכל מסך: כרטיס הכיתה, טאבים, טבלאות, כפתורי סינון, כפתורי המנהל.
   מקצוע שאינו ברשימה (קוד לא מוכר) נדחף לסוף. הפונקציה יציבה: מקצועות שווים נשארים בסדרם המקורי. */
import { SUBJECTS } from '../../shared/lib/subjects'

const SUBJECT_ORDER = new Map<string, number>(SUBJECTS.map((s, i) => [s.code, i]))
export const subjectRank = (code: string): number => SUBJECT_ORDER.get(code) ?? 99

export const bySubjectOrder = <T extends { code: string }>(xs: readonly T[]): T[] =>
  xs.map((x, i) => ({ x, i })).sort((a, b) => subjectRank(a.x.code) - subjectRank(b.x.code) || a.i - b.i).map((e) => e.x)

/* אותו דבר לפריטים שהקוד שלהם בשדה אחר (למשל { subject: { code } } או { subjectCode }) */
export const bySubjectOrderOf = <T,>(xs: readonly T[], codeOf: (x: T) => string): T[] =>
  xs.map((x, i) => ({ x, i })).sort((a, b) => subjectRank(codeOf(a.x)) - subjectRank(codeOf(b.x)) || a.i - b.i).map((e) => e.x)
