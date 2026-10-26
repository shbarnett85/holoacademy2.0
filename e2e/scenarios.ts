/* ──────────────────────────────────────────────────────────────────────────
   רשימת המסכים לביקורת — מונעת-נתונים. להרחבה: הוסיפו אובייקט ל-SCENARIOS.

   שדות (ראו e2e/lib/types.ts → Scenario):
     name               שם קצר וייחודי (a-z 0-9 -); משמש לשם הקובץ ולסינון --only
     group              'results' | 'analytics' | 'admin' | 'ai' | 'existing'
     who                צופה אחד או מערך. מורחב ל"<name>.<who>" (מסך לכל צופה)
                        guest-homeroom | guest-subject-math | guest-subject-hebrew | guest-admin     (חשבון הדגמה; בורר עדשה)
                        real-homeroom | real-subject | real-unlinked | real-admin                    (resultsFixture.ts: שליחות, מסכי התוצאות)
                        real-v2-*                                                                    (analyticsFixture.ts: נתוני אנליטיקה v2 על ספק חי)
     url                יחסי ל-base. {placeholders} מתגלים בזמן ריצה (e2e/lib/discover.ts) או נקבעים ע"י ה-fixture (e2e/lib/login.ts → analyticsVars):
                          {submissionId} {resultsStudentId} {resultsAttentionStudentId}                (תוצאות)
                          {classId} {studentId} {subject} {subjectName} {className}                    (אנליטיקה; פר-צופה)
                          {richClassId} {sparseClassId} {emptyClassId} {dualAClassId} {otherClassId}   (real-v2-*: כיתות ה-fixture)
                          {attentionStudentId} {calmStudentId} {biasStudentId} {memoryStudentId} {trendUpStudentId}
                          {emptyStudentId} {sparseStudentId} {sharedStudentId} {otherStudentId}        (real-v2-*: תלמידי ה-fixture)
                        לאורחים נוסף אוטומטית ?lens=…&subject=… לפי ה-who (אלא אם כבר כתוב ב-url).
     steps              (אופציונלי) צעדים אחרי הטעינה: { click } | { fill, value } | { waitFor } | { wait: ms } | { press }
                        target = CSS / "text=…" / { text } / { role, name }.  { optional: true } = לא נכשל אם חסר.
     ready              (אופציונלי) אלמנט שמסמן "המסך מוכן"; לא מופיע → "route/element missing"
     inner              true = עמוד פנימי → breadcrumb גלוי נדרש (strict)
     clicksFromMainTab  כמה לחיצות מהטאב הראשי של האזור (/results או /analytics). חסר → נספרים צעדי ה-click.
     expect / expectBy  תנאים אחרי שהמסך מוכן: present (חייב להיות גלוי) / absent (אסור שיהיה גלוי) — לכולם / לצופה מסוים. כשל = כשל קשיח.
     allowError         מסך שמטרתו להציג שגיאה (403/404): בלי זה, [data-v2-error] גלוי הוא כשל קשיח לכל מסך
     note               הערה שתופיע בדוח

   מסך שעוד לא נבנה (route/element missing) מדווח "missing" ולא מפיל את הריצה; משתנה שלא התגלה → "skipped".
   ────────────────────────────────────────────────────────────────────────── */
import type { Scenario, Target, Who } from './lib/types.ts'

const HOMEROOM: Who[] = ['guest-homeroom', 'real-homeroom']
const SUBJECT: Who[] = ['guest-subject-math', 'guest-subject-hebrew', 'real-subject']
const TEACHERS: Who[] = [...HOMEROOM, ...SUBJECT]
const TEACHERS_AND_UNLINKED: Who[] = [...TEACHERS, 'real-unlinked']
/* אנליטיקה v2 (התצוגה היחידה): אורח (הדגמה) + מורים אמיתיים מ-analyticsFixture */
const GUEST_TEACHERS: Who[] = ['guest-homeroom', 'guest-subject-math', 'guest-subject-hebrew']
const V2_HOMEROOM: Who[] = ['real-v2-homeroom']
/* מורים מקצועיים בכיתה העשירה: מתמטיקה (subject), עברית (mixed — ובדלה הוא מחנך), היסטוריה בלי נתונים (cross) */
const V2_SUBJECT: Who[] = ['real-v2-subject', 'real-v2-mixed']
const V2_ADMINS: Who[] = ['real-v2-admin']
const ADMINS: Who[] = ['guest-admin', ...V2_ADMINS]

