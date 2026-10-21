/* בדיקות ברמת HTTP של /api/ai-summary עם ה-deps האמיתיות (lib/aiSummary/deps.ts) מול ספקי v2 / תוצאות.
   מה אמיתי: הנתיב, ה-deps, resolveV2Context, הליבה של הספק (providerCore) על עולם ההדגמה, ליבת התוצאות (buildClassView), שירות הסיכום, השומר, חנות בזיכרון.
   מה מוחלף: האימות (x-user), הצופה (authz.loadViewer / toV2Viewer), יומן הגישה, הספק "החי" (= עולם ההדגמה — כדי שיהיו עובדות אמיתיות להקרין),
   טעינת התוצאות מה-DB (openSubmissionForSummary — בהרשאה האמיתית submissionVisible), והמודל (LLM מזויף). אין DB ואין קריאת LLM חיה. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import express from 'express'

const h = vi.hoisted(() => ({
  users: new Map<string, { staff: Record<string, unknown>; authz: Record<string, unknown>; v2: unknown }>(),
  logs: [] as { userId: string; entry: { studentId?: string | null; scope: string; endpoint: string }; opts: Record<string, unknown> }[],
  events: [] as string[],
  logFails: false,
  openSubmission: null as null | ((req: { staff: { userId: string } }, id: string) => Promise<{ classView(): Promise<unknown> }>),
}))

vi.mock('../middleware/staffAuth.js', async () => {
  const { AppError } = await import('../middleware/errors.js')
  return {
    requireStaff: (req: { headers: Record<string, string | undefined>; staff?: unknown }, _res: unknown, next: (e?: unknown) => void) => {
      const id = req.headers['x-user']
      const u = id ? h.users.get(id) : undefined
      if (!u) return next(new AppError(401, 'נדרשת התחברות צוות'))
      req.staff = u.staff
      next()
    },
    isDemoGuest: (req: { staff?: { isGuest?: boolean } }) => req.staff?.isGuest === true && process.env.DEMO_ANALYTICS !== '0',
  }
})
vi.mock('../lib/authz.js', async (orig) => {
  const m = await orig<typeof import('../lib/authz.js')>()
  const { AppError } = await import('../middleware/errors.js')
  return {
    ...m,
    loadViewer: vi.fn(async (req: { staff: { userId: string } }) => h.users.get(req.staff.userId)!.authz),
    logAccess: vi.fn(async (viewer: { userId: string }, entry: { studentId?: string | null; scope: string; endpoint: string }, opts?: Record<string, unknown>) => {
      h.events.push('log:start')
      await new Promise((r) => setTimeout(r, 25))
      if (h.logFails) throw new AppError(503, m.MSG_ACCESS_LOG_UNAVAILABLE)
      h.logs.push({ userId: viewer.userId, entry, opts: opts ?? {} })
      h.events.push('log:end')
    }),
  }
})
vi.mock('../lib/analyticsV2/liveViewer.js', async (orig) => ({
  ...(await orig<typeof import('../lib/analyticsV2/liveViewer.js')>()),
  toV2Viewer: vi.fn(async (base: { userId: string }) => h.users.get(base.userId)!.v2),
}))
/* הספק "החי" = עולם ההדגמה בזיכרון: כך משתמש אמיתי (grants פר-כיתה) מקבל עובדות אמיתיות, והמסלול של ה-LLM רץ על נתוני הדמו */
vi.mock('../lib/analyticsV2/liveProvider.js', async () => ({ liveProvider: (await import('../lib/analyticsV2/demoProvider.js')).demoProvider }))
vi.mock('../lib/results/realResults.js', async (orig) => ({
  ...(await orig<typeof import('../lib/results/realResults.js')>()),
  openSubmissionForSummary: (req: { staff: { userId: string } }, id: string) => h.openSubmission!(req, id),
}))

import { ERR_AGGREGATE_ONLY, ERR_NOT_FOUND, ERR_NO_ACCESS, ERR_V2_DISABLED, ERR_SUMMARY_NOT_FOUND } from '../../../src/shared/lib/findingsNarrative.js'
import { subjectName } from '../../../src/shared/lib/subjects.js'
import { AI_SUMMARY_EP } from '../../../src/shared/types/aiSummaryV1.js'
import { demoProvider, getAnalysis } from '../lib/analyticsV2/demoProvider.js'
import type { AnalyticsV2Provider } from '../lib/analyticsV2/provider.js'
import { adminViewer, grant, live } from '../lib/analyticsV2/providerTestkit.js'
import { createAiSummaryDeps } from '../lib/aiSummary/deps.js'
import { createSummaryService, type SummaryService } from '../lib/aiSummary/service.js'
import { createMemoryStore } from '../lib/aiSummary/store.js'
import { demoIdentifiers, fakeLlm, otherSubjectNames, type FakeLlm } from '../lib/aiSummary/testkit.js'
import { MSG_ACCESS_LOG_UNAVAILABLE, canUseResults, submissionVisible } from '../lib/authz.js'
import { buildClassView } from '../lib/results/core.js'
import { getDemoResults } from '../lib/results/demoResults.js'
import { AppError, errorHandler } from '../middleware/errors.js'
import { providerFor } from './analyticsV2.js'
import { SUMMARY_RATE, registerAiSummaryRoutes } from './aiSummary.js'

