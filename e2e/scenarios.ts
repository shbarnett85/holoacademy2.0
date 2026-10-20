/* ──────────────────────────────────────────────────────────────────────────
   רשימת המסכים לביקורת — מונעת-נתונים. להרחבה: הוסיפו אובייקט ל-SCENARIOS.

   שדות (ראו e2e/lib/types.ts → Scenario):
     name               שם קצר וייחודי (a-z 0-9 -); משמש לשם הקובץ ולסינון --only
     group              'results' | 'analytics' | 'admin' | 'existing'
     who                צופה אחד או מערך. מורחב ל"<name>.<who>" (מסך לכל צופה)
                        guest-homeroom | guest-subject-math | guest-subject-hebrew | guest-admin
                        real-homeroom | real-subject | real-unlinked | real-admin   (real-* דורשים את ה-fixture של resultsFixture.ts)
     url                יחסי ל-base. {placeholders} מתגלים בזמן ריצה מה-API (e2e/lib/discover.ts):
                          {submissionId} {resultsStudentId} {resultsAttentionStudentId}   (תוצאות)
                          {classId} {studentId} {subject} {subjectName} {className}       (אנליטיקה)
                        לאורחים נוסף אוטומטית ?lens=…&subject=… לפי ה-who (אלא אם כבר כתוב ב-url).
     steps              (אופציונלי) צעדים אחרי הטעינה: { click } | { fill, value } | { waitFor } | { wait: ms } | { press }
                        target = CSS / "text=…" / { text } / { role, name }.  { optional: true } = לא נכשל אם חסר.
     ready              (אופציונלי) אלמנט שמסמן "המסך מוכן"; לא מופיע → "route/element missing"
     inner              true = עמוד פנימי → breadcrumb גלוי נדרש (strict)
     clicksFromMainTab  כמה לחיצות מהטאב הראשי של האזור (/results או /analytics). חסר → נספרים צעדי ה-click.
     note               הערה שתופיע בדוח

   מסך שעוד לא נבנה (route/אלמנט חסר) מדווח "missing" ולא מפיל את הריצה; משתנה שלא התגלה → "skipped".
   ────────────────────────────────────────────────────────────────────────── */
import type { Scenario, Who } from './lib/types.ts'

const HOMEROOM: Who[] = ['guest-homeroom', 'real-homeroom']
const SUBJECT: Who[] = ['guest-subject-math', 'guest-subject-hebrew', 'real-subject']
const TEACHERS: Who[] = [...HOMEROOM, ...SUBJECT]
const TEACHERS_AND_UNLINKED: Who[] = [...TEACHERS, 'real-unlinked']
const ADMINS: Who[] = ['guest-admin', 'real-admin']

export const SCENARIOS: Scenario[] = [
  /* ───────────── תוצאות (/results) ───────────── */
  {
    name: 'results-list', group: 'results', who: TEACHERS_AND_UNLINKED,
    url: '/results', clicksFromMainTab: 0,
    note: 'רשימת השליחות. real-unlinked = מצב ריק (עיקרון 9)',
  },
  {
    name: 'results-class', group: 'results', who: TEACHERS,
    url: '/results/{submissionId}', inner: true, clicksFromMainTab: 1,
    note: 'מצב "כל הכיתה" של שליחה',
  },
  {
    name: 'results-student', group: 'results', who: TEACHERS,
    url: '/results/{submissionId}/student/{resultsStudentId}', inner: true, clicksFromMainTab: 2,
    note: 'תלמיד/ה בתוך שליחה',
  },
  {
    name: 'results-student-attention', group: 'results', who: TEACHERS,
    url: '/results/{submissionId}/student/{resultsAttentionStudentId}', inner: true, clicksFromMainTab: 2,
    note: 'תלמיד/ה שמסומן/ת "דורש תשומת לב" (אם יש)',
  },

  /* ───────────── אנליטיקה (/analytics) ───────────── */
  {
    name: 'analytics-entry', group: 'analytics', who: TEACHERS_AND_UNLINKED,
    url: '/analytics', clicksFromMainTab: 0,
    note: 'כניסה — "בחרו כיתה". לפני הבנייה מחדש זה מסך האנליטיקה הקיים',
  },
  {
    name: 'analytics-class-overview', group: 'analytics', who: HOMEROOM,
    url: '/analytics/class/{classId}?tab=overview', inner: true, clicksFromMainTab: 1,
  },
  {
    name: 'analytics-class-summary', group: 'analytics', who: [...HOMEROOM, ...SUBJECT],
    url: '/analytics/class/{classId}?tab={subject}&sub=summary', inner: true, clicksFromMainTab: 1,
    note: 'טאב מקצוע › סיכום. לחיצה אחת: כפתור המקצוע בכרטיס הכיתה במסך הכניסה (נתיב: אנליטיקה › כיתה › מקצוע)',
  },
  {
    name: 'analytics-class-errors', group: 'analytics', who: [...HOMEROOM, ...SUBJECT],
    url: '/analytics/class/{classId}?tab={subject}&sub=errors', inner: true, clicksFromMainTab: 2,
    note: 'טעויות נפוצות. 2 לחיצות: כפתור המקצוע בכרטיס הכיתה במסך הכניסה › טאב "טעויות נפוצות"',
  },
  {
    name: 'analytics-class-progress', group: 'analytics', who: [...HOMEROOM, ...SUBJECT],
    url: '/analytics/class/{classId}?tab={subject}&sub=progress', inner: true, clicksFromMainTab: 2,
    note: 'התקדמות. 2 לחיצות: כפתור המקצוע בכרטיס הכיתה במסך הכניסה › טאב "התקדמות"',
  },
  {
    name: 'analytics-class-students', group: 'analytics', who: [...HOMEROOM, ...SUBJECT],
    url: '/analytics/class/{classId}?tab={subject}&sub=students', inner: true, clicksFromMainTab: 2,
    note: 'תלמידים. 2 לחיצות: כפתור המקצוע בכרטיס הכיתה במסך הכניסה › טאב "תלמידים"',
  },
  {
    name: 'analytics-student', group: 'analytics', who: TEACHERS,
    url: '/analytics/student/{studentId}?class={classId}', inner: true, clicksFromMainTab: 2,
    note: 'כל המקצועות זה לצד זה (מחנך) / מקצוע אחד + אפור (מורה מקצועי)',
  },

  /* ───────────── מנהל (/analytics?tab=…) ───────────── */
  { name: 'admin-overview', group: 'admin', who: ADMINS, url: '/analytics?tab=overview', clicksFromMainTab: 0, note: 'real-admin = ארגון אמיתי בלי נתוני הדגמה (מצב "אין עדיין מספיק נתונים")' },
  { name: 'admin-grades', group: 'admin', who: ADMINS, url: '/analytics?tab=grades', clicksFromMainTab: 1 },
  { name: 'admin-subjects', group: 'admin', who: ADMINS, url: '/analytics?tab=subjects', clicksFromMainTab: 1 },
  { name: 'admin-errors', group: 'admin', who: ADMINS, url: '/analytics?tab=errors', clicksFromMainTab: 1 },

  /* ───────────── קיים היום (בסיס להשוואה / smoke של התשתית) ───────────── */
  {
    name: 'existing-creator', group: 'existing', who: 'guest-homeroom',
    url: '/creator', clicksFromMainTab: 0, note: 'אולפן היצירה הקיים (smoke)',
  },
  {
    name: 'existing-library', group: 'existing', who: 'guest-homeroom',
    url: '/creator/library', clicksFromMainTab: 0, note: 'ספריית ההדמיות הקיימת (smoke)',
  },
]
