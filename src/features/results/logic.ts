/* עזרים טהורים של מסך התוצאות (סינון הרשימה, סידור שמות, ניסוח מספרים בעברית פשוטה). בלי DOM ובלי רשת — נבדקים ב-logic.test.ts. */
import type { ClassSubmissionView, StudentChip, SubmissionRow } from '../../shared/types/resultsV1'

/* ── רשימת השליחות ── */
export interface ListFilter {
  /** מזהה כיתה, או null = כל הכיתות */
  classId: string | null
  /** קוד מקצוע, או null = כל המקצועות */
  subject: string | null
  /** חיפוש חופשי בשם ההדמיה */
  query: string
}

/* החדשה ביותר ראשונה. יציב: שליחות באותו תאריך נשארות בסדר המקורי. */
export function newestFirst(rows: SubmissionRow[]): SubmissionRow[] {
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (Date.parse(b.r.sentAt) - Date.parse(a.r.sentAt)) || a.i - b.i)
    .map((x) => x.r)
}

const norm = (s: string): string => s.normalize('NFC').trim().toLowerCase()

export function filterSubmissions(rows: SubmissionRow[], f: ListFilter): SubmissionRow[] {
  const q = norm(f.query)
  return newestFirst(rows).filter((r) => {
    if (f.classId && r.classId !== f.classId) return false
    if (f.subject && r.subject?.code !== f.subject) return false
    if (q && !norm(r.title).includes(q)) return false
    return true
  })
}

/* מסנן שאינו ברשימת האפשרויות של השרת (כתובת ישנה / עדשה אחרת) נחשב "הכול" — כדי שלא יוצג מסך ריק בלי כפתור שמסביר למה */
export function validOption(value: string | null, options: readonly string[]): string | null {
  return value !== null && options.includes(value) ? value : null
}

/* ── תלמידים ── */
const he = new Intl.Collator('he')
export const byName = (a: { name: string }, b: { name: string }): number => he.compare(a.name, b.name)

export function allStudents(roster: ClassSubmissionView['roster']): StudentChip[] {
  return [...roster.completed, ...roster.inProgress, ...roster.notStarted]
}

/* לפי א-ב */
export function sortedStudents(roster: ClassSubmissionView['roster']): StudentChip[] {
  return allStudents(roster).sort(byName)
}

/* התלמיד/ה הראשון/ה לפי א-ב — אליו עוברים כשלוחצים "לפי תלמיד" */
export function firstStudentId(roster: ClassSubmissionView['roster']): string | null {
  return sortedStudents(roster)[0]?.id ?? null
}

export function attentionTotal(roster: ClassSubmissionView['roster']): number {
  return allStudents(roster).filter((s) => s.attention).length
}

/* ── ניסוח מספרים ── */
export function studentsWord(n: number): string {
  if (n === 0) return 'אף תלמיד/ה'
  if (n === 1) return 'תלמיד/ה אחד/ת'
  return `${n} תלמידים`
}

export function topicsWord(n: number): string {
  return n === 1 ? 'תחום אחד' : `${n} תחומים`
}

/* "בתחום אחד" · "ב-3 תחומים" — לשימוש אחרי "התקשתה" */
export function inTopics(n: number): string {
  return n === 1 ? 'בתחום אחד' : `ב-${n} תחומים`
}

/* "12 שניות" · "שנייה אחת" · "דקה ו-5 שניות" · "3 דקות" */
export function formatSeconds(total: number | null): string {
  if (total === null) return 'אין נתון'
  const s = Math.max(0, Math.round(total))
  const m = Math.floor(s / 60)
  const r = s % 60
  if (m === 0) return r === 1 ? 'שנייה אחת' : `${r} שניות`
  const mins = m === 1 ? 'דקה' : `${m} דקות`
  if (r === 0) return mins
  return `${mins} ${r === 1 ? 'ושנייה אחת' : `ו-${r} שניות`}`
}

export function attemptsWord(n: number): string {
  return n === 1 ? 'ניסיון אחד' : `${n} ניסיונות`
}
