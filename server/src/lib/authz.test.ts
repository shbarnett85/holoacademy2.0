import { describe, it, expect, vi, beforeEach } from 'vitest'

/* fake מינימלי של supabase: טבלאות כמערכים + select/eq/in/maybeSingle/insert */
const h = vi.hoisted(() => {
  type Row = Record<string, unknown>
  const db: Record<string, Row[]> = {}
  /* שליטה בבדיקות היומן: האם הטבלה קיימת, והאם ה-insert נכשל (מחזיר error) או זורק (תקלת רשת) */
  const flags = { logTable: true, insertError: false, insertThrows: false }
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
      if (this.ins) {
        if (flags.insertThrows) return Promise.reject(new Error('network down')).then(ok, bad)
        if (flags.insertError) return Promise.resolve({ data: null, error: { message: 'insert failed' } }).then(ok, bad)
        tbl.push(...this.ins)
        return Promise.resolve({ data: null, error: null }).then(ok, bad)
      }
      const rows = tbl.filter((r) => this.filters.every((f) => f(r)))
      return Promise.resolve({ data: this.one ? (rows[0] ?? null) : rows, error: null }).then(ok, bad)
    }
  }
  return { db, flags, client: { from: (t: string) => new Q(t) } }
})

vi.mock('./supabase.js', () => ({ supabaseAdmin: h.client, supabaseAnon: {} }))
vi.mock('./activeColumn.js', () => ({ hasClassTeachers: async () => true, hasDataAccessLog: async () => h.flags.logTable }))

