/* תוויות הממשק של מסכי התוצאות — עברית פשוטה למורה שלא רגילה/רגיל למחשבים: מילה אחת ברורה לכל כפתור, בלי ז'רגון.
   משפטי הסיכום, הטעויות הנפוצות והסבר "איך חישבנו?" מגיעים מהחוזה / מ-findingsNarrative — לא נכתבים כאן. */
import { inTopics } from './logic'

export const UI = {
  loading: 'טוען…',
  open: 'פתיחה',
  retry: 'נסו שוב',
  backToResults: 'חזרה לתוצאות',
  toAnalytics: 'לאנליטיקה',
  finished: 'סיימו',
  succeeded: 'הצליחו',
  answered: 'ענו',
  studentsPlural: 'תלמידים',
  noValue: 'אין נתון',

  /* נתיב */
  crumbResults: 'תוצאות',
  crumbQuest: 'ההדמיה',
  crumbClass: 'הכיתה',
  crumbStudent: 'התלמיד/ה',

  /* רשימה */
  emptyWhatNext: 'אחרי ששולחים הדמיה לכיתה, התוצאות של התלמידים יופיעו כאן.',
  filterTitle: 'סינון הרשימה',
  searchLabel: 'חיפוש',
  searchPlaceholder: 'שם ההדמיה',
  filterClass: 'כיתה',
  allClasses: 'כל הכיתות',
  filterSubject: 'מקצוע',
  allSubjects: 'כל המקצועות',
  clearFilter: 'ניקוי הסינון',
  countLine: (shown: number, total: number): string =>
    shown === total ? (total === 1 ? 'הדמיה אחת' : `${total} הדמיות`) : `מוצגות ${shown} מתוך ${total} הדמיות`,
  classWord: (name: string): string => `כיתה ${name}`,
  sentOn: (date: string): string => `נשלחה ב-${date}`,
  sentBy: (name: string): string => `נשלחה על ידי ${name}`,

  /* "ד״ר הולו מציע" */
  suggestTitle: 'ד״ר הולו מציע',
  suggestText: (title: string, className: string, weakCount: number): string =>
    `ב"${title}" (כיתה ${className}) הכיתה התקשתה ${inTopics(weakCount)}. זה הזמן להדמיית חזרה.`,
  notNow: 'לא עכשיו',

  /* שגיאות */
  errNotFound: 'לא מצאנו את התוצאות האלה. ייתכן שהקישור ישן או שההדמיה נמחקה.',
  errForbidden: 'אין לך הרשאה לראות את התוצאות האלה. אפשר לראות רק הדמיות שנשלחו לכיתות שלך.',
  errGeneric: 'משהו השתבש בטעינת התוצאות. אפשר לנסות שוב.',

  /* ראש המסך */
  headLabel: 'פרטי ההדמיה',
  modeLabel: 'אופן הצפייה',
  modeClass: 'כל הכיתה',
  modeStudent: 'לפי תלמיד',
  stateLine: (inProgress: number, notStarted: number): string => {
    const parts = [inProgress > 0 ? `${inProgress} באמצע` : '', notStarted > 0 ? `${notStarted} עוד לא התחילו` : ''].filter(Boolean)
    return parts.length > 0 ? parts.join(' · ') : 'כולם סיימו'
  },

  /* תלמידים */
  rosterTitle: 'מי סיים ומי עוד לא?',
  rosterHint: 'לחצו על שם כדי לראות את התוצאות שלו/ה.',
  rosterEmpty: 'עוד אין תלמידים בכיתה הזאת.',
  groupFinished: 'סיימו',
  groupMiddle: 'באמצע',
  groupNotStarted: 'עוד לא התחילו',
  attentionWord: 'לתשומת לב',
  studentsTitle: 'תלמידים בכיתה',
  studentPosition: (i: number, n: number): string => `תלמיד/ה ${i} מתוך ${n}`,
  prev: 'הקודם',
  next: 'הבא',

  /* טאבים ואתגרים */
  partsLabel: 'חלקי המסך',
  tabChallenges: 'האתגרים',
  tabErrors: 'טעויות נפוצות',
  tabReview: 'תרגול חזרה',
  tabSlides: 'זמן בשקפים',
  challengesTitle: 'האתגרים בהדמיה',
  challengeWord: 'אתגר',
  noChallenges: 'בהדמיה הזאת אין אתגרים להצגה.',
  noAttemptsYet: 'עדיין אין תוצאות בהדמיה הזאת.',
  noAttemptsYetNext: 'הן יופיעו כאן כשתלמידים יסיימו.',
  detail: 'פירוט',
  optCorrect: 'נכונה',
  optWrong: 'שגויה',
  commonErrorShort: 'טעות נפוצה',
  chose: (n: number): string => (n === 0 ? 'אף אחד לא בחר' : n === 1 ? 'תלמיד/ה אחד/ת בחר/ה' : `${n} תלמידים בחרו`),
  pickedTimes: (n: number): string => (n === 0 ? 'לא נבחרה' : n === 1 ? 'נבחרה פעם אחת' : `נבחרה ${n} פעמים`),
  gaveUpLine: (n: number): string => (n === 1 ? 'תלמיד/ה אחד/ת ויתר/ה' : `${n} תלמידים ויתרו`),
  moralNote: 'בשאלת מוסר אין תשובה נכונה, והמערכת לא שומרת מי בחר מה.',

  /* לפי תלמיד */
  chosenAnswer: 'התשובה שנבחרה',
  correctAnswer: 'התשובה הנכונה',
  time: 'זמן',
  totalTime: 'סך הכול באתגר',
  moralStudentNote: 'בשאלת מוסר אין תשובה נכונה, והבחירה לא נשמרת עם שם התלמיד/ה.',
  studentNoResults: 'עוד אין תוצאות להצגה.',
  studentNoResultsNext: 'הן יופיעו כאן אחרי שהתלמיד/ה יתחיל/תתחיל את ההדמיה.',
  studentNoResultsMiddle: 'הן יופיעו כאן אחרי שהתלמיד/ה יסיים/תסיים את האתגר הראשון.',

  /* שקפים */
  slidesTitle: 'זמן בשקפים',
  slidesNote: 'כמה מילים יש בכל שקף, וכמה שניות עברו עד שהתלמיד/ה עבר/ה לשקף הבא. אלה עובדות בלבד.',
  slide: 'שקף',
  words: 'מילים',
  seconds: 'שניות',
  noSlides: 'עוד אין נתונים על זמן בשקפים. הם יופיעו כאן אחרי שהתלמיד/ה יפתח/תפתח את ההדמיה.',

  /* טעויות נפוצות */
  commonErrorsTitle: 'טעויות נפוצות בהדמיה הזאת',
  errorCount: (countText: string): string => `${countText} בחרו בטעות הזאת`,
  focusedQuest: 'צור הדמיה ממוקדת',
  focusedExists: (title: string): string => `יש כבר הדמיה ממוקדת: «${title}». הכפתור יפתח אותה.`,
  focusedNone: 'עדיין אין הדמיה מקושרת לטעות הזאת.',

  /* תרגול חזרה */
  reviewTitle: 'תרגול חזרה',
  reviewIntro: (weakCount: number): string =>
    `הכיתה התקשתה ${inTopics(weakCount)} בהדמיה הזאת. אפשר ליצור הדמיית חזרה קצרה שתחזק את החומר מזווית חדשה.`,
  reviewCreate: 'צור הדמיית חזרה',
  reviewWorking: 'ד״ר הולו בונה הדמיית חזרה… זה לוקח בערך דקה או שתיים. אפשר להישאר בעמוד.',
  reviewReady: (title: string): string => (title ? `ההדמיה «${title}» מוכנה. עברו עליה ואז שלחו אותה לכיתה.` : 'הדמיית החזרה מוכנה. עברו עליה ואז שלחו אותה לכיתה.'),
  reviewOpen: 'פתיחת הדמיית החזרה',
  reviewFailed: 'לא הצלחנו ליצור את הדמיית החזרה. אפשר לנסות שוב.',
  reviewSlow: 'היצירה לוקחת יותר זמן מהרגיל. הדמיית החזרה תופיע בספריית ההדמיות כשתהיה מוכנה.',
} as const
