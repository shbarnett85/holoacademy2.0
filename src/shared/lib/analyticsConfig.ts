/* ──────────────────────────────────────────────────────────────────────────
   analyticsConfig — תצורת האנליטיקה החדשה (שלב D). ניתן לעריכה; מקור אמת יחיד
   לספי הדיווח, לסוגי הווקטורים ולנורמת הגיל. משותף ללקוח, לשרת, לספק ההדגמה
   ולמנוע האמיתי שייבנה בשלבים 5–7.

   חוק 6: דפוס/אירוע מדווח רק אם N מעל המינימום, p מתוקן ב-Benjamini-Hochberg מתחת
   לסף, וגודל האפקט מעל הסף. אחרת "אין עדיין מספיק נתונים" — לעולם לא ממציאים אירוע.
   ────────────────────────────────────────────────────────────────────────── */

/* סף מינימום של תלמידים לתא באגרגט למנהל (חייב להיות זהה ל-MIN_CELL_SIZE ב-authz; נבדק בטסט) */
export const MIN_CELL_SIZE = 5

/* קצב גילוי שגוי (FDR) ל-BH */
export const FDR_ALPHA = 0.05

/* סוגי ממצאים */
export const FINDING_KINDS = [
  'level_trend', /* מגמת רמה של תלמיד במקצוע (עלייה / ירידה) */
  'class_concept_improvement', /* שיפור כיתתי במושג */
  'memory_random_pattern', /* דפוס לחיצות במשחק הזיכרון */
  'position_bias', /* הטיית מיקום בבחירה מרובה */
  'reading_skip', /* זמן מעבר בין שקפים שאינו תואם לאורך הטקסט */
  'cross_subject_dip', /* ירידה מקבילה בכמה מקצועות אצל אותו תלמיד */
] as const
export type FindingKind = (typeof FINDING_KINDS)[number]

/* ספי הדיווח לפי סוג: minN = כמות התצפיות המינימלית; minEffect = גודל האפקט המינימלי
   (היחידה נקבעת בסוג: d של Cohen / עודף חלק / פער שיעורים / יחס). */
export interface KindThreshold { minN: number; minEffect: number; effectUnit: string }
export const KIND_THRESHOLDS: Record<FindingKind, KindThreshold> = {
  level_trend: { minN: 8, minEffect: 0.8, effectUnit: 'Cohen d (הצלחה בסשנים: חלון אחרון מול קודם)' },
  class_concept_improvement: { minN: 15, minEffect: 0.8, effectUnit: 'dz (שינוי זוגי פר-תלמיד)' },
  memory_random_pattern: { minN: 6, minEffect: 0.25, effectUnit: 'פער בשיעור איתור זוג מוכר מול הצפוי בקשב (N = משחקים)' },
  position_bias: { minN: 25, minEffect: 0.15, effectUnit: 'עודף חלק האפשרות הראשונה מעל הצפוי (פריטים)' },
  reading_skip: { minN: 20, minEffect: 0.5, effectUnit: 'קיצור יחסי של זמן-למילה מול החציון הכיתתי (שקפים)' },
  cross_subject_dip: { minN: 2, minEffect: 0.8, effectUnit: 'מספר מקצועות עם ירידה מדווחת (כל אחד עבר BH)' },
}

/* תפיסות שגויות: מי נחשב "מציג" תפיסה, ומתי יש מספיק חשיפות כדי לדווח */
export const MISCONCEPTION_RULE = {
  minExposuresPerStudent: 3, /* פריטים שבהם התפיסה השגויה הייתה אחד המסיחים */
  minHitsPerStudent: 2, /* בחירות במסיח המתויג */
  minHitShare: 0.5, /* חלק הבחירות מתוך החשיפות */
  minStudentsForGroupShare: MIN_CELL_SIZE, /* ברמת כיתה/שכבה — מתחת לזה לא מדווחים אחוז */
} as const

/* נורמת גיל: רצועה סביב הרמה המיועדת לשכבה בסולם ההדמיות (גן=4 … י"ג=17).
   אין כאן מבחן ארצי — ההסתייגות מוצגת תמיד לצד הרצועה (חוק 11). */
export const AGE_NORM = {
  bandHalfWidth: 1.5,
} as const

