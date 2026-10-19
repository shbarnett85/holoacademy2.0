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
