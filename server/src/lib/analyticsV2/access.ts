/* ──────────────────────────────────────────────────────────────────────────
   access — כללי ההרשאה של האנליטיקה החדשה (חוק 12 — מודול הרשאות מרכזי, פונקציות טהורות).
   · הרשאה נגזרת **פר-כיתה** (V2ClassGrant): מחנך הכיתה / מקצועות שהמורה מלמד באותה כיתה בלבד / שיוך בלי מקצוע.
     מורה היסטוריה בכיתה א׳ ומתמטיקה בכיתה ב׳ אינו מקבל מתמטיקה בא׳ והיסטוריה בב׳ (לא מכפלה קרטזית).
   · מחנך: כל מקצועות תלמידי כיתתו, כולל התרעות חוצות-מקצועות — רק בכיתות שבהן הוא מחנך.
   · שיוך בלי מקצוע (unspecified): הכיתה מופיעה, כל המקצועות נעולים (שם בלבד). אין ברירת מחדל למקצוע.
   · מנהל: אגרגטים בלבד (lens='admin'). אין שם/מזהה תלמיד בשום תגובה, אין מידע על מורים, והתאים נחתכים ב-adminPrivacy.ts.
   ה-V2Viewer נגזר בשרת (viewer.ts / liveViewer.ts) ולעולם לא מהלקוח ישירות. כשאין classGrants (בדיקות, ספק ההדגמה)
   ההרשאות מסונתזות מהשדות הישנים (homeroomClassId / teachingClassIds / subjectCodes) — אותה התנהגות כמו תמיד.
   ────────────────────────────────────────────────────────────────────────── */
import type { SubjectCode } from '../../../../src/shared/lib/subjects.js'
import type { EndpointName, Lens } from '../../../../src/shared/types/analyticsV2.js'
import { ERR_AGGREGATE_ONLY, ERR_NO_ACCESS } from '../../../../src/shared/lib/findingsNarrative.js'
import { MIN_CELL_SIZE } from '../authz.js'
import { AppError } from '../../middleware/errors.js'

/* הרשאה פר-כיתה (ספק חי): מחנך / מקצועות שהמורה מלמד בכיתה הזאת / שיוך בלי מקצוע. לכל כיתה grant אחד לכל היותר. */
export interface V2ClassGrant { classId: string; homeroom: boolean; subjects: SubjectCode[]; unspecified: boolean }

export interface V2Viewer {
  /* תצוגה ונוסח בלבד (מחנך / מורה מקצועי / מנהל). **אסור להסיק ממנו הרשאה** — חוץ מ-'admin' = אגרגטים בלבד */
  lens: Lens
  /* האם נגזר מבורר העדשה (מורה אורח) */
  guest: boolean
  /* שדות תאימות (ספק ההדגמה והבדיקות). כש-classGrants קיים הם מידע בלבד, ולא מקור הרשאה */
  homeroomClassId: string | null
  teachingClassIds: string[]
  subjectCodes: SubjectCode[]
  /* אדיטיבי (ספק חי): מקור הנתונים, בית הספר, והרשאות פר-כיתה. כשחסר — נגזר מהשדות הישנים */
  source?: 'demo' | 'live'
  schoolId?: string | null
  classGrants?: V2ClassGrant[]
  /* ארגון הדגמה: מותר לראות שורות סינתטיות. במסלול החי הוא תמיד false (ארגון הדגמה מוגש מספק ההדגמה); הקורא (הספק החי) משתמש בו לבידוד נתוני הדגמה */
  seesSynthetic?: boolean
}

/* ── grants ── */
const NO_GRANTS: readonly V2ClassGrant[] = Object.freeze([])

/* מנהל (lens='admin') = אגרגטים בלבד: אין לו grants בשום מצב, גם אם classGrants מולא בטעות */
export const isAggregateOnly = (v: V2Viewer): boolean => v.lens === 'admin'

