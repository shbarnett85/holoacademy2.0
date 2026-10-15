import { describe, it, expect, vi, beforeEach } from 'vitest'

/* fake מינימלי של supabase: טבלאות כמערכים + select/eq/in/maybeSingle/insert */
const h = vi.hoisted(() => {
  type Row = Record<string, unknown>
  const db: Record<string, Row[]> = {}
  class Q {
    private filters: ((r: Row) => boolean)[] = []
    private one = false
    private ins: Row[] | null = null
    constructor(private t: string) {}
    select() { return this }
    insert(p: Row | Row[]) { this.ins = Array.isArray(p) ? p : [p]; return this }
    eq(k: string, v: unknown) { this.filters.push((r) => r[k] === v); return this }
    in(k: string, a: unknown[]) { this.filters.push((r) => a.includes(r[k])); return this }
    maybeSingle() { this.one = true; return this }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    then(ok?: any, bad?: any) {
      const tbl = db[this.t]
      if (!tbl) return Promise.resolve({ data: null, error: { message: 'no table' } }).then(ok, bad)
      if (this.ins) { tbl.push(...this.ins); return Promise.resolve({ data: null, error: null }).then(ok, bad) }
      const rows = tbl.filter((r) => this.filters.every((f) => f(r)))
      return Promise.resolve({ data: this.one ? (rows[0] ?? null) : rows, error: null }).then(ok, bad)
    }
  }
  return { db, client: { from: (t: string) => new Q(t) } }
})

vi.mock('./supabase.js', () => ({ supabaseAdmin: h.client, supabaseAnon: {} }))
vi.mock('./activeColumn.js', () => ({ hasClassTeachers: async () => true, hasDataAccessLog: async () => true }))

import {
  MIN_CELL_SIZE, studentScope, questVisible, canPatchLevels, classAccess, assignmentVisible, belowMinCell,
  loadViewer, logAccess, type Viewer, type TeachGrant,
} from './authz.js'
import type { Request } from 'express'

const MATH = 'subj-math'
const HIST = 'subj-history'
const CLASS_A = 'class-A'    // הכיתה של התלמיד
const CLASS_B = 'class-B'    // כיתה אחרת (התלמיד לא בה)
const SCHOOL = 'school-1'

const grant = (classId: string, o: Partial<TeachGrant> = {}): TeachGrant => ({ classId, homeroom: false, subjectIds: new Set(), unspecified: false, ...o })
const viewer = (role: Viewer['role'], grants: TeachGrant[] = [], over: Partial<Viewer> = {}): Viewer => ({
  userId: 'u-' + role, role, schoolId: SCHOOL, grants: new Map(grants.map((g) => [g.classId, g])), seesSynthetic: false, ...over,
})

const homeroom = viewer('teacher', [grant(CLASS_A, { homeroom: true })])
const mathTeacher = viewer('teacher', [grant(CLASS_A, { subjectIds: new Set([MATH]) })])
const histTeacher = viewer('teacher', [grant(CLASS_A, { subjectIds: new Set([HIST]) })])
const legacyTeacher = viewer('teacher', [grant(CLASS_A, { unspecified: true })])
const outsider = viewer('teacher', [grant(CLASS_B, { homeroom: true })])  // מחנך של כיתה אחרת
const admin = viewer('admin')
const municipal = viewer('municipal_admin')
const superAdmin = viewer('super_admin', [], { schoolId: null })

const studentClasses = [CLASS_A]

