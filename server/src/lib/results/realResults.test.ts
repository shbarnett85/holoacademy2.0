import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Request } from 'express'
import { MIN_CELL_SIZE } from '../authz.js'
import { ClassSubmissionViewSchema, StudentSubmissionViewSchema, SubmissionListSchema } from '../../../../src/shared/types/resultsV1.js'

/* ══════════════════════════════════════════════════════════════════════════
   הספק האמיתי של התוצאות מול DB מדומה בזיכרון: הרשאות, 404 אחיד, תקרות, יומן גישה, גרסאות אישיות, ההרצה שנספרת, בסיס החזרה.
   (הבדיקה החיה מול Supabase היא npm run results:accept.)
   ══════════════════════════════════════════════════════════════════════════ */

type Row = Record<string, unknown>
const h = vi.hoisted(() => {
  const db: Record<string, Row[]> = {}
  const calls: string[] = []
  const flags = { insertError: false }
  const limits: Record<string, number> = {}

  class Q {
    private filters: ((r: Row) => boolean)[] = []
    private orders: { col: string; asc: boolean }[] = []
    private lim: number | null = null
    private rng: [number, number] | null = null
    private one = false
    private ins: Row[] | null = null
    private cols = ''
    constructor(private t: string) { calls.push(t) }
    select(c = '*') { this.cols = c; return this }
    insert(p: Row | Row[]) { this.ins = Array.isArray(p) ? p : [p]; return this }
    eq(k: string, v: unknown) { this.filters.push((r) => r[k] === v); return this }
    in(k: string, a: unknown[]) { this.filters.push((r) => a.includes(r[k])); return this }
    is(k: string, v: unknown) { this.filters.push((r) => (r[k] ?? null) === v); return this }
    not(k: string, _op: string, v: unknown) { this.filters.push((r) => (r[k] ?? null) !== v); return this }
    order(col: string, o?: { ascending?: boolean }) { this.orders.push({ col, asc: o?.ascending !== false }); return this }
    limit(n: number) { this.lim = n; limits[this.t] = n; return this }
    range(a: number, b: number) { this.rng = [a, b]; return this }
    maybeSingle() { this.one = true; return this }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    then(ok?: any, bad?: any) {
      const tbl = db[this.t]
      if (!tbl) return Promise.resolve({ data: null, error: { message: `no table ${this.t}` } }).then(ok, bad)
      if (this.ins) {
        if (flags.insertError) return Promise.resolve({ data: null, error: { message: 'insert failed' } }).then(ok, bad)
        tbl.push(...this.ins)
        return Promise.resolve({ data: null, error: null }).then(ok, bad)
      }
      let rows = tbl.filter((r) => this.filters.every((f) => f(r)))
      for (const { col, asc } of [...this.orders].reverse()) {
        rows = [...rows].sort((a, b) => {
          const x = a[col] as string | number | null | undefined, y = b[col] as string | number | null | undefined
          if (x == null && y == null) return 0
          if (x == null) return 1
          if (y == null) return -1
          return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1)
        })
      }
      if (this.rng) rows = rows.slice(this.rng[0], this.rng[1] + 1)
      if (this.lim !== null) rows = rows.slice(0, this.lim)
      /* join מוטמע: class_members.select('class_id, users(...)') */
      if (this.t === 'class_members' && /users\(/.test(this.cols)) {
        rows = rows.map((r) => ({ ...r, users: (db.users ?? []).find((u) => u.id === r.user_id) ?? null }))
      }
      return Promise.resolve({ data: this.one ? (rows[0] ?? null) : rows, error: null }).then(ok, bad)
    }
  }
  return { db, calls, flags, limits, client: { from: (t: string) => new Q(t) } }
})

vi.mock('../supabase.js', () => ({ supabaseAdmin: h.client, supabaseAnon: {} }))
vi.mock('../activeColumn.js', () => ({
  hasAnswersTable: async () => true, hasFictitious: async () => false, hasIsActive: async () => true, hasMisconceptionLinks: async () => false,
  hasMisconceptions: async () => true, hasMoralChoices: async () => true, hasOptionTags: async () => true, hasQuestSubject: async () => false,
  hasQuestSubjectId: async () => true, hasQuestVariants: async () => true, hasSyntheticFlag: async () => true,
  hasClassTeachers: async () => true, hasDataAccessLog: async () => true,
}))
vi.mock('../subjects.js', () => ({
  questSubjectOut: async (r: { subject_id?: string | null }) => (r.subject_id ? { subject: 'מדעים', subjectCode: 'science' } : { subject: null, subjectCode: null }),
}))

