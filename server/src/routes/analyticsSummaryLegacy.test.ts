import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Request } from 'express'

/* ══════════════════════════════════════════════════════════════════════════
   הנתיב הישן /api/analytics/summary (עד שהוא מוחלף ב-/api/ai-summary): תיקוני הביטחון המינימליים.
   · cache ועריכה אישיים לצופה (created_by) — סיכום של צופה א׳ לא נחשף/נדרס ע״י צופה ב׳.
   · "צור מחדש" מאפס את עריכת המורה.
   · סף N מינימלי גם למורה (ליצירה בלבד).
   · הגבלת קצב ל-POST; רישום ביומן ברמת תלמיד עם await ו-studentLevel.
   · סיכום חלקי (מורה מקצועי) אינו נשמר.
   מול DB מדומה בזיכרון; בלי LLM חי.
   ══════════════════════════════════════════════════════════════════════════ */
type Row = Record<string, unknown>
const h = vi.hoisted(() => {
  const db: Record<string, Row[]> = {}
  const flags: Record<string, boolean> = {}
  const events: string[] = []
  const state = { logFails: false, nextId: 1 }
  class Q {
    private filters: ((r: Row) => boolean)[] = []
    private op: 'select' | 'update' | 'upsert' = 'select'
    private payload: Row = {}
    private conflict: string[] = []
    constructor(private t: string) {}
    select() { return this }
    eq(k: string, v: unknown) { this.filters.push((r) => r[k] === v); return this }
    in(k: string, a: unknown[]) { this.filters.push((r) => a.includes(r[k])); return this }
    not(k: string, _op: string, v: unknown) { this.filters.push((r) => (r[k] ?? null) !== v); return this }
    order() { return this }
    limit() { return this }
    update(p: Row) { this.op = 'update'; this.payload = p; return this }
    upsert(p: Row, o: { onConflict: string }) { this.op = 'upsert'; this.payload = p; this.conflict = o.onConflict.split(','); return this }
    private run(): Row[] {
      const tbl = (db[this.t] ??= [])
      if (this.op === 'upsert') {
        const cur = tbl.find((r) => this.conflict.every((k) => r[k] === this.payload[k]))
        if (cur) { Object.assign(cur, this.payload); return [cur] }
        const row = { id: `sum-${state.nextId++}`, ...this.payload }
        tbl.push(row)
        return [row]
      }
      const rows = tbl.filter((r) => this.filters.every((f) => f(r)))
      if (this.op === 'update') for (const r of rows) Object.assign(r, this.payload)
      return rows
    }
    single() { const r = this.run(); return Promise.resolve(r[0] ? { data: r[0], error: null } : { data: null, error: { message: 'no rows' } }) }
    maybeSingle() { return Promise.resolve({ data: this.run()[0] ?? null, error: null }) }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    then(ok?: any, bad?: any) { return Promise.resolve({ data: this.run(), error: null }).then(ok, bad) }
  }
  return { db, flags, events, state, Q }
})

vi.mock('../lib/supabase.js', () => ({ supabaseAdmin: { from: (t: string) => new h.Q(t) }, supabaseAnon: {} }))
vi.mock('../lib/activeColumn.js', async (orig) => {
  const m = await orig<Record<string, unknown>>()
  const out: Record<string, unknown> = { ...m }
  for (const [k, v] of Object.entries(m)) if (k.startsWith('has') && typeof v === 'function') out[k] = async () => h.flags[k] ?? false
  return out
})
vi.mock('../lib/claude.js', () => ({
  claude: { messages: { create: vi.fn(async (body: { messages: { content: string }[] }) => { h.events.push('llm'); return { content: [{ type: 'text', text: `סיכום על תלמיד/ה 1 [${body.messages[0].content.length}]` }] } }) } },
}))
vi.mock('../lib/authz.js', async (orig) => {
  const m = await orig<typeof import('../lib/authz.js')>()
  return {
    ...m,
    loadViewer: vi.fn(),
    requireStudentScope: vi.fn(),
    logAccess: vi.fn(async (_v: unknown, entry: { scope: string }, opts?: { studentLevel?: boolean }) => {
      await Promise.resolve()
      if (h.state.logFails && opts?.studentLevel) throw new (await import('../middleware/errors.js')).AppError(503, 'לא ניתן לתעד')
      h.events.push(`log:${entry.scope}:${opts?.studentLevel === true}`)
    }),
  }
})