export function grantOf(v: V2Viewer, classId: string): V2ClassGrant | null {
  if (isAggregateOnly(v)) return null
  if (v.classGrants) return v.classGrants.find((g) => g.classId === classId) ?? null
  if (v.lens === 'homeroom') return v.homeroomClassId === classId ? { classId, homeroom: true, subjects: [], unspecified: false } : null
  return v.teachingClassIds.includes(classId) ? { classId, homeroom: false, subjects: v.subjectCodes, unspecified: false } : null
}

export function grantsOf(v: V2Viewer): readonly V2ClassGrant[] {
  if (isAggregateOnly(v)) return NO_GRANTS
  if (v.classGrants) return v.classGrants
  if (v.lens === 'homeroom') return v.homeroomClassId ? [{ classId: v.homeroomClassId, homeroom: true, subjects: [], unspecified: false }] : NO_GRANTS
  return v.teachingClassIds.map((classId) => ({ classId, homeroom: false, subjects: v.subjectCodes, unspecified: false }))
}

/* הכיתות שבהיקף הצופה (כולל כיתות בלי נתונים), בסדר ה-grants */
export const scopeClassIds = (v: V2Viewer): string[] => grantsOf(v).map((g) => g.classId)

const allows = (g: V2ClassGrant, subject: SubjectCode): boolean => g.homeroom || g.subjects.includes(subject)

export const isHomeroomOf = (v: V2Viewer, classId: string): boolean => grantOf(v, classId)?.homeroom === true
/* מחנך בלפחות כיתה אחת (לנוסח ולעדשה בלבד) */
export const isHomeroomAnywhere = (v: V2Viewer): boolean => grantsOf(v).some((g) => g.homeroom)

/* העדשה (תצוגה/נוסח) שנגזרת מההרשאות: מנהל → admin; מחנך בכיתה כלשהי → homeroom; אחרת מורה מקצועי */
export function deriveLens(role: 'teacher' | 'admin' | 'municipal_admin', grants: readonly Pick<V2ClassGrant, 'homeroom'>[]): Lens {
  if (role === 'admin' || role === 'municipal_admin') return 'admin'
  return grants.some((g) => g.homeroom) ? 'homeroom' : 'subject_teacher'
}

/* ── תלמיד / מקצוע / כיתה ── */
export const canSeeStudentLevel = (v: V2Viewer): boolean => !isAggregateOnly(v)

/* האם הצופה רשאי לפתוח את התלמיד: יש לו הרשאה בכיתה של התלמיד (או באחת מכיתותיו). מקצועות — לפי canViewSubject */
export function canViewStudent(v: V2Viewer, studentClassId: string | readonly string[]): boolean {
  const ids = typeof studentClassId === 'string' ? [studentClassId] : studentClassId
  return ids.some((id) => grantOf(v, id) !== null)
}

/* האם המקצוע של התלמיד גלוי לצופה (אחרת: אפור). classId = כיתת התלמיד; בלעדיו — בכיתה כלשהי של הצופה */
export function canViewSubject(v: V2Viewer, subject: SubjectCode, classId?: string): boolean {
  if (isAggregateOnly(v)) return false
  if (classId !== undefined) { const g = grantOf(v, classId); return g !== null && allows(g, subject) }
  return grantsOf(v).some((g) => allows(g, subject))
}

export function canViewClassSubject(v: V2Viewer, classId: string, subject: SubjectCode): boolean {
  const g = grantOf(v, classId)
  return g !== null && allows(g, subject)
}

/* התרעות חוצות-מקצועות: למחנך בלבד, ורק לתלמידי הכיתה שבה הוא מחנך. classId חסר = בכיתה כלשהי */
export const canSeeCrossSubject = (v: V2Viewer, classId?: string): boolean => (classId === undefined ? isHomeroomAnywhere(v) : isHomeroomOf(v, classId))

/* "סקירה" של כיתה (כל המקצועות זה לצד זה) — מחנך הכיתה בלבד. מורה מקצועי ומנהל: אין גישה. */
export const canViewClassOverview = (v: V2Viewer, classId: string): boolean => isHomeroomOf(v, classId)