describe('מטריצת הרשאות: תפקיד × פעולה × (בכיתה/לא) × (המקצוע שלו/אחר)', () => {
  describe('גישה לפריט ברמת תלמיד', () => {
    it.each([
      ['מחנך הכיתה', homeroom, true],
      ['מורה מתמטיקה בכיתה', mathTeacher, true],
      ['מורה היסטוריה בכיתה', histTeacher, true],
      ['מורה עם שיוך היסטורי (בלי מקצוע)', legacyTeacher, true],
      ['מחנך של כיתה אחרת (התלמיד לא בכיתתו)', outsider, false],
      ['מנהל', admin, false],
      ['מנהל עירוני', municipal, false],
      ['מנהל-על (מפעיל פלטפורמה)', superAdmin, true],
    ] as const)('%s', (_n, v, allowed) => {
      const sc = studentScope(v, studentClasses)
      expect(sc.kind === 'scoped').toBe(allowed)
    })

    it('מנהלים נחסמים בגלל "אגרגטים בלבד"; מורה מחוץ לכיתה בגלל "לא בכיתה"', () => {
      expect(studentScope(admin, studentClasses)).toEqual({ kind: 'denied', reason: 'aggregate_only' })
      expect(studentScope(municipal, studentClasses)).toEqual({ kind: 'denied', reason: 'aggregate_only' })
      expect(studentScope(outsider, studentClasses)).toEqual({ kind: 'denied', reason: 'not_in_class' })
    })
  })

  describe('איזה מקצועות רואים (הדמיה במקצוע X)', () => {
    const mathQuest = { subject_id: MATH, created_by: 'someone-else' }
    const histQuest = { subject_id: HIST, created_by: 'someone-else' }
    const unclassified = { subject_id: null, created_by: 'someone-else' }

    it('מחנך רואה את כל המקצועות, כולל "לא סווג"', () => {
      const sc = studentScope(homeroom, studentClasses)
      for (const q of [mathQuest, histQuest, unclassified]) expect(questVisible(sc, q, homeroom.userId)).toBe(true)
    })
    it('מורה מתמטיקה רואה רק מתמטיקה', () => {
      const sc = studentScope(mathTeacher, studentClasses)
      expect(questVisible(sc, mathQuest, mathTeacher.userId)).toBe(true)
      expect(questVisible(sc, histQuest, mathTeacher.userId)).toBe(false)
      expect(questVisible(sc, unclassified, mathTeacher.userId)).toBe(false)
    })
    it('מורה רואה הדמיה שיצר בעצמו גם אם אינה במקצועו המוגדר', () => {
      const sc = studentScope(mathTeacher, studentClasses)
      expect(questVisible(sc, { subject_id: HIST, created_by: mathTeacher.userId }, mathTeacher.userId)).toBe(true)
    })
    it('שיוך היסטורי (בלי מקצוע) רואה רק מה שיצר', () => {
      const sc = studentScope(legacyTeacher, studentClasses)
      expect(questVisible(sc, mathQuest, legacyTeacher.userId)).toBe(false)
      expect(questVisible(sc, { subject_id: MATH, created_by: legacyTeacher.userId }, legacyTeacher.userId)).toBe(true)
    })
    it('מנהלים לא רואים שום פריט ברמת תלמיד', () => {
      expect(questVisible(studentScope(admin, studentClasses), mathQuest, admin.userId)).toBe(false)
      expect(questVisible(studentScope(municipal, studentClasses), mathQuest, municipal.userId)).toBe(false)
    })
  })

  describe('עדכון רמות (PATCH)', () => {
    it('מחנך: מקצוע כלשהו וגם גלובלי', () => {
      const sc = studentScope(homeroom, studentClasses)
      expect(canPatchLevels(sc, MATH)).toBe(true)
      expect(canPatchLevels(sc, HIST)).toBe(true)
      expect(canPatchLevels(sc, null)).toBe(true)
    })
    it('מורה מתמטיקה: רק מתמטיקה — לא היסטוריה ולא גלובלי', () => {
      const sc = studentScope(mathTeacher, studentClasses)
      expect(canPatchLevels(sc, MATH)).toBe(true)
      expect(canPatchLevels(sc, HIST)).toBe(false)
      expect(canPatchLevels(sc, null)).toBe(false)
    })
    it('שיוך היסטורי בלי מקצוע, מחוץ לכיתה ומנהלים — אסור', () => {
      expect(canPatchLevels(studentScope(legacyTeacher, studentClasses), MATH)).toBe(false)
      expect(canPatchLevels(studentScope(outsider, studentClasses), MATH)).toBe(false)
      expect(canPatchLevels(studentScope(admin, studentClasses), MATH)).toBe(false)
      expect(canPatchLevels(studentScope(municipal, studentClasses), null)).toBe(false)
    })
  })

  describe('גישה לכיתה (אגרגט) ולמטלה', () => {
    const cls = { id: CLASS_A, school_id: SCHOOL }
    const otherSchoolCls = { id: CLASS_A, school_id: 'school-2' }
    it('מורה — רק כיתות שהוא משויך אליהן; מנהל — רק בבית ספרו', () => {
      expect(classAccess(homeroom, cls)).toBe('teacher')
      expect(classAccess(outsider, cls)).toBe('none')
      expect(classAccess(admin, cls)).toBe('aggregate')
      expect(classAccess(admin, otherSchoolCls)).toBe('none')
      expect(classAccess(municipal, otherSchoolCls)).toBe('none')
      expect(classAccess(superAdmin, otherSchoolCls)).toBe('super')
    })
    it('מטלה: מורה מתמטיקה רואה מתמטיקה בלבד; מחנך הכול; מנהל — אגרגט של כל מטלה בבית ספרו', () => {
      const m = { subject_id: MATH, created_by: 'x' }
      const hq = { subject_id: HIST, created_by: 'x' }
      expect(assignmentVisible(mathTeacher, CLASS_A, m)).toBe(true)
      expect(assignmentVisible(mathTeacher, CLASS_A, hq)).toBe(false)
      expect(assignmentVisible(homeroom, CLASS_A, hq)).toBe(true)
      expect(assignmentVisible(outsider, CLASS_A, m)).toBe(false)
      expect(assignmentVisible(admin, CLASS_A, hq)).toBe(true)
    })
  })

  describe('סף מינימום לתא', () => {
    it(`מתחת ל-${MIN_CELL_SIZE} מוסתר, ${MIN_CELL_SIZE} ומעלה מוצג`, () => {
      expect(MIN_CELL_SIZE).toBe(5)
      expect(belowMinCell(0)).toBe(true)
      expect(belowMinCell(4)).toBe(true)
      expect(belowMinCell(5)).toBe(false)
      expect(belowMinCell(30)).toBe(false)
    })
  })
})