/* ── עולם ההדגמה: כיתות ותלמידים ── */
const A = getAnalysis()
const V2 = 'c-v2'
const V1 = 'c-v1'
const studentOf = (classId: string, i = 0): string => A.classById.get(classId)!.studentIds[i]
const S_V2 = A.world.students.find((s) => s.cast === 'maya')!.id /* ו׳2: שיפור במתמטיקה */
const S_V2_B = A.world.students.find((s) => s.cast === 'tamar')!.id /* ו׳2: ירידה במקביל בכמה מקצועות */
const S_V1 = studentOf(V1)
const submissions = getDemoResults().submissions
const subOf = (classId: string, subject: string): string => submissions.find((s) => s.def.classId === classId && s.quest.subject === subject)!.def.id
const SUB_MATH_V2 = subOf(V2, 'math')
const SUB_HISTORY_V2 = subOf(V2, 'history')
const SUB_MATH_V1 = subOf(V1, 'math')

/* ── משתמשים. לכל בדיקה משתמשים חדשים (id ייחודי) — כדי שמגבלת הקצב וחנות הסיכומים לא יידלפו בין בדיקות ── */
type Kind = 'home' | 'math' | 'math1' | 'mixed' | 'none' | 'unspec' | 'admin' | 'muni' | 'super' | 'guest' | 'demoorg'
const G = (classId: string, homeroom: boolean, subjectIds: string[] = [], unspecified = false) => [classId, { classId, homeroom, subjectIds: new Set(subjectIds), unspecified }] as const
let seq = 0
function addUser(kind: Kind): string {
  const id = `u-${kind}-${++seq}`
  const role = kind === 'admin' ? 'admin' : kind === 'muni' ? 'municipal_admin' : kind === 'super' ? 'super_admin' : 'teacher'
  const grants = new Map(
    kind === 'home' ? [G(V2, true)]
      : kind === 'math' ? [G(V2, false, ['sid-math']), G(V1, false, ['sid-math'])]
        : kind === 'math1' ? [G(V1, false, ['sid-math'])]
        : kind === 'mixed' ? [G(V1, true), G(V2, false, ['sid-math'])]
          : kind === 'unspec' ? [G(V2, false, [], true)]
            : kind === 'demoorg' ? [G(V2, true)]
              : [],
  )
  const v2 = kind === 'home' ? live([grant(V2, { homeroom: true })])
    : kind === 'math' ? live([grant(V2, { subjects: ['math'] }), grant(V1, { subjects: ['math'] })])
      : kind === 'math1' ? live([grant(V1, { subjects: ['math'] })])
      : kind === 'mixed' ? live([grant(V1, { homeroom: true }), grant(V2, { subjects: ['math'] })])
        : kind === 'unspec' ? live([grant(V2, { unspecified: true })])
          : kind === 'admin' || kind === 'muni' ? adminViewer
            : live([])
  h.users.set(id, {
    staff: { userId: id, role, schoolId: 'sch-1', isGuest: kind === 'guest', canShare: true },
    authz: { userId: id, role, schoolId: 'sch-1', grants, seesSynthetic: kind === 'demoorg' },
    v2,
  })
  return id
}
/* אותו משתמש, הרשאה אחרת (שינוי שיוך אחרי שנכתב סיכום) */
const regrant = (id: string, to: Kind): void => {
  const donor = h.users.get(addUser(to))!
  const cur = h.users.get(id)!
  h.users.set(id, { staff: cur.staff, authz: { ...donor.authz, userId: id }, v2: donor.v2 })
}

/* ── מודל מזויף: מחלץ את העובדות מההנחיה ומחזיר ניסוח שעובר את השומר (כל מספר מצוטט מהעובדות) ── */
const factsOf = (user: string): { id: string; text: string }[] => JSON.parse(user.slice(user.indexOf('[\n {'))) as { id: string; text: string }[]
const goodFromPrompt = (req: { user: string }): string => {
  const f = factsOf(req.user)
  const pick = (i: number) => f[i % f.length]
  const a = [pick(0), pick(1)]
  const b = [pick(2)]
  return JSON.stringify({
    paragraphs: [
      { text: `לפי הנתונים, ${a.map((x) => x.text).join(' ')}`, facts: a.map((x) => x.id) },
      { text: `נראה ש${b.map((x) => x.text).join(' ')} כדאי לקיים שיחה קצרה ולעקוב שוב בעוד כמה שבועות.`, facts: b.map((x) => x.id) },
    ],
  })
}

/* ── שרת ── */
let llm: FakeLlm
let store = createMemoryStore()
let current: SummaryService
const service: SummaryService = {
  get: (r) => current.get(r), generate: (r, o) => current.generate(r, o), describe: (i, v) => current.describe(i, v), edit: (a) => current.edit(a),
}
const providerCalls = { student: 0, classOverview: 0, classSubject: 0 }
const counting: AnalyticsV2Provider = {
  ...demoProvider,
  student: (...a) => { providerCalls.student++; return demoProvider.student(...a) },
  classOverview: (...a) => { providerCalls.classOverview++; return demoProvider.classOverview(...a) },
  classSubject: (...a) => { providerCalls.classSubject++; return demoProvider.classSubject(...a) },
}
let genderLookups: string[] = []