import { ASSIGNMENT_SCAN_CAP, loadReviewBasis, openSubmissionForSummary, realResultsProvider } from './realResults.js'

const uid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const SCHOOL = uid(1), C1 = uid(10), C2 = uid(11)
const T_HOME = uid(20), T_SCI = uid(21), T_OUT = uid(22), ADMIN = uid(23), SUPER = uid(24)
const SCI = uid(60), Q1 = uid(40), A1 = uid(50), V1 = uid(70)
const STU = [30, 31, 32, 33, 34, 35].map(uid)
const NAMES = ['אבי כהן', 'בני לוי', 'גלית ברק', 'דנה רז', 'הדס שמש', 'ויקטור נחום']
const STU_OTHER = uid(39)
const NIL = uid(999)

const GAME = {
  entrySceneId: 's0',
  scenes: [
    { id: 's0', title: 'פתיחה', narrative: 'מילה אחת שתיים שלוש' },
    { id: 's1', title: 'מצב הצבירה', puzzle: { type: 'multipleChoice', question: 'מה מצב הצבירה של קרח?', choices: [
      { id: 'a', text: 'מוצק', isCorrect: true }, { id: 'b', text: 'נוזל', isCorrect: false }, { id: 'c', text: 'גז', isCorrect: false },
    ] } },
  ],
}
const VARIANT_GAME = {
  entrySceneId: 's0',
  scenes: [
    { id: 's0', title: 'פתיחה', narrative: 'מילה' },
    { id: 's1', title: 'מצב הצבירה', puzzle: { type: 'multipleChoice', question: 'מה קורה למים כשהם קופאים?', choices: [
      { id: 'a', text: 'גז', isCorrect: false }, { id: 'b', text: 'מוצק', isCorrect: true }, { id: 'c', text: 'נוזל', isCorrect: false }, { id: 'd', text: 'פלזמה', isCorrect: false },
    ] } },
  ],
}

let seq = 0
const ins = (table: string, rows: Row[]): void => { h.db[table].push(...rows.map((r) => ({ id: `r${++seq}`, ...r }))) }
const session = (id: string, user: string, done: boolean, startedAt = '2026-10-11T08:00:00Z'): Row =>
  ({ id, user_id: user, quest_id: Q1, started_at: startedAt, completed_at: done ? '2026-10-11T08:20:00Z' : null, is_synthetic: false })
const answer = (sessionId: string, student: string, opt: string | null, outcome: string, extra: Row = {}): Row => ({
  client_event_id: `${sessionId}:s1:0:0`, session_id: sessionId, student_id: student, class_id: C1, quest_id: Q1, scene_id: 's1', item_index: 0, puzzle_type: 'multipleChoice',
  selected_option_id: opt, is_correct: outcome === 'correct', attempt_no: 1, response_ms: 5000, outcome, variant_id: null, is_synthetic: false, created_at: '2026-10-11T08:10:00Z', ...extra,
})
const solvedEvent = (sessionId: string, student: string, ok: boolean): Row =>
  ({ session_id: sessionId, user_id: student, quest_id: Q1, type: ok ? 'puzzle_solved' : 'puzzle_failed', scene_id: 's1', payload: { attempts: 1, solveTimeMs: 6000 }, is_synthetic: false })

