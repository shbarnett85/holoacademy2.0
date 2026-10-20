import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Request } from 'express'

vi.mock('../lib/authz.js', async (orig) => {
  const m = await orig<typeof import('../lib/authz.js')>()
  return { ...m, loadViewer: vi.fn(async () => ({ userId: 'u-A', role: 'teacher', schoolId: 's1', grants: new Map(), seesSynthetic: false })), logAccess: vi.fn(async () => undefined) }
})

import { ERR_SUMMARY_DEMO_EDIT, ERR_SUMMARY_NOT_CONNECTED, ERR_SUMMARY_NOT_FOUND } from '../../../src/shared/lib/findingsNarrative.js'
import { AI_SUMMARY_EP, SummaryStateSchema, type SummaryTarget } from '../../../src/shared/types/aiSummaryV1.js'
import { demoProvider, getAnalysis } from '../lib/analyticsV2/demoProvider.js'
import { projectSource, type SummarySource } from '../lib/aiSummary/inputs.js'
import { createSummaryService, type SummaryService } from '../lib/aiSummary/service.js'
import { createMemoryStore } from '../lib/aiSummary/store.js'
import { NOW, demoSources, fakeLlm, goodResponse, homeroomOf } from '../lib/aiSummary/testkit.js'
import { logAccess, loadViewer } from '../lib/authz.js'
import { AppError } from '../middleware/errors.js'
import { requireStaff } from '../middleware/staffAuth.js'
import { NOT_CONNECTED_DEPS, SUMMARY_RATE, registerAiSummaryRoutes, type AiSummaryRouteDeps, type SummaryAuthorization } from './aiSummary.js'

/* הנתיב מול deps מזויפות (בלי ספקי v2/תוצאות, בלי DB, בלי LLM חי). הקריאה לנקודות הקצה: ישירות ל-handler של ה-route (כמו analyticsV2.test.ts). */
interface Layer { handle: unknown; route?: { path: string; methods: Record<string, boolean>; stack: { handle: (req: Request, res: unknown, next: (e?: unknown) => void) => Promise<void> }[] } }
const layersOf = (r: ReturnType<typeof registerAiSummaryRoutes>): Layer[] => (r as unknown as { stack: Layer[] }).stack

let source: SummarySource
let sid: string
let GOOD: string

beforeAll(async () => {
  const A = getAnalysis(NOW)
  sid = A.classById.get('c-v2')!.studentIds[0]
  source = { scope: 'student', overview: (await demoProvider.student(homeroomOf('c-v2'), sid)).data, gender: null }
  GOOD = goodResponse(projectSource(source))
})

const reqOf = (over: Record<string, unknown> = {}): Request => ({ staff: { userId: 'u-A', role: 'teacher', isGuest: false }, query: {}, body: {}, params: {}, ...over } as unknown as Request)
const studentQuery = (extra: Record<string, string> = {}): Record<string, string> => ({ scope: 'student', id: sid, ...extra })

async function call(router: ReturnType<typeof registerAiSummaryRoutes>, method: 'get' | 'post' | 'patch', req: Request): Promise<{ body?: { dataState: string; data: ReturnType<typeof SummaryStateSchema.parse> }; error?: AppError }> {
  const layer = layersOf(router).find((l) => l.route && l.route.methods[method])
  if (!layer?.route) throw new Error(`no ${method} route`)
  let body: { dataState: string; data: ReturnType<typeof SummaryStateSchema.parse> } | undefined
  let error: AppError | undefined
  await layer.route.stack[0].handle(req, { json: (b: unknown) => { body = b as typeof body } }, (e) => { error = e as AppError })
  return { body, error }
}

const studentSource = (): Extract<SummarySource, { scope: 'student' }> => source as Extract<SummarySource, { scope: 'student' }>

