/* כל הטקסט של שכבת המשחק שפונה לתלמיד: לשון רבים, בלי רמת קושי, בלי אחוזים ובלי השוואה לאחרים.
   הטקסט הזה נסרק ב-studentUiStrings.test.ts. */

const gemsWord = (n: number): string => (n === 1 ? 'גביש אחד' : `${n} גבישים`)

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
  titleClosed: 'סוף הסיפור',
  titleOpen: 'הסיפור עוד לא נגמר',
  narrativeClosed: 'אספתם מספיק תובנות, והסיפור נסגר.',
  narrativeOpen: 'חסרות עוד תובנות כדי לסגור את הסיפור. אפשר לשחק שוב ולגלות אותן.',
  gemsCount: (whole: number, hasPartial: boolean): string => {
    const base = whole === 0 ? 'עוד אין גביש הבנה' : whole === 1 ? 'אספתם גביש הבנה אחד' : `אספתם ${whole} גבישי הבנה`
    return hasPartial ? `${base}, והגביש הבא כבר התחיל להתמלא` : base
  },
  firstTry: (n: number): string => (n === 1 ? 'אתגר אחד הצליח בניסיון הראשון' : `${n} אתגרים הצליחו בניסיון הראשון`),
  retried: (n: number): string => (n === 1 ? 'פעם אחת ניסיתם שוב והצלחתם' : `${n} פעמים ניסיתם שוב והצלחתם`),
  needMore: 'אפשר לשחק שוב ולגלות את מה שחסר.',
  enough: 'אספתם מספיק תובנות כדי לסגור את הסיפור',
  home: 'חזרה למסך הראשי',
  playAgain: 'שחקו שוב',
  back: 'חזרה לשיעורים',
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
