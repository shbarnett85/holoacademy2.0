import type { Request } from 'express'
import { supabaseAdmin } from './supabase.js'
import { AppError } from '../middleware/errors.js'
import { hasClassTeachers, hasDataAccessLog } from './activeColumn.js'

/* ══════════════════════════════════════════════════════════════════════════════
   authz — מודול ההרשאות המרכזי לאנליטיקה (חוק 12 ב-CLAUDE.md).
   כל נקודת קצה של אנליטיקה עוברת כאן; אין בדיקות הרשאה מפוזרות.

   המודל:
   · מורה מקצועי  — רק תלמידי הכיתות שלו, ורק המקצוע/ות שלו (class_teachers.subject_id).
                    מקצועות אחרים של התלמיד חוזרים כרשימת שמות בלבד (לאפור), בלי נתונים.
   · מחנך         — class_teachers.is_homeroom: כל המקצועות של תלמידי כיתתו.
   · קישור "ללא מקצוע" (subject_id NULL, לא מחנך) — מצב היסטורי: רואה רק את מה שיצר בעצמו.
   · admin / municipal_admin — אגרגטים בלבד, בסף מינימום (MIN_CELL_SIZE). אין פריט ברמת תלמיד.
   · super_admin  — מפעיל פלטפורמה: גישה מלאה, וכל צפייה ברמת תלמיד נרשמת ביומן.
   ══════════════════════════════════════════════════════════════════════════════ */

/* סף מינימום של תלמידים לתא באגרגט (מנהלים). קבוע תצורה יחיד. */
export const MIN_CELL_SIZE = 5

export type ViewerRole = 'teacher' | 'admin' | 'municipal_admin' | 'super_admin'

export interface TeachGrant {
  classId: string
  homeroom: boolean
  subjectIds: Set<string>
  /* קישור ללא מקצוע ובלי דגל מחנך (שיוך היסטורי) */
  unspecified: boolean
}

export interface Viewer {
  userId: string
  role: ViewerRole
  schoolId: string | null
  grants: Map<string, TeachGrant>
  /* האם הצופה רואה נתונים סינתטיים (ארגון הדגמה בלבד) */
  seesSynthetic: boolean
}

export const isSuper = (v: Viewer) => v.role === 'super_admin'
export const isAggregateOnly = (v: Viewer) => v.role === 'admin' || v.role === 'municipal_admin'

/* ── טווח הגישה של צופה לתלמיד אחד ── */
export type StudentScope =
  | { kind: 'denied'; reason: 'aggregate_only' | 'not_in_class' }
  | { kind: 'scoped'; full: boolean; subjectIds: Set<string>; own: boolean }

/* studentClassIds — הכיתות שהתלמיד חבר בהן */
export function studentScope(v: Viewer, studentClassIds: string[]): StudentScope {
  if (isSuper(v)) return { kind: 'scoped', full: true, subjectIds: new Set(), own: false }
  if (isAggregateOnly(v)) return { kind: 'denied', reason: 'aggregate_only' }
  let full = false
  let own = false
  let linked = false
  const subjectIds = new Set<string>()
  for (const cid of studentClassIds) {
    const g = v.grants.get(cid)
    if (!g) continue
    linked = true
    if (g.homeroom) full = true
    for (const s of g.subjectIds) subjectIds.add(s)
    if (g.unspecified) own = true
  }
  if (!linked) return { kind: 'denied', reason: 'not_in_class' }
  return { kind: 'scoped', full, subjectIds, own }
}

/* האם ההדמיה (לפי מקצוע/יוצר) גלויה בטווח הזה */
export function questVisible(scope: StudentScope, quest: { subject_id: string | null; created_by: string | null }, viewerId: string): boolean {
  if (scope.kind === 'denied') return false
  if (scope.full) return true
  if (quest.created_by !== null && quest.created_by === viewerId) return true
  return quest.subject_id !== null && scope.subjectIds.has(quest.subject_id)
}

/* עדכון רמות: מחנך (כל מקצוע + גלובלי), או מורה שמלמד את התלמיד באותו מקצוע */
export function canPatchLevels(scope: StudentScope, subjectId: string | null): boolean {
  if (scope.kind === 'denied') return false
  if (scope.full) return true
  return subjectId !== null && scope.subjectIds.has(subjectId)
}

/* ── גישה לכיתה (רמת אגרגט) ── */
export type ClassAccess = 'none' | 'super' | 'aggregate' | 'teacher'
export function classAccess(v: Viewer, cls: { id: string; school_id: string | null }): ClassAccess {
  if (isSuper(v)) return 'super'
  if (isAggregateOnly(v)) return cls.school_id !== null && cls.school_id === v.schoolId ? 'aggregate' : 'none'
  return v.grants.has(cls.id) ? 'teacher' : 'none'
}

