/* כל הטקסט של שכבת המשחק שפונה לתלמיד: לשון רבים, בלי רמת קושי, בלי אחוזים ובלי השוואה לאחרים.
   הטקסט הזה נסרק ב-studentUiStrings.test.ts. */

const gemsWord = (n: number): string => (n === 1 ? 'גביש אחד' : `${n} גבישים`)

/* הספרייה ההולוגרפית: כל שיעור הוא ספר, ולכן התלמיד רואה "עמוד" (בקוד ובמסד השם נשאר scene).
   מספר העמוד הוא המקום של העמוד בספר, ולא כמה עמודים כבר נקראו. */
export const BOOK_TEXT = {
  page: (n: number, total: number): string => `עמוד ${n} מתוך ${total}`,
  pageShort: (n: number): string => `עמוד ${n}`,
  pagesCount: (n: number): string => (n === 1 ? 'עמוד אחד' : `${n} עמודים`),
  /* טקסט ארוך של עמוד אחד מתחלק לחלקים בתוך תיבת הטקסט */
  part: (i: number, n: number): string => `חלק ${i} מתוך ${n}`,
  /* פעם אחת, במסך הפתיחה של התלמיד (מדף הספרים) */
  libraryTitle: 'הספרייה ההולוגרפית',
} as const

/* מדף הספרים של התלמיד: שלושה מצבים (חדש, בקריאה, הושלם), סימנייה ומועד הגשה */
export const SHELF_TEXT = {
  fresh: 'חדש',
  /* נוסף למדף מאז הביקור הקודם */
  freshMark: '✦ חדש',
  reading: 'בקריאה',
  readingAt: (page: number): string => `בקריאה, ${BOOK_TEXT.pageShort(page)}`,
  bookmark: (page: number): string => BOOK_TEXT.pageShort(page),
  done: '✓ הושלם',
  doneLate: '✓ הושלם · באיחור',
  gems: (n: number): string => gemsWord(n),
  dueBy: (date: string): string => `להגשה עד ${date}`,
  duePassed: (date: string): string => `המועד עבר · ${date}`,
  review: '🔄 חיזוק',
  count: (shown: number, total: number): string => `${shown}${shown !== total ? `/${total}` : ''} שיעורים`,
} as const

/* הבית של התלמיד: פס עליון עם השלום והסיכום, הפורטל מציג שיעור אחד (ברירת המחדל: האחרון שהתקבל), החצים מדפדפים,
   ובחלון הצד רשימת השיעורים עם חיפוש וסינון */
export const PORTAL_TEXT = {
  /* השלום שבפס העליון, לפי השעה */
  greeting: (hour: number): string => (hour >= 5 && hour < 12 ? 'בוקר טוב' : hour >= 12 && hour < 17 ? 'צהריים טובים' : hour >= 17 && hour < 21 ? 'ערב טוב' : 'לילה טוב'),
  /* הסיכום שבפס העליון: תווית ומספר, כך שהמשפט נכון בכל מספר */
  statGems: 'גבישים שנאספו:',
  statDone: 'שיעורים שהושלמו:',
  statOf: (n: number, total: number): string => `${n} מתוך ${total}`,
  statPaused: 'הופסקו באמצע:',
  statFresh: 'חדשים:',
  statsLabel: 'הסיכום שלכם',
  position: (i: number, n: number): string => `שיעור ${i} מתוך ${n}`,
  prev: 'השיעור הקודם',
  next: 'השיעור הבא',
  /* הכפתור שמתחת לפורטל, לפי מצב השיעור */
  playNew: 'שחקו עכשיו',
  playContinue: 'המשיכו לקרוא',
  playAgain: 'שחקו שוב',
  /* הסימון שעל הפורטל (וגם ברשימה שבחלון הצד): שלושה מצבים, תמיד עם סמל ומילה */
  statusDone: 'הושלם',
  statusDoneLate: 'הושלם · באיחור',
  statusPaused: 'הופסק באמצע',
  statusPausedAt: (page: number): string => `הופסק באמצע · ${BOOK_TEXT.pageShort(page)}`,
  /* השורה הקטנה שמתחת למצב, בטקסט שעל הפורטל */
  captionLate: 'באיחור',
  captionGems: (n: number): string => `${gemsWord(n)} מתוך 5`,
  captionFresh: 'חדש',
  statusNotDone: 'לא הושלם',
  /* נוסף מאז הביקור הקודם */
  freshMark: '✦ חדש',
  /* הכפתור שמעל ד"ר הולו: פותח חלון הסבר על הספרייה, על ד"ר הולו ועל המערכת */
  whereAmI: 'איפה אני?',
  /* הכפתור שעל הקונסולה שלפני הפורטל: נכנס לשיעור. בגוף ראשון, לבקשת המשתמש: התלמיד מדבר אל המכונה, ואין בזה מין */
  launch: 'שגר אותי!',
  fromTeacher: (name: string): string => `מאת ${name}`,
  /* חלון הצד: רשימת השיעורים */
  listTitle: 'השיעורים שלי',
  listCount: (shown: number, total: number): string => (shown === total ? `${total}` : `${shown} מתוך ${total}`),
  journeyLink: 'המסע שלי ↓',
  filterStatus: 'סינון לפי מצב',
  filterSubject: 'סינון לפי מקצוע',
  filterTeacher: 'סינון לפי מורה',
  sortLabel: 'סדר הרשימה',
  allStatuses: 'כל המצבים',
  allSubjects: 'כל המקצועות',
  allTeachers: 'כל המורים',
  searchPlaceholder: 'חיפוש לפי שם שיעור…',
  clear: '✕ ניקוי הסינון',
  noMatch: 'לא נמצאו שיעורים שמתאימים לסינון',
  inPortal: 'בפורטל עכשיו',
  none: 'עדיין לא הוקצו לכם שיעורים',
  noneSub: 'המורה יעדכן בקרוב ✨',
  notLoggedIn: 'לא מחוברים — חזרו לקישור הכיתה',
  /* כניסת אורחים: בלי קוד כיתה, עם שיעורי ההתנסות. שום דבר לא נשמר */
  guestEnter: 'כניסת אורחים',
  guestName: 'אורחים',
  guestNote: 'כניסת אורחים: שיעורים לדוגמה. ההתקדמות לא נשמרת.',
  mute: 'השתקת הצליל',
  unmute: 'הפעלת הצליל',
  exit: 'יציאה',
} as const

