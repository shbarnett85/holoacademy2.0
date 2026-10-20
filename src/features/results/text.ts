/* תוויות הממשק של מסכי התוצאות — עברית פשוטה למורה שלא רגילה/רגיל למחשבים: מילה אחת ברורה לכל כפתור, בלי ז'רגון.
   משפטי הסיכום, הטעויות הנפוצות והסבר "איך חישבנו?" מגיעים מהחוזה / מ-findingsNarrative — לא נכתבים כאן. */
import { countNb } from '../../shared/lib/findingsNarrative'
import { inTopics } from './logic'

export const UI = {
  loading: 'טוען…',
  /* הכפתור בכל שורת שליחה: מה שנפתח הוא התוצאות של אותה שליחה */
  openResults: 'לתוצאות',
  retry: 'נסו שוב',
  backToResults: 'חזרה לתוצאות',
  toAnalytics: 'לאנליטיקה',
  finished: 'סיימו',
  /* במצב "לפי תלמיד" הסרגל העליון עדיין מראה את הכיתה כולה — מסמנים את זה במילה */
  finishedInClass: 'תלמידי הכיתה סיימו',
  succeeded: 'הצליחו',
  answered: 'ענו',
  studentsPlural: 'תלמידים',
  noValue: 'אין נתון',

  /* נתיב */
  crumbResults: 'תוצאות',
  crumbQuest: 'ההדמיה',
  crumbClass: 'הכיתה',
  crumbStudent: 'התלמיד/ה',
  crumbError: (status: number): string => (status === 404 ? 'לא נמצא' : status === 403 ? 'אין הרשאה' : 'משהו השתבש'),

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
    shown === total ? (total === 1 ? 'הדמיה אחת' : `${total} הדמיות`) : `מוצגות ${countNb(shown, total)} הדמיות`,
  classWord: (name: string): string => `כיתה ${name}`,
  sentOn: (date: string): string => `נשלחה ב-${date}`,
  sentBy: (name: string): string => `נשלחה על ידי ${name}`,

  /* "ד״ר הולו מציע" */
  suggestTitle: 'ד״ר הולו מציע',
  suggestText: (title: string, className: string, weakCount: number): string =>
    `ב"${title}" (כיתה ${className}) הכיתה התקשתה ${inTopics(weakCount)}. זה הזמן להדמיית חזרה.`,
  suggestOpen: 'לתרגול חזרה',
  suggestOpenFor: (title: string, className: string): string => `לתרגול חזרה: ${title}, כיתה ${className}`,
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
    /* אותו סדר כמו קבוצות התלמידים (עוד לא התחילו קודם) */
    const parts = [notStarted > 0 ? `${notStarted} עוד לא התחילו` : '', inProgress > 0 ? `${inProgress} באמצע` : ''].filter(Boolean)
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
  studentPosition: (i: number, n: number): string => `תלמיד/ה ${countNb(i, n)}`,
  prev: 'הקודם',
  next: 'הבא',

  /* טאבים ואתגרים */
  partsLabel: 'חלקי המסך',
  tabGlance: 'במבט אחד',
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
  errorsEmptyNext: 'טעות נפוצה מופיעה כאן כשכמה תלמידים בוחרים באותה תשובה שגויה.',
  /* משפט הסיכום של הטאב (במקום כותרת שחוזרת על שם הטאב) */
  commonErrorsSummary: (n: number): string =>
    n === 1 ? 'יש בהדמיה הזאת טעות אחת שכמה תלמידים בחרו בה.' : `יש בהדמיה הזאת ${n} טעויות שכמה תלמידים בחרו בהן.`,
  errorCount: (countText: string): string => `${countText} בחרו בטעות הזאת`,
  focusedQuest: 'צור הדמיה ממוקדת',
  focusedOpen: 'פתיחת ההדמיה הממוקדת',
  focusedExists: (title: string): string => `יש הדמיה ממוקדת לטעות הזאת: «${title}».`,
  focusedNone: 'עדיין אין הדמיה ממוקדת לטעות הזאת, ולכן הכפתור לא פעיל.',

  /* יעדי הלמידה */
  tabObjectives: 'יעדי הלמידה',
  objectivesEmpty: 'אין עדיין יעדים להדמיה הזאת.',
  objectivesEmptyNext: 'יעדי למידה נקבעים כשיוצרים את ההדמיה. כשיהיו יעדים, תראו כאן כמה תלמידים הצליחו בכל אחד מהם.',
  objectivesLabel: 'יעדי הלמידה של ההדמיה',
  objectiveNoData: 'התוצאות ביעד הזה יופיעו כאן כשתלמידים יסיימו.',
  objectiveNobodyWeak: 'אף תלמיד/ה לא מתקשה ביעד הזה.',
  /* "מתקשים ביעד הזה: 6 מתוך 22" */
  objectiveWeakHead: (weak: number, attempted: number): string => `מתקשים ביעד הזה: ${countNb(weak, attempted)}`,
  objectiveWeakNames: 'התלמידים שמתקשים ביעד הזה',
  openStudentHidden: 'לפתיחת התוצאות שלו/ה',
  moreStudents: (n: number): string => (n === 1 ? 'עוד תלמיד/ה אחד/ת' : `עוד ${n} תלמידים`),
  fewerStudents: 'הצגת פחות',

  /* תרגול חזרה */
  reviewTitle: 'תרגול חזרה',
  reviewEmpty: 'אין כרגע מה לתרגל.',
  reviewEmptyNext: 'כשהכיתה תתקשה בתחום מסוים בהדמיה הזאת, אפשר יהיה ליצור כאן הדמיית חזרה קצרה.',
  reviewIntro: (weakCount: number): string =>
    `הכיתה התקשתה ${inTopics(weakCount)} בהדמיה הזאת. אפשר ליצור הדמיית חזרה קצרה שתחזק את החומר מזווית חדשה.`,
  reviewCreate: 'צור הדמיית חזרה',
  reviewWorking: 'ד״ר הולו בונה הדמיית חזרה… זה לוקח בערך דקה או שתיים. אפשר להישאר בעמוד.',
  reviewReady: (title: string): string => (title ? `ההדמיה «${title}» מוכנה. עברו עליה ואז שלחו אותה לכיתה.` : 'הדמיית החזרה מוכנה. עברו עליה ואז שלחו אותה לכיתה.'),
  reviewOpen: 'פתיחת הדמיית החזרה',
  reviewFailed: 'לא הצלחנו ליצור את הדמיית החזרה. אפשר לנסות שוב.',
  reviewSlow: 'היצירה לוקחת יותר זמן מהרגיל. הדמיית החזרה תופיע בספריית ההדמיות כשתהיה מוכנה.',
} as const