import { claude } from '../lib/claude.js'
import { loadViewer, requireStudentScope, type Viewer } from '../lib/authz.js'
import { AppError } from '../middleware/errors.js'
import { analyticsRouter } from './analytics.js'

const A = 'user-A'
const B = 'user-B'
const viewer = (userId: string, over: Partial<Viewer> = {}): Viewer => ({
  userId, role: 'teacher', schoolId: 's1', seesSynthetic: false,
  grants: new Map([['c1', { classId: 'c1', homeroom: true, subjectIds: new Set<string>(), unspecified: false }]]), ...over,
})
const viewers: Record<string, Viewer> = {}

interface Layer { route?: { path: string; methods: Record<string, boolean>; stack: { handle: (req: Request, res: unknown, next: (e?: unknown) => void) => Promise<void> }[] } }
const routes = (): Layer[] => (analyticsRouter as unknown as { stack: Layer[] }).stack.filter((l) => l.route?.path === '/summary')
async function call(method: 'get' | 'post' | 'patch', userId: string, input: { query?: Record<string, string>; body?: Record<string, unknown>; guest?: boolean }): Promise<{ body?: Record<string, any>; error?: AppError }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const layer = routes().find((l) => l.route!.methods[method])!
  const req = { staff: { userId, role: 'teacher', isGuest: input.guest === true }, query: input.query ?? {}, body: input.body ?? {}, params: {} } as unknown as Request
  let body: Record<string, unknown> | undefined
  let error: AppError | undefined
  const stack = layer.route!.stack
  await stack[stack.length - 1].handle(req, { json: (b: Record<string, unknown>) => { body = b } }, (e) => { error = e as AppError })
  return { body, error }
}

function seedClass(players: number, userPrefix = 'st'): void {
  h.db.classes = [{ id: 'c1', school_id: 's1', name: 'ו׳2', grade_label: null }]
  h.db.class_members = Array.from({ length: 5 }, (_, i) => ({ class_id: 'c1', users: { id: `${userPrefix}${i}`, name: `תלמיד אמיתי ${i}`, role: 'student', is_active: true } }))
  h.db.sessions = Array.from({ length: players }, (_, i) => ({ user_id: `${userPrefix}${i}`, quest_id: 'q1', completed_at: '2026-10-01T10:00:00Z', total_score: 3 + i, max_score: 5, is_synthetic: false }))
  h.db.pedagogical_summaries = []
}

beforeEach(() => {
  for (const k of Object.keys(h.db)) delete h.db[k]
  for (const k of Object.keys(h.flags)) delete h.flags[k]
  h.events.length = 0
  h.state.logFails = false
  h.state.nextId = 1
  h.flags.hasPedagogicalSummaries = true
  vi.mocked(claude.messages.create).mockClear()
  viewers[A] = viewer(A)
  viewers[B] = viewer(B)
  vi.mocked(loadViewer).mockImplementation(async (req: Request) => viewers[(req.staff as { userId: string }).userId])
})