function harness(over: Partial<AiSummaryRouteDeps> = {}, authz: Partial<SummaryAuthorization> = {}) {
  const events: string[] = []
  const llm = fakeLlm([GOOD])
  const store = createMemoryStore()
  const service: SummaryService = createSummaryService({ llm, store, now: () => NOW })
  const deps: AiSummaryRouteDeps = {
    async authorize() { events.push('authorize'); return { demo: false, audienceKey: 'full', ...authz } },
    async loadStudentFacts() { events.push('load'); return { overview: studentSource().overview, gender: studentSource().gender } },
    async loadClassFacts() { events.push('load'); throw new Error('not used') },
    async loadSubmissionFacts() { events.push('load'); throw new Error('not used') },
    async logAccess({ target, authz: a }) { events.push(`log:${target.scope}:${a.demo ? 'demo' : 'real'}`) },
    ...over,
  }
  return { router: registerAiSummaryRoutes(deps, { service }), events, llm, store, deps }
}

beforeEach(() => { vi.mocked(logAccess).mockClear(); vi.mocked(loadViewer).mockClear() })

describe('חיווט', () => {
  it('שלוש הנקודות של AI_SUMMARY_EP רשומות, עם requireStaff והגבלות קצב לפניהן', () => {
    const { router } = harness()
    const routes = layersOf(router).filter((l) => l.route).map((l) => `${Object.keys(l.route!.methods)[0]} ${l.route!.path}`)
    expect(routes.sort()).toEqual(['get /', 'patch /:summaryId', 'post /'])
    expect(AI_SUMMARY_EP.get.path).toBe('/api/ai-summary')
    expect(AI_SUMMARY_EP.edit.path).toBe('/api/ai-summary/:summaryId')
    const use = layersOf(router).filter((l) => !l.route)
    expect(use.length).toBeGreaterThanOrEqual(4)
    expect(use.some((l) => l.handle === requireStaff)).toBe(true)
    /* requireStaff לפני כל route */
    const stack = layersOf(router)
    expect(stack.findIndex((l) => l.handle === requireStaff)).toBeLessThan(stack.findIndex((l) => !!l.route))
  })

  it('ברירת המחדל (לא מחובר): כל הנקודות 503', async () => {
    const router = registerAiSummaryRoutes(NOT_CONNECTED_DEPS, { service: createSummaryService({ llm: fakeLlm([GOOD]), store: createMemoryStore() }) })
    for (const [m, req] of [['get', reqOf({ query: studentQuery() })], ['post', reqOf({ body: { scope: 'student', id: sid } })]] as const) {
      const r = await call(router, m, req)
      expect(r.error?.status, m).toBe(503)
      expect(r.error?.message).toBe(ERR_SUMMARY_NOT_CONNECTED)
    }
    const p = await call(router, 'patch', reqOf({ params: { summaryId: '11111111-1111-4111-8111-111111111111' }, body: { editedText: 'x' } }))
    expect(p.error?.status).toBe(404) /* לא נמצא אצל הצופה — לפני שנוגעים בהרשאה */
  })

  it('הגבלת קצב: 6 בדקה ליצירה (POST בלבד), בלי הגבלה על GET', async () => {
    expect(SUMMARY_RATE.generatePerUser).toBe(6)
    const { router } = harness()
    const limiter = layersOf(router).filter((l) => !l.route)[3].handle as (req: Request, res: unknown, next: (e?: unknown) => void) => void
    const staff = { userId: `rate-${Math.random()}`, role: 'teacher', isGuest: false }
    const run = (method: string): unknown => { let out: unknown = 'none'; limiter({ method, staff, ip: '1.1.1.1' } as unknown as Request, {}, (e) => { out = e }); return out }
    for (let i = 0; i < 20; i++) expect(run('GET')).toBeUndefined()
    for (let i = 0; i < 6; i++) expect(run('POST')).toBeUndefined()
    expect((run('POST') as AppError).status).toBe(429)
    expect(run('GET')).toBeUndefined()
  })
})