function reset(): void {
  for (const k of Object.keys(h.db)) delete h.db[k]
  for (const t of ['schools', 'classes', 'class_teachers', 'users', 'class_members', 'quests', 'assignments', 'sessions', 'events', 'answers', 'quest_variants', 'option_tags', 'misconceptions', 'moral_choices', 'data_access_log']) h.db[t] = []
  h.calls.length = 0
  h.flags.insertError = false
  for (const k of Object.keys(h.limits)) delete h.limits[k]
  seq = 0
  ins('schools', [{ id: SCHOOL, demo_data_enabled: false }])
  ins('classes', [{ id: C1, name: 'ו׳2', grade_label: 'ו׳2', school_id: SCHOOL }, { id: C2, name: 'ז׳1', grade_label: 'ז׳1', school_id: SCHOOL }])
  ins('class_teachers', [
    { class_id: C1, teacher_id: T_HOME, is_homeroom: true, subject_id: null },
    { class_id: C1, teacher_id: T_SCI, is_homeroom: false, subject_id: SCI },
    { class_id: C2, teacher_id: T_OUT, is_homeroom: true, subject_id: null },
  ])
  ins('users', [
    ...[[T_HOME, 'מחנך'], [T_SCI, 'מורה מדעים'], [T_OUT, 'מורה אחר']].map(([id, name]) => ({ id, name, role: 'teacher', school_id: SCHOOL, is_active: true })),
    ...STU.map((id, i) => ({ id, name: NAMES[i], role: 'student', school_id: SCHOOL, is_active: true })),
    { id: STU_OTHER, name: 'תלמיד אחר', role: 'student', school_id: SCHOOL, is_active: true },
  ])
  ins('class_members', [...STU.map((id) => ({ class_id: C1, user_id: id })), { class_id: C2, user_id: STU_OTHER }])
  ins('quests', [{ id: Q1, title: 'מסע המים', created_by: T_SCI, subject_id: SCI, game_data: GAME }])
  ins('assignments', [{ id: A1, quest_id: Q1, class_id: C1, user_id: T_SCI, created_at: '2026-10-10T08:00:00Z' }])
}

const req = (userId: string, role: 'teacher' | 'admin' | 'municipal_admin' | 'super_admin' = 'teacher'): Request =>
  ({ staff: { userId, role, schoolId: role === 'super_admin' ? null : SCHOOL, name: 'x', authId: 'x', canShare: true } }) as unknown as Request
const fail = async (p: Promise<unknown>): Promise<{ status: number; message: string }> => {
  try { await p } catch (e) { return e as { status: number; message: string } }
  throw new Error('expected a rejection')
}
const HEAVY = ['sessions', 'answers', 'events', 'option_tags', 'moral_choices', 'quest_variants']

beforeEach(reset)

describe('שליחה שאינה גלויה: אותו 404 כמו שליחה שאינה קיימת (אין אורקל קיום)', () => {
  it('מסך הדמיה: לא קיימת = לא גלויה (מורה שאינו משויך לכיתה) — אותו סטטוס ואותה הודעה', async () => {
    const missing = await fail(realResultsProvider.classView(req(T_OUT), NIL))
    const invisible = await fail(realResultsProvider.classView(req(T_OUT), A1))
    expect(invisible).toMatchObject({ status: 404, message: missing.message })
    expect(missing.status).toBe(404)
    const malformed = await fail(realResultsProvider.classView(req(T_OUT), 'not-a-uuid'))
    expect(malformed).toMatchObject({ status: 404, message: missing.message })
  })

  it('מסך תלמיד: אותו דבר', async () => {
    const missing = await fail(realResultsProvider.studentView(req(T_OUT), NIL, STU[0]))
    const invisible = await fail(realResultsProvider.studentView(req(T_OUT), A1, STU[0]))
    expect(invisible).toMatchObject({ status: 404, message: missing.message })
  })

  it('מורה מקצוע של מקצוע אחר ושולח שאינו המקצוע: 404 (לא 403)', async () => {
    ins('class_teachers', [{ class_id: C1, teacher_id: T_OUT, is_homeroom: false, subject_id: uid(61) }])
    expect((await fail(realResultsProvider.classView(req(T_OUT), A1))).status).toBe(404)
  })

  it('403 נשאר רק לתפקיד שאין לו תוצאות בכלל (מנהל / מנהל עירוני) — גם על מזהה שאינו קיים', async () => {
    for (const role of ['admin', 'municipal_admin'] as const) {
      expect((await fail(realResultsProvider.classView(req(ADMIN, role), A1))).status).toBe(403)
      expect((await fail(realResultsProvider.classView(req(ADMIN, role), NIL))).status).toBe(403)
      expect((await fail(realResultsProvider.list(req(ADMIN, role), {}))).status).toBe(403)
    }
  })

  it('מורה גלוי (מחנך, יוצר-ושולח, מנהל-על): 200', async () => {
    for (const r of [req(T_HOME), req(T_SCI), req(SUPER, 'super_admin')]) {
      const v = await realResultsProvider.classView(r, A1)
      expect(v.head.id).toBe(A1)
      expect(ClassSubmissionViewSchema.safeParse(v).success).toBe(true)
    }
  })
})