describe('סיכום ישן: כיתה — cache ועריכה אישיים לצופה', () => {
  it('צופה ב׳ לא רואה את הסיכום של א׳, ולא דורס אותו; א׳ מקבל cache משלו', async () => {
    seedClass(4)
    const a1 = await call('post', A, { body: { scope: 'class', id: 'c1' } })
    expect(a1.error).toBeUndefined()
    expect(a1.body!.cached).toBe(false)
    expect(h.db.pedagogical_summaries).toHaveLength(1)
    expect(h.db.pedagogical_summaries[0]).toMatchObject({ created_by: A, edited_content: null })
    const original = h.db.pedagogical_summaries[0].content

    const a2 = await call('post', A, { body: { scope: 'class', id: 'c1' } })
    expect(a2.body!.cached).toBe(true)
    expect(claude.messages.create).toHaveBeenCalledTimes(1)

    expect((await call('get', B, { query: { scope: 'class', id: 'c1' } })).body!.summary).toBeNull()
    expect((await call('get', A, { query: { scope: 'class', id: 'c1' } })).body!.summary).toMatchObject({ created_by: A })

    const b = await call('post', B, { body: { scope: 'class', id: 'c1' } })
    expect(b.error).toBeUndefined()
    expect(b.body!.notPersisted).toBe(true)
    expect(b.body!.summary.id).toBeNull()
    expect(claude.messages.create).toHaveBeenCalledTimes(2)
    expect(h.db.pedagogical_summaries).toHaveLength(1)
    expect(h.db.pedagogical_summaries[0]).toMatchObject({ created_by: A, content: original })
  })

  it('PATCH: רק הבעלים עורך; צופה אחר מקבל 404 והעריכה שלו לא נכתבת', async () => {
    seedClass(4)
    await call('post', A, { body: { scope: 'class', id: 'c1' } })
    const other = await call('patch', B, { body: { scope: 'class', id: 'c1', edited_content: 'פריצה' } })
    expect(other.error?.status).toBe(404)
    expect(h.db.pedagogical_summaries[0].edited_content).toBeNull()
    const own = await call('patch', A, { body: { scope: 'class', id: 'c1', edited_content: 'העריכה שלי' } })
    expect(own.error).toBeUndefined()
    expect(h.db.pedagogical_summaries[0].edited_content).toBe('העריכה שלי')
  })

  it('"צור מחדש" מאפס את עריכת המורה (edited_content=null) ומחליף את הטקסט', async () => {
    seedClass(4)
    await call('post', A, { body: { scope: 'class', id: 'c1' } })
    await call('patch', A, { body: { scope: 'class', id: 'c1', edited_content: 'העריכה שלי' } })
    expect(h.db.pedagogical_summaries[0].edited_content).toBe('העריכה שלי')
    const again = await call('post', A, { body: { scope: 'class', id: 'c1', regenerate: true } })
    expect(again.body!.cached).toBe(false)
    expect(h.db.pedagogical_summaries).toHaveLength(1)
    expect(h.db.pedagogical_summaries[0].edited_content).toBeNull()
    expect(again.body!.summary.edited_content).toBeNull()
    expect(claude.messages.create).toHaveBeenCalledTimes(2)
  })

  it('לפני המיגרציה (אין טבלה): מחזיר סיכום חי בלי לשמור', async () => {
    seedClass(4)
    h.flags.hasPedagogicalSummaries = false
    const r = await call('post', A, { body: { scope: 'class', id: 'c1' } })
    expect(r.body!.notPersisted).toBe(true)
    expect(h.db.pedagogical_summaries).toHaveLength(0)
  })
})

describe('סיכום ישן: סף N מינימלי גם למורה (ליצירה בלבד)', () => {
  it('כיתה עם 2 תלמידים ששיחקו: POST נדחה ב-400 עם הסבר מה יקרה, בלי LLM; GET אינו נדחה', async () => {
    seedClass(2)
    const r = await call('post', A, { body: { scope: 'class', id: 'c1' } })
    expect(r.error?.status).toBe(400)
    expect(r.error?.message).toContain('אין מספיק נתונים')
    expect(r.error?.message).toContain('יהיה זמין')
    expect(claude.messages.create).not.toHaveBeenCalled()
    const g = await call('get', A, { query: { scope: 'class', id: 'c1' } })
    expect(g.error).toBeUndefined()
    expect(g.body!.summary).toBeNull()
  })

  it('3 תלמידים ששיחקו → עובר', async () => {
    seedClass(3)
    expect((await call('post', A, { body: { scope: 'class', id: 'c1' } })).error).toBeUndefined()
  })
})

