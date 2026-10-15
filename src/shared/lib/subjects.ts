/* מקור יחיד לרשימת המקצועות — משותף ליצירת הדמיה, לספרייה, לניהול כיתות ולאנליטיקה.
   זהה לשורות טבלת `subjects` (server/migrations/analytics_foundations.sql); טסט בשרת מוודא התאמה.
   הקוד (code) הוא המזהה היציב; השם בעברית לתצוגה בלבד.
   "אחר/שונה" הוא מקצוע לכל דבר, אך בהמשך האנליטיקה שלו תהיה נכון/לא-נכון בלבד (אין קונספטים
   ותפיסות שגויות למקצוע שאינו מוגדר) — לא לבנות עליו וקטורי תוכן. */
export const SUBJECTS = [
  { code: 'hebrew', nameHe: 'עברית' },
  { code: 'history', nameHe: 'היסטוריה' },
  { code: 'math', nameHe: 'מתמטיקה' },
  { code: 'english', nameHe: 'אנגלית' },
  { code: 'science', nameHe: 'מדעים' },
  { code: 'bible', nameHe: 'תנ״ך' },
  { code: 'geography', nameHe: 'גאוגרפיה' },
  { code: 'civics', nameHe: 'אזרחות' },
  { code: 'literature', nameHe: 'ספרות' },
  { code: 'art', nameHe: 'אמנות' },
  { code: 'music', nameHe: 'מוזיקה' },
  { code: 'pe', nameHe: 'חינוך גופני' },
  { code: 'arabic', nameHe: 'ערבית' },
  { code: 'french', nameHe: 'צרפתית' },
  { code: 'other', nameHe: 'אחר/שונה' },
] as const

export type SubjectCode = (typeof SUBJECTS)[number]['code']

/* תווית להדמיה בלי מקצוע (subject_id = NULL) */
export const UNCLASSIFIED_LABEL = 'לא סווג'

const NAME_BY_CODE = new Map<string, string>(SUBJECTS.map((s) => [s.code, s.nameHe]))

export function isSubjectCode(v: unknown): v is SubjectCode {
  return typeof v === 'string' && NAME_BY_CODE.has(v)
}
export function subjectName(code: string | null | undefined): string {
  return (code && NAME_BY_CODE.get(code)) || UNCLASSIFIED_LABEL
}

/* מיפוי מחרוזות היסטוריות (טקסט חופשי שנשמר ב-quests.subject) → קוד. זהה לטבלת
   subject_legacy_map במיגרציה. כל מחרוזת אחרת (כולל ריקה) → null = "לא סווג"; לא מנחשים. */
const LEGACY_NAME_TO_CODE: Record<string, SubjectCode> = {
  'עברית': 'hebrew', 'היסטוריה': 'history', 'מתמטיקה': 'math', 'אנגלית': 'english', 'מדעים': 'science',
  'תנ״ך': 'bible', 'תנ"ך': 'bible', 'תנך': 'bible', 'גאוגרפיה': 'geography', 'אזרחות': 'civics',
  'ספרות': 'literature', 'אמנות': 'art', 'מוזיקה': 'music', 'חינוך גופני': 'pe',
  'ערבית': 'arabic', 'צרפתית': 'french', 'אחר': 'other', 'אחר/שונה': 'other',
}
export function legacySubjectToCode(name: string | null | undefined): SubjectCode | null {
  if (!name) return null
  return LEGACY_NAME_TO_CODE[name.trim()] ?? null
}
export const LEGACY_SUBJECT_MAP: Readonly<Record<string, SubjectCode>> = LEGACY_NAME_TO_CODE