let server: Server
let base = ''
beforeAll(async () => {
  h.openSubmission = async (req, id) => {
    const viewer = h.users.get(req.staff.userId)!.authz as never
    if (!canUseResults(viewer)) throw new AppError(403, 'role')
    const s = getDemoResults().byId.get(id)
    if (!s || !submissionVisible(viewer, s.def.classId, { subject_id: `sid-${s.quest.subject}`, created_by: null }, null)) throw new AppError(404, ERR_NOT_FOUND)
    return { classView: async () => buildClassView(s.input) }
  }
  const app = express()
  app.set('trust proxy', true)
  app.use(express.json())
  const deps = createAiSummaryDeps({ providerFor: (ctx) => (providerFor(ctx) === demoProvider ? counting : providerFor(ctx)), studentGender: async (id) => { genderLookups.push(id); return 'female' } })
  app.use('/api/ai-summary', registerAiSummaryRoutes(deps, { service }))
  app.use(errorHandler)
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()) })
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ai-summary`
})
afterAll(async () => { await new Promise((r) => server.close(r)) })
beforeEach(() => {
  for (const k of ['ANALYTICS_V2', 'ANALYTICS_V2_LIVE', 'ANALYTICS_V2_AUDIT_FAIL_CLOSED', 'ANALYTICS_V2_PROVIDER', 'DEMO_ANALYTICS', 'AI_SUMMARY_DEMO_LLM']) delete process.env[k]
  h.logs.length = 0
  h.events.length = 0
  h.logFails = false
  genderLookups = []
  providerCalls.student = providerCalls.classOverview = providerCalls.classSubject = 0
  llm = fakeLlm([(req) => { h.events.push('llm'); return goodFromPrompt(req) }])
  store = createMemoryStore()
  current = createSummaryService({ llm, store, demoLlm: false })
})

let ipSeq = 0
interface Res { status: number; body: Record<string, any> } // eslint-disable-line @typescript-eslint/no-explicit-any
async function call(method: 'GET' | 'POST' | 'PATCH', pathOrQuery: string, user: string | null, body?: unknown): Promise<Res> {
  const res = await fetch(base + pathOrQuery, {
    method,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.7.${++ipSeq % 250}.${Math.floor(ipSeq / 250) + 1}`, ...(user ? { 'x-user': user } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, body: (await res.json()) as Res['body'] }
}
const q = (scope: string, id: string, extra = ''): string => `?scope=${scope}&id=${encodeURIComponent(id)}${extra}`
const post = (user: string | null, scope: string, id: string, extra: Record<string, unknown> = {}, query = ''): Promise<Res> => call('POST', query, user, { scope, id, ...extra })
const llmText = (): string => llm.calls.map((c) => c.system + '\n' + c.user).join('\n')
/* ההקשר הדינמי בלבד (העובדות והשורות הנלוות); ההנחיה הקבועה (system) אומרת "בעברית" ולכן אינה מתאימה לבדיקת שמות מקצוע */
const userText = (): string => llm.calls.map((c) => c.user).join('\n')
const SCOPES: [string, string, string][] = [['student', S_V2, ''], ['class', V2, ''], ['class_subject', V2, '&subject=math'], ['submission', SUB_MATH_V2, '']]

describe('מנהל / מנהל עירוני / מנהל-על: אין סיכום בשום היקף (חוק 8)', () => {
  it.each(['admin', 'muni'] as const)('%s: 403 לפני כל טעינה / יומן / LLM — בכל ארבעת ההיקפים, גם על ישות שאינה קיימת', async (kind) => {
    const u = addUser(kind)
    for (const [scope, id, extra] of [...SCOPES, ['student', 'does-not-exist', ''], ['submission', 'does-not-exist', '']] as [string, string, string][]) {
      const g = await call('GET', q(scope, id, extra), u)
      expect(g.status, `GET ${scope}`).toBe(403)
      expect(g.body.error, `GET ${scope}`).toBe(ERR_AGGREGATE_ONLY)
      const p = await post(u, scope, id, extra ? { subject: 'math' } : {})
      expect(p.status, `POST ${scope}`).toBe(403)
      expect(p.body.error).toBe(ERR_AGGREGATE_ONLY)
    }
    expect(llm.calls).toHaveLength(0)
    expect(h.logs).toHaveLength(0)
    expect(genderLookups).toEqual([])
    expect(providerCalls).toEqual({ student: 0, classOverview: 0, classSubject: 0 })
    expect(store.rows.size).toBe(0)
  })

  it('מנהל-על: 403 בכל ההיקפים (v2 — כבוי למנהל-על; הגשה — אין סיכום), בלי LLM', async () => {
    const u = addUser('super')
    for (const [scope, id, extra] of SCOPES) {
      const r = await call('GET', q(scope, id, extra), u)
      expect(r.status, scope).toBe(403)
      expect(r.body.error, scope).toBe(scope === 'submission' ? ERR_NO_ACCESS : ERR_V2_DISABLED)
    }
    expect(llm.calls).toHaveLength(0)
    expect(h.logs).toHaveLength(0)
  })

  it('בלי התחברות: 401', async () => {
    expect((await call('GET', q('student', S_V2), null)).status).toBe(401)
  })
})

