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

/* ───────── שפה חזותית של מקצועות (CLAUDE.md "שפה חזותית של מקצועות") ─────────
   לכל מקצוע צבע וסמל קבועים. **הצבעים עצמם נמצאים רק ב-`src/styles/tokens.css`** (`--subject-<code>`); כאן רק שם הטוקן,
   הסמל, וצבע הטקסט שעל התגית (דיו או לבן, לפי הניגודיות הגבוהה יותר; `subjects.test.ts` מחשב מקובץ הטוקנים ואוכף 4.5:1).
   הצבע משמש לתגיות ולמסגרות קטנות בלבד, ואף פעם לא לבד: שם המקצוע כתוב על התגית. חלק מהצבעים בהירים מכדי לשמש מסגרת
   על רקע לבן, ולכן מסגרת הכרטיס היא בדיו וצבע המקצוע הוא פס או תגית. "אחר" ו"לא סווג" באותו אפור; "לא סווג" מובחן בתווית. */
export interface SubjectVisual { glyph: string; token: `--subject-${string}`; onColor: 'ink' | 'surface' }

export const UNCLASSIFIED_CODE = 'unclassified' as const
export type SubjectVisualCode = SubjectCode | typeof UNCLASSIFIED_CODE

export const SUBJECT_VISUAL: Readonly<Record<SubjectVisualCode, SubjectVisual>> = {
  math: { glyph: '🔢', token: '--subject-math', onColor: 'ink' },
  hebrew: { glyph: '📖', token: '--subject-hebrew', onColor: 'ink' },
  history: { glyph: '🏛️', token: '--subject-history', onColor: 'ink' },
  science: { glyph: '🔬', token: '--subject-science', onColor: 'surface' },
  english: { glyph: '🔤', token: '--subject-english', onColor: 'surface' },
  bible: { glyph: '📜', token: '--subject-bible', onColor: 'surface' },
  geography: { glyph: '🗺️', token: '--subject-geography', onColor: 'surface' },
  civics: { glyph: '⚖️', token: '--subject-civics', onColor: 'ink' },
  literature: { glyph: '✍️', token: '--subject-literature', onColor: 'ink' },
  art: { glyph: '🎨', token: '--subject-art', onColor: 'ink' },
  music: { glyph: '🎵', token: '--subject-music', onColor: 'ink' },
  pe: { glyph: '⚽', token: '--subject-pe', onColor: 'ink' },
  arabic: { glyph: '🗣️', token: '--subject-arabic', onColor: 'surface' },
  french: { glyph: '🥖', token: '--subject-french', onColor: 'surface' },
  other: { glyph: '🧩', token: '--subject-other', onColor: 'ink' },
  unclassified: { glyph: '❔', token: '--subject-unclassified', onColor: 'ink' },
}

/* נשאר לתאימות עם קריאות קיימות: יש פלטה אחת, והפרמטר לא משפיע */
export type SubjectVisualMode = 'light' | 'dark'

/* code = null/לא מוכר → "לא סווג" (אפור). color = הפניה לטוקן (var(--subject-…)), לשימוש ב-style בלבד */
export function subjectVisual(code: string | null | undefined, mode?: SubjectVisualMode): { code: SubjectVisualCode; color: string; glyph: string; label: string } {
  void mode
  const known = isSubjectCode(code)
  const c: SubjectVisualCode = known ? code : UNCLASSIFIED_CODE
  const v = SUBJECT_VISUAL[c]
  return { code: c, color: `var(${v.token})`, glyph: v.glyph, label: known ? subjectName(code) : UNCLASSIFIED_LABEL }
}

/* ───────── תגית מקצוע: צבע המקצוע ברקע, שם המקצוע עליו ─────────
   bg = צבע המקצוע, fg = דיו או לבן (הטוב מבין השניים לכל צבע). צבע לעולם לא מופיע לבד. */
export function subjectTagColors(code: string | null | undefined, mode?: SubjectVisualMode): { bg: string; fg: string; label: string; code: SubjectVisualCode } {
  void mode
  const v = subjectVisual(code)
  const fg = SUBJECT_VISUAL[v.code].onColor === 'ink' ? 'var(--color-ink)' : 'var(--color-surface)'
  return { bg: v.color, fg, label: v.label, code: v.code }
}

/* WCAG 2.x: יחס ניגודיות בין שני צבעי hex (לבדיקות ולכלי המדידה) */
function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
}
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export function contrastRatio(a: string, b: string): number {
  const x = relativeLuminance(a)
  const y = relativeLuminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