describe('GET / POST', () => {
  it('GET: אין סיכום עדיין → זכאות; subject בשאילתה (בורר עדשה של אורח) מתעלמים בהיקף שאינו class_subject', async () => {
    const { router, llm } = harness()
    const r = await call(router, 'get', reqOf({ query: studentQuery({ subject: 'hebrew', lens: 'subject_teacher' }) }))
    expect(r.error).toBeUndefined()
    expect(r.body!.data.summary).toBeNull()
    expect(r.body!.data.eligibility).toEqual({ ok: true })
    expect(llm.calls).toHaveLength(0)
    expect(AI_SUMMARY_EP.get.response.safeParse(r.body).success).toBe(true)
  })

  it('POST: יצירה, התגובה עומדת בחוזה, ושוב POST מחזיר את אותו סיכום (cache אישי)', async () => {
    const { router, llm } = harness()
    const a = await call(router, 'post', reqOf({ body: { scope: 'student', id: sid } }))
    expect(a.error).toBeUndefined()
    expect(a.body!.data.summary!.writtenBy).toBe('ai')
    expect(AI_SUMMARY_EP.create.response.safeParse(a.body).success).toBe(true)
    const b = await call(router, 'post', reqOf({ body: { scope: 'student', id: sid } }))
    expect(b.body!.data.summary!.id).toBe(a.body!.data.summary!.id)
    expect(llm.calls).toHaveLength(1)
    /* צופה אחר (אותו קהל) — בלי הסיכום של א׳ */
    const other = await call(router, 'get', reqOf({ staff: { userId: 'u-B', role: 'teacher', isGuest: false }, query: studentQuery() }))
    expect(other.body!.data.summary).toBeNull()
  })

  it('בקשות לא תקינות → 400: היקף לא מוכר, בלי id, class_subject בלי subject, subject בהיקף אחר', async () => {
    const { router, llm } = harness()
    for (const q of [{ scope: 'nope', id: 'x' }, { scope: 'student' }, { scope: 'class_subject', id: 'c' }, {}]) {
      const r = await call(router, 'get', reqOf({ query: q }))
      expect(r.error?.status, JSON.stringify(q)).toBe(400)
    }
    for (const b of [{ scope: 'student', id: sid, subject: 'math' }, { scope: 'class_subject', id: 'c', subject: 'zzz' }, { id: 'x' }, { scope: 'student', id: sid, regenerate: 'yes' }]) {
      const r = await call(router, 'post', reqOf({ body: b }))
      expect(r.error?.status, JSON.stringify(b)).toBe(400)
    }
    expect(llm.calls).toHaveLength(0)
  })

  it('class_subject: subject מהשאילתה מועבר ליעד', async () => {
    const seen: SummaryTarget[] = []
    const { router } = harness({ async authorize({ target: t }) { seen.push(t); return { demo: true, audienceKey: 'full' } } })
    const r = await call(router, 'get', reqOf({ query: { scope: 'class_subject', id: 'c-v2', subject: 'math' } }))
    expect(seen).toEqual([{ scope: 'class_subject', id: 'c-v2', subject: 'math' }])
    /* בלי loadClassSubjectFacts (שלב ג׳) → "לא מחובר" */
    expect(r.error?.status).toBe(503)
  })
})

