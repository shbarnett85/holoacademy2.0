/* ──────────────────────────────────────────────────────────────────────────
   רוסטר ההדגמה של מורה אורח (GET /api/staff/students) — תלמידי העולם הווירטואלי של האנליטיקה (אותם מזהים כמו getAnalysis().world),
   כך שמעבר מהרוסטר אל /analytics/student/:id לא נכשל ב-404. אפס שורות DB, דטרמיניסטי (מבוסס על עולם ההדגמה).
   רק כיתת המחנך/ת של האורח (ו׳2): זו העדשה שנבחרת כברירת מחדל, ולכן כל תלמיד ברשימה פתוח לצפייה בה.
   קוד הכיתה וה-PIN קבועים וברורים כהדגמה (אותו קוד כיתה כמו ב-demoClasses).
   ────────────────────────────────────────────────────────────────────────── */
import { DEMO_CLASS, demoClasses } from '../demoAnalytics.js'
import { DEMO_HOMEROOM_CLASS } from './access.js'
import { getAnalysis } from './demoProvider.js'
import { skey } from './demoWorld.js'
import { compareHebrewNames } from './derive.js'

export interface DemoRosterRow {
  id: string
  name: string
  classId: string
  class: string
  classCode: string
  secret: string
  isActive: true
  lastActive: string | null
}

/* PIN דמו: 1111, 2222, … 9999 ושוב — לפי הסדר האלפביתי ברשימה */
const demoPin = (i: number): string => String(1111 * ((i % 9) + 1)).padStart(4, '0')

export function demoRosterV2(now: Date = new Date()): { students: DemoRosterRow[] } {
  const a = getAnalysis(now)
  const cls = a.classById.get(DEMO_HOMEROOM_CLASS)
  if (!cls) return { students: [] }
  const sorted = cls.studentIds.map((id) => a.studentById.get(id)).filter((s): s is NonNullable<typeof s> => !!s)
    .sort((x, y) => compareHebrewNames(x, y))
  const students = sorted.map((st, i): DemoRosterRow => {
    let last: string | null = null
    for (const subject of st.subjects) {
      for (const s of a.world.data.get(skey(st.id, subject))?.sessions ?? []) if (last === null || s.date > last) last = s.date
    }
    return {
      id: st.id, name: st.displayName, classId: cls.id, class: cls.gradeLabel, classCode: DEMO_CLASS.urlCode,
      secret: demoPin(i), isActive: true, lastActive: last,
    }
  })
  return { students }
}

/* רשימת הכיתות של האורח (GET /api/staff/classes) באותו עולם: אותה כיתה ואותו מספר תלמידים כמו ברוסטר, והאורח הוא המחנך/ת שלה —
   כך "סיכום הכיתה" בניהול הכיתה מוביל לאנליטיקה של אותה כיתה (viewerUserId = מזהה המשתמש של האורח) */
export function demoClassesV2(viewerUserId: string, now: Date = new Date()): ReturnType<typeof demoClasses> {
  const base = demoClasses().classes[0]
  const cls = getAnalysis(now).classById.get(DEMO_HOMEROOM_CLASS)
  if (!cls) return { classes: [] }
  return {
    classes: [{
      ...base, id: cls.id, name: cls.name, gradeLabel: cls.gradeLabel, studentCount: cls.studentIds.length,
      teachers: base.teachers.map((t) => ({ ...t, teacherId: viewerUserId, isHomeroom: true })),
    }],
  }
}