/* הדמיה גלויה לצופה ברמת כיתה (דשבורד מטלה): מחנך הכיתה / מקצוע מתאים / יוצר ההדמיה.
   מנהלים רואים אגרגט של כל מטלה בבית הספר. */
export function assignmentVisible(v: Viewer, classId: string, quest: { subject_id: string | null; created_by: string | null }): boolean {
  if (isSuper(v) || isAggregateOnly(v)) return true
  const g = v.grants.get(classId)
  if (!g) return false
  if (g.homeroom) return true
  if (quest.created_by !== null && quest.created_by === v.userId) return true
  return quest.subject_id !== null && g.subjectIds.has(quest.subject_id)
}

/* תא קטן מדי — לא מציגים (מנהלים) */
export function belowMinCell(n: number): boolean {
  return n < MIN_CELL_SIZE
}

/* ── טעינת הצופה מה-DB (מקושרת ל-req כדי לא לשאול פעמיים בבקשה) ── */
const CACHE = Symbol('viewer')

export async function loadViewer(req: Request): Promise<Viewer> {
  const cached = (req as unknown as Record<symbol, Viewer | undefined>)[CACHE]
  if (cached) return cached
  const s = req.staff
  if (!s) throw new AppError(401, 'נדרשת התחברות צוות')
  const role = s.role as ViewerRole
  const grants = new Map<string, TeachGrant>()

  if (role === 'teacher') {
    if (await hasClassTeachers()) {
      const { data } = await supabaseAdmin.from('class_teachers').select('*').eq('teacher_id', s.userId)
      for (const r of (data ?? []) as { class_id: string; subject_id?: string | null; is_homeroom?: boolean }[]) {
        const g = grants.get(r.class_id) ?? { classId: r.class_id, homeroom: false, subjectIds: new Set<string>(), unspecified: false }
        if (r.is_homeroom) g.homeroom = true
        else if (r.subject_id) g.subjectIds.add(r.subject_id)
        else g.unspecified = true
        grants.set(r.class_id, g)
      }
    } else {
      /* לפני מיגרציית class_teachers: מורה הכיתה היחיד = מחנך (התנהגות קיימת) */
      const { data } = await supabaseAdmin.from('classes').select('id').eq('teacher_id', s.userId)
      for (const c of (data ?? []) as { id: string }[]) {
        grants.set(c.id, { classId: c.id, homeroom: true, subjectIds: new Set(), unspecified: false })
      }
    }
  }

  let seesSynthetic = false
  if (s.schoolId && role !== 'super_admin') {
    const { data } = await supabaseAdmin.from('schools').select('demo_data_enabled').eq('id', s.schoolId).maybeSingle()
    seesSynthetic = (data as { demo_data_enabled?: boolean } | null)?.demo_data_enabled === true
  }

  const v: Viewer = { userId: s.userId, role, schoolId: s.schoolId ?? null, grants, seesSynthetic }
  ;(req as unknown as Record<symbol, Viewer>)[CACHE] = v
  return v
}

/* כל התלמידים → כיתות (class_members) */
export async function classIdsOfStudent(studentId: string): Promise<string[]> {
  const { data } = await supabaseAdmin.from('class_members').select('class_id').eq('user_id', studentId)
  return ((data ?? []) as { class_id: string }[]).map((m) => m.class_id)
}

/* הרשאה לתלמיד — זורק 403 אם נדחה; מחזיר טווח + כיתות */
export async function requireStudentScope(req: Request, studentId: string): Promise<{ viewer: Viewer; scope: Extract<StudentScope, { kind: 'scoped' }>; classIds: string[] }> {
  const viewer = await loadViewer(req)
  const classIds = await classIdsOfStudent(studentId)
  const scope = studentScope(viewer, classIds)
  if (scope.kind === 'denied') {
    throw new AppError(403, scope.reason === 'aggregate_only'
      ? 'נתוני תלמיד בודד אינם זמינים לתפקיד זה — רק תמונות רחבות ומגמות'
      : 'אין לך גישה לתלמיד זה')
  }
  return { viewer, scope, classIds }
}

/* ── יומן גישה: כל צפייה/שינוי ברמת תלמיד. best-effort — לעולם לא מפיל בקשה. ── */
export async function logAccess(viewer: Viewer, entry: { studentId?: string | null; scope: string; endpoint: string }): Promise<void> {
  try {
    if (!(await hasDataAccessLog())) return
    await supabaseAdmin.from('data_access_log').insert({
      viewer_id: viewer.userId,
      viewer_role: viewer.role,
      student_id: entry.studentId ?? null,
      scope: entry.scope,
      endpoint: entry.endpoint,
    })
  } catch {
    /* יומן — best-effort */
  }
}