describe('מסך תלמיד: חברות ברשימה נבדקת לפני טעינת נתוני הכיתה', () => {
  it('תלמיד מכיתה אחרת / לא קיים / מזהה פגום: 404, ובלי אף שאילתה כבדה', async () => {
    for (const sid of [STU_OTHER, NIL, 'not-a-uuid']) {
      h.calls.length = 0
      expect((await fail(realResultsProvider.studentView(req(T_HOME), A1, sid))).status).toBe(404)
      for (const t of HEAVY) expect(h.calls, `${t} (${sid})`).not.toContain(t)
    }
  })

  it('תלמיד מושבת ברשימה: 404', async () => {
    h.db.users.find((u) => u.id === STU[2])!.is_active = false
    expect((await fail(realResultsProvider.studentView(req(T_HOME), A1, STU[2]))).status).toBe(404)
  })

  it('תלמיד בכיתה: 200 וטוען את הנתונים', async () => {
    const v = await realResultsProvider.studentView(req(T_HOME), A1, STU[0])
    expect(v.student).toMatchObject({ id: STU[0], name: NAMES[0] })
    expect(StudentSubmissionViewSchema.safeParse(v).success).toBe(true)
    expect(h.calls).toContain('sessions')
  })
})

describe('יומן גישה', () => {
  it('מסך הדמיה: שורה לכל תלמיד ברשימה (results_class)', async () => {
    await realResultsProvider.classView(req(T_HOME), A1)
    const rows = h.db.data_access_log
    expect(rows).toHaveLength(STU.length)
    expect(rows.every((r) => r.scope === 'results_class' && r.viewer_id === T_HOME)).toBe(true)
    expect(rows.map((r) => r.student_id).sort()).toEqual([...STU].sort())
  })

  it('רשימה: שורה אחת בלי תלמיד (results_list)', async () => {
    await realResultsProvider.list(req(T_HOME), {})
    expect(h.db.data_access_log).toHaveLength(1)
    expect(h.db.data_access_log[0]).toMatchObject({ scope: 'results_list', student_id: null, viewer_id: T_HOME })
  })

  it('מסך תלמיד: שורה אחת עם התלמיד (results)', async () => {
    await realResultsProvider.studentView(req(T_HOME), A1, STU[3])
    expect(h.db.data_access_log).toEqual([expect.objectContaining({ scope: 'results', student_id: STU[3], viewer_id: T_HOME })])
  })

  it('בקשה שנדחתה (404/403) לא נרשמת', async () => {
    await fail(realResultsProvider.classView(req(T_OUT), A1))
    await fail(realResultsProvider.studentView(req(T_HOME), A1, STU_OTHER))
    await fail(realResultsProvider.classView(req(ADMIN, 'admin'), A1))
    expect(h.db.data_access_log).toHaveLength(0)
  })

  it('מנהל-על: אם אי אפשר לכתוב ליומן — נחסם 503 ולא מקבל נתוני תלמיד (מסך הדמיה ומסך תלמיד)', async () => {
    h.flags.insertError = true
    expect((await fail(realResultsProvider.classView(req(SUPER, 'super_admin'), A1))).status).toBe(503)
    expect((await fail(realResultsProvider.studentView(req(SUPER, 'super_admin'), A1, STU[0]))).status).toBe(503)
  })

  it('מורה רגיל: כשלון ביומן לא חוסם (best-effort)', async () => {
    h.flags.insertError = true
    await expect(realResultsProvider.classView(req(T_HOME), A1)).resolves.toBeTruthy()
    await expect(realResultsProvider.studentView(req(T_HOME), A1, STU[0])).resolves.toBeTruthy()
    await expect(realResultsProvider.list(req(T_HOME), {})).resolves.toBeTruthy()
  })
})

