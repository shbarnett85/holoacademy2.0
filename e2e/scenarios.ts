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
/* אנליטיקה v2 (מסכי הדמו) פעילה למורה אורח בלבד; מורה אמיתי רואה את האנליטיקה הקיימת (התקדמות + סוגי אתגרים) */
const GUEST_TEACHERS: Who[] = ['guest-homeroom', 'guest-subject-math', 'guest-subject-hebrew']
const REAL_TEACHERS: Who[] = ['real-homeroom', 'real-subject', 'real-unlinked']
const ADMINS: Who[] = ['guest-admin', 'real-admin']

export const SCENARIOS: Scenario[] = [
  /* ───────────── תוצאות (/results) ───────────── */
  {
    name: 'results-list', group: 'results', who: TEACHERS_AND_UNLINKED,
    url: '/results', clicksFromMainTab: 0, ready: '[data-submission-row], [data-empty-state]',
    note: 'רשימת השליחות. real-unlinked = מצב ריק (עיקרון 9)',
  },
  {
    name: 'results-class', group: 'results', who: TEACHERS,
    url: '/results/{submissionId}', inner: true, clicksFromMainTab: 1, ready: '[data-people-panel]',
    note: 'מצב "כל הכיתה" של שליחה (נפתח על הטאב "במבט אחד")',
  },
  {
    name: 'results-class-glance', group: 'results', who: TEACHERS,
    url: '/results/{submissionId}?tab=glance', inner: true, clicksFromMainTab: 1, ready: '[data-glance]',
    note: 'טאב "במבט אחד": שני גרפי עוגה (מי סיים · כמה אתגרים הצליחו מי שסיימו) + חריץ לסיכום המילולי. נכנס במסך אחד ב-1366×768 בלי גלילה פנימית (כיתה של 25, 6 אתגרים)',
  },
  {
    name: 'results-class-challenges', group: 'results', who: TEACHERS,
    url: '/results/{submissionId}?tab=challenges', inner: true, clicksFromMainTab: 2, ready: '[data-people-panel]',
    note: 'טאב האתגרים (עד "במבט אחד" הוא היה ברירת המחדל של מסך הכיתה)',
  },
  {
    name: 'results-student', group: 'results', who: TEACHERS,
    url: '/results/{submissionId}/student/{resultsStudentId}', inner: true, clicksFromMainTab: 2, ready: '[data-people-panel]',
    note: 'תלמיד/ה בתוך שליחה',
  },
  {
    name: 'results-class-objectives', group: 'results', who: TEACHERS,
    url: '/results/{submissionId}?tab=objectives', inner: true, clicksFromMainTab: 2, ready: '[data-people-panel]',
    note: 'טאב יעדי הלמידה (סט הטאבים קבוע: עם יעדים — הרשימה; בלי — מצב ריק מסביר)',
  },
  {
    name: 'results-class-errors', group: 'results', who: TEACHERS,
    url: '/results/{submissionId}?tab=errors', inner: true, clicksFromMainTab: 2, ready: '[data-people-panel]',
    note: 'טאב טעויות נפוצות (עם תגיות — כרטיסים; בלי — מצב ריק מסביר)',
  },
  {
    name: 'results-class-review', group: 'results', who: TEACHERS,
    url: '/results/{submissionId}?tab=review', inner: true, clicksFromMainTab: 2, ready: '[data-people-panel]',
    note: 'טאב תרגול חזרה (יש תחומים חלשים — כפתור יצירה; אין — מצב ריק מסביר)',
  },
  {
    name: 'results-class-how-we-calc', group: 'results', who: HOMEROOM,
    url: '/results/{submissionId}', inner: true, clicksFromMainTab: 2, ready: '[data-people-panel]',
    steps: [{ click: { role: 'button', name: 'איך חישבנו?' } }, { waitFor: { role: 'dialog' } }],
    note: '"איך חישבנו?" פתוח: חלון קטן מעל התוכן (לא דוחף נתונים), עם כפתור סגירה',
  },
  {
    name: 'results-student-slides', group: 'results', who: TEACHERS,
    url: '/results/{submissionId}/student/{resultsStudentId}?tab=slides', inner: true, clicksFromMainTab: 2, ready: '[data-people-panel]',
    note: 'תלמיד/ה › זמן בשקפים',
  },
  {
    name: 'results-student-attention', group: 'results', who: TEACHERS,
    url: '/results/{submissionId}/student/{resultsAttentionStudentId}', inner: true, clicksFromMainTab: 2, ready: '[data-people-panel]',
    note: 'תלמיד/ה שמסומן/ת "דורש תשומת לב" (אם יש)',
  },

  /* ───────────── אנליטיקה (/analytics) ───────────── */
  {
    name: 'analytics-entry', group: 'analytics', who: GUEST_TEACHERS,
    url: '/analytics', clicksFromMainTab: 0, ready: '[data-class-id]',
    note: 'כניסה — "איזו כיתה תרצו לראות?". הכרטיסים (כולל קיצורי המקצועות) מופיעים רק אחרי ששתי הקריאות חזרו, ולכן [data-class-id] הוא סימן המוכנות',
  },
  {
    name: 'analytics-entry-real', group: 'analytics', who: REAL_TEACHERS,
    url: '/analytics', clicksFromMainTab: 0,
    note: 'מורה אמיתי (בלי ANALYTICS_V2): האנליטיקה הקיימת — התקדמות + ביצועים לפי סוג אתגר. real-unlinked = מצב ריק (עיקרון 9)',
  },
  {
    name: 'analytics-class-overview', group: 'analytics', who: HOMEROOM,
    url: '/analytics/class/{classId}?tab=overview', inner: true, clicksFromMainTab: 1, ready: '[role="tablist"]',
  },
  {
    name: 'analytics-class-summary', group: 'analytics', who: [...HOMEROOM, ...SUBJECT],
    url: '/analytics/class/{classId}?tab={subject}&sub=summary', inner: true, clicksFromMainTab: 1, ready: '[role="tablist"]',
    note: 'טאב מקצוע › סיכום. לחיצה אחת: כפתור המקצוע בכרטיס הכיתה במסך הכניסה (נתיב: אנליטיקה › כיתה › מקצוע)',
  },
  {
    name: 'analytics-class-errors', group: 'analytics', who: [...HOMEROOM, ...SUBJECT],
    url: '/analytics/class/{classId}?tab={subject}&sub=errors', inner: true, clicksFromMainTab: 2, ready: '[role="tablist"]',
    note: 'טעויות נפוצות. 2 לחיצות: כפתור המקצוע בכרטיס הכיתה במסך הכניסה › טאב "טעויות נפוצות"',
  },
  {
    name: 'analytics-class-progress', group: 'analytics', who: [...HOMEROOM, ...SUBJECT],
    url: '/analytics/class/{classId}?tab={subject}&sub=progress', inner: true, clicksFromMainTab: 2, ready: '[role="tablist"]',
    note: 'התקדמות. 2 לחיצות: כפתור המקצוע בכרטיס הכיתה במסך הכניסה › טאב "התקדמות"',
  },
  {
    name: 'analytics-class-students', group: 'analytics', who: [...HOMEROOM, ...SUBJECT],
    url: '/analytics/class/{classId}?tab={subject}&sub=students', inner: true, clicksFromMainTab: 2, ready: '[role="tablist"]',
    note: 'תלמידים. 2 לחיצות: כפתור המקצוע בכרטיס הכיתה במסך הכניסה › טאב "תלמידים"',
  },
  {
    name: 'analytics-student', group: 'analytics', who: TEACHERS,
    url: '/analytics/student/{studentId}?class={classId}', inner: true, clicksFromMainTab: 2, ready: '[role="tablist"]',
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