describe('סיכום ישן: תלמיד', () => {
  const sessions = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, quest_id: 'q1', user_id: 'st0', completed_at: '2026-10-01T10:00:00Z', started_at: `2026-09-${10 + i}T10:00:00Z`, total_score: 3, max_score: 5, is_synthetic: false }))
  function seedStudent(n: number, full: boolean): void {
    h.db.users = [{ id: 'st0', name: 'דנה כהן' }]
    h.db.sessions = sessions(n)
    h.db.quests = [{ id: 'q1', title: 'הדמיה', created_by: 'other-teacher', subject_id: 'sub-math' }]
    h.db.classes = [{ id: 'c1', school_id: 's1', name: 'ו׳2', grade_label: null }]
    h.db.pedagogical_summaries = []
    h.flags.hasQuestSubjectId = true
    vi.mocked(requireStudentScope).mockImplementation(async (req: Request) => ({
      viewer: viewers[(req.staff as { userId: string }).userId],
      scope: { kind: 'scoped' as const, full, subjectIds: new Set(['sub-math']), own: false },
      classIds: ['c1'],
    }))
  }

  it('מחנך (מלא): נשמר אישית; שם התלמיד לא נשלח ל-LLM; היומן נכתב עם studentLevel לפני קריאת ה-LLM', async () => {
    seedStudent(5, true)
    const r = await call('post', A, { body: { scope: 'student', id: 'st0' } })
    expect(r.error).toBeUndefined()
    expect(r.body!.notPersisted).toBeUndefined()
    expect(h.db.pedagogical_summaries).toHaveLength(1)
    expect(h.db.pedagogical_summaries[0]).toMatchObject({ created_by: A, edited_content: null })
    const sent = vi.mocked(claude.messages.create).mock.calls[0][0].messages[0].content as string
    expect(sent).toContain('תלמיד/ה 1')
    expect(sent).not.toContain('דנה כהן')
    /* ה-await על היומן (studentLevel) קודם לקריאת ה-AI */
    expect(h.events).toEqual(['log:summary_student:true', 'llm'])
  })

  it('מורה מקצועי (חלקי): הסיכום מוחזר אבל לא נשמר ולא נקרא מה-cache — לא יוצג למחנך כסיכום מלא', async () => {
    seedStudent(5, false)
    const r = await call('post', A, { body: { scope: 'student', id: 'st0' } })
    expect(r.error).toBeUndefined()
    expect(r.body!.notPersisted).toBe(true)
    expect(h.db.pedagogical_summaries).toHaveLength(0)
    h.db.pedagogical_summaries = [{ id: 'x', scope: 'student', entity_id: 'st0', content: 'סיכום מלא של המחנך', created_by: A }]
    expect((await call('get', A, { query: { scope: 'student', id: 'st0' } })).body!.summary).toBeNull()
  })

  it('פחות מ-4 הדמיות שהושלמו → 400 (ליצירה); GET אינו נדחה', async () => {
    seedStudent(3, true)
    const r = await call('post', A, { body: { scope: 'student', id: 'st0' } })
    expect(r.error?.status).toBe(400)
    expect(r.error?.message).toContain('4 הדמיות')
    expect(claude.messages.create).not.toHaveBeenCalled()
    expect((await call('get', A, { query: { scope: 'student', id: 'st0' } })).error).toBeUndefined()
  })

  it('כשל ביומן (נכשל-סגור למנהל-על) חוסם: אין קריאה ל-LLM ואין שמירה', async () => {
    seedStudent(5, true)
    h.state.logFails = true
    const r = await call('post', A, { body: { scope: 'student', id: 'st0' } })
    expect(r.error?.status).toBe(503)
    expect(claude.messages.create).not.toHaveBeenCalled()
    expect(h.db.pedagogical_summaries).toHaveLength(0)
  })
})

describe('סיכום ישן: קצב ואורח', () => {
  it('ל-POST מחוברת הגבלת קצב של 6 בדקה למשתמש', async () => {
    const post = routes().find((l) => l.route!.methods.post)!.route!
    expect(post.stack).toHaveLength(2)
    const limiter = post.stack[0].handle as unknown as (req: Request, res: unknown, next: (e?: unknown) => void) => void
    const req = { staff: { userId: `rate-${Math.random()}`, isGuest: false }, ip: '9.9.9.9' } as unknown as Request
    const out: unknown[] = []
    for (let i = 0; i < 7; i++) limiter(req, {}, (e) => out.push(e))
    expect(out.slice(0, 6).every((e) => e === undefined)).toBe(true)
    expect((out[6] as AppError).status).toBe(429)
  })

  it('אורח: GET ריק, POST הדגמה קבועה — בלי DB ובלי LLM', async () => {
    const g = await call('get', 'guest', { guest: true, query: { scope: 'class', id: 'c1' } })
    expect(g.body).toEqual({ summary: null })
    const p = await call('post', 'guest', { guest: true, body: { scope: 'class', id: 'c1' } })
    expect(p.error).toBeUndefined()
    expect(claude.messages.create).not.toHaveBeenCalled()
    expect(h.db.pedagogical_summaries ?? []).toHaveLength(0)
  })
})