describe('מחנך הכיתה: כל ההיקפים', () => {
  it('תלמיד/ה: נכתב ב-AI, קהל מלא, נשמר אישית; התגובה עומדת בחוזה; מגדר נקרא רק אחרי ההרשאה', async () => {
    const u = addUser('home')
    const r = await post(u, 'student', S_V2)
    expect(r.status).toBe(200)
    expect(AI_SUMMARY_EP.create.response.safeParse(r.body).success).toBe(true)
    expect(r.body.data).toMatchObject({ demo: false, persisted: true })
    expect(r.body.data.summary.writtenBy).toBe('ai')
    expect(llm.calls).toHaveLength(1)
    const [row] = [...store.rows.values()]
    expect(row).toMatchObject({ viewerId: u, scope: 'student', entityId: S_V2, audienceKey: 'full', writtenBy: 'ai' })
    expect(genderLookups).toEqual([S_V2])
    /* מחנך רואה את כל מקצועות התלמיד: לפחות שני מקצועות בעובדות שנשלחו */
    const facts = factsOf(llm.calls[0].user).map((f) => f.text).join(' ')
    const named = A.studentById.get(S_V2)!.subjects.filter((s) => facts.includes(subjectName(s)))
    expect(named.length).toBeGreaterThanOrEqual(2)
  })

  it('מגדר מועבר להנחיה (לשון נקבה כשהתלמידה מוגדרת נקבה)', async () => {
    const u = addUser('home')
    await post(u, 'student', S_V2)
    expect(llm.calls[0].user).toContain('בלשון נקבה')
  })

  it('כיתה, מקצוע בכיתה והגשה', async () => {
    const u = addUser('home')
    for (const [scope, id, extra] of [['class', V2, {}], ['class_subject', V2, { subject: 'math' }], ['submission', SUB_MATH_V2, {}]] as [string, string, Record<string, unknown>][]) {
      const r = await post(u, scope, id, extra)
      expect(r.status, scope).toBe(200)
      expect(r.body.data.summary.writtenBy, scope).toBe('ai')
      expect(r.body.data.demo, scope).toBe(false)
      expect(AI_SUMMARY_EP.create.response.safeParse(r.body).success, scope).toBe(true)
    }
    expect([...store.rows.values()].map((x) => `${x.scope}:${x.audienceKey}`).sort()).toEqual(['class:full', 'class_subject:full', 'submission:full'])
  })

  it('הגשה של מקצוע אחר באותה כיתה: מחנך הכיתה רואה את כל השליחות לכיתתו', async () => {
    const u = addUser('home')
    expect((await post(u, 'submission', SUB_HISTORY_V2)).status).toBe(200)
  })

  it('הספק נטען פעם אחת לבקשה: authorize ו-load משתפים את התוצאה', async () => {
    const u = addUser('home')
    await post(u, 'student', S_V2)
    await post(u, 'class', V2)
    await post(u, 'class_subject', V2, { subject: 'math' })
    expect(providerCalls).toEqual({ student: 1, classOverview: 1, classSubject: 1 })
  })

  it('GET: אין סיכום עדיין → זכאות, בלי LLM; אחרי POST — הסיכום השמור', async () => {
    const u = addUser('home')
    const g1 = await call('GET', q('student', S_V2), u)
    expect(g1.status).toBe(200)
    expect(g1.body.data).toMatchObject({ summary: null, eligibility: { ok: true }, demo: false })
    expect(llm.calls).toHaveLength(0)
    const p = await post(u, 'student', S_V2)
    const g2 = await call('GET', q('student', S_V2), u)
    expect(g2.body.data.summary.id).toBe(p.body.data.summary.id)
    expect(llm.calls).toHaveLength(1)
  })
})

