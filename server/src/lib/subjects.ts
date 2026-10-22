import { supabaseAdmin } from './supabase.js'
import { hasSubjects } from './activeColumn.js'
import { ProbeUnavailableError, isSchemaMissingError } from './schemaErrors.js'
import { SUBJECTS, legacySubjectToCode } from '../../../src/shared/lib/subjects.js'

/* ── מקצועות בצד השרת: טבלת `subjects` היא מקור האמת למזהים (uuid);
   הקוד (code) והשמות מגיעים מ-src/shared/lib/subjects.ts (מקור יחיד גם לקליינט). ── */

export interface SubjectRow { id: string; code: string; nameHe: string }

/* strict (האנליטיקה / ההרשאות): כשל חולף בטעינת הטבלה (ניתוק, timeout, 5xx) **לא** נקרא "אין מקצוע" — זורק ProbeUnavailableError (503) ואינו נשמר.
   ברירת המחדל (שאר המערכת, כולל נתיב השחקן) נשארת סלחנית: טבלה חסרה או כשל ← null כמו תמיד. */
export interface SubjectLookupOpts { strict?: boolean }

let byCode: Map<string, SubjectRow> | null = null
let byId: Map<string, SubjectRow> | null = null

export function resetSubjectCache(): void {
  byCode = null
  byId = null
}

async function load(strict = false): Promise<boolean> {
  if (byCode) return true
  /* strict: השאילתה עצמה היא הבדיקה — "הטבלה חסרה" (קוד סכמה) ← false; כל שגיאה אחרת ← 503 */
  if (!strict && !(await hasSubjects())) return false
  const { data, error } = await supabaseAdmin.from('subjects').select('id, code, name_he').eq('active', true)
  if (strict && (error || !data)) {
    if (error && isSchemaMissingError(error)) return false
    throw new ProbeUnavailableError('subjects', String(error?.code || error?.message || 'unknown'))
  }
  if (error || !data) return false
  const c = new Map<string, SubjectRow>()
  const i = new Map<string, SubjectRow>()
  for (const r of data as { id: string; code: string; name_he: string }[]) {
    const row = { id: r.id, code: r.code, nameHe: r.name_he }
    c.set(r.code, row)
    i.set(r.id, row)
  }
  byCode = c
  byId = i
  return true
}

/* קוד → שורת מקצוע (null אם הקוד לא מוכר או שהטבלה עוד לא קיימת) */
export async function subjectByCode(code: string | null | undefined, opts: SubjectLookupOpts = {}): Promise<SubjectRow | null> {
  if (!code) return null
  if (!(await load(opts.strict))) return null
  return byCode!.get(code) ?? null
}

export async function subjectById(id: string | null | undefined, opts: SubjectLookupOpts = {}): Promise<SubjectRow | null> {
  if (!id) return null
  if (!(await load(opts.strict))) return null
  return byId!.get(id) ?? null
}

/* מחרוזת היסטורית (טקסט חופשי) → שורת מקצוע. לא מנחשים: לא מוכר → null */
export async function subjectByLegacyName(name: string | null | undefined): Promise<SubjectRow | null> {
  return subjectByCode(legacySubjectToCode(name))
}

/* פלט מקצוע לממשק: לפי subject_id; לפני המיגרציה — לפי המחרוזת ההיסטורית דרך אותו מיפוי מפורש.
   הדמיה בלי subject_id (גם אם יש טקסט לא מוכר) → null = "לא סווג". */
export async function questSubjectOut(row: { subject?: string | null; subject_id?: string | null }, opts: SubjectLookupOpts = {}): Promise<{ subject: string | null; subjectCode: string | null }> {
  if (row.subject_id) {
    const s = await subjectById(row.subject_id, opts)
    if (s) return { subject: s.nameHe, subjectCode: s.code }
  }
  if (row.subject_id === undefined && row.subject) {
    /* עמודת subject_id עדיין לא נשלפה/קיימת */
    const code = legacySubjectToCode(row.subject)
    if (code) return { subject: SUBJECTS.find((s) => s.code === code)!.nameHe, subjectCode: code }
  }
  return { subject: null, subjectCode: null }
}

/* שדות המקצוע של הדמיה קיימת — להעתקה/ירושה (הדמיית חזרה, עותק מהספרייה). רק עמודות שקיימות. */
export async function subjectFieldsOfQuest(questId: string): Promise<{ fields: Record<string, unknown>; subjectName: string | null }> {
  const { data } = await supabaseAdmin.from('quests').select('*').eq('id', questId).maybeSingle()
  const row = (data ?? {}) as { subject?: string | null; subject_id?: string | null }
  const fields: Record<string, unknown> = {}
  if ('subject_id' in row) fields.subject_id = row.subject_id ?? null
  if ('subject' in row) fields.subject = row.subject ?? null
  const out = await questSubjectOut({ subject: row.subject, subject_id: 'subject_id' in row ? (row.subject_id ?? null) : undefined })
  return { fields, subjectName: out.subject }
}

export async function allSubjects(): Promise<SubjectRow[]> {
  if (await load()) return [...byCode!.values()]
  /* לפני המיגרציה: הרשימה המשותפת בלי מזהים */
  return SUBJECTS.map((s) => ({ id: '', code: s.code, nameHe: s.nameHe }))
}
