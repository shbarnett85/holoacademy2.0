/* ──────────────────────────────────────────────────────────────────────────
   החלטות טהורות של מסכי האנליטיקה (בלי DOM, בלי רשת) — כדי שמצבי הריק והניתוב ייבדקו בלי לרנדר מסך.
   ────────────────────────────────────────────────────────────────────────── */
import { AI_SUMMARY_PANEL_TEXT, V2_CLIENT_TEXT } from '../../shared/lib/findingsNarrative'
import type { Briefing, Roster, StudentFeedback } from '../../shared/types/analyticsV2'

/* ── שכבות-על בכתובת: ?brief=student:<id> · ?sum=class:<id> ── */
export const BRIEF_SCOPES = ['student', 'class'] as const
export const SUMMARY_SCOPES = ['student', 'class'] as const
export type BriefScope = (typeof BRIEF_SCOPES)[number]
export type SummaryScope = (typeof SUMMARY_SCOPES)[number]

/** "scope:id" מהכתובת; null כשחסר, כשההיקף אינו מוכר או כשאין מזהה */
export function parseScopeId<S extends string>(value: string | null, scopes: readonly S[]): { scope: S; id: string } | null {
  if (!value) return null
  const at = value.indexOf(':')
  if (at <= 0) return null
  const scope = value.slice(0, at)
  const id = value.slice(at + 1)
  if (!id || !(scopes as readonly string[]).includes(scope)) return null
  return { scope: scope as S, id }
}

/* ── כניסה (בחרו כיתה) ── */
export type EntryClassState = 'noResults' | 'attention' | 'clear'

/** מצב כרטיס כיתה: "עוד אין תוצאות" אינו "אין תלמידים לתשומת לב" — הראשון חסר נתונים, השני דיווח חיובי */
export function entryClassState(c: { hasResults: boolean; attentionCount: number }): EntryClassState {
  if (c.attentionCount > 0) return 'attention'
  return c.hasResults ? 'clear' : 'noResults'
}

/** "התצוגה הקודמת" (גרף ההתקדמות הכללי) מוצעת רק למורה אמיתי: לא לאורח (ההדגמה מציגה רק את החדש) ולא למנהל/ת (אגרגטים בלבד) */
export function canSeePreviousView(p: { role: string | null; isGuest: boolean }): boolean {
  return p.role === 'teacher' && !p.isGuest
}

export const PREVIOUS_VIEW_PARAM = 'view'
export const PREVIOUS_VIEW_VALUE = 'previous'
export const PREVIOUS_VIEW_HREF = `/analytics?${PREVIOUS_VIEW_PARAM}=${PREVIOUS_VIEW_VALUE}`

/* ── תדריך / משוב: מסמך ריק אינו מוצג כמסמך ── */
/* 'unknowns' ו-'how_we_calculated' כוללים תמיד שורת הסבר קבועה (מגבלות הראיות, הערת השיטה), ולכן אינם מעידים על תוכן */
const BRIEFING_CONTENT_SECTIONS: readonly string[] = ['strengths', 'difficulties', 'trend', 'recommendations', 'evidence_basis']

export function briefingHasContent(b: Pick<Briefing, 'sections'>): boolean {
  return b.sections.some((s) => BRIEFING_CONTENT_SECTIONS.includes(s.id) && s.items.length > 0)
}

export const feedbackHasContent = (f: Pick<StudentFeedback, 'items'>): boolean => f.items.length > 0

/* ── עמוד התלמיד/ה ── */
/** המשפט שבראש העמוד. ספק שאין לו עדיין תוצאות על התלמיד/ה מחזיר dataState='insufficient' — ואז לא כותבים "אין דבר חריג" (זה נשמע כמו "הכול בסדר") */
export function studentHeadline(dataState: 'ok' | 'insufficient' | null, firstName: string, serverSummary: string): string {
  return dataState === 'insufficient' ? V2_CLIENT_TEXT.studentNoResults(firstName) : serverSummary
}

/* ── הדמיה ממוקדת ── */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** כתובת ההדמיה בספרייה. רק מזהה אמיתי (uuid) מנווט אל ההדמיה עצמה; מזהה של הדגמה אינו קיים בבסיס הנתונים — אז הספרייה */
export const questHref = (questId: string): string => (UUID.test(questId) ? `/creator/quest/${questId}` : '/creator/library')

/* ── רשימת הכיתות והתלמידים (GET /roster) ──
   תלמיד/ה שמשויך/ת לכמה כיתות של אותו צופה מופיע/ה פעם לכל כיתה (classId שונה): מפתח ברשימה הוא id+classId,
   וכל ספירה או חיפוש לפי תלמיד/ה סופרים כל אחד/ת פעם אחת. */
export type RosterClass = Roster['classes'][number]
export type RosterStudent = Roster['students'][number]

export const rosterStudentKey = (s: Pick<RosterStudent, 'id' | 'classId'>): string => `${s.id}:${s.classId}`

export function uniqueRosterStudents(students: readonly RosterStudent[]): RosterStudent[] {
  const seen = new Set<string>()
  const out: RosterStudent[] = []
  for (const s of students) if (!seen.has(s.id)) { seen.add(s.id); out.push(s) }
  return out
}

export const rosterStudentCount = (students: readonly RosterStudent[]): number => new Set(students.map((s) => s.id)).size

/* ── סיכום מילולי: מה מציגים בכותרת ובייצוא (השם מהמסך, לא מה-AI) ומה היקף הצפייה ──
   name: שם התלמיד/ה או הכיתה; ריק כשהרשימה עוד לא נטענה (הכותרת היא שם ההיקף בלבד).
   subjectOnly: הצופה אינו מחנך/ת באף כיתה של התלמיד/ה, ולכן הסיכום מתייחס רק למקצועות שלו/ה. */
export function summaryContextOf(roster: Roster | null, scope: SummaryScope, id: string): { name: string; subjectOnly: boolean } {
  if (!roster) return { name: '', subjectOnly: false }
  if (scope === 'class') {
    const c = roster.classes.find((x) => x.id === id)
    return { name: c ? AI_SUMMARY_PANEL_TEXT.classLabel(c.name) : '', subjectOnly: false }
  }
  const rows = roster.students.filter((s) => s.id === id)
  const homeroomOfAny = rows.some((s) => roster.classes.find((c) => c.id === s.classId)?.isHomeroom === true)
  return { name: rows[0]?.displayName ?? '', subjectOnly: rows.length > 0 && !homeroomOfAny }
}
