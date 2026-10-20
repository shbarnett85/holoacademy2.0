/* ──────────────────────────────────────────────────────────────────────────
   provider — הממשק היחיד שהמסכים והנתיבים מכירים. providerCore.createProvider(source) מממש אותו להדגמה ולחי;
   emptyProvider (alias: realProvider) הוא ספק ריק שעומד בחוזה ("אין עדיין מספיק נתונים" בכל מקום) — לבדיקות ולנסיגה.
   ────────────────────────────────────────────────────────────────────────── */
import {
  ANALYTICS_CAVEATS, FEEDBACK_INTRO_TEXT, NO_DATA_YET, groupTrendText, narrateAlertsTitle,
} from '../../../../src/shared/lib/findingsNarrative.js'
import type {
  AdminOverview, AnalyticsConfig, Briefing, ClassOverview, ClassSubjectView, Entry, Envelope, Roster, StudentFeedback, StudentOverview,
} from '../../../../src/shared/types/analyticsV2.js'
import { subjectName, type SubjectCode } from '../../../../src/shared/lib/subjects.js'
import type { V2Viewer } from './access.js'

/* רישום צפייה ברמת תלמיד: הספק מדווח אילו תלמידים נחשפו בשמם בתגובה, והנתיב כותב ליומן (data_access_log) לפני שהתגובה נשלחת.
   כך ספק אינו יכול "לשכוח", ואין סריקה שבירה של התגובה. בלי sink (בדיקות, ספק ההדגמה) — אין רישום. */
export interface AuditSink { expose(studentIds: Iterable<string>): void }
export interface ProviderOpts { audit?: AuditSink }

export interface AnalyticsV2Provider {
  config(v: V2Viewer): Promise<Envelope<AnalyticsConfig>>
  roster(v: V2Viewer, opts?: ProviderOpts): Promise<Envelope<Roster>>
  /* מסך הכניסה "בחרו כיתה": כיתות + עד 3 התרעות "דורש תשומת לב" (מנהל: ריק) */
  entry(v: V2Viewer, opts?: ProviderOpts): Promise<Envelope<Entry>>
  student(v: V2Viewer, studentId: string, opts?: ProviderOpts): Promise<Envelope<StudentOverview>>
  feedback(v: V2Viewer, studentId: string, opts?: ProviderOpts): Promise<Envelope<StudentFeedback>>
  /* "סקירה" — מחנך הכיתה בלבד (מחוץ להיקף: 404; מורה מקצועי בכיתה שלו: 403) */
  classOverview(v: V2Viewer, classId: string, opts?: ProviderOpts): Promise<Envelope<ClassOverview>>
  classSubject(v: V2Viewer, classId: string, subject: SubjectCode, opts?: ProviderOpts): Promise<Envelope<ClassSubjectView>>
  admin(v: V2Viewer): Promise<Envelope<AdminOverview>>
  briefing(v: V2Viewer, scope: 'student' | 'class', id: string, opts?: ProviderOpts): Promise<Envelope<Briefing>>
}

const CAVEATS = ANALYTICS_CAVEATS
const NOW_ISO = (): string => new Date().toISOString()
const insufficient = <T>(data: T): Envelope<T> => ({ dataState: 'insufficient', data })
const EMPTY_NORM = { gradeLabel: '', center: 0, low: 0, high: 0 }
const DASH = '—'

/* ספק ריק: "אין עדיין מספיק נתונים" בכל מקום. כל תשובה עומדת בסכמת החוזה, כך שהמסכים מתנהגים זהה בלי לדעת שזה לא ספק אמיתי. */
export const emptyProvider: AnalyticsV2Provider = {
  async config(v) {
    return insufficient({ enabled: true, lens: v.lens, availableLenses: [], subjects: [], classes: [], dataNotice: null, curriculumNotice: null, caveats: CAVEATS })
  },
  async roster() { return insufficient({ classes: [], students: [] }) },
  async entry() { return insufficient({ classes: [], alerts: [], alertsTotal: 0, alertsTitle: narrateAlertsTitle(0, 0), alertsMore: null, unclassifiedCount: 0, coverageNote: null }) },
  async student(_v, id) {
    return insufficient({
      student: { id, displayName: DASH, classId: '', className: '', grade: 0, gradeLabel: '' },
      summary: NO_DATA_YET,
      access: 'subject_only', panels: [], crossSubject: [], caveats: CAVEATS,
    })
  },
  async feedback() { return insufficient({ firstName: DASH, intro: FEEDBACK_INTRO_TEXT, headline: NO_DATA_YET, items: [] }) },
  async classOverview(_v, classId) {
    return insufficient({ class: { id: classId, name: DASH, gradeLabel: '', studentCount: 0 }, summary: NO_DATA_YET, rows: [], caveats: CAVEATS })
  },
  async classSubject(_v, classId, subject) {
    return insufficient({
      class: { id: classId, name: DASH, gradeLabel: '', studentCount: 0 },
      subject: { code: subject, nameHe: subjectName(subject) },
      classLevel: { mean: null, ageNorm: EMPTY_NORM },
      summary: { headline: NO_DATA_YET, recent: [], whatToTeach: [] },
      tabSummaries: { misconceptions: NO_DATA_YET, progress: NO_DATA_YET, students: NO_DATA_YET },
      misconceptions: [], recommendations: [],
      progress: { series: [], ageNorm: EMPTY_NORM, events: [] },
      classFindings: [], studentFindings: [], students: [],
      trend: 'insufficient', trendText: groupTrendText('insufficient'),
      otherSubjects: [], caveats: CAVEATS,
    })
  },
  async admin() {
    return insufficient({
      school: { id: '', name: DASH }, highlights: [], grades: [], gradeRows: [], subjectRows: [], cells: [], progress: [], comparisons: [],
      misconceptions: [], hiddenCells: 0, caveats: CAVEATS,
    })
  },
  async briefing(_v, scope, id) {
    return insufficient({ scope, entityId: id, title: NO_DATA_YET, subtitle: '', generatedAt: NOW_ISO(), sections: [], caveats: CAVEATS })
  },
}

/* שם ישן (תאימות לבדיקות): "הספק האמיתי" לפני שנבנה = ספק ריק */
export const realProvider = emptyProvider
