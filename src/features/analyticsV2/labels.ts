/* ──────────────────────────────────────────────────────────────────────────
   תוויות הממשק של מסכי האנליטיקה (כפתורים, כותרות מסך, תוויות קבועות). עברית פשוטה, בלי ז'רגון.
   משפטי תוכן (ממצאים, המלצות, סיכומים, הסתייגויות) מגיעים מהחוזה / findingsNarrative.ts — לא נכתבים כאן.
   ────────────────────────────────────────────────────────────────────────── */
import { ANALYTICS_TEXT, LOCKED_SUBJECT_TEXT } from '../../shared/lib/findingsNarrative'

export { LOCKED_SUBJECT_TEXT }

/* טאב "סקירה" חסום (עיקרון 10): מורה מקצועי רואה אותו באפור, עם מנעול והסיבה גלויה בתוך הטאב */
export const LOCKED_OVERVIEW_TEXT = 'זמין למחנך/ת הכיתה'

export const L = {
  analytics: 'אנליטיקה',
  entryTitle: ANALYTICS_TEXT.entryTitle,
  alertsTitle: ANALYTICS_TEXT.alertsTitle,
  overviewTab: ANALYTICS_TEXT.classTabs.overview,
  subTabs: ANALYTICS_TEXT.subjectTabs,
  adminTabs: ANALYTICS_TEXT.adminTabs,
  whatToTeach: 'מה ללמד מחר',
  whatHappened: ANALYTICS_TEXT.labels.whatHappenedLately,
  strongAreas: ANALYTICS_TEXT.labels.strongAreas,
  challengingAreas: ANALYTICS_TEXT.labels.challengingAreas,
  commonErrors: ANALYTICS_TEXT.labels.commonErrors,
  level: ANALYTICS_TEXT.labels.level,
  trend: ANALYTICS_TEXT.labels.trend,
  whoShows: 'מי התלמידים?',
  hideWho: 'הסתרת הרשימה',
  openQuestInLibrary: 'פתיחה בספרייה',
  briefing: 'הכנה לישיבה פדגוגית / תל״א',
  briefingClass: 'הכנה לישיבה פדגוגית — כיתה',
  studentPreview: 'כך התלמיד/ה רואה',
  print: 'הדפסה / שמירה כ-PDF',
  close: 'סגירה',
  retry: 'נסו שוב',
  loading: 'טוען…',
  attentionShort: 'לתשומת לב',
  noAttention: 'אין תלמידים לתשומת לב',
  openSubject: 'פתחו',
  subjectShortcuts: 'ישר למקצוע:',
  subjectShortcutsLabel: (className: string) => `קיצורי דרך למקצועות של כיתה ${className}`,
  openStudent: (firstName: string) => `לעמוד של ${firstName}`,
  curriculumGoal: 'יעד בתוכנית הלימודים',
  sampleMapping: 'מיפוי לדוגמה',
  demoChip: 'נתוני הדגמה',
  levelLabel: (n: number | null) => (n === null ? 'אין רמה עדיין' : `רמה ${n}`),
  eventsHeading: 'מה קרה, לפי הסדר שבגרף',
  chartLegendClass: 'ממוצע הכיתה בכל חודש',
  chartNumbersNote: 'המספרים על הקו הם הרמה בכל חודש.',
  schoolFallback: 'בית הספר',
  noStudentData: 'עוד אין נתונים על התלמיד/ה.',
  noStudentDataNext: 'הם יופיעו כאן כשיסיימו כמה הדמיות.',
  studentNotFound: 'לא מצאנו את התלמיד/ה הזה/זו.',
  backToEntry: 'חזרה לבחירת כיתה',
  tableSubject: 'מקצוע',
  tableLevelTrend: 'רמה ומגמה',
  tablePosition: 'מול הטווח המיועד',
  noArea: 'אין תחום בולט',
  tableAlerts: 'לתשומת לב',
  none: 'אין',
  studentsInSubject: 'התלמידים במקצוע',
} as const

/* כותרות המסכים — השאלה שהמסך עונה עליה */
export const titles = {
  /* המסך עונה על שאלה (עיקרון 1) */
  entry: 'איזו כיתה תרצו לראות?',
  class: (name: string) => `איך כיתה ${name} מסתדרת?`,
  student: (firstName: string) => `איך ${firstName} מסתדר/ת?`,
  classGeneric: 'איך הכיתה מסתדרת?',
  studentGeneric: 'איך התלמיד/ה מסתדר/ת?',
  admin: 'איך בית הספר מסתדר?',
} as const

/* תתי-הטאבים של מקצוע בכיתה (מזהה בכתובת → תווית) */
export const SUB_IDS = ['summary', 'errors', 'progress', 'students'] as const
export type SubId = (typeof SUB_IDS)[number]
export const SUB_LABEL: Record<SubId, string> = {
  summary: L.subTabs.summary, errors: L.subTabs.misconceptions, progress: L.subTabs.progress, students: L.subTabs.students,
}