/* סימן "הנתונים הגיעו" במסכי v2: תוכן מוכן, מצב ריק מסביר, או בלוק שגיאה (שגיאה בלתי צפויה נתפסת בנפרד, כשל קשיח) */
const V2_READY = '[data-v2-ready], [data-empty-state], [data-v2-error]'
/* שכבות-על (תדריך / משוב): התוכן בתוך הדיאלוג */
const DIALOG_READY = '[role="dialog"] h1, [role="dialog"] [data-empty-state], [role="dialog"] [data-v2-error]'
/* סיכום ד"ר הולו: הפאנל בתוך השכבה יצא ממצב הטעינה / הסיכום נכתב */
const AI_OVERLAY_SETTLED = '[data-ai-overlay] [data-ai-summary]:not([data-ai-state="loading"])'
const AI_OVERLAY_READY = '[data-ai-overlay] [data-ai-summary][data-ai-state="ready"]'

const LOCKED_TAB = '[role="tab"][aria-disabled="true"]'
/* טאב נעול שאינו "טעויות נפוצות" (שנעול בכוונה כשהקטלוג ריק בחשבון אמיתי) */
const LOCKED_TAB_NOT_ERRORS = '[role="tab"][aria-disabled="true"]:not([data-tab-id="errors"])'
const PREV_VIEW: Target = { role: 'link', name: 'התצוגה הקודמת' }
const BACK_TO_NEW: Target = { role: 'link', name: 'חזרה לתצוגה החדשה' }
const SUMMARY_BUTTON: Target = { role: 'button', name: 'סיכום מד״ר הולו' }
const WRITE_BUTTON: Target = { role: 'button', name: 'כתבו לי סיכום' }
/* מזהה שלא קיים בשום ארגון (אחידות 404, ובדיקת מנהל מול נקודת מורה) */
const NO_SUCH_ID = '00000000-0000-4000-8000-000000000001'