describe('טעינת נתונים לפי היקף', () => {
  it('כל היקף נטען דרך ה-callback שלו, עם היעד ותוצאת ההרשאה', async () => {
    const all = await demoSources()
    const pick = (scope: SummarySource['scope']): SummarySource => all.find((x) => x.source.scope === scope)!.source
    const seen: string[] = []
    const mk = <T>(name: string, v: T) => async (ctx: { target: SummaryTarget; authz: SummaryAuthorization }): Promise<T> => { seen.push(`${name}:${ctx.target.scope}:${ctx.authz.audienceKey}`); return v }
    const view = (s: SummarySource, key: 'overview' | 'view'): never => (s as unknown as Record<string, never>)[key]
    const router = registerAiSummaryRoutes({
      async authorize() { return { demo: true, audienceKey: 'full' } },
      loadStudentFacts: mk('student', { overview: view(pick('student'), 'overview'), gender: null }),
      loadClassFacts: mk('class', view(pick('class'), 'overview')),
      loadClassSubjectFacts: mk('class_subject', view(pick('class_subject'), 'view')),
      loadSubmissionFacts: mk('submission', view(pick('submission'), 'view')),
    }, { service: createSummaryService({ llm: fakeLlm([GOOD]), store: createMemoryStore(), now: () => NOW }) })
    for (const q of [{ scope: 'student', id: 'x' }, { scope: 'class', id: 'x' }, { scope: 'class_subject', id: 'x', subject: 'math' }, { scope: 'submission', id: 'x' }]) {
      const r = await call(router, 'get', reqOf({ query: q }))
      expect(r.error, q.scope).toBeUndefined()
      expect(AI_SUMMARY_EP.get.response.safeParse(r.body).success, q.scope).toBe(true)
    }
    expect(seen).toEqual(['student:student:full', 'class:class:full', 'class_subject:class_subject:full', 'submission:submission:full'])
  })
})

describe('הרשאות ויומן גישה', () => {
  it('authorize דוחה (403) → אין טעינת נתונים, אין LLM, אין יומן', async () => {
    const { router, llm, events } = harness({ async authorize() { throw new AppError(403, 'אין הרשאה') } })
    const r = await call(router, 'post', reqOf({ body: { scope: 'student', id: sid } }))
    expect(r.error?.status).toBe(403)
    expect(llm.calls).toHaveLength(0)
    expect(events).toEqual([])
  })

  it('היומן נכתב (await) לפני טעינת הנתונים ולפני התגובה; כשל ביומן (fail-closed) חוסם הכול', async () => {
    const h = harness()
    const ok = await call(h.router, 'post', reqOf({ body: { scope: 'student', id: sid } }))
    expect(ok.error).toBeUndefined()
    expect(h.events.slice(0, 3)).toEqual(['authorize', 'log:student:real', 'load'])

    const closed = harness({ async logAccess() { throw new AppError(503, 'לא ניתן לתעד') } })
    const r = await call(closed.router, 'post', reqOf({ body: { scope: 'student', id: sid } }))
    expect(r.error?.status).toBe(503)
    expect(r.body).toBeUndefined()
    expect(closed.llm.calls).toHaveLength(0)
  })

  it('יומן ברירת המחדל: תלמיד → studentLevel (fail-closed למנהל-על); כיתה/הגשה → שורה בלי תלמיד; הדגמה → כלום', async () => {
    const authorize = async (): Promise<SummaryAuthorization> => ({ demo: false, audienceKey: 'full' })
    const base = { authorize, async loadStudentFacts() { return { overview: studentSource().overview, gender: null } }, async loadClassFacts(): Promise<never> { throw new AppError(404, 'x') }, async loadSubmissionFacts(): Promise<never> { throw new AppError(404, 'x') } }
    const router = registerAiSummaryRoutes(base, { service: createSummaryService({ llm: fakeLlm([GOOD]), store: createMemoryStore(), now: () => NOW }) })
    await call(router, 'get', reqOf({ query: studentQuery() }))
    expect(vi.mocked(logAccess)).toHaveBeenLastCalledWith(expect.anything(), { studentId: sid, scope: 'ai_summary_student', endpoint: 'ai-summary' }, { studentLevel: true })
    await call(router, 'get', reqOf({ query: { scope: 'class', id: 'c-v2' } }))
    expect(vi.mocked(logAccess)).toHaveBeenLastCalledWith(expect.anything(), { studentId: null, scope: 'ai_summary_class', endpoint: 'ai-summary' })
    await call(router, 'get', reqOf({ query: { scope: 'submission', id: 'a-1' } }))
    expect(vi.mocked(logAccess)).toHaveBeenLastCalledWith(expect.anything(), { studentId: null, scope: 'ai_summary_submission', endpoint: 'ai-summary' })

    vi.mocked(logAccess).mockClear()
    const demoRouter = registerAiSummaryRoutes({ ...base, async authorize() { return { demo: true, audienceKey: 'full' } } }, { service: createSummaryService({ llm: fakeLlm([GOOD]), store: createMemoryStore(), now: () => NOW }) })
    await call(demoRouter, 'get', reqOf({ query: studentQuery() }))
    expect(vi.mocked(logAccess)).not.toHaveBeenCalled()
  })

  it('אורח הוא תמיד הדגמה, גם אם ה-deps אמרו אחרת: תבנית, בלי LLM, בלי שמירה, ובלי עריכה', async () => {
    const h = harness({}, { demo: false })
    const guest = { userId: 'guest-1', role: 'teacher', isGuest: true }
    const r = await call(h.router, 'post', reqOf({ staff: guest, body: { scope: 'student', id: sid } }))
    expect(r.error).toBeUndefined()
    expect(r.body!.data.demo).toBe(true)
    expect(r.body!.data.summary!.writtenBy).toBe('template')
    expect(r.body!.data.summary!.id).toBeNull()
    expect(h.llm.calls).toHaveLength(0)
    expect(h.store.rows.size).toBe(0)
    expect(h.events).toContain('log:student:demo')
    const p = await call(h.router, 'patch', reqOf({ staff: guest, params: { summaryId: '11111111-1111-4111-8111-111111111111' }, body: { editedText: 'x' } }))
    expect(p.error?.status).toBe(403)
    expect(p.error?.message).toBe(ERR_SUMMARY_DEMO_EDIT)
  })
})