export const HUD_TEXT = {
  barLabel: (whole: number): string => `${gemsWord(whole)} מתוך 5`,
  streak: (n: number): string => `רצף ×${n}`,
  bigChallenge: 'האתגר הגדול',
} as const

export const RETRY_TEXT = {
  /* בחירה מרובה אחרי טעות: אפשר לבחור פעם נוספת אחת */
  tryAgain: 'נסו שוב: תשובה נכונה עכשיו שווה חצי מהערך של האתגר.',
  neutralHint: 'לא בדיוק. חשבו שוב ובחרו תשובה אחרת.',
  secondTryHeader: '✓ נכון, בניסיון השני',
  secondTryNote: 'הצלחתם בניסיון השני: חצי מהערך של האתגר.',
  revealed: 'התשובה הנכונה מסומנת. ממשיכים!',
} as const

/* אם ההסבר לטעות מגלה את התשובה, ניסיון שני חסר משמעות: במקומו מוצג רמז כללי, וההסבר עצמו מוצג אחרי הניסיון השני */
export function retryHint(explanation: string | null | undefined, correctText: string | null | undefined): string {
  const e = (explanation ?? '').trim()
  if (!e) return RETRY_TEXT.neutralHint
  const c = (correctText ?? '').trim()
  if (/התשובה הנכונה/.test(e) || (c.length > 1 && e.includes(c))) return RETRY_TEXT.neutralHint
  return e
}

export const END_TEXT = {
  kickerClosed: 'הסיפור נסגר',
  kickerOpen: 'הסיפור נשאר פתוח',
  kickerRadiant: 'חמישה גבישים זוהרים',
  /* הכותרת של מסך הסיום, בשני המצבים */
  chapterEnd: 'סוף הפרק',
  narrativeClosed: 'אספתם מספיק תובנות, והסיפור נסגר.',
  narrativeOpen: 'חסרות עוד תובנות כדי לסגור את הסיפור. אפשר לשחק שוב ולגלות אותן.',
  gemsCount: (whole: number, hasPartial: boolean): string => {
    const base = whole === 0 ? 'עוד אין גביש הבנה' : whole === 1 ? 'אספתם גביש הבנה אחד' : `אספתם ${whole} גבישי הבנה`
    return hasPartial ? `${base}, והגביש הבא כבר התחיל להתמלא` : base
  },
  firstTry: (n: number): string => (n === 1 ? 'אתגר אחד הצליח במלואו' : `${n} אתגרים הצליחו במלואם`),
  retried: (n: number): string => (n === 1 ? 'פעם אחת ניסיתם שוב והצלחתם' : `${n} פעמים ניסיתם שוב והצלחתם`),
  needMore: 'אפשר לשחק שוב ולגלות את מה שחסר.',
  enough: 'אספתם מספיק תובנות כדי לסגור את הסיפור',
  /* הכפתור היחיד במסך הסיום (וגם לחיצה על הפורטל בסיפור שנסגר) */
  back: 'חזרה לספרייה',
  /* קישור בדיו, לא כפתור (וגם לחיצה על הפורטל בסיפור שנשאר פתוח) */
  playAgain: 'שחקו שוב',
  classTitle: 'גבישי הכיתה בשיעור הזה',
  classLine: (x: number, y: number, z: number): string => `הכיתה אספה עד עכשיו ${x} גבישים, ו-${y} מהם שלכם. היעד: ${z}.`,
  journeyTitle: 'המסע שלכם',
} as const

export const JOURNEY_TEXT = {
  sectionTitle: 'המסע שלי',
  now: 'עכשיו',
  open: 'מחכה לכם',
  done: (gems: number): string => (gems === 1 ? 'גביש אחד' : `${gems} גבישים`),
  classClosed: 'כל הכיתה סגרה את הסיפור',
  unclassified: 'לא סווג',
  empty: 'השיעורים שתקבלו יופיעו כאן כתחנות במסע.',
  subjectJourney: (name: string): string => `המסע ב${name}`,
} as const

export const GATE_TEXT = { tapToContinue: 'לחצו להמשך' } as const