describe('מורה מקצועי (מתמטיקה): רק מקצועו', () => {
  it('תלמיד/ה: קהל subj:math, ובעובדות / בהנחיה / בתגובה אין אף מקצוע אחר (canary)', async () => {
    const u = addUser('math')
    const r = await post(u, 'student', S_V2)
    expect(r.status).toBe(200)
    const [row] = [...store.rows.values()]
    expect(row.audienceKey).toBe('subj:math')
    const sent = userText()
    for (const other of otherSubjectNames('math')) expect(sent.includes(other), `בהנחיה: ${other}`).toBe(false)
    expect(JSON.stringify(r.body).includes('ירידה במקביל'), 'התרעה חוצת-מקצועות היא למחנך בלבד').toBe(false)
    for (const f of row.inputFacts) for (const other of otherSubjectNames('math')) expect(f.text.includes(other), `עובדה שנשמרה: ${other}`).toBe(false)
    expect(sent).toContain(subjectName('math'))
  })

  it('תלמיד/ה עם התרעה חוצת-מקצועות: מחנך מקבל אותה בעובדות, מורה מקצועי לא', async () => {
    const hr = addUser('home')
    await post(hr, 'student', S_V2_B)
    const forHomeroom = factsOf(llm.calls[0].user).map((f) => f.text).join(' ')
    const t = addUser('math')
    await post(t, 'student', S_V2_B)
    const forTeacher = factsOf(llm.calls[1].user).map((f) => f.text).join(' ')
    expect(forHomeroom.length).toBeGreaterThan(forTeacher.length)
    for (const other of otherSubjectNames('math')) expect(forTeacher.includes(other)).toBe(false)
  })

  it('כיתה (סקירה): 403 — מחנך הכיתה בלבד; בלי LLM ובלי יומן', async () => {
    const u = addUser('math')
    const r = await post(u, 'class', V2)
    expect(r.status).toBe(403)
    expect(r.body.error).toBe(ERR_NO_ACCESS)
    expect(llm.calls).toHaveLength(0)
    expect(h.logs).toHaveLength(0)
  })

  it('מקצוע בכיתה: מקצועו פתוח (קהל subj:math), מקצוע אחר נעול — 403', async () => {
    const u = addUser('math')
    expect((await post(u, 'class_subject', V2, { subject: 'math' })).status).toBe(200)
    expect([...store.rows.values()][0].audienceKey).toBe('subj:math')
    const locked = await post(u, 'class_subject', V2, { subject: 'history' })
    expect(locked.status).toBe(403)
    expect(locked.body.error).toBe(ERR_NO_ACCESS)
    expect(llm.calls).toHaveLength(1)
  })

  it('הגשה: רק של מקצועו — של מקצוע אחר 404 אחיד (כמו שליחה שאינה קיימת)', async () => {
    const u = addUser('math')
    expect((await post(u, 'submission', SUB_MATH_V2)).status).toBe(200)
    const other = await post(u, 'submission', SUB_HISTORY_V2)
    const missing = await post(u, 'submission', 'nope')
    expect([other.status, other.body]).toEqual([404, missing.body])
    expect(missing.status).toBe(404)
    expect(llm.calls).toHaveLength(1)
  })
})

describe('מורה מעורב (מחנך ו׳1 + מתמטיקה בו׳2): אין מכפלה קרטזית', () => {
  it('תלמיד/ה בכיתת המחנכות: קהל מלא · תלמיד/ה בכיתה שמלמד בה: קהל subj:math', async () => {
    const u = addUser('mixed')
    expect((await post(u, 'student', S_V1)).status).toBe(200)
    expect((await post(u, 'student', S_V2)).status).toBe(200)
    const aud = Object.fromEntries([...store.rows.values()].map((r) => [r.entityId, r.audienceKey]))
    expect(aud).toEqual({ [S_V1]: 'full', [S_V2]: 'subj:math' })
    /* ההנחיה של תלמיד/ה בו׳2 לא כוללת מקצוע אחר */
    for (const other of otherSubjectNames('math')) expect(llm.calls[1].user.includes(other), other).toBe(false)
  })

  it('סקירה: בכיתת המחנכות כן, בכיתה השנייה 403; מקצוע בכיתה השנייה: רק מתמטיקה', async () => {
    const u = addUser('mixed')
    expect((await post(u, 'class', V1)).status).toBe(200)
    expect((await post(u, 'class', V2)).status).toBe(403)
    expect((await post(u, 'class_subject', V2, { subject: 'math' })).status).toBe(200)
    expect((await post(u, 'class_subject', V2, { subject: 'history' })).status).toBe(403)
    expect((await post(u, 'class_subject', V1, { subject: 'history' })).status).toBe(200) /* מחנך ו׳1: כל מקצועות הכיתה */
  })

  it('הגשות: של כיתת המחנכות כל המקצועות, של הכיתה השנייה רק מתמטיקה', async () => {
    const u = addUser('mixed')
    const hist1 = subOf(V1, 'history')
    expect((await post(u, 'submission', hist1)).status).toBe(200)
    expect((await post(u, 'submission', SUB_MATH_V2)).status).toBe(200)
    expect((await post(u, 'submission', SUB_HISTORY_V2)).status).toBe(404)
  })
})

describe('מורה בלי הרשאה / שיוך בלי מקצוע', () => {
  it('מורה בלי כיתות: 404 אחיד בכל ההיקפים, בלי LLM ובלי יומן', async () => {
    const u = addUser('none')
    for (const [scope, id, extra] of SCOPES) {
      const r = await post(u, scope, id, extra ? { subject: 'math' } : {})
      expect(r.status, scope).toBe(404)
      expect(r.body.error, scope).toBe(ERR_NOT_FOUND)
    }
    expect(llm.calls).toHaveLength(0)
    expect(h.logs).toHaveLength(0)
  })

  it('מורה בכיתה אחרת (ו׳1 בלבד) לא מקבל תלמיד/ה / כיתה / הגשה של ו׳2', async () => {
    const u = addUser('math1')
    for (const [scope, id, extra] of SCOPES) expect((await post(u, scope, id, extra ? { subject: 'math' } : {})).status, scope).toBe(404)
    expect((await post(u, 'submission', SUB_MATH_V1)).status).toBe(200)
  })

  it('שיוך בלי מקצוע: הכיתה בהיקף אך כל המקצועות נעולים — אין עובדות, ולכן "אין עדיין מספיק נתונים" ובלי LLM', async () => {
    const u = addUser('unspec')
    const r = await post(u, 'student', S_V2)
    expect(r.status).toBe(200)
    expect(r.body.dataState).toBe('insufficient')
    expect(r.body.data.eligibility.ok).toBe(false)
    expect(r.body.data.summary).toBeNull()
    expect(llm.calls).toHaveLength(0)
    expect((await post(u, 'class', V2)).status).toBe(403)
    expect((await post(u, 'class_subject', V2, { subject: 'math' })).status).toBe(403)
    expect((await post(u, 'submission', SUB_MATH_V2)).status).toBe(404)
  })
})