describe('PATCH', () => {
  it('הבעלים עורך; צופה אחר — 404; הרשאה שבוטלה — 403; קהל ששונה — 404; ריק — 400', async () => {
    const h = harness()
    const created = await call(h.router, 'post', reqOf({ body: { scope: 'student', id: sid } }))
    const id = created.body!.data.summary!.id!
    const patch = (userId: string, body: unknown, id2 = id): ReturnType<typeof call> => call(h.router, 'patch', reqOf({ staff: { userId, role: 'teacher', isGuest: false }, params: { summaryId: id2 }, body }))

    const other = await patch('u-B', { editedText: 'פריצה' })
    expect(other.error?.status).toBe(404)
    expect(other.error?.message).toBe(ERR_SUMMARY_NOT_FOUND)

    const bad = await patch('u-A', { editedText: 123 })
    expect(bad.error?.status).toBe(400)
    const empty = await patch('u-A', { editedText: '   ' })
    expect(empty.error?.status).toBe(400)
    const malformedId = await patch('u-A', { editedText: 'x' }, 'not a uuid!!')
    expect(malformedId.error?.status).toBe(404)

    const ok = await patch('u-A', { editedText: 'שלי' })
    expect(ok.error).toBeUndefined()
    expect(ok.body!.data.summary!.edited).toBe(true)
    expect(ok.body!.data.summary!.paragraphs).toEqual(['שלי'])
    expect(AI_SUMMARY_EP.edit.response.safeParse(ok.body).success).toBe(true)
    const back = await patch('u-A', { editedText: null })
    expect(back.body!.data.summary!.edited).toBe(false)

    const revoked = registerAiSummaryRoutes({ ...harness().deps, async authorize() { throw new AppError(403, 'אין הרשאה') } }, { service: createSummaryService({ llm: fakeLlm([GOOD]), store: h.store, now: () => NOW }) })
    expect((await call(revoked, 'patch', reqOf({ params: { summaryId: id }, body: { editedText: 'x' } }))).error?.status).toBe(403)

    const changedAudience = registerAiSummaryRoutes({ ...harness().deps, async authorize() { return { demo: false, audienceKey: 'subj:math' } } }, { service: createSummaryService({ llm: fakeLlm([GOOD]), store: h.store, now: () => NOW }) })
    expect((await call(changedAudience, 'patch', reqOf({ params: { summaryId: id }, body: { editedText: 'x' } }))).error?.status).toBe(404)
  })
})