describe('רשימה: תקרת סריקה ו-truncated', () => {
  const addAssignments = (n: number): void => {
    ins('assignments', Array.from({ length: n }, (_, i) => ({
      id: uid(1000 + i), quest_id: Q1, class_id: C1, user_id: T_SCI, created_at: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString(),
    })))
  }

  it('מעל התקרה: נסרקות רק החדשות ביותר, truncated=true, ומוצגות לכל היותר 60', async () => {
    addAssignments(ASSIGNMENT_SCAN_CAP + 20)
    const res = await realResultsProvider.list(req(T_HOME), {})
    expect(res.truncated).toBe(true)
    expect(SubmissionListSchema.safeParse(res).success).toBe(true)
    expect(res.submissions.length).toBeLessThanOrEqual(60)
    expect(h.limits.assignments).toBe(ASSIGNMENT_SCAN_CAP + 1)
    /* החדשה ביותר ראשונה: A1 (אוקטובר 2026) חדשה מכל מה שנוצר מינואר */
    expect(res.submissions[0].id).toBe(A1)
  })

  it('יותר שליחות מכפי שמוצג (אך מתחת לתקרת הסריקה): truncated=true', async () => {
    addAssignments(70)
    expect((await realResultsProvider.list(req(T_HOME), {})).truncated).toBe(true)
  })

  it('מעט שליחות: אין שדה truncated בכלל', async () => {
    addAssignments(3)
    const res = await realResultsProvider.list(req(T_HOME), {})
    expect('truncated' in res).toBe(false)
    expect(SubmissionListSchema.safeParse(res).success).toBe(true)
    expect(res.submissions).toHaveLength(4)
  })

  it('מנהל-על: אותה תקרה', async () => {
    addAssignments(ASSIGNMENT_SCAN_CAP + 5)
    const res = await realResultsProvider.list(req(SUPER, 'super_admin'), {})
    expect(res.truncated).toBe(true)
    expect(h.limits.assignments).toBe(ASSIGNMENT_SCAN_CAP + 1)
  })
})

describe('ההרצה שנספרת: הרצה שהושלמה גוברת על session ריק שנפתח עכשיו', () => {
  it('מסך הדמיה ורשימה', async () => {
    ins('sessions', [session('old', STU[1], true, '2026-10-11T08:00:00Z'), session('new', STU[1], false, '2026-10-13T08:00:00Z')])
    ins('answers', [answer('old', STU[1], 'a', 'correct')])
    ins('events', [solvedEvent('old', STU[1], true)])
    const v = await realResultsProvider.classView(req(T_HOME), A1)
    expect(v.head.counts).toMatchObject({ completed: 1, inProgress: 0 })
    expect(v.challenges[0]).toMatchObject({ attempted: 1, solved: 1 })
    const list = await realResultsProvider.list(req(T_HOME), {})
    expect(list.submissions[0].counts).toMatchObject({ completed: 1, inProgress: 0 })
  })
})

describe('במבט אחד: successBands בספק האמיתי (אותה ליבה כמו בהדגמה)', () => {
  it('רק מי שסיימו נספרים: פתרו = ברוב, טעו = במעט; באמצע ולא התחילו מחוץ לגרף ההצלחה', async () => {
    ins('sessions', [session('b0', STU[0], true), session('b1', STU[1], true), session('b2', STU[2], true), session('b3', STU[3], false)])
    ins('answers', [answer('b0', STU[0], 'a', 'correct'), answer('b1', STU[1], 'a', 'correct'), answer('b2', STU[2], 'b', 'wrong')])
    ins('events', [solvedEvent('b0', STU[0], true), solvedEvent('b1', STU[1], true), solvedEvent('b2', STU[2], false)])
    const v = await realResultsProvider.classView(req(T_HOME), A1)
    expect(v.head.counts).toMatchObject({ total: 6, completed: 3, inProgress: 1, notStarted: 2 })
    expect(v.successBands).toEqual({ basis: 3, low: 1, mid: 0, high: 2, enough: true })
    expect(ClassSubmissionViewSchema.safeParse(v).success).toBe(true)
    /* הספירה הנמוכה = בדיוק מי שמסומן "לתשומת לב" בגלל הצלחה נמוכה */
    const lowSuccess = [...v.roster.completed, ...v.roster.inProgress, ...v.roster.notStarted].filter((c) => c.attentionReasons.includes('low_success'))
    expect(lowSuccess).toHaveLength(v.successBands.low)
  })

  it('מי שסיים אחד בלבד: enough=false (ההתפלגות לא מוצגת), אבל הספירה אמיתית ועומדת בחוזה', async () => {
    ins('sessions', [session('c0', STU[0], true)])
    ins('answers', [answer('c0', STU[0], 'a', 'correct')])
    ins('events', [solvedEvent('c0', STU[0], true)])
    const v = await realResultsProvider.classView(req(T_HOME), A1)
    expect(v.successBands).toEqual({ basis: 1, low: 0, mid: 0, high: 1, enough: false })
    expect(ClassSubmissionViewSchema.safeParse(v).success).toBe(true)
  })

  it('אף אחד לא התחיל: basis=0 ו-enough=false', async () => {
    const v = await realResultsProvider.classView(req(T_HOME), A1)
    expect(v.successBands).toEqual({ basis: 0, low: 0, mid: 0, high: 0, enough: false })
  })
})

