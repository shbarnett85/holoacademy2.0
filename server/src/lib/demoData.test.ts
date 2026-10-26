import { describe, it, expect, vi, beforeEach } from 'vitest'

/* ── fake Supabase בזיכרון: טבלאות כמערכים + builder שרשרתי מינימלי ── */
const h = vi.hoisted(() => {
  type Row = Record<string, unknown>
  const db: Record<string, Row[]> = {}
  const reset = () => {
    for (const k of Object.keys(db)) delete db[k]
    for (const t of ['schools', 'users', 'classes', 'class_members', 'class_teachers', 'quests', 'assignments', 'sessions', 'events', 'difficulty_profiles', 'progress_snapshots', 'answers', 'level_history', 'student_subject_levels']) db[t] = []
  }
  let seq = 0
  const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`

  class Q {
    private op: 'select' | 'insert' | 'delete' = 'select'
    private filters: ((r: Row) => boolean)[] = []
    private payload: Row[] = []
    private sel = ''
    private conflictKey: string | null = null
    private lim = Infinity
    private shape: 'many' | 'single' | 'maybe' = 'many'
    constructor(private table: string) {}
    select(cols = '') { this.sel = cols; return this }
    insert(p: Row | Row[]) { this.op = 'insert'; this.payload = Array.isArray(p) ? p : [p]; return this }
    delete() { this.op = 'delete'; return this }
    /* upsert + ignoreDuplicates לפי עמודת onConflict יחידה */
    upsert(p: Row | Row[], o?: { onConflict?: string }) {
      this.op = 'insert'; this.payload = Array.isArray(p) ? p : [p]; this.conflictKey = o?.onConflict ?? null; return this
    }
    eq(k: string, v: unknown) { this.filters.push((r) => r[k] === v); return this }
    in(k: string, arr: unknown[]) { this.filters.push((r) => arr.includes(r[k])); return this }
    order() { return this }
    limit(n: number) { this.lim = n; return this }
    single() { this.shape = 'single'; return this }
    maybeSingle() { this.shape = 'maybe'; return this }
    private embed(r: Row): Row {
      if (this.table === 'class_members' && /users\(/.test(this.sel)) {
        return { ...r, users: db.users.find((u) => u.id === r.user_id) ?? null }
      }
      return r
    }
    private run(): { data: unknown; error: unknown } {
      const t = db[this.table]
      if (!t) return { data: null, error: { message: 'no table ' + this.table } }
      if (this.op === 'insert') {
        let incoming = this.payload
        if (this.conflictKey) {
          const k = this.conflictKey
          incoming = incoming.filter((p) => !t.some((r) => r[k] === p[k]))
        }
        const rows = incoming.map((p) => ({ id: uuid(), created_at: new Date().toISOString(), ...p }))
        t.push(...rows)
        const out = rows
        if (this.shape === 'single') return { data: out[0], error: null }
        return { data: this.sel ? out : null, error: null }
      }
      const match = t.filter((r) => this.filters.every((f) => f(r)))
      if (this.op === 'delete') {
        db[this.table] = t.filter((r) => !match.includes(r))
        return { data: null, error: null }
      }
      const rows = match.slice(0, this.lim).map((r) => this.embed(r))
      if (this.shape === 'single') return rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: 'not found' } }
      if (this.shape === 'maybe') return { data: rows[0] ?? null, error: null }
      return { data: rows, error: null }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    then(ok?: any, bad?: any) {
      return Promise.resolve(this.run()).then(ok, bad)
    }
  }
  const client = { from: (t: string) => new Q(t) }
  return { db, reset, uuid, client }
})

vi.mock('./supabase.js', () => ({ supabaseAdmin: h.client, supabaseAnon: {} }))
vi.mock('./activeColumn.js', () => {
  const yes = async () => true
  return {
    hasClassTeachers: yes, hasFictitious: yes, hasGradeLabel: yes, hasIsActive: yes,
    hasProgressSnapshots: yes, hasSessionCrystals: yes, hasUserGender: yes,
    hasQuestSubjectId: yes, hasSyntheticFlag: yes,
  }
})
vi.mock('./profileCalibration.js', () => ({
  recalibrateProfile: async (userId: string) => {
    if (!h.db.difficulty_profiles.some((p) => p.user_id === userId)) h.db.difficulty_profiles.push({ user_id: userId })
    return { skipping: false, profile: { textLevel: 5, perPuzzleLevel: {} } }
  },
}))

import {
  requireDemoScope, createFictitiousClass, addFictitiousStudents, refreshResults, deleteDemoData, tierOfStudentName,
  type DemoScope,
} from './demoData.js'
import { AppError } from '../middleware/errors.js'
import { CLASS_TIERS, type Tier } from './demoSim.js'
import type { StaffContext } from '../middleware/staffAuth.js'

const NESHER = 'school-nesher'
const OTHER = 'school-other'

function seedQuest(owner: string) {
  const id = h.uuid()
  const scenes = Array.from({ length: 6 }, (_, i) => ({
    id: 's' + i,
    puzzle: i < 4
      ? { type: 'multipleChoice', difficulty: 5, choices: ['a', 'b', 'c'].map((c, k) => ({ id: c, text: c, isCorrect: k === 0 })) }
      : i === 4 ? { type: 'memory', difficulty: 5 }
      : { type: 'finalQuiz', difficulty: 5, questions: [{ question: 'q', options: ['x', 'y', 'z'], correctIndex: 0 }] },
  }))
  h.db.quests.push({ id, title: 'שיעור ' + id.slice(-4), game_data: { scenes }, created_by: owner })
  return id
}

function staff(over: Partial<StaffContext>): StaffContext {
  return { userId: 't1', role: 'teacher', schoolId: NESHER, ...over } as StaffContext
}

beforeEach(() => {
  h.reset()
  h.db.schools.push({ id: NESHER, demo_data_enabled: true }, { id: OTHER, demo_data_enabled: false })
  h.db.users.push({ id: 't1', role: 'teacher', school_id: NESHER, name: 'מורה א' }, { id: 't2', role: 'teacher', school_id: NESHER, name: 'מורה ב' })
})

describe('בידוד ארגונים — שער השרת', () => {
  it('מורה בארגון אחר (demo_data_enabled=false) נדחה ב-403', async () => {
    await expect(requireDemoScope(staff({ schoolId: OTHER }))).rejects.toMatchObject({ status: 403 })
  })
  it('תלמיד / מנהל-על / בלי ארגון — נדחים', async () => {
    await expect(requireDemoScope(staff({ role: 'student' as never }))).rejects.toBeInstanceOf(AppError)
    await expect(requireDemoScope(staff({ role: 'super_admin' as never }))).rejects.toMatchObject({ status: 403 })
    await expect(requireDemoScope(staff({ schoolId: null as never }))).rejects.toMatchObject({ status: 403 })
    await expect(requireDemoScope(undefined)).rejects.toMatchObject({ status: 401 })
  })
  it('מורה ומנהל עירוני בארגון ההדגמה — מאושרים', async () => {
    await expect(requireDemoScope(staff({}))).resolves.toMatchObject({ schoolId: NESHER, role: 'teacher' })
    await expect(requireDemoScope(staff({ role: 'municipal_admin' }))).resolves.toMatchObject({ role: 'municipal_admin' })
  })
  it('אי אפשר להוסיף תלמידי דוגמה לכיתה אמיתית', async () => {
    const real = h.uuid()
    h.db.classes.push({ id: real, name: 'ז׳1', school_id: NESHER, is_fictitious: false, teacher_id: 't1' })
    h.db.class_teachers.push({ class_id: real, teacher_id: 't1' })
    const scope: DemoScope = { schoolId: NESHER, actorId: 't1', role: 'teacher' }
    await expect(addFictitiousStudents(scope, real, 3)).rejects.toMatchObject({ status: 403 })
    expect(h.db.users.filter((u) => u.is_fictitious)).toHaveLength(0)
  })
})

describe('יצירת כיתת דוגמה', () => {
  const scope: DemoScope = { schoolId: NESHER, actorId: 't1', role: 'teacher' }

  it('12 תלמידים פיקטיביים, בחלוקה 2/3/3/2/1/1, כולם מסומנים isFictitious', async () => {
    seedQuest('t1'); seedQuest('t1'); seedQuest('t1')
    const r = await createFictitiousClass(scope)
    expect(r.students).toBe(12)
    const students = h.db.users.filter((u) => u.role === 'student')
    expect(students).toHaveLength(12)
    expect(students.every((s) => s.is_fictitious === true && s.school_id === NESHER)).toBe(true)
    expect(students.every((s) => /דמו/.test(String(s.name)))).toBe(true)
    const tiers = students.map((s) => tierOfStudentName(String(s.name)))
    const count = (t: Tier) => tiers.filter((x) => x === t).length
    expect([count('strong'), count('good'), count('medium'), count('struggling'), count('inconsistent'), count('partial')]).toEqual([2, 3, 3, 2, 1, 1])
    expect(CLASS_TIERS.length).toBe(12)
    const cls = h.db.classes[0]
    expect(cls.is_fictitious).toBe(true)
  })

  it('ההקצאות נכתבות רק לכיתה הפיקטיבית ורק לשיעורים המוכנים של המורה', async () => {
    const mine = seedQuest('t1')
    seedQuest('t2') /* של מורה אחר — לא בהיקף */
    await createFictitiousClass(scope)
    expect(h.db.assignments.length).toBe(1)
    expect(h.db.assignments[0].quest_id).toBe(mine)
    expect(h.db.assignments[0].class_id).toBe(h.db.classes[0].id)
  })

  it('הסשנים והאירועים באותו מבנה כמו המסלול האמיתי (בלי נתיב מיוחד לדשבורד)', async () => {
    seedQuest('t1')
    await createFictitiousClass(scope)
    const completed = h.db.sessions.filter((s) => s.completed_at)
    expect(completed.length).toBeGreaterThan(8)
    for (const s of completed) {
      expect(s.is_fictitious).toBe(true)
      expect(typeof s.user_id).toBe('string')
      expect(s.max_score).toBe(6)
      expect(s.total_score).toBeLessThanOrEqual(6)
      const ev = h.db.events.filter((e) => e.session_id === s.id)
      const types = new Set(ev.map((e) => e.type))
      expect(types.has('session_completed')).toBe(true)
      expect(types.has('scene_enter')).toBe(true)
      expect(types.has('puzzle_solved') || types.has('puzzle_failed')).toBe(true)
      const puzzleEv = ev.filter((e) => e.type === 'puzzle_solved' || e.type === 'puzzle_failed')
      expect(puzzleEv).toHaveLength(6)
      for (const p of puzzleEv) {
        const pl = p.payload as Record<string, unknown>
        for (const k of ['puzzleType', 'difficulty', 'attempts', 'solveTimeMs', 'shards']) expect(pl).toHaveProperty(k)
      }
      const done = ev.find((e) => e.type === 'session_completed')!.payload as Record<string, unknown>
      for (const k of ['successRate', 'avgSceneMs', 'crystalsEarned', 'completed', 'durationMs', 'perType']) expect(done).toHaveProperty(k)
    }
    /* snapshot + פרופיל קושי נכתבו כמו אחרי complete אמיתי */
    expect(h.db.progress_snapshots.length).toBe(completed.length)
    expect(h.db.difficulty_profiles.length).toBeGreaterThan(0)
  })

  it('ה-payload זהה בדיוק למה שהזרימה האמיתית כותבת (שדות הבחירה אינם נכתבים; יחזרו ב-1B ל-answers)', async () => {
    seedQuest('t1')
    await createFictitiousClass(scope)
    const mc = h.db.events.filter((e) => (e.payload as { puzzleType?: string } | undefined)?.puzzleType === 'multipleChoice')
    expect(mc.length).toBeGreaterThan(10)
    const allowed = ['puzzleType', 'difficulty', 'attempts', 'solveTimeMs', 'shards'].sort()
    for (const e of mc) expect(Object.keys(e.payload as Record<string, unknown>).sort()).toEqual(allowed)
  })

  it('כל מה שנכתב מסומן is_synthetic (סשנים, אירועים, snapshots) והסקירה האמיתית יכולה לסנן', async () => {
    seedQuest('t1')
    await createFictitiousClass(scope)
    expect(h.db.sessions.length).toBeGreaterThan(0)
    expect(h.db.sessions.every((x) => x.is_synthetic === true)).toBe(true)
    expect(h.db.events.every((x) => x.is_synthetic === true)).toBe(true)
    expect(h.db.progress_snapshots.every((x) => x.is_synthetic === true)).toBe(true)
  })
})

describe('idempotency', () => {
  const scope: DemoScope = { schoolId: NESHER, actorId: 't1', role: 'teacher' }

  it('רענון חוזר לא יוצר סשנים/אירועים/הקצאות כפולים', async () => {
    seedQuest('t1'); seedQuest('t1')
    await createFictitiousClass(scope)
    const snap = { s: h.db.sessions.length, e: h.db.events.length, a: h.db.assignments.length, u: h.db.users.length, p: h.db.progress_snapshots.length }
    const r = await refreshResults(scope)
    expect(r.created).toBe(0)
    expect(r.skipped).toBeGreaterThan(0)
    expect({ s: h.db.sessions.length, e: h.db.events.length, a: h.db.assignments.length, u: h.db.users.length, p: h.db.progress_snapshots.length }).toEqual(snap)
  })

  it('שיעור חדש נוסף בלבד: רענון יוצר תוצאות רק עבורו', async () => {
    seedQuest('t1')
    await createFictitiousClass(scope)
    const before = h.db.sessions.length
    const fresh = seedQuest('t1')
    const r = await refreshResults(scope)
    expect(r.created).toBeGreaterThan(0)
    expect(h.db.sessions.length).toBeGreaterThan(before)
    const added = h.db.sessions.slice(before)
    expect(added.every((s) => s.quest_id === fresh)).toBe(true)
  })
})

describe('מחיקת נתוני דוגמה', () => {
  const scope: DemoScope = { schoolId: NESHER, actorId: 't1', role: 'teacher' }

  it('מוחקת רק רשומות isFictitious של המורה — נתונים אמיתיים ומורה אחר שלמים', async () => {
    const q = seedQuest('t1')
    seedQuest('t2')
    /* נתונים אמיתיים: כיתה + תלמיד + סשן + אירוע */
    const realClass = h.uuid(); const realStu = h.uuid(); const realSess = h.uuid()
    h.db.classes.push({ id: realClass, name: 'ח׳1', school_id: NESHER, is_fictitious: false })
    h.db.class_teachers.push({ class_id: realClass, teacher_id: 't1' })
    h.db.users.push({ id: realStu, role: 'student', name: 'תלמיד אמיתי', school_id: NESHER, is_fictitious: false })
    h.db.class_members.push({ class_id: realClass, user_id: realStu })
    h.db.sessions.push({ id: realSess, user_id: realStu, quest_id: q, is_fictitious: false, completed_at: 'x' })
    h.db.events.push({ session_id: realSess, user_id: realStu, type: 'session_completed' })
    h.db.difficulty_profiles.push({ user_id: realStu })

    await createFictitiousClass(scope)
    /* כיתת דוגמה של מורה אחר */
    await createFictitiousClass({ schoolId: NESHER, actorId: 't2', role: 'teacher' })
    const otherTeacherStudents = h.db.users.filter((u) => u.is_fictitious).length

    const out = await deleteDemoData(scope)
    expect(out.students).toBe(12)
    expect(out.classes).toBe(1)

    /* האמיתי נשאר */
    expect(h.db.classes.some((c) => c.id === realClass)).toBe(true)
    expect(h.db.users.some((u) => u.id === realStu)).toBe(true)
    expect(h.db.sessions.some((s) => s.id === realSess)).toBe(true)
    expect(h.db.events.some((e) => e.session_id === realSess)).toBe(true)
    expect(h.db.difficulty_profiles.some((p) => p.user_id === realStu)).toBe(true)
    expect(h.db.class_members.some((m) => m.user_id === realStu)).toBe(true)
    /* המורים נשארים */
    expect(h.db.users.filter((u) => u.role === 'teacher')).toHaveLength(2)
    /* הדוגמה של מורה אחר שלמה */
    expect(h.db.users.filter((u) => u.is_fictitious)).toHaveLength(otherTeacherStudents - 12)
    expect(h.db.sessions.filter((s) => s.is_fictitious).length).toBeGreaterThan(0)
    /* שלי נמחק לגמרי */
    const mineClasses = h.db.classes.filter((c) => c.is_fictitious && h.db.class_teachers.some((l) => l.class_id === c.id && l.teacher_id === 't1'))
    expect(mineClasses).toHaveLength(0)
  })

  it('מנהל עירוני מוחק את כל נתוני הדוגמה של הארגון, ושום דבר אחר', async () => {
    seedQuest('t1'); seedQuest('t2')
    await createFictitiousClass(scope)
    await createFictitiousClass({ schoolId: NESHER, actorId: 't2', role: 'teacher' })
    h.db.users.push({ id: 'real-stu', role: 'student', name: 'אמיתי', school_id: NESHER, is_fictitious: false })
    await deleteDemoData({ schoolId: NESHER, actorId: 'admin1', role: 'municipal_admin' })
    expect(h.db.users.filter((u) => u.is_fictitious)).toHaveLength(0)
    expect(h.db.sessions.filter((s) => s.is_fictitious)).toHaveLength(0)
    expect(h.db.classes.filter((c) => c.is_fictitious)).toHaveLength(0)
    expect(h.db.events).toHaveLength(0)
    expect(h.db.users.some((u) => u.id === 'real-stu')).toBe(true)
    expect(h.db.quests).toHaveLength(2)
  })

  it('כשאין נתוני דוגמה — לא נוגעת בכלום', async () => {
    seedQuest('t1')
    const before = JSON.stringify(h.db)
    const out = await deleteDemoData(scope)
    expect(out).toEqual({ classes: 0, students: 0, sessions: 0 })
    expect(JSON.stringify(h.db)).toBe(before)
  })
})