import {
  MIN_CELL_SIZE, studentScope, questVisible, canPatchLevels, classAccess, assignmentVisible, belowMinCell,
  loadViewer, logAccess, logAccessMany, canUseResults, canAssignToClass, submissionVisible, MSG_ACCESS_LOG_UNAVAILABLE, type Viewer, type TeachGrant,
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


/* ══════════════════════════════════════════════════════════════════════════════
   מטריצת הרשאות של טאב "תוצאות": תפקיד × (רשימה / מסך הדמיה / מסך תלמיד)
   · רשימה = השער canUseResults; מסך הדמיה = submissionVisible (שולח / יוצר / מחנך / מורה מקצוע בכיתה);
   · מסך תלמיד = אותה גישה לשליחה + התלמיד חבר בכיתת השליחה (הספק מחזיר 404 אחרת).
   ══════════════════════════════════════════════════════════════════════════════ */
describe('מטריצת הרשאות: תוצאות', () => {
  const OTHER = 'someone-else'
  const SENDER_ID = 'u-sender'
  const mathQuest = { subject_id: MATH, created_by: OTHER }
  const histQuest = { subject_id: HIST, created_by: OTHER }
  const unclassified = { subject_id: null, created_by: OTHER }

  /* מורה ששלח (user_id של ההקצאה) אך אינו מחנך ולא מורה המקצוע: שיוך כללי לכיתה */
  const sender = viewer('teacher', [grant(CLASS_A, { unspecified: true })], { userId: SENDER_ID })
  /* מורה שיצר את ההדמיה (created_by) ושלח מורה אחר */
  const creator = viewer('teacher', [grant(CLASS_A, { unspecified: true })], { userId: 'u-creator' })
  const sameSubject = mathTeacher
  const otherSubject = histTeacher
  const unlinked = viewer('teacher', [grant(CLASS_B, { homeroom: true })], { userId: 'u-unlinked' })
  /* גם אם הוא השולח/היוצר — בלי קישור לכיתה אין גישה */
  const unlinkedSender = viewer('teacher', [grant(CLASS_B, { homeroom: true })], { userId: SENDER_ID })

  type Case = readonly [string, Viewer, { subject_id: string | null; created_by: string | null }, string | null, boolean]
  const cases: Case[] = [
    ['מורה ששלח, בכיתה שלו, הדמיה במקצוע אחר', sender, histQuest, SENDER_ID, true],
    ['מורה ששלח — אך לא הוא השולח (שולח אחר)', sender, histQuest, OTHER, false],
    ['יוצר ההדמיה (לא השולח), בכיתה שלו', creator, { subject_id: HIST, created_by: 'u-creator' }, OTHER, true],
    ['מחנך הכיתה — כל שליחה, גם "לא סווג"', homeroom, unclassified, OTHER, true],
    ['מחנך הכיתה — שליחה של מורה אחר במקצוע אחר', homeroom, histQuest, OTHER, true],
    ['מורה מקצוע (אותו מקצוע)', sameSubject, mathQuest, OTHER, true],
    ['מורה מקצוע (מקצוע אחר)', otherSubject, mathQuest, OTHER, false],
    ['מורה מקצוע — הדמיה "לא סווג" שלא שלח ולא יצר', sameSubject, unclassified, OTHER, false],
    ['מורה שאינו מקושר לכיתה', unlinked, mathQuest, OTHER, false],
    ['מורה שאינו מקושר לכיתה, גם כשהוא השולח', unlinkedSender, mathQuest, SENDER_ID, false],
    ['מנהל', admin, mathQuest, OTHER, false],
    ['מנהל עירוני', municipal, mathQuest, OTHER, false],
    ['מנהל-על', superAdmin, unclassified, OTHER, true],
  ]

  describe('מסך הדמיה (submissionVisible)', () => {
    it.each(cases)('%s', (_n, v, quest, senderId, allowed) => {
      expect(submissionVisible(v, CLASS_A, quest, senderId)).toBe(allowed)
    })
  })

  describe('מסך תלמיד: גישה לשליחה + התלמיד בכיתת השליחה', () => {
    const studentView = (v: Viewer, quest: Case[2], senderId: string | null, studentClassIds: string[]) =>
      studentClassIds.includes(CLASS_A) && submissionVisible(v, CLASS_A, quest, senderId)
    it.each(cases)('%s', (_n, v, quest, senderId, allowed) => {
      expect(studentView(v, quest, senderId, [CLASS_A])).toBe(allowed)
    })
    it('תלמיד מכיתה אחרת — נדחה לכל תפקיד, גם מחנך ומנהל-על', () => {
      for (const v of [homeroom, sameSubject, sender, superAdmin]) expect(studentView(v, mathQuest, SENDER_ID, [CLASS_B])).toBe(false)
    })
  })

  describe('רשימה (canUseResults)', () => {
    it.each([
      ['מורה ששלח', sender, true], ['יוצר', creator, true], ['מחנך', homeroom, true],
      ['מורה מקצוע', sameSubject, true], ['מורה לא מקושר (הרשימה ריקה אצלו, אך השער פתוח)', unlinked, true],
      ['מנהל', admin, false], ['מנהל עירוני', municipal, false], ['מנהל-על', superAdmin, true],
    ] as const)('%s', (_n, v, allowed) => {
      expect(canUseResults(v)).toBe(allowed)
    })
  })

  it('מנהלים לעולם לא רואים שליחה, בכל כיתה ובכל מקצוע', () => {
    for (const q of [mathQuest, histQuest, unclassified, { subject_id: MATH, created_by: admin.userId }]) {
      for (const c of [CLASS_A, CLASS_B]) {
        expect(submissionVisible(admin, c, q, admin.userId)).toBe(false)
        expect(submissionVisible(municipal, c, q, municipal.userId)).toBe(false)
      }
    }
  })
})


/* ══════════════════════════════════════════════════════════════════════════════
   הקצאת הדמיה לכיתה (POST /quests/:id/assign): מי רשאי לשלוח לכיתה
   ══════════════════════════════════════════════════════════════════════════════ */
describe('מטריצת הרשאות: הקצאה לכיתה (canAssignToClass)', () => {
  const cls = { id: CLASS_A, school_id: SCHOOL }
  const otherSchool = { id: CLASS_A, school_id: 'school-2' }
  const noSchool = { id: CLASS_A, school_id: null }

  it.each([
    ['מחנך הכיתה', homeroom, cls, true],
    ['מורה מקצוע בכיתה', mathTeacher, cls, true],
    ['מורה עם שיוך כללי (בלי מקצוע)', legacyTeacher, cls, true],
    ['מורה שאינו משויך לכיתה (גם אם יצר את ההדמיה)', outsider, cls, false],
    ['מורה בלי שום שיוך', viewer('teacher'), cls, false],
    ['מנהל של בית הספר של הכיתה', admin, cls, true],
    ['מנהל עירוני של בית הספר של הכיתה', municipal, cls, true],
    ['מנהל מבית ספר אחר', admin, otherSchool, false],
    ['מנהל עירוני מארגון אחר', municipal, otherSchool, false],
    ['מנהל מול כיתה בלי בית ספר', admin, noSchool, false],
    ['מנהל-על — כל כיתה', superAdmin, otherSchool, true],
  ] as const)('%s', (_n, v, c, allowed) => {
    expect(canAssignToClass(v, c)).toBe(allowed)
  })

  it('מנהל בלי בית ספר (schoolId=null) לא מתאים לכיתה בלי בית ספר', () => {
    expect(canAssignToClass(viewer('admin', [], { schoolId: null }), noSchool)).toBe(false)
  })
})

/* ══════════════════════════════════════════════════════════════════════════════
   יומן גישה: הכנסה מרוכזת; למנהל-על נכשל סגור בקריאת נתוני תלמיד, לאחרים best-effort
   ══════════════════════════════════════════════════════════════════════════════ */
describe('יומן גישה לתוצאות', () => {
  const teacher = viewer('teacher', [grant(CLASS_A, { homeroom: true })])
  const entries = ['s1', 's2', 's3'].map((id) => ({ studentId: id, scope: 'results_class', endpoint: 'GET /api/results/submission/:id' }))

  beforeEach(() => {
    h.db.data_access_log = []
    h.flags.logTable = true
    h.flags.insertError = false
    h.flags.insertThrows = false
  })

  it('מסך הדמיה: שורה לכל תלמיד ברשימה, scope=results_class, עם התפקיד של הצופה', async () => {
    await logAccessMany(teacher, entries, { studentLevel: true })
    expect(h.db.data_access_log).toHaveLength(3)
    expect(h.db.data_access_log.map((r) => r.student_id)).toEqual(['s1', 's2', 's3'])
    expect(h.db.data_access_log.every((r) => r.scope === 'results_class' && r.viewer_id === teacher.userId && r.viewer_role === 'teacher')).toBe(true)
  })

  it('רשימה: שורה אחת בלי תלמיד (scope=results_list)', async () => {
    await logAccess(teacher, { scope: 'results_list', endpoint: 'GET /api/results/submissions' })
    expect(h.db.data_access_log).toEqual([{ viewer_id: teacher.userId, viewer_role: 'teacher', student_id: null, scope: 'results_list', endpoint: 'GET /api/results/submissions' }])
  })

  it('רשימה ריקה (כיתה בלי תלמידים): לא כותב כלום', async () => {
    await logAccessMany(teacher, [], { studentLevel: true })
    expect(h.db.data_access_log).toHaveLength(0)
  })

  it('הרבה תלמידים: ההכנסה מתחלקת לאצוות ואף שורה לא אובדת', async () => {
    const many = Array.from({ length: 1234 }, (_, i) => ({ studentId: `s${i}`, scope: 'results_class', endpoint: 'e' }))
    await logAccessMany(teacher, many, { studentLevel: true })
    expect(h.db.data_access_log).toHaveLength(1234)
  })

  describe('כשלון בכתיבה ליומן', () => {
    it.each([
      ['מחזיר שגיאה', () => { h.flags.insertError = true }],
      ['זורק (רשת)', () => { h.flags.insertThrows = true }],
      ['הטבלה חסרה', () => { h.flags.logTable = false }],
    ] as const)('מנהל-על + קריאת נתוני תלמיד (%s): נחסם 503 לפני שמחזירים נתונים', async (_n, breakIt) => {
      breakIt()
      await expect(logAccessMany(superAdmin, entries, { studentLevel: true })).rejects.toMatchObject({ status: 503, message: MSG_ACCESS_LOG_UNAVAILABLE })
      await expect(logAccess(superAdmin, entries[0], { studentLevel: true })).rejects.toMatchObject({ status: 503 })
    })

    it.each([
      ['מחזיר שגיאה', () => { h.flags.insertError = true }],
      ['זורק (רשת)', () => { h.flags.insertThrows = true }],
      ['הטבלה חסרה', () => { h.flags.logTable = false }],
    ] as const)('מורה (%s): best-effort — לא נחסם', async (_n, breakIt) => {
      breakIt()
      await expect(logAccessMany(teacher, entries, { studentLevel: true })).resolves.toBeUndefined()
      await expect(logAccess(teacher, entries[0], { studentLevel: true })).resolves.toBeUndefined()
    })

    it('מנהל-על בלי studentLevel (למשל רשימה): best-effort', async () => {
      h.flags.insertError = true
      await expect(logAccess(superAdmin, { scope: 'results_list', endpoint: 'e' })).resolves.toBeUndefined()
    })

    it('מנהל-על כשהיומן תקין: נרשם כרגיל', async () => {
      await logAccessMany(superAdmin, entries, { studentLevel: true })
      expect(h.db.data_access_log).toHaveLength(3)
      expect(h.db.data_access_log[0]).toMatchObject({ viewer_role: 'super_admin' })
    })
  })
})
