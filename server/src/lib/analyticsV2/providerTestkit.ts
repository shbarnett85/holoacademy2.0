/* ──────────────────────────────────────────────────────────────────────────
   providerTestkit — עזרים לבדיקות הספק המשותף והנתיבים: עולם מינימלי עם כיתות ותלמידים מוגדרים ידנית, מקור "חי" מזויף
   (ניתוח קבוע, בלי DB) וצופים עם grants פר-כיתה. לא חלק מהקוד שרץ בשרת.
   ────────────────────────────────────────────────────────────────────────── */
import { DEMO_WORLD } from '../../../../src/shared/lib/analyticsConfig.js'
import type { SubjectCode } from '../../../../src/shared/lib/subjects.js'
import { deriveLens, type V2ClassGrant, type V2Viewer } from './access.js'
import type { SessionRec, StudentSubjectData, World } from './demoWorld.js'
import { skey } from './demoWorld.js'
import { analyze, type Analysis } from './engine.js'
import { buildSchoolDays } from './schoolCalendar.js'
import type { AnalyticsSource } from './source.js'

export const NOW = new Date('2026-10-19T09:00:00Z')
export const DAYS = buildSchoolDays(NOW, DEMO_WORLD.schoolDays)
const TERM = { kind: 'half_a', startIso: '2026-09-01T12:00:00.000Z', idx: 100 } as const

export const mkSession = (day: number, success: number, level: number): SessionRec => ({
  day, date: DAYS[day], success, level, concepts: {}, scenes: 6, words: 200, closedMs: 60000, retries: { afterFail: 1, giveUps: 1 },
})
/* count משחקים מפוזרים בשווה על `over` ימי הלימוד האחרונים */
export const spread = (count: number, f: (day: number) => [number, number], over = 200): SessionRec[] =>
  Array.from({ length: count }, (_, i) => { const day = Math.floor((i / count) * over); const [s, l] = f(day); return mkSession(day, s, l) })
/* תקרה (הצלחה 100%) / יורד אמיתי (ממצא "בירידה" מדווח) / יציב נמוך */
export const ceiling = (): SessionRec[] => spread(70, () => [1, 9])
export const decliner = (): SessionRec[] => spread(70, (day) => [day < 60 ? 0.35 : 0.85, 9])
export const steadyLow = (): SessionRec[] => spread(40, () => [0.7, 6])

export interface Cls { id: string; name: string; grade: number; gradeLabel: string; subjects?: SubjectCode[] }
export interface Stu { id: string; classId: string; subjects?: SubjectCode[]; sessions?: (s: SubjectCode) => SessionRec[]; noData?: boolean }

export function world(classes: Cls[], students: Stu[]): World {
  const data = new Map<string, StudentSubjectData>()
  const ws = students.map((s) => {
    const subjects = s.subjects ?? ['math', 'history']
    if (!s.noData) for (const sub of subjects) data.set(skey(s.id, sub), { sessions: (s.sessions ?? ceiling)(sub), mc: [], memory: [] })
    const grade = classes.find((c) => c.id === s.classId)!.grade
    return { id: s.id, firstName: `שם-${s.id}`, displayName: `שם-${s.id} משפחה`, gender: 'male' as const, classId: s.classId, grade, subjects, cast: null }
  })
  return {
    now: NOW, days: DAYS, term: TERM, school: { id: 'sch-1', name: 'בית ספר לבדיקה' },
    classes: classes.map((c) => ({ ...c, studentIds: students.filter((s) => s.classId === c.id).map((s) => s.id) })),
    students: ws, data,
  }
}
export const ids = (prefix: string, n: number): string[] => Array.from({ length: n }, (_, i) => `${prefix}-${i}`)

export const CA: Cls = { id: 'cls-A', name: 'כיתה ה׳1', grade: 5, gradeLabel: 'ה׳' }
export const CB: Cls = { id: 'cls-B', name: 'כיתה ה׳2', grade: 5, gradeLabel: 'ה׳' }
export const CC: Cls = { id: 'cls-C', name: 'כיתה ו׳1', grade: 6, gradeLabel: 'ו׳' }
export const CD: Cls = { id: 'cls-D', name: 'כיתה ה׳3', grade: 5, gradeLabel: 'ה׳' }

/* בית ספר רגיל: A — 9 תלמידים עם נתונים (אחד יורד במתמטיקה) + 1 בלי נתונים בכלל; B — 8 תלמידים (רמה נמוכה יציבה);
   C — 3 תלמידים (שכבה קטנה מהסף); D — כיתה ריקה */
export function standardWorld(): World {
  const a: Stu[] = ids('stu-A', 9).map((id, i) => ({ id, classId: CA.id, sessions: i === 0 ? (s: SubjectCode) => (s === 'math' ? decliner() : ceiling()) : ceiling }))
  a.push({ id: 'stu-A-nodata', classId: CA.id, noData: true })
  const b: Stu[] = ids('stu-B', 8).map((id) => ({ id, classId: CB.id, sessions: steadyLow }))
  const c: Stu[] = ids('stu-C', 3).map((id) => ({ id, classId: CC.id, subjects: ['math'], sessions: steadyLow }))
  return world([CA, CB, CC, CD], [...a, ...b, ...c])
}
let standard: Analysis | null = null
export const standardAnalysis = (): Analysis => (standard ??= analyze(standardWorld()))

/* מקור חי מזויף: מחזיר ניתוח קבוע. classIds של המקור "טועה" וחושף את כל הכיתות לכולם — הליבה חייבת לחתוך מול ההרשאות */
export function fakeSource(a: Analysis, over: Partial<AnalyticsSource> = {}): AnalyticsSource & { analysisCalls: number } {
  const src: AnalyticsSource & { analysisCalls: number } = {
    kind: 'live', analysisCalls: 0,
    async analysis() { src.analysisCalls++; return a },
    classIds: (_v, an) => [...an.classById.keys()],
    classSubjects: (an, id) => { const c = an.classById.get(id); return c ? c.subjects ?? [...new Set(c.studentIds.flatMap((sid) => an.studentById.get(sid)?.subjects ?? []))] : [] },
    configParts: (v) => ({ availableLenses: [v.lens], subjects: [], dataNotice: null, curriculumNotice: null }),
    coverage: () => ({ unclassifiedSessions: 0, detailAvailableFrom: null }),
    ...over,
  }
  return src
}

export const grant = (classId: string, over: Partial<V2ClassGrant> = {}): V2ClassGrant => ({ classId, homeroom: false, subjects: [], unspecified: false, ...over })
export const live = (grants: V2ClassGrant[]): V2Viewer => ({
  lens: deriveLens('teacher', grants), guest: false, homeroomClassId: null, teachingClassIds: [], subjectCodes: [], source: 'live', schoolId: 'sch-1', classGrants: grants,
})
export const adminViewer: V2Viewer = { lens: 'admin', guest: false, homeroomClassId: null, teachingClassIds: [], subjectCodes: [], source: 'live', schoolId: 'sch-1' }