describe('אורח וארגון הדגמה: תבנית בלבד — בלי LLM, בלי שמירה, בלי יומן, בלי מגדר מה-DB', () => {
  it('אורח (עדשת מחנך): כל ההיקפים demo=true, writtenBy=template, id=null', async () => {
    const u = addUser('guest')
    for (const [scope, id, extra] of SCOPES) {
      const r = await post(u, scope, id, extra ? { subject: 'math' } : {}, '?lens=homeroom')
      expect(r.status, scope).toBe(200)
      expect(r.body.data, scope).toMatchObject({ demo: true, persisted: false })
      expect(r.body.data.summary, scope).toMatchObject({ writtenBy: 'template', id: null })
      expect(AI_SUMMARY_EP.create.response.safeParse(r.body).success, scope).toBe(true)
    }
    expect(llm.calls).toHaveLength(0)
    expect(store.rows.size).toBe(0)
    expect(h.logs).toHaveLength(0)
    expect(genderLookups).toEqual([])
  })

  it('אורח: עריכה — 403; עדשת מנהל — 403 בכל ההיקפים; עדשת מורה מקצועי — מקצועו בלבד', async () => {
    const u = addUser('guest')
    expect((await call('PATCH', '/11111111-1111-4111-8111-111111111111', u, { editedText: 'x' })).status).toBe(403)
    for (const [scope, id, extra] of SCOPES) expect((await post(u, scope, id, extra ? { subject: 'math' } : {}, '?lens=admin')).status, scope).toBe(403)
    const lens = '?lens=subject_teacher&subject=math'
    expect((await post(u, 'student', S_V2, {}, lens)).status).toBe(200)
    expect((await post(u, 'class', V2, {}, lens)).status).toBe(403)
    expect((await post(u, 'submission', SUB_HISTORY_V2, {}, lens)).status).toBe(403)
    for (const other of otherSubjectNames('math')) expect(JSON.stringify((await post(u, 'student', S_V2, {}, lens)).body).includes(other), other).toBe(false)
    expect(llm.calls).toHaveLength(0)
  })

  it('AI_SUMMARY_DEMO_LLM=1: רק אז אורח מקבל ניסוח מהמודל — ועדיין בלי שמירה', async () => {
    current = createSummaryService({ llm, store, demoLlm: true })
    const u = addUser('guest')
    const r = await post(u, 'student', S_V2, {}, '?lens=homeroom')
    expect(r.body.data.summary.writtenBy).toBe('ai')
    expect(r.body.data.summary.id).toBeNull()
    expect(store.rows.size).toBe(0)
    expect(llm.calls).toHaveLength(1)
  })

  it('ארגון הדגמה: v2 מעולם ההדגמה — demo=true, בלי LLM ובלי שמירה ובלי יומן; הגשה — העובדות מהתוצאות האמיתיות אך הסיכום תבניתי', async () => {
    const u = addUser('demoorg')
    const s = await post(u, 'student', S_V2)
    expect(s.body.data).toMatchObject({ demo: true, persisted: false })
    expect(s.body.data.summary.writtenBy).toBe('template')
    for (const [scope, id, extra] of [['class', V2, {}], ['class_subject', V2, { subject: 'math' }]] as [string, string, Record<string, unknown>][]) {
      const r = await post(u, scope, id, extra)
      expect(r.status, scope).toBe(200)
      expect(r.body.data, scope).toMatchObject({ demo: true, persisted: false })
      expect(r.body.data.summary.writtenBy, scope).toBe('template')
    }
    const sub = await post(u, 'submission', SUB_MATH_V2)
    expect(sub.status).toBe(200)
    expect(sub.body.data).toMatchObject({ demo: true })
    expect(sub.body.data.summary.writtenBy).toBe('template')
    expect(llm.calls).toHaveLength(0)
    expect(store.rows.size).toBe(0)
    expect(h.logs).toHaveLength(0)
    expect(genderLookups).toEqual([])
  })
})

