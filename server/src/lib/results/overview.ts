/* ──────────────────────────────────────────────────────────────────────────
   results/overview — מנהל/ת (ומנהל עירוני): טבלה אחת, שכבה × מקצוע, בטאב "סיכום שיעור". pure — שני הספקים (אמיתי / הדגמה) מזינים אותה.
   בכל תא: כמה שיעורים שונים נשלחו בתקופה, וכמה מהתלמידים בכיתות שקיבלו אותם התחילו לפחות אחד מהם.
   פרטיות (חוק 8/9): בלי פירוק לכיתה או למורה; אין שמות תלמידים; תא עם פחות מ-MIN_CELL_SIZE תלמידים, או עם פחות מ-MIN_CELL_CLASSES כיתות
   (כיתה אחת = תא שחושף כיתה), מוסתר — בלי מספרים בכלל. אין גישה לעמודי שיעור. */
import type { Overview, OverviewCell, ResultsSubject } from '../../../../src/shared/types/resultsV1.js'
import { MIN_CELL_SIZE } from '../../../../src/shared/lib/analyticsConfig.js'
import { MIN_CELL_CLASSES } from '../analyticsV2/adminPrivacy.js'
import { OVERVIEW_TEXT } from '../../../../src/shared/lib/findingsNarrative.js'
import { SUBJECTS } from '../../../../src/shared/lib/subjects.js'
import { subjectOfCode } from './core.js'

export interface OverviewSend {
  questId: string
  classId: string
  /* מספר השכבה (1..12) — null כשלא ידוע (נשמט) */
  grade: number | null
  subject: string | null
  /* תלמידי הכיתה (מזהים) */
  students: readonly string[]
}

export interface OverviewInput {
  periodLabel: string
  sends: readonly OverviewSend[]
  /* "questId|studentId" — מי התחיל את השיעור (session קיים) */
  started: ReadonlySet<string>
}

const GRADE_LABEL = ['', 'א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ז׳', 'ח׳', 'ט׳', 'י׳', 'י״א', 'י״ב']
export const gradeId = (g: number): string => `g${g}`
export const gradeLabelOf = (g: number): string => `שכבה ${GRADE_LABEL[g] ?? g}`

export function buildOverview(input: OverviewInput): Overview {
  interface Acc { quests: Set<string>; classes: Set<string>; students: Set<string>; participated: Set<string> }
  const acc = new Map<string, Acc>()
  const grades = new Set<number>()
  const subjects = new Set<string>()
  for (const s of input.sends) {
    if (s.grade === null || !s.subject || !subjectOfCode(s.subject)) continue
    grades.add(s.grade)
    subjects.add(s.subject)
    const key = `${s.grade}|${s.subject}`
    const a = acc.get(key) ?? { quests: new Set<string>(), classes: new Set<string>(), students: new Set<string>(), participated: new Set<string>() }
    a.quests.add(s.questId)
    a.classes.add(s.classId)
    for (const st of s.students) {
      a.students.add(st)
      if (input.started.has(`${s.questId}|${st}`)) a.participated.add(st)
    }
    acc.set(key, a)
  }
  const gradeList = [...grades].sort((a, b) => a - b)
  const subjectList: ResultsSubject[] = SUBJECTS.filter((s) => subjects.has(s.code)).map((s) => ({ code: s.code, nameHe: s.nameHe }))
  const cells: OverviewCell[] = []
  for (const g of gradeList) {
    for (const sub of subjectList) {
      const a = acc.get(`${g}|${sub.code}`)
      if (!a) { cells.push({ gradeId: gradeId(g), subject: sub.code, status: 'empty' }); continue }
      if (a.students.size < MIN_CELL_SIZE || a.classes.size < MIN_CELL_CLASSES) { cells.push({ gradeId: gradeId(g), subject: sub.code, status: 'hidden' }); continue }
      cells.push({ gradeId: gradeId(g), subject: sub.code, status: 'shown', lessons: a.quests.size, participated: a.participated.size, total: a.students.size })
    }
  }
  const shown = cells.filter((c) => c.status === 'shown')
  return {
    periodLabel: input.periodLabel,
    sentence: shown.length === 0 ? OVERVIEW_TEXT.empty : OVERVIEW_TEXT.sentence(new Set(shown.map((c) => c.subject)).size, new Set(shown.map((c) => c.gradeId)).size),
    grades: gradeList.map((g) => ({ id: gradeId(g), label: gradeLabelOf(g) })),
    subjects: subjectList,
    cells,
    hasHidden: cells.some((c) => c.status === 'hidden'),
    howWeCalculated: [...OVERVIEW_TEXT.howWe],
  }
}