describe('גרסאות אישיות (answers.variant_id → quest_variants)', () => {
  beforeEach(() => {
    ins('sessions', [session('s-base', STU[0], true), session('s-var', STU[1], true)])
    ins('answers', [answer('s-base', STU[0], 'b', 'wrong'), answer('s-var', STU[1], 'd', 'wrong', { variant_id: V1 })])
    ins('events', [solvedEvent('s-base', STU[0], false), solvedEvent('s-var', STU[1], false)])
    ins('quest_variants', [{ id: V1, quest_id: Q1, student_id: STU[1], game_data: VARIANT_GAME }])
  })

  it('מסך תלמיד: שאלה, תשובה ונכונה מהגרסה', async () => {
    const v = await realResultsProvider.studentView(req(T_HOME), A1, STU[1])
    expect(v.challenges[0].items[0]).toMatchObject({ prompt: 'מה קורה למים כשהם קופאים?', answerText: 'פלזמה', correctText: 'מוצק', isCorrect: false })
    const base = await realResultsProvider.studentView(req(T_HOME), A1, STU[0])
    expect(base.challenges[0].items[0]).toMatchObject({ prompt: 'מה מצב הצבירה של קרח?', answerText: 'נוזל', correctText: 'מוצק' })
  })

  it('התפלגות כיתתית: הבחירה "d" של הגרסה אינה בהתפלגות; ניסו/הצליחו כוללים אותה', async () => {
    const v = await realResultsProvider.classView(req(T_HOME), A1)
    const ch = v.challenges[0]
    expect([ch.attempted, ch.solved]).toEqual([2, 0])
    const picks = ch.items[0].options!.flatMap((o) => o.students.map((s) => s.id))
    expect(picks).toEqual([STU[0]])
  })

  it('הגרסאות נטענות רק במסך המפורט (לא ברשימה)', async () => {
    h.calls.length = 0
    await realResultsProvider.list(req(T_HOME), {})
    expect(h.calls).not.toContain('quest_variants')
    h.calls.length = 0
    await realResultsProvider.classView(req(T_HOME), A1)
    expect(h.calls).toContain('quest_variants')
  })

  it('תגיות של גרסה אישית לא נכנסות לתגיות הבסיס (אותה אפשרות "b" אצל תלמיד אחר)', async () => {
    ins('misconceptions', [{ id: 'mis1', title_he: 'בלבול בין מוצק לנוזל', description_he: '', status: 'approved' }, { id: 'mis2', title_he: 'בלבול בגרסה', description_he: '', status: 'approved' }])
    ins('option_tags', [
      { quest_id: Q1, variant_id: null, scene_id: 's1', item_index: 0, option_id: 'b', misconception_id: 'mis1' },
      { quest_id: Q1, variant_id: V1, scene_id: 's1', item_index: 0, option_id: 'b', misconception_id: 'mis2' },
      { quest_id: Q1, variant_id: V1, scene_id: 's1', item_index: 0, option_id: 'd', misconception_id: 'mis2' },
    ])
    const cls = await realResultsProvider.classView(req(T_HOME), A1)
    const optB = cls.challenges[0].items[0].options!.find((o) => o.optionId === 'b')!
    expect(optB.errorTag).toEqual({ id: 'mis1', title: 'בלבול בין מוצק לנוזל' })
    const stu = await realResultsProvider.studentView(req(T_HOME), A1, STU[1])
    expect(stu.challenges[0].items[0].errorTag).toEqual({ id: 'mis2', title: 'בלבול בגרסה' })
  })
})