describe('loadViewer — טעינת טווח הרשאות מ-class_teachers', () => {
  const req = (staff: Record<string, unknown>) => ({ staff } as unknown as Request)

  beforeEach(() => {
    for (const k of Object.keys(h.db)) delete h.db[k]
    h.db.class_teachers = [
      { class_id: CLASS_A, teacher_id: 't-home', is_homeroom: true, subject_id: null },
      { class_id: CLASS_A, teacher_id: 't-math', is_homeroom: false, subject_id: MATH },
      { class_id: CLASS_A, teacher_id: 't-math', is_homeroom: false, subject_id: HIST },
      { class_id: CLASS_B, teacher_id: 't-legacy', is_homeroom: false, subject_id: null },
    ]
    h.db.schools = [{ id: 'demo-org', demo_data_enabled: true }, { id: SCHOOL, demo_data_enabled: false }]
    h.db.data_access_log = []
  })

  it('מחנך, מורה רב-מקצועי ושיוך היסטורי נטענים נכון', async () => {
    const home = await loadViewer(req({ userId: 't-home', role: 'teacher', schoolId: SCHOOL }))
    expect(home.grants.get(CLASS_A)?.homeroom).toBe(true)
    const math = await loadViewer(req({ userId: 't-math', role: 'teacher', schoolId: SCHOOL }))
    expect([...math.grants.get(CLASS_A)!.subjectIds].sort()).toEqual([HIST, MATH].sort())
    expect(math.grants.get(CLASS_A)?.homeroom).toBe(false)
    const legacy = await loadViewer(req({ userId: 't-legacy', role: 'teacher', schoolId: SCHOOL }))
    expect(legacy.grants.get(CLASS_B)?.unspecified).toBe(true)
  })

  it('נתונים סינתטיים נראים רק בארגון הדגמה', async () => {
    const inDemo = await loadViewer(req({ userId: 't-home', role: 'teacher', schoolId: 'demo-org' }))
    expect(inDemo.seesSynthetic).toBe(true)
    const elsewhere = await loadViewer(req({ userId: 't-home', role: 'teacher', schoolId: SCHOOL }))
    expect(elsewhere.seesSynthetic).toBe(false)
    const sup = await loadViewer(req({ userId: 'su', role: 'super_admin', schoolId: null }))
    expect(sup.seesSynthetic).toBe(false)
  })

  it('כל צפייה ברמת תלמיד נרשמת ב-data_access_log', async () => {
    const v = await loadViewer(req({ userId: 't-home', role: 'teacher', schoolId: SCHOOL }))
    await logAccess(v, { studentId: 'stu-1', scope: 'student_detail', endpoint: 'GET /student/:id' })
    expect(h.db.data_access_log).toHaveLength(1)
    expect(h.db.data_access_log[0]).toMatchObject({ viewer_id: 't-home', viewer_role: 'teacher', student_id: 'stu-1', scope: 'student_detail' })
  })
})
