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
  level_trend: { minN: 8, minEffect: 0.8, effectUnit: 'Cohen d (הצלחה בשיעורים: חלון אחרון מול קודם; בחשבון אמיתי — ההצלחה ביחס לשאר הכיתה באותו שיעור, ראו LIVE_TREND_RULE)' },
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
  { key: 'consistency', labelHe: 'עקביות', hintHe: 'יציבות ההצלחה בין שיעורים' },
] as const
export type BehaviorVectorKey = (typeof BEHAVIOR_VECTOR_KINDS)[number]['key']

export const contentVectorLabel = (k: string): string => CONTENT_VECTOR_KINDS.find((v) => v.key === k)?.labelHe ?? k
export const behaviorVectorLabel = (k: string): string => BEHAVIOR_VECTOR_KINDS.find((v) => v.key === k)?.labelHe ?? k

/* ── תוצאות (טאב "תוצאות") ── */

/* "תשומת לב" בסיכום שיעור — כלל עובדתי בלבד (לא מסקנה). שלושה כללים; ליד כל סימון מופיעה הסיבה במילים:
   · לא התחיל/ה — נחשב רק **אחרי מועד ההגשה** (בשיעור בלי מועד: לא נחשב).
   · ויתר/ה על לפחות 2 אתגרים.
   · הצליח/ה בפחות מ-40% מהאתגרים, בשיעור עם 5 אתגרים לפחות. הכיול מכוון כל תלמיד/ה ל-60–80% הצלחה ברמה שלו/ה,
     ולכן תוצאה כזאת חריגה ביחס לתלמיד/ה עצמו/ה — וזה לא תלוי בשאר הכיתה.
   עריכה כאן משנה את כל המסכים והסבר "איך חישבנו?". */
export const ATTENTION_RULE = {
  notStartedAfterDue: true,
  gaveUpAtLeast: 2,
  /* חלק האתגרים שנפתרו (מתוך כל אתגרי השיעור) מתחת לערך הזה = תשומת לב; נבדק רק למי שסיים/ה */
  solvedShareBelow: 0.4,
  /* כלל ההצלחה חל רק בשיעור עם לפחות כך וכך אתגרים */
  minChallengesForSuccessRule: 5,
} as const

/* טעות נפוצה: אותה תשובה שגויה אצל לפחות כך וכך תלמידים. כשהתלמידים קיבלו גרסאות שונות של אותה שאלה, "אותה תשובה" נקבעת לפי
   misconception_id (אם יש), אחרת לפי טקסט האפשרות אחרי נרמול; בלי התאמה אמינה לא מאחדים. */
export const COMMON_MISTAKE_MIN_STUDENTS = 3
export const COMMON_ERROR_MIN_STUDENTS = COMMON_MISTAKE_MIN_STUDENTS

/* השוואה לתלמידים אחרים — הוגנת בלבד: רק מול מי ששיחקו את אותו אתגר באותו ממד (סוג האתגר) ברמה דומה: עד maxGap דרגות מעל או מתחת,
   ולפחות minPeers תלמידים כאלה (בלי התלמיד/ה עצמו/ה). אחרת: "אין מספיק תלמידים ברמה דומה להשוואה". ליד כל תוצאה מופיעה הדרגה.
   bands = טווחי הדרגות של הפירוק בתוך אתגר ("דרגות 6-10: 9 מתוך 12 הצליחו"). */
export const LEVEL_COMPARISON = { maxGap: 2, minPeers: 3 } as const
export const LEVEL_BANDS = [{ from: 1, to: 5 }, { from: 6, to: 10 }, { from: 11, to: 15 }, { from: 16, to: 20 }] as const

/* "תצוגה חיה" (שיעור במצב "פעיל עכשיו"): כללים עובדתיים בלבד.
   · heartbeatMs — פעימת הקליינט של התלמיד/ה (בנוסף לסוף כל אתגר); refreshMs — רענון המסך אצל המורה (polling, בלי websockets).
   · stuck: stuckMistakes טעויות ברצף באותו אתגר, או stuckNoProgressMs בלי התקדמות (מעבר סצנה / סיום אתגר).
   · inactive: inactiveMs בלי שום אירוע/פעימה. */
export const LIVE_RULES = {
  heartbeatMs: 30_000,
  refreshMs: 15_000,
  stuckMistakes: 3,
  stuckNoProgressMs: 3 * 60_000,
  inactiveMs: 2 * 60_000,
} as const

/* רשימת השיעורים: "מוקדם יותר" מגיע עד recentDays ימים אחורה; מעבר לכך — מאחורי הכפתור "הצגת שיעורים ישנים יותר" */
export const LESSON_LIST = { recentDays: 30 } as const

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
export const REVIEW_MIN_COMPLETED = 2

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
/* תווית מגמה לתלמיד/ה (ולכל תת-קבוצה): לפחות כך וכך משחקים בכל אחד משני החלונות (האחרון והקודם).
   מתחת לזה — "אין עדיין מספיק נתונים", ולא "משתפר/ת" על סמך שני משחקים. (ממצא מגמה מדווח דורש הרבה יותר: KIND_THRESHOLDS.level_trend.minN.) */