describe('יומן גישה', () => {
  it('תלמיד/ה: נכתב (await) לפני טעינת הנתונים ולפני ה-LLM, ברמת תלמיד, עם הבקשה נכשל-סגור לפי המדיניות', async () => {
    const u = addUser('home')
    await post(u, 'student', S_V2)
    expect(h.logs).toEqual([{ userId: u, entry: { studentId: S_V2, scope: 'ai_summary_student', endpoint: 'ai-summary' }, opts: { studentLevel: true } }])
    expect(h.events).toEqual(['log:start', 'log:end', 'llm'])
  })

  it('כיתה והגשה: שורה אחת בלי תלמיד, ובלי studentLevel', async () => {
    const u = addUser('home')
    await post(u, 'class', V2)
    await post(u, 'submission', SUB_MATH_V2)
    expect(h.logs.map((l) => [l.entry.scope, l.entry.studentId, l.opts])).toEqual([['ai_summary_class', null, {}], ['ai_summary_submission', null, {}]])
  })

  it('ANALYTICS_V2_AUDIT_FAIL_CLOSED=all: נכשל-סגור לכל התפקידים (כמו בנתיבי v2)', async () => {
    process.env.ANALYTICS_V2_AUDIT_FAIL_CLOSED = 'all'
    const u = addUser('home')
    await post(u, 'student', S_V2)
    expect(h.logs[0].opts).toEqual({ studentLevel: true, failClosed: 'all' })
  })

  it('כשל בכתיבה ליומן: 503, בלי LLM ובלי תוכן סיכום', async () => {
    h.logFails = true
    const u = addUser('home')
    const r = await post(u, 'student', S_V2)
    expect(r.status).toBe(503)
    expect(r.body).toEqual({ error: MSG_ACCESS_LOG_UNAVAILABLE })
    expect(llm.calls).toHaveLength(0)
    expect(store.rows.size).toBe(0)
    expect((await call('GET', q('student', S_V2), u)).status).toBe(503)
  })

  it('דחיות (404 / 403) לא נרשמות', async () => {
    const t = addUser('math')
    await post(t, 'class', V2)
    await post(t, 'student', 'ghost')
    await post(addUser('none'), 'student', S_V2)
    expect(h.logs).toHaveLength(0)
  })
})

describe('cache אישי: לא דולף בין צופים ולא בין קהלים', () => {
  it('מחנך ב׳ באותה כיתה לא רואה את הסיכום של מחנך א׳, ויוצר משלו (קריאת מודל נוספת)', async () => {
    const a = addUser('home')
    const b = addUser('home')
    const pa = await post(a, 'student', S_V2)
    expect((await call('GET', q('student', S_V2), b)).body.data.summary).toBeNull()
    const pb = await post(b, 'student', S_V2)
    expect(pb.body.data.summary.id).not.toBe(pa.body.data.summary.id)
    expect(llm.calls).toHaveLength(2)
    /* ושוב א׳: אותו סיכום, בלי קריאה נוספת */
    expect((await post(a, 'student', S_V2)).body.data.summary.id).toBe(pa.body.data.summary.id)
    expect(llm.calls).toHaveLength(2)
  })

  it('מורה מקצועי לא רואה את הסיכום המלא של המחנך על אותו תלמיד/ה', async () => {
    const hr = addUser('home')
    const t = addUser('math')
    await post(hr, 'student', S_V2)
    expect((await call('GET', q('student', S_V2), t)).body.data.summary).toBeNull()
  })

  it('אותו משתמש שההרשאה שלו הצטמצמה (מחנך → מקצועי): הסיכום המלא הישן לא מוחזר', async () => {
    const u = addUser('home')
    const full = await post(u, 'student', S_V2)
    expect(full.body.data.summary.id).toBeTruthy()
    regrant(u, 'math')
    expect((await call('GET', q('student', S_V2), u)).body.data.summary).toBeNull()
    const narrowed = await post(u, 'student', S_V2)
    expect(narrowed.body.data.summary.id).not.toBe(full.body.data.summary.id)
    for (const other of otherSubjectNames('math')) expect(llm.calls[1].user.includes(other), other).toBe(false)
  })
})

describe('PATCH (עריכה אישית)', () => {
  it('הבעלים עורך וחוזר לטקסט המקורי; צופה אחר, מנהל ואורח — לא', async () => {
    const u = addUser('home')
    const created = await post(u, 'student', S_V2)
    const id = created.body.data.summary.id as string
    const edit = await call('PATCH', `/${id}`, u, { editedText: 'ניסוח שלי' })
    expect(edit.status).toBe(200)
    expect(edit.body.data.summary).toMatchObject({ edited: true, paragraphs: ['ניסוח שלי'] })
    expect(AI_SUMMARY_EP.edit.response.safeParse(edit.body).success).toBe(true)
    const other = await call('PATCH', `/${id}`, addUser('home'), { editedText: 'פריצה' })
    expect([other.status, other.body.error]).toEqual([404, ERR_SUMMARY_NOT_FOUND])
    expect((await call('PATCH', `/${id}`, addUser('admin'), { editedText: 'x' })).status).toBe(404)
    expect((await call('PATCH', `/${id}`, addUser('guest'), { editedText: 'x' })).status).toBe(403)
    const back = await call('PATCH', `/${id}`, u, { editedText: null })
    expect(back.body.data.summary.edited).toBe(false)
  })

  it('הרשאה שבוטלה אחרי הכתיבה: העריכה נדחית', async () => {
    const u = addUser('home')
    const id = (await post(u, 'student', S_V2)).body.data.summary.id as string
    regrant(u, 'none')
    expect((await call('PATCH', `/${id}`, u, { editedText: 'x' })).status).toBe(404)
  })
})