describe('דילמה מוסרית: אנונימיות מול גרסאות', () => {
  it('שורות moral_choices של גרסה אישית אינן נספרות בהתפלגות הבסיס', async () => {
    h.db.quests[0].game_data = { ...GAME, scenes: [...GAME.scenes, { id: 'd1', title: 'דילמה', puzzle: { type: 'moralDilemma', question: 'מה?', situation: 'מצב', moralChoices: [{ text: 'א' }, { text: 'ב' }] } }] }
    const ids = STU.slice(0, MIN_CELL_SIZE)
    ins('sessions', ids.map((s, i) => session(`m${i}`, s, true)))
    ins('events', ids.map((s, i) => ({ session_id: `m${i}`, user_id: s, quest_id: Q1, type: 'puzzle_solved', scene_id: 'd1', payload: {}, is_synthetic: false })))
    ins('moral_choices', [
      ...ids.map((_, i) => ({ quest_id: Q1, class_id: C1, scene_id: 'd1', option_id: i % 2 ? 'm1' : 'm0', variant_id: null, created_at: '2026-10-12T08:00:00Z' })),
      ...Array.from({ length: 4 }, () => ({ quest_id: Q1, class_id: C1, scene_id: 'd1', option_id: 'm0', variant_id: V1, created_at: '2026-10-12T08:00:00Z' })),
    ])
    const v = await realResultsProvider.classView(req(T_HOME), A1)
    const moral = v.challenges.find((c) => c.type === 'moralDilemma')!
    expect(moral.items[0].options!.reduce((n, o) => n + o.count, 0)).toBe(MIN_CELL_SIZE)
  })
})

describe('בסיס הדמיית חזרה (loadReviewBasis): אותה הרשאה כמו התוצאות', () => {
  const finish = (n: number): void => {
    ins('sessions', STU.slice(0, n).map((s, i) => session(`r${i}`, s, true)))
    ins('answers', STU.slice(0, n).map((s, i) => answer(`r${i}`, s, 'b', 'wrong')))
    ins('events', STU.slice(0, n).map((s, i) => solvedEvent(`r${i}`, s, false)))
  }

  it('מטלה שאינה קיימת: 404', async () => {
    expect((await fail(loadReviewBasis(req(T_HOME), NIL, Q1))).status).toBe(404)
    expect((await fail(loadReviewBasis(req(T_HOME), 'nope', Q1))).status).toBe(404)
  })

  it('מורה שאינו משויך לכיתה (גם אם הוא בעל ההדמיה): 404 אחיד', async () => {
    finish(3)
    h.db.quests[0].created_by = T_OUT
    const invisible = await fail(loadReviewBasis(req(T_OUT), A1, Q1))
    const missing = await fail(loadReviewBasis(req(T_OUT), NIL, Q1))
    expect(invisible).toMatchObject({ status: 404, message: missing.message })
    /* ובלי שום שאילתת תוצאות */
    expect(h.calls).not.toContain('answers')
  })

  it('מנהל / מנהל עירוני: 403', async () => {
    expect((await fail(loadReviewBasis(req(ADMIN, 'admin'), A1, Q1))).status).toBe(403)
    expect((await fail(loadReviewBasis(req(ADMIN, 'municipal_admin'), A1, Q1))).status).toBe(403)
  })

  it('מטלה של הדמיה אחרת: 400', async () => {
    expect((await fail(loadReviewBasis(req(T_HOME), A1, uid(41)))).status).toBe(400)
  })

  it('מחנך הכיתה: מקבל כמה סיימו והתחומים לחיזוק — ואותה ספירה כמו weakCount שבמסך', async () => {
    finish(3)
    const basis = await loadReviewBasis(req(T_HOME), A1, Q1)
    expect(basis).toMatchObject({ completed: 3, classId: C1 })
    expect(basis.concepts).toHaveLength(1)
    expect(basis.concepts[0]).toMatchObject({ text: 'מצב הצבירה', successRate: 0, units: [{ sceneId: 's1', itemIndex: null }] })
    expect((await realResultsProvider.classView(req(T_HOME), A1)).review.weakCount).toBe(basis.concepts.length)
  })

  it('מעט מדי תלמידים שסיימו: אין תחומים (הנקודה תחזיר "אין מספיק נתונים")', async () => {
    finish(1)
    expect(await loadReviewBasis(req(T_HOME), A1, Q1)).toMatchObject({ completed: 1, concepts: [] })
  })

  it('נרשם ביומן הגישה (בלי תלמיד)', async () => {
    finish(2)
    await loadReviewBasis(req(T_HOME), A1, Q1)
    expect(h.db.data_access_log).toEqual([expect.objectContaining({ scope: 'results_review', student_id: null })])
  })
})

