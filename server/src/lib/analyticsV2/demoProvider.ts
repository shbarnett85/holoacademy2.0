/* ──────────────────────────────────────────────────────────────────────────
   demoProvider — ספק ההדגמה של האנליטיקה החדשה: מקור הנתונים הוא עולם הדמו (demoWorld+engine) בזיכרון, אפס שורות DB.
   כל הלוגיקה (הרשאות, ניסוח, אגרגציה, פרטיות מנהל) ב-providerCore.createProvider — משותפת עם הספק החי.
   כאן רק המקור: ניתוח העולם ליום הנוכחי, הכיתות שבהיקף הצופה, ופרטי התצורה (עדשות אורח, "נתוני הדגמה", "מיפוי לדוגמה").
   ────────────────────────────────────────────────────────────────────────── */
import { NOTICE_CURRICULUM_SAMPLE, NOTICE_DEMO_DATA } from '../../../../src/shared/lib/findingsNarrative.js'
import type { SubjectCode } from '../../../../src/shared/lib/subjects.js'
import { DEMO_SUBJECT_PERSONAS, scopeClassIds, type V2Viewer } from './access.js'
import { getWorld } from './demoWorld.js'
import { analyze, type Analysis } from './engine.js'
import { createProvider } from './providerCore.js'
import type { AnalyticsSource } from './source.js'

/* ניתוח לפי יום (נתוני העולם זהים בכל יום; התאריכים זזים) */
const ANALYSIS_CACHE = new Map<string, Analysis>()
export function getAnalysis(now: Date = new Date()): Analysis {
  const key = now.toISOString().slice(0, 10)
  let a = ANALYSIS_CACHE.get(key)
  if (!a) { a = analyze(getWorld(now)); ANALYSIS_CACHE.clear(); ANALYSIS_CACHE.set(key, a) }
  return a
}

export function demoViewerClasses(subjects: SubjectCode[]): string[] {
  const a = getAnalysis()
  return a.world.classes.filter((c) => c.studentIds.some((sid) => subjects.some((s) => a.studentById.get(sid)!.subjects.includes(s)))).map((c) => c.id)
}

/* מקצועות הכיתה = כל מה שלומדים תלמידיה, לפי סדר הופעה */
function classSubjectsOf(a: Analysis, classId: string): SubjectCode[] {
  const cls = a.classById.get(classId)
  return cls ? [...new Set(cls.studentIds.flatMap((sid) => a.studentById.get(sid)?.subjects ?? []))] : []
}

export const demoSource: AnalyticsSource = {
  kind: 'demo',
  analysis: async (_v, now) => getAnalysis(now),
  /* מנהל: אין כיתות (scopeClassIds ריק לו). אחרים: כיתות ה-grants שקיימות בעולם */
  classIds: (v: V2Viewer, a) => scopeClassIds(v).filter((id) => a.classById.has(id)),
  classSubjects: classSubjectsOf,
  configParts: (v) => ({
    availableLenses: v.guest ? ['homeroom', 'subject_teacher', 'admin'] : [v.lens],
    subjects: v.guest ? DEMO_SUBJECT_PERSONAS : v.lens === 'subject_teacher' ? v.subjectCodes : [],
    dataNotice: NOTICE_DEMO_DATA,
    curriculumNotice: NOTICE_CURRICULUM_SAMPLE,
  }),
  coverage: () => ({ unclassifiedSessions: 0, detailAvailableFrom: null }),
}

export const demoProvider = createProvider(demoSource)
