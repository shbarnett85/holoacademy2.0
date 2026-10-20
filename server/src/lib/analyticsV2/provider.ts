/* ──────────────────────────────────────────────────────────────────────────
   provider — הממשק היחיד שהמסכים והנתיבים מכירים. ספק הדגמה מממש אותו כעת; ספק אמיתי בשלבים 5–7.
   ────────────────────────────────────────────────────────────────────────── */
import {
  CAVEAT_AGE_NORM, CAVEAT_CROSS_SUBJECT, CAVEAT_TREND, NO_DATA_YET, groupTrendText,
} from '../../../../src/shared/lib/findingsNarrative.js'
import type {
  AdminOverview, AnalyticsConfig, Briefing, ClassOverview, ClassSubjectView, Entry, Envelope, Roster, StudentFeedback, StudentOverview,
} from '../../../../src/shared/types/analyticsV2.js'
import { subjectName, type SubjectCode } from '../../../../src/shared/lib/subjects.js'
import type { V2Viewer } from './access.js'

export interface AnalyticsV2Provider {
  config(v: V2Viewer): Promise<Envelope<AnalyticsConfig>>
  roster(v: V2Viewer): Promise<Envelope<Roster>>
  /* מסך הכניסה "בחרו כיתה": כיתות + עד 3 התרעות "דורש תשומת לב" (מנהל: ריק) */
  entry(v: V2Viewer): Promise<Envelope<Entry>>
  student(v: V2Viewer, studentId: string): Promise<Envelope<StudentOverview>>
  feedback(v: V2Viewer, studentId: string): Promise<Envelope<StudentFeedback>>
  /* "סקירה" — מחנך הכיתה בלבד (אחרת 403) */
  classOverview(v: V2Viewer, classId: string): Promise<Envelope<ClassOverview>>
  classSubject(v: V2Viewer, classId: string, subject: SubjectCode): Promise<Envelope<ClassSubjectView>>
  admin(v: V2Viewer): Promise<Envelope<AdminOverview>>
  briefing(v: V2Viewer, scope: 'student' | 'class', id: string): Promise<Envelope<Briefing>>
}

const CAVEATS = { ageNorm: CAVEAT_AGE_NORM, crossSubject: CAVEAT_CROSS_SUBJECT, trend: CAVEAT_TREND }
const NOW_ISO = (): string => new Date().toISOString()
const insufficient = <T>(data: T): Envelope<T> => ({ dataState: 'insufficient', data })
const EMPTY_NORM = { gradeLabel: '', center: 0, low: 0, high: 0 }
const DASH = '—'

/* ספק אמיתי — placeholder עד שהמנוע ייבנה (שלבים 5–7): "אין עדיין מספיק נתונים" בכל מקום.
   כל תשובה עומדת בסכמת החוזה, כך שהמסכים מתנהגים זהה בלי לדעת שזה לא ספק ההדגמה. */
export const realProvider: AnalyticsV2Provider = {
  async config(v) {
    return insufficient({ enabled: true, lens: v.lens, availableLenses: [], subjects: [], classes: [], dataNotice: null, curriculumNotice: null, caveats: CAVEATS })
  },
  async roster() { return insufficient({ classes: [], students: [] }) },
  async entry() { return insufficient({ classes: [], alerts: [] }) },
  async student(_v, id) {
    return insufficient({
      student: { id, displayName: DASH, classId: '', className: '', grade: 0, gradeLabel: '' },
      summary: NO_DATA_YET,
      access: 'subject_only', panels: [], crossSubject: [], caveats: CAVEATS,
    })
  },
  async feedback() { return insufficient({ firstName: DASH, headline: NO_DATA_YET, items: [] }) },
  async classOverview(_v, classId) {
    return insufficient({ class: { id: classId, name: DASH, gradeLabel: '', studentCount: 0 }, summary: NO_DATA_YET, rows: [], caveats: CAVEATS })
  },
  async classSubject(_v, classId, subject) {
    return insufficient({
      class: { id: classId, name: DASH, gradeLabel: '', studentCount: 0 },
      subject: { code: subject, nameHe: subjectName(subject) },
      classLevel: { mean: null, ageNorm: EMPTY_NORM },
      summary: { headline: NO_DATA_YET, recent: [], whatToTeach: [] },
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