/* חלון מדידת שיפור כיתתי: ימי הלימוד הראשונים של המחצית מול ימי הלימוד האחרונים */
export const CLASS_IMPROVEMENT_WINDOW_DAYS = 25

/* גודל מעשי מינימלי לשיפור כיתתי (רמות ממוצעות לתלמיד/ה), בנוסף ל-dz */
export const CLASS_IMPROVEMENT_MIN_MEAN_DELTA = 1.0

/* חלונות מגמת רמה: חלון אחרון מול החלון שקדם לו (ימי לימוד) */
export const TREND_WINDOWS = { recentDays: 60, priorDays: 120 } as const

/* מינימום תצפיות לווקטור שמוצג כ"מדווח" */
export const VECTOR_MIN_N = 5

/* תוכן הדמו: גדלים ותאריכים (הכול יחסי להיום) */
export const DEMO_WORLD = {
  seed: 20260419,
  schoolDays: 260, /* ימי לימוד אחורה (≈ שנת לימודים + מרווח) */
} as const

/* וקטורים — סוג משותף, מופע לפי מקצוע (חוק 4). וקטור מוצג רק במקצוע שיש לו בו פריטים. */
export const CONTENT_VECTOR_KINDS = [
  { key: 'factual', labelHe: 'ידע עובדתי' },
  { key: 'concept_understanding', labelHe: 'הבנת מושגים' },
  { key: 'sequence_causality', labelHe: 'רצף וסיבתיות' },
  { key: 'domain_reading', labelHe: 'הבנת הנקרא בתחום' },
  { key: 'application_inference', labelHe: 'יישום והסקה' },
] as const
export type ContentVectorKey = (typeof CONTENT_VECTOR_KINDS)[number]['key']

export const BEHAVIOR_VECTOR_KINDS = [
  { key: 'persistence', labelHe: 'התמדה', hintHe: 'ניסיונות חוזרים מול ויתור' },
  { key: 'reading_attention', labelHe: 'קשב לקריאה', hintHe: 'זמן קריאה ביחס לאורך הטקסט' },
  { key: 'consistency', labelHe: 'עקביות', hintHe: 'יציבות ההצלחה בין הדמיות' },
] as const
export type BehaviorVectorKey = (typeof BEHAVIOR_VECTOR_KINDS)[number]['key']

export const contentVectorLabel = (k: string): string => CONTENT_VECTOR_KINDS.find((v) => v.key === k)?.labelHe ?? k
export const behaviorVectorLabel = (k: string): string => BEHAVIOR_VECTOR_KINDS.find((v) => v.key === k)?.labelHe ?? k

/* ── תוצאות (טאב "תוצאות") ── */

/* "תשומת לב" בתוצאות — כלל עובדתי בלבד (לא מסקנה): לא התחיל/ה, ויתר/ה על לפחות 2 אתגרים,
   או הצליח/ה בפחות מחצי מהאתגרים. עריכה כאן משנה את כל המסכים והסבר "איך חישבנו?". */
export const ATTENTION_RULE = {
  notStarted: true,
  gaveUpAtLeast: 2,
  /* חלק האתגרים שנפתרו (מתוך כל אתגרי ההדמיה) מתחת לערך הזה = תשומת לב; נבדק רק למי שסיים/ה */
  solvedShareBelow: 0.5,
} as const

/* טעות נפוצה מוצגת באתגר/בהדמיה כשלפחות כך וכך תלמידים בחרו במסיח המתויג שלה */
export const COMMON_ERROR_MIN_STUDENTS = 2

/* סף לניסוח "רוב הכיתה הצליחה" (חלק האתגרים שנפתרו בממוצע בין מי שסיימו) */
export const CLASS_SUCCESS_BANDS = { most: 0.75, some: 0.5 } as const

/* מינימום תלמידים שסיימו כדי לסכם את הכיתה במשפט כללי כשעדיין לא כולם סיימו ("רובם הצליחו").
   מתחת לזה המשפט אומר רק כמה סיימו — לא מכליל מתלמיד/ה בודד/ת. */
export const CLASS_SUMMARY_MIN_COMPLETED = 2

/* התפלגות בחירות בדילמה מוסרית: ב-moral_choices אין שם/תלמיד בכוונה, ולכן התפלגות על מעט תלמידים מאפשרת לזהות מי בחר מה.
   מוצגת רק כשיש לפחות כך וכך שורות בחירה, וכך וכך תלמידים שסיימו את ההדמיה (שני התנאים יחד). */