/* מקצועות הכיתה שהצופה רשאי לפתוח / שנעולים לו (שם בלבד). classSubjects = כל מקצועות הכיתה (גם בלי נתונים).
   מקצוע שהמורה מלמד תמיד פתוח, גם אם עדיין אין בכיתה נתונים בו. אין grant בכיתה — אין כלום (הכיתה לא קיימת עבורו). */
export function classSubjectAccess(v: V2Viewer, classId: string, classSubjects: readonly SubjectCode[]): { open: SubjectCode[]; locked: SubjectCode[] } {
  const g = grantOf(v, classId)
  if (!g) return { open: [], locked: [] }
  const uniq = (xs: readonly SubjectCode[]): SubjectCode[] => [...new Set(xs)]
  if (g.homeroom) return { open: uniq([...classSubjects, ...g.subjects]), locked: [] }
  const open = uniq([...classSubjects.filter((s) => g.subjects.includes(s)), ...g.subjects])
  return { open, locked: uniq(classSubjects).filter((s) => !open.includes(s)) }
}

/* ── גישה לתלמיד שרשום בכמה כיתות: איחוד ההרשאות (כמו authz.studentScope) ── */
export type StudentAccess = { kind: 'denied' } | { kind: 'scoped'; full: boolean; subjects: ReadonlySet<SubjectCode> }
export function studentAccess(v: V2Viewer, studentClassIds: readonly string[]): StudentAccess {
  if (isAggregateOnly(v)) return { kind: 'denied' }
  let linked = false
  let full = false
  const subjects = new Set<SubjectCode>()
  for (const id of studentClassIds) {
    const g = grantOf(v, id)
    if (!g) continue
    linked = true
    if (g.homeroom) full = true
    for (const s of g.subjects) subjects.add(s)
  }
  return linked ? { kind: 'scoped', full, subjects } : { kind: 'denied' }
}
export const accessAllowsSubject = (a: StudentAccess, subject: SubjectCode): boolean => a.kind === 'scoped' && (a.full || a.subjects.has(subject))
export const accessSeesCrossSubject = (a: StudentAccess): boolean => a.kind === 'scoped' && a.full

/* תא אגרגט מוצג רק אם ≥ MIN_CELL_SIZE תלמידים */
export const cellVisible = (n: number): boolean => n >= MIN_CELL_SIZE

export function requireNotAdmin(v: V2Viewer): void {
  if (isAggregateOnly(v)) throw new AppError(403, ERR_AGGREGATE_ONLY)
}

/* ── יכולת לפי נקודת קצה: מנהל מול מסכי מורה (403 לפי תפקיד, בלי תלות בקיום הישות) ── */
export type EndpointCap = 'any' | 'teacher' | 'aggregate'
export const ENDPOINT_CAP: Record<EndpointName, EndpointCap> = {
  config: 'any',
  roster: 'any',
  entry: 'any',
  student: 'teacher',
  feedback: 'teacher',
  classOverview: 'teacher',
  classSubject: 'teacher',
  briefing: 'teacher',
  admin: 'aggregate',
}
export const capAllows = (v: V2Viewer, cap: EndpointCap): boolean => cap === 'any' || (cap === 'aggregate' ? isAggregateOnly(v) : !isAggregateOnly(v))
/* מנהל מול נקודת מורה → ERR_AGGREGATE_ONLY; מורה מול נקודת מנהל → ERR_NO_ACCESS */
export function requireCap(v: V2Viewer, ep: EndpointName): void {
  const cap = ENDPOINT_CAP[ep]
  if (capAllows(v, cap)) return
  throw new AppError(403, cap === 'aggregate' ? ERR_NO_ACCESS : ERR_AGGREGATE_ONLY)
}

/* פרסונות ההדגמה: מורה מקצועי אורח בוחר מקצוע; מלמד בכל הכיתות שיש בהן את המקצוע */
export const DEMO_SUBJECT_PERSONAS: SubjectCode[] = ['math', 'hebrew', 'history', 'science', 'english', 'bible']
export const DEMO_HOMEROOM_CLASS = 'c-v2'