describe('גישה לשירות הסיכום המילולי (openSubmissionForSummary): אותה הרשאה כמו מסך ההדמיה, בלי רישום לכל תלמיד', () => {
  it('אותה הרשאה בדיוק: מנהלים 403, שליחה שאינה גלויה / לא קיימת / פגומה — אותו 404 אחיד; מורה גלוי (מחנך, יוצר-ושולח, מנהל-על) — נפתח', async () => {
    for (const role of ['admin', 'municipal_admin'] as const) {
      expect((await fail(openSubmissionForSummary(req(ADMIN, role), A1))).status).toBe(403)
      expect((await fail(openSubmissionForSummary(req(ADMIN, role), NIL))).status).toBe(403)
    }
    const missing = await fail(openSubmissionForSummary(req(T_OUT), NIL))
    expect(missing.status).toBe(404)
    expect(await fail(openSubmissionForSummary(req(T_OUT), A1))).toMatchObject({ status: 404, message: missing.message })
    expect(await fail(openSubmissionForSummary(req(T_OUT), 'not-a-uuid'))).toMatchObject({ status: 404, message: missing.message })
    for (const r of [req(T_HOME), req(T_SCI), req(SUPER, 'super_admin')]) await expect(openSubmissionForSummary(r, A1)).resolves.toBeTruthy()
  })

  it('ההרשאה נבדקת מיד והטעינה הכבדה נדחית: עד classView() אין שאילתת סשנים / תשובות / אירועים', async () => {
    const access = await openSubmissionForSummary(req(T_HOME), A1)
    for (const t of HEAVY) expect(h.calls, t).not.toContain(t)
    await access.classView()
    expect(h.calls).toContain('sessions')
  })

  it('לא נרשם ביומן הגישה (שירות הסיכום רושם בעצמו שורה אחת) — גם לא אצל מנהל-על, ומנהל-על אינו נחסם כשהיומן תקול', async () => {
    const access = await openSubmissionForSummary(req(T_HOME), A1)
    await access.classView()
    expect(h.db.data_access_log).toHaveLength(0)
    h.flags.insertError = true
    await expect((await openSubmissionForSummary(req(SUPER, 'super_admin'), A1)).classView()).resolves.toBeTruthy()
  })

  it('התוכן זהה למסך ההדמיה (אותה ליבה): אין סטייה בין מה שהמורה רואה למה שמסוכם', async () => {
    ins('sessions', [session('s1', STU[0], true), session('s2', STU[1], true), session('s3', STU[2], false)])
    ins('answers', [answer('s1', STU[0], 'a', 'correct'), answer('s2', STU[1], 'b', 'wrong')])
    ins('events', [solvedEvent('s1', STU[0], true), solvedEvent('s2', STU[1], false)])
    const viaSummary = await (await openSubmissionForSummary(req(T_HOME), A1)).classView()
    const viaScreen = await realResultsProvider.classView(req(T_HOME), A1)
    expect(viaSummary).toEqual(viaScreen)
    expect(ClassSubmissionViewSchema.safeParse(viaSummary).success).toBe(true)
  })

  it('תלמיד מושבת: אותה הסתרה כמו במסך', async () => {
    h.db.users.find((u) => u.id === STU[2])!.is_active = false
    const view = await (await openSubmissionForSummary(req(T_HOME), A1)).classView()
    expect(view.head.counts.total).toBe(STU.length - 1)
  })
})
