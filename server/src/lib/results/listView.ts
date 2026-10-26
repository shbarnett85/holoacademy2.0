/* ──────────────────────────────────────────────────────────────────────────
   results/listView — בחירת השיעורים שמוצגים ברשימת "סיכום שיעור" + הפס השבועי של המחנך/ת. pure — שני הספקים (אמיתי / הדגמה) קוראים לאותן פונקציות.
   · view: 'mine' = השיעורים שלי (ששלחתי, או במקצוע שאני מלמד/ת); 'class' = כל השיעורים בכיתת-החינוך שלי (רק למחנך/ת).
   · מציגים את LESSON_LIST.recentDays הימים האחרונים; הישנים יותר רק עם older=true (הכפתור "הצגת שיעורים ישנים יותר"), ו-olderCount אומר כמה ימתינו.
   · הקיבוץ לשבועות ("השבוע" / "שבוע שעבר" / "מוקדם יותר") נעשה בקליינט עם weekGroupOf (אותה פונקציה משותפת).
   · הפס השבועי: כמה שיעורים נשלחו השבוע לכיתת-החינוך, בכמה מקצועות, ומי סומן/ה לתשומת לב ביותר ממקצוע אחד השבוע.
   ────────────────────────────────────────────────────────────────────────── */
import type { ResultsSubject, SubmissionList, SubmissionRow } from '../../../../src/shared/types/resultsV1.js'
import { LESSON_LIST } from '../../../../src/shared/lib/analyticsConfig.js'
import { weekStripFlaggedLine, weekStripSentence } from '../../../../src/shared/lib/findingsNarrative.js'
import { israelWeekStart } from '../../../../src/shared/lib/lessonState.js'
import { SUBJECTS } from '../../../../src/shared/lib/subjects.js'

const DAY_MS = 86_400_000

export interface ResultsListQuery {
  classId?: string
  subject?: string
  q?: string
  /* 'mine' (ברירת מחדל) | 'class' — נענה רק למחנך/ת */
  view?: 'mine' | 'class'
  /* true = גם שיעורים ישנים מ-LESSON_LIST.recentDays */
  older?: boolean
}

/* מה שהבחירה צריכה לדעת על שיעור, בלי לבנות שורה (הבנייה כבדה — טוענת תוצאות) */
export interface LessonDesc {
  id: string
  classId: string
  className: string
  title: string
  subject: ResultsSubject | null
  sentAtMs: number
  /* האם זה "שלי": ששלחתי, או במקצוע שאני מלמד/ת בכיתה הזאת */
  inMine: boolean
}

export interface SelectOpts {
  query: ResultsListQuery
  nowMs: number
  /* הכיתות שהצופה מחנך/ת בהן; ריק = אין בורר */
  homeroomClassIds: ReadonlySet<string>
  limit: number
  olderLimit: number
}

export interface Selection<T> {
  view: 'mine' | 'class'
  canToggleView: boolean
  /* מה שמוצג (אחרי סינון, חיתוך תקרה וחלון הזמן) */
  shown: T[]
  /* שיעורי השבוע בכיתות-החינוך (לפס השבועי) — רק במצב 'class'; לא מושפע מסינון הכיתה/מקצוע/חיפוש */
  weekPool: T[]
  olderCount: number
  /* יש יותר שיעורים מכפי שהוצגו (חיתוך התקרה) */
  overLimit: boolean
  /* אפשרויות הסינון — מהמאגר של המצב הנוכחי, לפני הסינון עצמו */
  classOptions: { id: string; name: string }[]
  subjectOptions: ResultsSubject[]
}

const subjectOrder = (code: string): number => SUBJECTS.findIndex((s) => s.code === code)
const idCmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