describe('מתגי כיבוי והגבלות', () => {
  it('ANALYTICS_V2=0 / ANALYTICS_V2_LIVE=0: סיכום תלמיד / כיתה כבוי (403); הגשה אינה תלויה באנליטיקה', async () => {
    const u = addUser('home')
    for (const flag of ['ANALYTICS_V2', 'ANALYTICS_V2_LIVE']) {
      process.env[flag] = '0'
      const s = await post(u, 'student', S_V2)
      expect([s.status, s.body.error]).toEqual([403, ERR_V2_DISABLED])
      expect((await post(u, 'class', V2)).status).toBe(403)
      delete process.env[flag]
    }
    process.env.ANALYTICS_V2 = '0'
    expect((await post(u, 'submission', SUB_MATH_V2)).status).toBe(200)
    expect(llm.calls).toHaveLength(1)
  })

  it('ANALYTICS_V2_PROVIDER=empty: ספק ריק — אין עובדות, "אין עדיין מספיק נתונים" ובלי LLM', async () => {
    process.env.ANALYTICS_V2_PROVIDER = 'empty'
    const r = await post(addUser('home'), 'student', S_V2)
    expect(r.body.data.eligibility.ok).toBe(false)
    expect(llm.calls).toHaveLength(0)
  })

  it(`הגבלת קצב: ${SUMMARY_RATE.generatePerUser} יצירות בדקה למשתמש, ו-GET אינו מוגבל על ידן`, async () => {
    const u = addUser('home')
    const students = A.classById.get(V2)!.studentIds.slice(0, SUMMARY_RATE.generatePerUser + 1)
    for (const id of students.slice(0, SUMMARY_RATE.generatePerUser)) expect((await post(u, 'student', id)).status, id).not.toBe(429)
    expect((await post(u, 'student', students[SUMMARY_RATE.generatePerUser])).status).toBe(429)
    expect((await call('GET', q('student', students[0]), u)).status).toBe(200)
  })

  it('בקשות לא תקינות: 400', async () => {
    const u = addUser('home')
    expect((await call('GET', '?scope=student', u)).status).toBe(400)
    expect((await post(u, 'galaxy', 'x')).status).toBe(400)
    expect((await call('POST', '', u, { scope: 'class_subject', id: V2 })).status).toBe(400)
  })
})

describe('פרטיות (חוק 12): אף שם / מזהה / שם כיתה / שם מורה לא מגיע למודל ולא חוזר בתגובה', () => {
  it('כל ההיקפים × כל התפקידים על עולם ההדגמה — ההנחיה המלאה (system + user) והתגובות נקיות', async () => {
    const ids = demoIdentifiers()
    const fullNames = ids.names
    const firstNames = [...new Set(ids.names.flatMap((n) => n.split(/\s+/)).filter((t) => t.length >= 3))].map((t) => new RegExp(`(?<![א-ת])${t}(?![א-ת])`))
    const forbidden = [...fullNames, ...ids.ids, ...ids.classNames, ...ids.teachers]
    const leaks = (text: string): string[] => [...forbidden.filter((t) => text.includes(t)), ...firstNames.filter((re) => re.test(text)).map(String)]
    const bodies: string[] = []
    /* משתמש חדש לכל קריאה — תקרת היצירה (6 בדקה) היא פר-משתמש */
    const run = async (kind: Kind, scope: string, id: string, extra: Record<string, unknown> = {}): Promise<void> => {
      const r = await post(addUser(kind), scope, id, extra)
      expect(r.status, `${kind} ${scope} ${id}`).toBe(200)
      /* היעד (target.id) הוא הד של מה שהלקוח עצמו ביקש — הוא אינו "דליפה"; כל השאר בתגובה חייב להיות נקי */
      bodies.push(JSON.stringify({ ...r.body.data, summary: { ...r.body.data.summary, target: undefined } }))
    }
    for (const sid of A.classById.get(V2)!.studentIds.slice(0, 3)) { await run('home', 'student', sid); await run('math', 'student', sid) }
    await run('mixed', 'student', S_V1)
    await run('home', 'class', V2)
    await run('mixed', 'class', V1)
    for (const subject of ['math', 'history', 'science']) await run('home', 'class_subject', V2, { subject })
    await run('math', 'class_subject', V2, { subject: 'math' })
    for (const s of submissions.filter((x) => x.def.classId === V2).slice(0, 4)) await run('home', 'submission', s.def.id)
    await run('math', 'submission', SUB_MATH_V2)
    expect(llm.calls.length).toBeGreaterThanOrEqual(15)
    expect(leaks(llmText()), 'הנחיה למודל').toEqual([])
    for (const row of store.rows.values()) expect(leaks(JSON.stringify(row.inputFacts)), 'עובדות שנשמרו').toEqual([])
    for (const b of bodies) expect(leaks(b), 'תגובה').toEqual([])
  }, 60_000)

  it('שם התלמיד/ה לא נשלח גם כשהוא מופיע בנתוני הספק (displayName קיים בחוזה, ולא בהנחיה)', async () => {
    const overview = (await demoProvider.student(live([grant(V2, { homeroom: true })]), S_V2)).data
    expect(overview.student.displayName.length).toBeGreaterThan(2)
    await post(addUser('home'), 'student', S_V2)
    expect(llmText().includes(overview.student.displayName)).toBe(false)
    expect(llmText().includes(overview.student.displayName.split(' ')[0])).toBe(false)
  })
})