/* קיצורים לתנאים לפי קבוצת צופים */
const forAll = (whos: Who[], e: { present?: Target[]; absent?: Target[] }): Partial<Record<Who, { present?: Target[]; absent?: Target[] }>> =>
  Object.fromEntries(whos.map((w) => [w, e]))

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
    expect: { present: ['[data-ai-summary]'] },
    note: 'טאב "במבט אחד": שני גרפי עוגה (מי סיים · כמה אתגרים הצליחו מי שסיימו) + כרטיס הסיכום המילולי של ד"ר הולו (חייב להופיע). נכנס במסך אחד ב-1366×768 בלי גלילה פנימית (כיתה של 25, 6 אתגרים)',
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

  /* ───────────── אנליטיקה (/analytics) — v2 לכל המורים ───────────── */
  {
    name: 'analytics-entry', group: 'analytics', who: [...GUEST_TEACHERS, ...V2_HOMEROOM, ...V2_SUBJECT, 'real-v2-cross'],
    url: '/analytics', clicksFromMainTab: 0, ready: V2_READY,
    expect: { present: ['[data-class-id]'] },
    expectBy: {
      ...forAll(GUEST_TEACHERS, { absent: [PREV_VIEW] }),
      /* מורה אמיתי: "התצוגה הקודמת" גלויה; למחנך העשיר גם הערת הכיסוי (6 משחקים בשיעורים בלי מקצוע) עם כפתור שיוך */
      'real-v2-homeroom': { present: [PREV_VIEW, { role: 'link', name: 'שייכו מקצוע לשיעורים' }] },
      'real-v2-subject': { present: [PREV_VIEW] }, 'real-v2-mixed': { present: [PREV_VIEW] }, 'real-v2-cross': { present: [PREV_VIEW] },
    },
    note: 'כניסה — "איזו כיתה תרצו לראות?". הכרטיסים (כולל קיצורי המקצועות) מופיעים רק אחרי ששתי הקריאות חזרו. מחנך עשיר: רצועת התרעות + הערת כיסוי; מעורב: שתי כיתות; צולב: כיתה דלה + כיתה עשירה',
  },
  {
    name: 'analytics-entry-states', group: 'analytics', who: ['real-v2-empty', 'real-v2-no-classes', 'real-v2-unspecified', 'real-v2-dual'],
    url: '/analytics', clicksFromMainTab: 0, ready: V2_READY,
    expectBy: {
      'real-v2-empty': { present: [{ text: 'עוד אין תוצאות' }, '[data-class-id]'] },
      'real-v2-no-classes': { present: ['[data-empty-state]'], absent: ['[data-class-id]'] },
      'real-v2-unspecified': { present: ['[data-class-id]'] },
      'real-v2-dual': { present: ['[data-class-id]'] },
    },
    note: 'מצבי כניסה: כיתה בלי תוצאות ("עוד אין תוצאות" ולא "הכול בסדר"), מורה בלי כיתות (מצב ריק מלא), שיוך בלי מקצוע (כיתה בלי קיצורים), מחנך בכיתה + מקצוע בכיתה שנייה (תלמיד/ה משותף/ת)',
  },
  {
    name: 'analytics-entry-previous', group: 'analytics', who: ['real-v2-homeroom', 'real-v2-subject'],
    url: '/analytics', inner: true, clicksFromMainTab: 1, ready: BACK_TO_NEW,
    steps: [{ click: PREV_VIEW }, { waitFor: '[data-breadcrumb]' }],
    note: '"התצוגה הקודמת" (גרף ההתקדמות הכללי) — לחיצה אחת מהכניסה. הפאנל הקודם ידוע כמפר גופנים/יעדים (ראו "מגבלות ידועות")',
  },
  {
    name: 'analytics-previous-blocked', group: 'analytics', who: ['guest-homeroom', ...V2_ADMINS], url: '/analytics?view=previous', clicksFromMainTab: 0, ready: V2_READY,
    expect: { absent: [BACK_TO_NEW] },
    note: '?view=previous נשאר חסום לאורח ולמנהל/ת: מסך הכניסה/המנהל הרגיל, בלי הפאנל הקודם',
  },
  {
    name: 'analytics-class-overview', group: 'analytics', who: ['guest-homeroom', ...V2_HOMEROOM],
    url: '/analytics/class/{classId}?tab=overview', inner: true, clicksFromMainTab: 1, ready: V2_READY,
    expect: { present: [SUMMARY_BUTTON], absent: [LOCKED_TAB] },
    note: 'סקירת הכיתה (מחנך/ת). כפתור "סיכום מד״ר הולו" לכיתה — רק למחנך/ת הכיתה; אין טאבים נעולים',
  },
  {
    name: 'analytics-class-overview-sparse', group: 'analytics', who: ['real-v2-mixed'],
    url: '/analytics/class/{sparseClassId}?tab=overview', inner: true, clicksFromMainTab: 1, ready: V2_READY,
    expect: { present: [SUMMARY_BUTTON] },
    note: 'סקירת כיתה דלה (3 תלמידים, 2 משחקים כל אחד): מחנך/ת בה (ובכיתה העשירה הוא/היא מורה עברית — שם הסקירה נעולה)',
  },
  {
    name: 'analytics-class-overview-empty', group: 'analytics', who: ['real-v2-empty'],
    url: '/analytics/class/{emptyClassId}?tab=overview', inner: true, clicksFromMainTab: 1, ready: V2_READY,
    note: 'סקירת כיתה בלי אף תוצאה: מצב ריק שאומר מה יקרה',
  },
  {
    name: 'analytics-class-overview-dual', group: 'analytics', who: ['real-v2-dual'],
    url: '/analytics/class/{dualAClassId}?tab=overview', inner: true, clicksFromMainTab: 1, ready: V2_READY,
    note: 'סקירה של כיתה שבה תלמיד/ה משותף/ת לשתי כיתות (מחנך בה, מורה תנ"ך בשנייה)',
  },
  {
    name: 'analytics-class-locked', group: 'analytics', who: ['real-v2-cross'],
    url: '/analytics/class/{richClassId}?tab=math&sub=summary', inner: true, clicksFromMainTab: 1, ready: V2_READY,
    expect: { present: [LOCKED_TAB] },
    note: 'מורה היסטוריה בעשירה (ומתמטיקה בדלה) מבקש/ת דרך הכתובת את המתמטיקה של העשירה: נעולה, וגם הסקירה — נופלים להיסטוריה (מכפלה קרטזית של הרשאות אסורה)',
  },
  {
    name: 'analytics-class-cross-open', group: 'analytics', who: ['real-v2-cross'],
    url: '/analytics/class/{sparseClassId}?tab=math&sub=summary', inner: true, clicksFromMainTab: 1, ready: V2_READY,
    note: 'אותו מורה: במתמטיקה של הכיתה הדלה הוא/היא רשאי/ת (הרשאה פר-כיתה)',
  },
  {
    name: 'analytics-class-no-open-subject', group: 'analytics', who: ['real-v2-unspecified'],
    url: '/analytics/class/{richClassId}', inner: true, clicksFromMainTab: 1, ready: V2_READY,
    expect: { present: ['[data-empty-state]', LOCKED_TAB] },
    note: 'שיוך לכיתה בלי מקצוע ובלי מחנכות: אין מקצוע פתוח — מצב ריק במילים, כל הטאבים נעולים (לא ברירת מחדל "מתמטיקה")',
  },
  {
    name: 'analytics-class-summary', group: 'analytics', who: [...GUEST_TEACHERS, ...V2_HOMEROOM, ...V2_SUBJECT],
    url: '/analytics/class/{classId}?tab={subject}&sub=summary', inner: true, clicksFromMainTab: 1, ready: V2_READY,
    expectBy: { ...forAll(V2_HOMEROOM, { absent: [LOCKED_TAB_NOT_ERRORS] }), ...forAll(V2_SUBJECT, { present: [LOCKED_TAB] }) },
    note: 'טאב מקצוע › סיכום. לחיצה אחת: כפתור המקצוע בכרטיס הכיתה במסך הכניסה (נתיב: אנליטיקה › כיתה › מקצוע). מורה מקצועי: סקירה ושאר המקצועות נעולים',
  },
  {
    name: 'analytics-class-errors', group: 'analytics', who: [...GUEST_TEACHERS, ...V2_HOMEROOM, ...V2_SUBJECT],
    url: '/analytics/class/{classId}?tab={subject}&sub=errors', inner: true, clicksFromMainTab: 2, ready: V2_READY,
    note: 'טעויות נפוצות. 2 לחיצות: כפתור המקצוע בכרטיס הכיתה במסך הכניסה › טאב "טעויות נפוצות". על נתוני אמת עוד אין תיוג — מצב ריק מסביר',
  },
  {
    name: 'analytics-class-progress', group: 'analytics', who: [...GUEST_TEACHERS, ...V2_HOMEROOM, ...V2_SUBJECT],
    url: '/analytics/class/{classId}?tab={subject}&sub=progress', inner: true, clicksFromMainTab: 2, ready: V2_READY,
    note: 'התקדמות. 2 לחיצות: כפתור המקצוע בכרטיס הכיתה במסך הכניסה › טאב "התקדמות"',
  },
  {
    name: 'analytics-class-students', group: 'analytics', who: [...GUEST_TEACHERS, ...V2_HOMEROOM, ...V2_SUBJECT],
    url: '/analytics/class/{classId}?tab={subject}&sub=students', inner: true, clicksFromMainTab: 2, ready: V2_READY,
    note: 'תלמידים. 2 לחיצות: כפתור המקצוע בכרטיס הכיתה במסך הכניסה › טאב "תלמידים"',
  },
  {
    name: 'analytics-class-hebrew', group: 'analytics', who: V2_HOMEROOM,
    url: '/analytics/class/{richClassId}?tab=hebrew&sub=summary', inner: true, clicksFromMainTab: 1, ready: V2_READY,
    note: 'עברית בכיתה העשירה: שתי ירידות, דפוס זיכרון אקראי, וממצא "אין עדיין מספיק נתונים"',
  },
  {
    name: 'analytics-class-hebrew-students', group: 'analytics', who: V2_HOMEROOM,
    url: '/analytics/class/{richClassId}?tab=hebrew&sub=students', inner: true, clicksFromMainTab: 2, ready: V2_READY,
    note: 'עברית › תלמידים: 14 תלמידים, מגמות ותלמידים לתשומת לב',
  },
  {
    name: 'analytics-class-science', group: 'analytics', who: V2_HOMEROOM,
    url: '/analytics/class/{richClassId}?tab=science&sub=summary', inner: true, clicksFromMainTab: 1, ready: V2_READY,
    note: 'מדעים בכיתה העשירה: 5 תלמידים בלבד (N קטן)',
  },
  {
    name: 'analytics-class-history-empty', group: 'analytics', who: V2_HOMEROOM,
    url: '/analytics/class/{richClassId}?tab=history&sub=summary', inner: true, clicksFromMainTab: 1, ready: V2_READY,
    note: 'היסטוריה: מקצוע-כיתה בלי אף תוצאה — מצב ריק תקף (לא שגיאה)',
  },
  {
    name: 'analytics-class-notfound', group: 'analytics', who: [...V2_HOMEROOM, 'real-v2-subject'],
    url: '/analytics/class/{otherClassId}', inner: true, clicksFromMainTab: 1, ready: V2_READY,
    expect: { present: ['[data-empty-state]'] },
    note: 'כיתה של בית ספר אחר: ממשק "לא מצאנו את הכיתה" (404 אחיד — לא מגלים שהיא קיימת)',
  },
  {
    name: 'analytics-student', group: 'analytics', who: [...GUEST_TEACHERS, ...V2_HOMEROOM, ...V2_SUBJECT, 'real-v2-cross'],
    url: '/analytics/student/{studentId}?class={classId}', inner: true, clicksFromMainTab: 2, ready: V2_READY,
    expect: { present: [SUMMARY_BUTTON] },
    expectBy: { ...forAll(V2_HOMEROOM, { absent: [LOCKED_TAB] }), ...forAll([...V2_SUBJECT, 'real-v2-cross'], { present: [LOCKED_TAB] }) },
    note: 'כל המקצועות זה לצד זה (מחנך) / מקצוע אחד + אפור (מורה מקצועי). תלמידה בירידה בשני מקצועות (התרעה חוצת-מקצועות). כפתור סיכום מד״ר הולו לכל מורה',
  },
  {
    name: 'analytics-student-subject', group: 'analytics', who: V2_HOMEROOM,
    url: '/analytics/student/{attentionStudentId}?class={richClassId}&tab=hebrew', inner: true, clicksFromMainTab: 2, ready: V2_READY,
    note: 'תלמידה בירידה › טאב עברית: מסלול רמה עם הטווח המיועד, ממצא ירידה',
  },
  {
    name: 'analytics-student-calm', group: 'analytics', who: V2_HOMEROOM,
    url: '/analytics/student/{calmStudentId}?class={richClassId}', inner: true, clicksFromMainTab: 2, ready: V2_READY,
    note: 'תלמיד יציב: בלי ממצאים — לא ממציאים אירוע',
  },
  {
    name: 'analytics-student-bias', group: 'analytics', who: V2_HOMEROOM,
    url: '/analytics/student/{biasStudentId}?class={richClassId}&tab=math', inner: true, clicksFromMainTab: 2, ready: V2_READY,
    note: 'הטיית מיקום במתמטיקה (22 מתוך 30 בחירות באפשרות הראשונה): ממצא בניסוח תצפיתי',
  },
  {
    name: 'analytics-student-memory', group: 'analytics', who: V2_HOMEROOM,
    url: '/analytics/student/{memoryStudentId}?class={richClassId}&tab=hebrew', inner: true, clicksFromMainTab: 2, ready: V2_READY,
    note: 'דפוס זיכרון אקראי בעברית (משחקי זיכרון)',
  },
  {
    name: 'analytics-student-trend-up', group: 'analytics', who: V2_HOMEROOM,
    url: '/analytics/student/{trendUpStudentId}?class={richClassId}&tab=math', inner: true, clicksFromMainTab: 2, ready: V2_READY,
    note: 'מגמה חיובית במתמטיקה (+2.2 רמות)',
  },
  {
    name: 'analytics-student-sparse', group: 'analytics', who: ['real-v2-mixed'],
    url: '/analytics/student/{sparseStudentId}?class={sparseClassId}', inner: true, clicksFromMainTab: 2, ready: V2_READY,
    note: 'תלמיד בכיתה הדלה (2 משחקים): אין עדיין מספיק נתונים לממצאים',
  },
  {
    name: 'analytics-student-empty', group: 'analytics', who: ['real-v2-empty'],
    url: '/analytics/student/{emptyStudentId}?class={emptyClassId}', inner: true, clicksFromMainTab: 2, ready: V2_READY,
    note: 'תלמיד בכיתה בלי תוצאות: "עוד אין תוצאות על …" ומה יקרה',
  },
  {
    name: 'analytics-student-dual', group: 'analytics', who: ['real-v2-dual'],
    url: '/analytics/student/{sharedStudentId}?class={dualAClassId}', inner: true, clicksFromMainTab: 2, ready: V2_READY,
    expect: { absent: [LOCKED_TAB] },
    note: 'תלמיד/ה בשתי כיתות: מחנך בכיתה אחת ← גישה מלאה (איחוד הרשאות), גם למתמטיקה שנוצרה בכיתה העיקרית השנייה',
  },
  {
    name: 'analytics-student-notfound', group: 'analytics', who: [...V2_HOMEROOM, 'real-v2-subject'],
    url: '/analytics/student/{otherStudentId}?class={richClassId}', inner: true, clicksFromMainTab: 2, ready: V2_READY, allowError: true,
    expect: { present: ['[data-v2-error="404"]'] },
    note: 'תלמיד של בית ספר אחר: 404 אחיד בעברית פשוטה, עם נתיב חזרה',
  },
  {
    name: 'analytics-student-admin-blocked', group: 'analytics', who: ['guest-admin', ...V2_ADMINS],
    url: `/analytics/student/${NO_SUCH_ID}`, inner: true, clicksFromMainTab: 2, ready: V2_READY, allowError: true,
    expect: { present: ['[data-v2-error="403"]'] },
    note: 'מנהל/ת מול נקודת תלמיד: 403 (אגרגטים בלבד — חוק 8), בהודעה בעברית פשוטה',
  },

  /* ── שכבות-על: תדריך ומשוב ── */
  {
    name: 'analytics-briefing-student', group: 'analytics', who: ['guest-homeroom', 'guest-subject-math', ...V2_HOMEROOM, 'real-v2-subject'],
    url: '/analytics/student/{studentId}?class={classId}&brief=student:{studentId}', clicksFromMainTab: 2, ready: DIALOG_READY,
    note: 'הכנה לישיבה פדגוגית על תלמיד/ה (מסמך להדפסה). שכבת-על: הדף שמתחת מושבת; גלילה בתוך המסמך מכוונת',
  },
  {
    name: 'analytics-briefing-class', group: 'analytics', who: ['guest-homeroom', ...V2_HOMEROOM],
    url: '/analytics/class/{classId}?tab=overview&brief=class:{classId}', clicksFromMainTab: 2, ready: DIALOG_READY,
    note: 'הכנה לישיבה פדגוגית על כיתה',
  },
  {
    name: 'analytics-briefing-empty', group: 'analytics', who: ['real-v2-empty'],
    url: '/analytics/student/{emptyStudentId}?class={emptyClassId}&brief=student:{emptyStudentId}', clicksFromMainTab: 2, ready: DIALOG_READY,
    expect: { present: ['[role="dialog"] [data-empty-state]'] },
    note: 'תדריך על תלמיד/ה בלי נתונים: לא מסמך ריק אלא הסבר במילים',
  },
  {
    name: 'analytics-briefing-class-no-subjects', group: 'analytics', who: ['real-v2-empty'],
    url: '/analytics/class/{emptyClassId}?tab=overview&brief=class:{emptyClassId}', clicksFromMainTab: 2, ready: DIALOG_READY, allowError: true,
    expect: { present: ['[role="dialog"] [data-empty-state]'], absent: ['[data-v2-error]'] },
    knownIssue: 'באג מוצר: תדריך כיתה למחנך/ת של כיתה בלי מקצועות עדיין (כיתה חדשה) מחזיר 403 ומציג "אין הרשאה" במקום מצב ריק מסביר (providerCore.briefing, "if (!subjects.length) denied()")',
    note: 'נגיש רק דרך כתובת (?brief=class:) — אין כפתור תדריך כיתה במסך כיתה בלי מקצועות',
  },
  {
    name: 'analytics-feedback', group: 'analytics', who: ['guest-homeroom', ...V2_HOMEROOM],
    url: '/analytics/student/{studentId}?class={classId}&fb={studentId}', clicksFromMainTab: 2, ready: DIALOG_READY,
    note: '"כך התלמיד/ה רואה": משוב מכוון צמיחה',
  },
  {
    name: 'analytics-feedback-empty', group: 'analytics', who: ['real-v2-empty'],
    url: '/analytics/student/{emptyStudentId}?class={emptyClassId}&fb={emptyStudentId}', clicksFromMainTab: 2, ready: DIALOG_READY,
    expect: { present: ['[role="dialog"] [data-empty-state]'] },
    note: 'משוב לתלמיד/ה בלי נתונים: הסבר במילים',
  },

  /* ───────────── מנהל (/analytics?tab=…) ───────────── */
  {
    name: 'admin-overview', group: 'admin', who: [...ADMINS, 'real-v2-municipal', 'real-v2-admin-small', 'real-v2-admin-empty'],
    url: '/analytics?tab=overview', clicksFromMainTab: 0, ready: V2_READY,
    expect: { absent: ['[data-ai-summary]', SUMMARY_BUTTON, WRITE_BUTTON] },
    note: 'מנהל/ת: אגרגטים בלבד. עשיר (תאים מוצגים/מוסתרים), עירוני, בית ספר קטן (הכול מוסתר), בית ספר בלי כיתות. אין כפתור/כרטיס סיכום AI',
  },
  { name: 'admin-grades', group: 'admin', who: ADMINS, url: '/analytics?tab=grades', clicksFromMainTab: 1, ready: V2_READY },
  { name: 'admin-subjects', group: 'admin', who: ADMINS, url: '/analytics?tab=subjects', clicksFromMainTab: 1, ready: V2_READY },
  { name: 'admin-errors', group: 'admin', who: ADMINS, url: '/analytics?tab=errors', clicksFromMainTab: 1, ready: V2_READY },

  /* ───────────── סיכום ד"ר הולו (AI) — אורח בלבד לוחץ "כתבו לי סיכום" (תבנית דטרמיניסטית, בלי LLM); אצל real-* לעולם לא ───────────── */
  {
    name: 'ai-glance-write', group: 'ai', who: ['guest-homeroom', 'guest-subject-math'],
    url: '/results/{submissionId}?tab=glance', inner: true, clicksFromMainTab: 2, ready: '[data-ai-summary][data-ai-state="ready"]',
    steps: [{ waitFor: '[data-ai-summary][data-ai-state="none"]' }, { click: WRITE_BUTTON }, { waitFor: { text: 'סיכום הדגמה' }, timeoutMs: 20_000 }],
    expect: { present: ['[data-ai-label="demo"]'] },
    note: 'כרטיס הסיכום בטאב "במבט אחד", אורח: none ← כתבו לי סיכום ← ready (תווית "סיכום הדגמה", תבנית בלי LLM). אחרי כתיבה הלשונית גוללת בתוך עצמה (מכוון)',
  },
  {
    name: 'ai-student-overlay', group: 'ai', who: ['guest-homeroom', 'guest-subject-math', ...V2_HOMEROOM, 'real-v2-subject'],
    url: '/analytics/student/{studentId}?class={classId}&sum=student:{studentId}', clicksFromMainTab: 3, ready: AI_OVERLAY_SETTLED,
    expect: { present: ['[data-ai-overlay]', '[data-ai-summary]'] },
    note: 'שכבת הסיכום על תלמיד/ה במצב פתיחה (אין סיכום עדיין / אין מספיק נתונים). לא לוחצים "כתבו לי סיכום" (אצל real-* זה היה קורא ל-LLM)',
  },
  {
    name: 'ai-student-overlay-write', group: 'ai', who: ['guest-homeroom', 'guest-subject-math'],
    url: '/analytics/student/{studentId}?class={classId}&sum=student:{studentId}', clicksFromMainTab: 3, ready: AI_OVERLAY_READY,
    steps: [{ waitFor: '[data-ai-overlay] [data-ai-summary][data-ai-state="none"]' }, { click: WRITE_BUTTON }, { waitFor: { text: 'סיכום הדגמה' }, timeoutMs: 20_000 }],
    expect: { present: ['[data-ai-label="demo"]'] },
    note: 'אורח: כתיבת סיכום על תלמיד/ה (תבנית). נמדד: 3 לחיצות ממסך הכניסה (מסך התלמיד/ה › סיכום › כתבו לי סיכום)',
  },
  {
    name: 'ai-class-overlay', group: 'ai', who: ['guest-homeroom', ...V2_HOMEROOM],
    url: '/analytics/class/{classId}?tab=overview&sum=class:{classId}', clicksFromMainTab: 2, ready: AI_OVERLAY_SETTLED,
    expect: { present: ['[data-ai-overlay]', '[data-ai-summary]'] },
    note: 'שכבת הסיכום על כיתה (מחנך/ת הכיתה בלבד), מצב פתיחה. לא לוחצים כתיבה',
  },
  {
    name: 'ai-class-overlay-write', group: 'ai', who: ['guest-homeroom'],
    url: '/analytics/class/{classId}?tab=overview&sum=class:{classId}', clicksFromMainTab: 3, ready: AI_OVERLAY_READY,
    steps: [{ waitFor: '[data-ai-overlay] [data-ai-summary][data-ai-state="none"]' }, { click: WRITE_BUTTON }, { waitFor: { text: 'סיכום הדגמה' }, timeoutMs: 20_000 }],
    expect: { present: ['[data-ai-label="demo"]'] },
    note: 'אורח: כתיבת סיכום על כיתה (תבנית)',
  },
  {
    name: 'ai-class-overlay-denied', group: 'ai', who: ['real-v2-subject'],
    url: '/analytics/class/{classId}?tab=math&sub=summary&sum=class:{classId}', clicksFromMainTab: 2, ready: AI_OVERLAY_SETTLED,
    expect: { present: ['[data-ai-overlay]'] },
    note: 'מורה מקצועי פותח דרך הכתובת סיכום כיתה (שהוא של מחנך/ת בלבד): השרת מסרב וההודעה במילים — הכפתור עצמו אינו מוצג למורה מקצועי',
  },
  {
    name: 'ai-admin-hidden', group: 'ai', who: ['guest-admin', ...V2_ADMINS],
    url: `/analytics?tab=overview&sum=class:${NO_SUCH_ID}`, clicksFromMainTab: 0, ready: V2_READY,
    expect: { absent: ['[data-ai-overlay]', '[data-ai-summary]', SUMMARY_BUTTON, WRITE_BUTTON] },
    note: 'מנהל/ת לא רואה סיכום AI גם כשמכניסים ?sum= בכתובת: אין שכבה, אין כרטיס, אין כפתור',
  },

  /* ───────────── קיים היום (בסיס להשוואה / smoke של התשתית) ───────────── */
  {
    name: 'existing-creator', group: 'existing', who: 'guest-homeroom',
    url: '/creator', clicksFromMainTab: 0, note: 'אולפן היצירה הקיים (smoke)',
  },
  {
    name: 'existing-library', group: 'existing', who: 'guest-homeroom',
    url: '/creator/library', clicksFromMainTab: 0, note: 'ספריית השיעורים הקיימת (smoke)',
  },
]