export function selectLessons<T>(all: T[], describe: (item: T) => LessonDesc, o: SelectOpts): Selection<T> {
  const canToggleView = o.homeroomClassIds.size > 0
  const view: 'mine' | 'class' = canToggleView && o.query.view === 'class' ? 'class' : 'mine'
  const pool = all.filter((it) => {
    const d = describe(it)
    return view === 'class' ? o.homeroomClassIds.has(d.classId) : d.inMine
  })

  const classOpts = new Map<string, string>()
  const subjOpts = new Map<string, ResultsSubject>()
  for (const it of pool) {
    const d = describe(it)
    classOpts.set(d.classId, d.className)
    if (d.subject) subjOpts.set(d.subject.code, d.subject)
  }

  const needle = (o.query.q ?? '').trim().toLowerCase()
  const newest = (a: T, b: T): number => { const da = describe(a); const db = describe(b); return (db.sentAtMs - da.sentAtMs) || idCmp(da.id, db.id) }
  const matching = pool
    .filter((it) => { const d = describe(it); return !o.query.classId || d.classId === o.query.classId })
    .filter((it) => !o.query.subject || describe(it).subject?.code === o.query.subject)
    .filter((it) => {
      if (!needle) return true
      const d = describe(it)
      return [d.title, d.className, d.subject?.nameHe ?? ''].some((s) => s.toLowerCase().includes(needle))
    })
    .sort(newest)

  const cutoff = o.nowMs - LESSON_LIST.recentDays * DAY_MS
  const recent = matching.filter((it) => describe(it).sentAtMs >= cutoff)
  const olderCount = matching.length - recent.length
  const visible = o.query.older ? matching : recent
  const cap = o.query.older ? o.olderLimit : o.limit
  const shown = visible.slice(0, cap)

  const weekStart = israelWeekStart(o.nowMs).getTime()
  const weekPool = view === 'class' ? pool.filter((it) => describe(it).sentAtMs >= weekStart).sort(newest).slice(0, o.limit) : []

  return {
    view, canToggleView, shown, weekPool, olderCount, overLimit: visible.length > cap,
    classOptions: [...classOpts.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'he')),
    subjectOptions: [...subjOpts.values()].sort((a, b) => subjectOrder(a.code) - subjectOrder(b.code)),
  }
}

/* פעיל עכשיו קודם; השאר בסדר שהתקבל (חדש → ישן). מיון יציב */
export function activeFirst<T extends { row: SubmissionRow }>(items: T[]): T[] {
  return [...items.filter((x) => x.row.state === 'active_now'), ...items.filter((x) => x.row.state !== 'active_now')]
}

export interface RowWithPeople { row: SubmissionRow; attention: { id: string; name: string }[] }

/* הפס השבועי: lessons = כמה שיעורים השבוע, subjects = בכמה מקצועות (לא כולל "לא סווג"), flagged = מי סומן/ה בשיעורים של יותר ממקצוע אחד */
export function buildWeekStrip(week: RowWithPeople[]): NonNullable<SubmissionList['weekStrip']> {
  const subjectCodes = new Set<string>()
  const flaggedBy = new Map<string, { name: string; subjects: Map<string, string> }>()
  for (const { row, attention } of week) {
    if (!row.subject) continue
    subjectCodes.add(row.subject.code)
    for (const p of attention) {
      const cur = flaggedBy.get(p.id) ?? { name: p.name, subjects: new Map<string, string>() }
      cur.subjects.set(row.subject.code, row.subject.nameHe)
      flaggedBy.set(p.id, cur)
    }
  }
  const flagged = [...flaggedBy.entries()]
    .filter(([, v]) => v.subjects.size > 1)
    .map(([id, v]) => ({ id, name: v.name, subjects: [...v.subjects.entries()].sort((a, b) => subjectOrder(a[0]) - subjectOrder(b[0])).map(([, n]) => n) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'he') || idCmp(a.id, b.id))
  return {
    lessons: week.length,
    subjects: subjectCodes.size,
    sentence: weekStripSentence(week.length, subjectCodes.size),
    flagged,
    flaggedLine: weekStripFlaggedLine(flagged),
  }
}

/* אפשרויות הסינון בחוזה. המקצוע מוצג בממשק רק אם יש יותר מאחד — הכרעה של הקליינט על subjects.length */
export function filtersOf<T>(sel: Selection<T>): SubmissionList['filters'] {
  return { classes: sel.classOptions, subjects: sel.subjectOptions }
}