export const MORAL_MIN_ROWS = MIN_CELL_SIZE
export const MORAL_MIN_COMPLETED = MIN_CELL_SIZE

/* הצעה ל"תרגול חזרה" / יצירת הדמיית חזרה: מינימום תלמידים שסיימו. המורה ממילא רואה תוצאות ברמת תלמיד בשליחה הגלויה לו, ולכן הסף אינו
   של פרטיות מול המורה — הוא מונע בניית הדמיה חדשה (שאפשר גם לשתף) על בסיס ביצועים של תלמיד/ה בודד/ת. אותו סף במסך ובנקודת הקצה. */
export const REVIEW_MIN_COMPLETED = COMMON_ERROR_MIN_STUDENTS

/* שליטה ביעד למידה (טאב "יעדי הלמידה"): חלק התלמידים שהצליחו ביעד — לפחות strong = "למדו", לפחות partial = "למדו חלקית",
   פחות מזה = "עדיין קשה". אותו partial הוא גם הסף האישי: תלמיד/ה שהצליח/ה בפחות מ-partial מהאתגרים והשאלות של היעד נחשב/ת מתקשה בו.
   (ספי 60/80 — עקביים עם מודל כיול הקושי.) */
export const OBJECTIVE_BANDS = { strong: 0.8, partial: 0.6 } as const

/* ── אנליטיקה v2 — מסכי מורה בעיצוב החדש (שלב UX; תוספת בלבד) ── */

/* מגמה (פר תלמיד / כיתה / שכבה) — מילים בלבד בממשק: משתפר/ת · יציב/ה · בירידה · אין עדיין מספיק נתונים */
export const TRENDS = ['improving', 'steady', 'declining', 'insufficient'] as const
export type Trend = (typeof TRENDS)[number]
export const POSITIONS = ['above', 'within', 'below'] as const
export type Position = (typeof POSITIONS)[number]

/* מגמה = ממוצע הרמה ב-60 ימי הלימוד האחרונים פחות ממוצע הרמה ב-90 עד 150 ימי הלימוד שלפני כן.
   הפרש של לפחות חצי רמה = שיפור/ירידה; חסר אחד הצדדים = אין עדיין מספיק נתונים. */
export const TREND_LABEL_MIN_DELTA = 0.5
/* לצבירה כיתתית/שכבתית: מינימום תלמידים שיש להם מגמה כדי לדווח מגמה לקבוצה */
export const GROUP_TREND_MIN_STUDENTS = 3

/* תחום (סוג תוכן) נחשב "חזק" / "מאתגר" כשהרמה בו רחוקה מרמת המקצוע לפחות ברמה אחת, והוא מדווח (N מספיק) */
export const AREA_MIN_DELTA = 1
/* ברמת כיתה: מינימום תלמידים שהתחום מדווח אצלם */
export const CLASS_AREA_MIN_STUDENTS = MIN_CELL_SIZE

/* מסך הכניסה: כמה התרעות "דורש תשומת לב" מוצגות לכל היותר */
export const ENTRY_MAX_ALERTS = 3
/* "מה קרה לאחרונה" בסיכום המקצוע */
export const SUMMARY_RECENT_MAX = 3
/* טקסטי התרעות בשורת מקצוע בסקירת הכיתה */
export const OVERVIEW_ALERT_TEXTS_MAX = 3
/* אירועים על ציר הזמן של ההתקדמות */
export const PROGRESS_EVENTS_MAX = 12

/* טעות נפוצה בכיתה: לפחות כך וכך אחוזים מהתלמידים שנחשפו לנושא חוזרים עליה.
   משמש גם ל"מה ללמד" (המלצות) וגם למשפט הסיכום של טאב "טעויות נפוצות". */
export const CLASS_COMMON_ERROR_MIN_SHARE_PCT = 20
/* משפט הסיכום של טאב "טעויות נפוצות": כמה שמות של טעויות נקראים במשפט (השאר: "ועוד N") */
export const ERRORS_TAB_TITLES_MAX = 3

/* "הרמה הנוכחית" = ממוצע הרמה בכמה ההדמיות האחרונות במקצוע */
export const CURRENT_LEVEL_SESSIONS = 4