export const TREND_LABEL_MIN_SESSIONS = 3

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

/* ── מנוע הדפוסים על נתוני אמת (W1) ── */

/* מגמת רמה בנתוני אמת (FX1a). הרמה היא תוצר של כיול 60/80: כל רמה תלויה בקודמתה (הליכה אקראית), והיא זזה גם כשקושי ההדמיה זז ולא רק כשהתלמיד/ה השתנו —
   ולכן מבחן ישיר על הרמה מסמן "שינוי" אצל 4% עד 35% מהתלמידים גם כשלא השתנה דבר (נמדד בסימולציית אפס).
   הבדיקה בנתוני אמת היא על ההצלחה של התלמיד/ה ביחס לשאר הכיתה באותה הדמיה: הצלחה פחות הצלחת הכיתה (בלי התלמיד/ה) באותה הדמיה.
   זה מנטרל קושי הדמיה ושינוי קושי כיתתי. הרמה משמשת רק לאישור — מדווחים רק אם גם ההצלחה הגולמית וגם הרמה זזו באותו כיוון.
   · minPeers: כמה תלמידים אחרים צריכים לסיים את אותה הדמיה כדי שיהיה לה ציון יחסי (בלי מספיק עמיתים אין ציון, והמשחק לא נספר במגמה).
   · minRelativeShift: הפרש מינימלי בממוצע ההצלחה היחסית בין החלון האחרון לקודם (שבר הצלחה).
   · minRawShift: הפרש מינימלי באותו כיוון בהצלחה הגולמית.
   · outlierK / outlierMinScale: השינוי היחסי של התלמיד/ה חייב להיות חריג גם מול שינוי היתר בכיתה (חציון ו-MAD של השינוי היחסי של התלמידים שנבדקו; הסקאלה לא קטנה מ-outlierMinScale).
     כך תגובה לא אחידה לשינוי קושי כיתתי (תלמידי תקרה זזים פחות) ושונות בין תלמידים אינן נקראות כשינוי של תלמיד/ה.
   · LEVEL_TREND_BASIS.minDeltaLevels: הפרש ממוצע הרמה באותו כיוון — צעד הכיול. (בהדגמה הבדיקה נשארת על ההצלחה, כמו תמיד.) */
export const LEVEL_TREND_BASIS = { minDeltaLevels: 1 } as const
export const LIVE_TREND_RULE = { minPeers: MIN_CELL_SIZE, minRelativeShift: 0.2, minRawShift: 0.05, outlierK: 2, outlierMinScale: 0.03 } as const

/* שיעור איתור זוג מוכר "בקשב" במשחק הזיכרון — הבסיס שממנו נמדד דפוס אקראי. נגזר מחציון התלמידים רק כשיש לפחות MIN_CELL_SIZE תורמים,
   אחרת ערך קבוע; ותמיד בתוך [min, max] — חציון של 1.0 (כולם מושלמים) הופך כל החמצה ל-p=0 וממצא כוזב על ילד. */
export const MEMORY_ATTENTIVE_RATE = { fallback: 0.7, min: 0.5, max: 0.95 } as const

/* ── FX1b: סף N לטענות רמה (מיקום מול הטווח המיועד, "הרמה בכיתה מתחת לטווח") ──
   רמה "נוכחית" היא ממוצע ארבעת המשחקים האחרונים; מתלמיד/ה עם משחק אחד היא עדיין לא טענה על רמה.
   · אישי: מיקום מול הטווח המיועד רק מ-PERSONAL_LEVEL_MIN_SESSIONS משחקים במקצוע.
   · כיתתי: רמה ומיקום של הכיתה רק כש-CLASS_LEVEL_MIN_STUDENTS תלמידים לפחות עומדים בסף האישי (והממוצע מחושב מהם בלבד).
   · מנהל: תורם לתא שכבה × מקצוע רק מי שעומד בסף האישי; ותא מוצג רק אם אחרי הסרת הכיתה הגדולה ביותר נשארים ADMIN_CELL_MIN_OUTSIDE_LARGEST_CLASS תורמים לפחות
     (אחרת הממוצע שמתפרסם הוא בפועל ממוצע כיתה אחת, ומורה מזוהה — חוק 9). */
export const PERSONAL_LEVEL_MIN_SESSIONS = CURRENT_LEVEL_SESSIONS
export const CLASS_LEVEL_MIN_STUDENTS = 3
export const ADMIN_CELL_MIN_OUTSIDE_LARGEST_CLASS = MIN_CELL_SIZE
