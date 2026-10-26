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
   לכל מקצוע צבע וסמל קבועים, ממקור אחד — לקליינט ולשרת. שני וריאנטים: `light` (מסכי מורה, מצב בהיר)
   ו-`dark` (מסכי תלמיד, תמיד כהים; ומורה שבחר מצב כהה). הצבעים נגזרו אוטומטית כך שהמסגרת עומדת ב-3:1 לפחות
   מול הרקעים האמיתיים בשני המצבים (`SUBJECT_SURFACES`) — בפועל ≥3.6 בבהיר ו-≥6 בכהה; `subjects.test.ts` מחשב מחדש ואוכף.
   גוונים קרובים (למשל פירוז/אדום־ורוד) מובחנים בשם המקצוע שכתוב על התגית — צבע אף פעם לא לבד. "לא סווג" = אפור + סמל ניטרלי. */
export interface SubjectVisual { glyph: string; light: string; dark: string }

export const UNCLASSIFIED_CODE = 'unclassified' as const
export type SubjectVisualCode = SubjectCode | typeof UNCLASSIFIED_CODE

export const SUBJECT_VISUAL: Readonly<Record<SubjectVisualCode, SubjectVisual>> = {
  math: { glyph: '🔢', light: '#3e69e0', dark: '#7797ee' },
  hebrew: { glyph: '📖', light: '#9f3ee0', dark: '#c17bef' },
  history: { glyph: '🏛️', light: '#a2701a', dark: '#cc8b19' },
  science: { glyph: '🔬', light: '#178c48', dark: '#16b659' },
  english: { glyph: '🔤', light: '#19849a', dark: '#18a7c3' },
  bible: { glyph: '📜', light: '#847915', dark: '#b6a616' },
  geography: { glyph: '🗺️', light: '#348c17', dark: '#3eb616' },
  civics: { glyph: '⚖️', light: '#de3579', dark: '#ed6ea1' },
  literature: { glyph: '✍️', light: '#d322c1', dark: '#eb60dd' },
  art: { glyph: '🎨', light: '#df3a3f', dark: '#ee7276' },
  music: { glyph: '🎵', light: '#543ee0', dark: '#9b8ef1' },
  pe: { glyph: '⚽', light: '#16886c', dark: '#16b68e' },
  arabic: { glyph: '🗣️', light: '#638415', dark: '#86b616' },
  french: { glyph: '🥖', light: '#1f7ec1', dark: '#3ca0e7' },
  other: { glyph: '🧩', light: '#bd5e1f', dark: '#e67a33' },
  unclassified: { glyph: '❔', light: '#707b89', dark: '#909aa7' },
}

/* הרקעים שעליהם יושבת המסגרת, לבדיקת הניגודיות (הפינה הכהה ביותר של רקע האולפן הבהיר; הפינה הבהירה ביותר של הרקע הכהה) */
export const SUBJECT_SURFACES = {
  light: ['#ffffff', '#f2f5f8', '#e8ecf1'],
  dark: ['#04060f', '#070a18', '#0c1430', '#0a163c', '#0b1220', '#151d36'],
} as const
export const MIN_FRAME_CONTRAST = 3

export type SubjectVisualMode = 'light' | 'dark'

/* code = null/לא מוכר → "לא סווג" (אפור). מחזיר את הצבע של המצב המבוקש, את הסמל ואת השם בעברית */
export function subjectVisual(code: string | null | undefined, mode: SubjectVisualMode = 'light'): { code: SubjectVisualCode; color: string; glyph: string; label: string } {
  const known = isSubjectCode(code)
  const c: SubjectVisualCode = known ? code : UNCLASSIFIED_CODE
  const v = SUBJECT_VISUAL[c]
  return { code: c, color: v[mode], glyph: v.glyph, label: known ? subjectName(code) : UNCLASSIFIED_LABEL }
}

/* ───────── תגית מקצוע: צבע המקצוע ברקע, שם המקצוע עליו ─────────
   צבע לעולם לא מופיע לבד — השם כתוב על התגית. הטקסט בלבן או בשחור (הטוב מבין השניים לכל צבע — שחור טהור, כי מול גוון בינוני רק הוא מבטיח 4.5:1 לכל צבע), כך שיחס הניגודיות מול רקע התגית
   הוא לפחות 4.5:1 (AA) לכל 16 הצבעים בשני הווריאנטים (`subjects.test.ts` אוכף). אותם צבעים משמשים גם למסגרת הכרטיס. */
export const TAG_TEXT_COLORS = { onDark: '#ffffff', onLight: '#000000' } as const

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

/* צבעי התגית של מקצוע: bg = צבע המקצוע (או אפור ל"לא סווג"), fg = הטקסט בעל הניגודיות הגבוהה יותר */
export function subjectTagColors(code: string | null | undefined, mode: SubjectVisualMode = 'light'): { bg: string; fg: string; label: string; code: SubjectVisualCode } {
  const v = subjectVisual(code, mode)
  const fg = contrastRatio(v.color, TAG_TEXT_COLORS.onDark) >= contrastRatio(v.color, TAG_TEXT_COLORS.onLight) ? TAG_TEXT_COLORS.onDark : TAG_TEXT_COLORS.onLight
  return { bg: v.color, fg, label: v.label, code: v.code }
}
