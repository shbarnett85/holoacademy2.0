/* עזרים טהורים של מסך התוצאות (סינון הרשימה, סידור שמות, ניסוח מספרים בעברית פשוטה). בלי DOM ובלי רשת — נבדקים ב-logic.test.ts. */
import type { ObjectivesSummaryInput } from '../../shared/lib/findingsNarrative'
import { weekGroupOf, type WeekGroup } from '../../shared/lib/lessonState'
import type { ClassSubmissionView, ObjectiveResult, StudentChip, SubmissionRow } from '../../shared/types/resultsV1'

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

/* ── קיבוץ הרשימה לשבועות (שבוע ישראלי: ראשון עד שבת) ──
   פעיל עכשיו עומד לבד בראש הרשימה; השאר: השבוע · שבוע שעבר · מוקדם יותר, החדש ראשון בכל קבוצה. קבוצה ריקה לא מופיעה. */
export type ListGroupKey = 'active' | WeekGroup
export interface ListGroup { key: ListGroupKey; rows: SubmissionRow[] }
export function groupByWeek(rows: SubmissionRow[], nowMs: number): ListGroup[] {
  const sorted = newestFirst(rows)
  const active = sorted.filter((r) => r.state === 'active_now')
  const rest = sorted.filter((r) => r.state !== 'active_now')
  const groups: ListGroup[] = [{ key: 'active', rows: active }]
  for (const key of ['this', 'last', 'earlier'] as const) groups.push({ key, rows: rest.filter((r) => weekGroupOf(r.sentAt, nowMs) === key) })
  return groups.filter((g) => g.rows.length > 0)
}

/* מסנן שאינו ברשימת האפשרויות של השרת (כתובת ישנה / עדשה אחרת) נחשב "הכול" — כדי שלא יוצג מסך ריק בלי כפתור שמסביר למה */
export function validOption(value: string | null, options: readonly string[]): string | null {
  return value !== null && options.includes(value) ? value : null
}

/* ── תלמידים ── */
const he = new Intl.Collator('he')
export const byName = (a: { name: string }, b: { name: string }): number => he.compare(a.name, b.name)

/* שלוש קבוצות הסטטוס בחלונית "כל הכיתה" — קודם מי שדורש מעקב (עוד לא התחילו, אחר כך באמצע), ובסוף מי שסיים.
   כך "מי עוד לא סיים?" נראה בלי לגלול, גם בכיתה של 25 תלמידים שרובם כבר סיימו. אותו סדר בשורת המצב בראש המסך. */
export const ROSTER_GROUP_ORDER = ['notStarted', 'inProgress', 'completed'] as const

/* בתוך קבוצה: "לתשומת לב" קודם, ואז לפי א-ב */
export const byAttentionThenName = (a: StudentChip, b: StudentChip): number => (Number(b.attention) - Number(a.attention)) || byName(a, b)

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

/* המקום של התלמיד/ה ברשימה לפי א-ב (0 = הראשון/ה), או -1 */
export function studentIndex(roster: StudentChip[], id: string): number {
  return [...roster].sort(byName).findIndex((s) => s.id === id)
}

export function attentionTotal(roster: ClassSubmissionView['roster']): number {
  return allStudents(roster).filter((s) => s.attention).length
}

/* ── יעדי למידה ── */
/* כמה יעדים בכל רמה — קלט למשפט הסיכום של הטאב (total = כל היעדים, גם אלה שעוד אין להם נתונים) */
export function objectiveLevelCounts(objectives: ObjectiveResult[]): ObjectivesSummaryInput {
  const count = (level: ObjectiveResult['level']): number => objectives.filter((o) => o.level === level).length
  return { total: objectives.length, strong: count('strong'), partial: count('partial'), weak: count('weak') }
}

/* מתקשים להצגה: עד `limit` ראשונים לפי א-ב, ואחרי לחיצה — כולם. `hidden` = כמה מוסתרים כרגע.
   לא מסתירים תלמיד/ה בודד/ת מאחורי כפתור "עוד תלמיד/ה אחד/ת" — הכפתור עצמו תופס את המקום שלו. */
export function visibleStudents<T>(students: T[], expanded: boolean, limit: number): { shown: T[]; hidden: number } {
  if (expanded || students.length <= limit + 1) return { shown: students, hidden: 0 }
  return { shown: students.slice(0, limit), hidden: students.length - limit }
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

/* ── טאבים: סט קבוע לכל שליחה (טאב בלי נתונים נשאר במקומו ומסביר למה ריק — טאבים לא מופיעים ונעלמים) ── */
export const CLASS_TAB_IDS = ['glance', 'challenges', 'objectives', 'actions'] as const
export const STUDENT_TAB_IDS = ['challenges', 'slides'] as const

/* ?tab= שאינו אחד מטאבי המסך (או חסר) → הטאב הראשון של המסך: "במבט אחד" בכיתה, "האתגרים" אצל תלמיד/ה */
export function resolveTab(tab: string | null, ids: readonly string[]): string {
  return tab !== null && ids.includes(tab) ? tab : ids[0]
}
