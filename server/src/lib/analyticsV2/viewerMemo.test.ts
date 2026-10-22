/* F1: מטמון הצופה (ViewerMemo + resolveV2Context): TTL קצר, single-flight, כשל לא נשמר, מפתח לפי משתמש+תפקיד+בית ספר.
   המטמון מקצר את זמן הבקשה (בלי סבבי DB על class_teachers / schools / classes בכל בקשה); המחיר: שינוי הרשאות תופס תוך TTL. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Request } from 'express'

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>
  const state = { classes: [] as Row[], error: false, queries: 0 }
  const client = {
    from: (table: string) => ({
      select: () => ({
        in: async (_col: string, ids: string[]) => {
          state.queries++
          if (state.error) return { data: null, error: { message: 'down' } }
          return { data: table === 'classes' ? state.classes.filter((r) => ids.includes(r.id as string)) : [], error: null }
        },
      }),
    }),
  }
  return { state, client }
})
vi.mock('../supabase.js', () => ({ supabaseAdmin: h.client, supabaseAnon: {} }))
vi.mock('../authz.js', async (orig) => ({ ...(await orig<typeof import('../authz.js')>()), loadViewer: vi.fn() }))
vi.mock('../subjects.js', () => ({ subjectById: vi.fn(async () => null) }))

import { loadViewer, type TeachGrant, type Viewer } from '../authz.js'
import { ViewerMemo, VIEWER_MEMO_DEFAULT_TTL_MS, viewerMemoTtlMs } from './liveViewer.js'
import { resetViewerCaches, resolveV2Context } from './viewer.js'

/* ══ ViewerMemo (יחידה) ══ */
describe('ViewerMemo', () => {
  let t = 0
  const memo = (ttl = 20_000, max = 500): ViewerMemo<string> => new ViewerMemo<string>({ ttlMs: () => ttl, maxEntries: max, now: () => t })
  beforeEach(() => { t = 1_000 })

  it('אותו מפתח בתוך ה-TTL: טעינה אחת; מפתח אחר: טעינה נפרדת', async () => {
    const m = memo()
    const load = vi.fn(async () => 'v')
    expect(await m.get('a', load)).toBe('v')
    t += 19_999
    expect(await m.get('a', load)).toBe('v')
    expect(load).toHaveBeenCalledTimes(1)
    await m.get('b', load)
    expect(load).toHaveBeenCalledTimes(2)
  })
  it('אחרי ה-TTL: טוען מחדש', async () => {
    const m = memo()
    let n = 0
    const load = async (): Promise<string> => `v${++n}`
    expect(await m.get('a', load)).toBe('v1')
    t += 20_000
    expect(await m.get('a', load)).toBe('v2')
  })
  it('single-flight: בקשות מקבילות שמגיעות בזמן הטעינה — טעינה אחת ואותה תוצאה', async () => {
    const m = memo()
    let release: (v: string) => void = () => undefined
    const load = vi.fn(() => new Promise<string>((r) => { release = r }))
    const all = Promise.all([m.get('a', load), m.get('a', load), m.get('a', load)])
    release('shared')
    expect(await all).toEqual(['shared', 'shared', 'shared'])
    expect(load).toHaveBeenCalledTimes(1)
  })
  it('ה-TTL נמדד מסיום הטעינה, לא מתחילתה (טעינה איטית לא "אוכלת" את החלון)', async () => {
    const m = memo()
    let release: (v: string) => void = () => undefined
    const load = vi.fn(() => new Promise<string>((r) => { release = r }))
    const p = m.get('a', load)
    t += 15_000
    release('slow')
    await p
    t += 15_000
    await m.get('a', load)
    expect(load).toHaveBeenCalledTimes(1)
  })
  it('כשל לא נשמר: כל הממתינים נכשלים, והבקשה הבאה מנסה שוב', async () => {
    const m = memo()
    let reject: (e: Error) => void = () => undefined
    const bad = vi.fn(() => new Promise<string>((_r, rej) => { reject = rej }))
    const a = m.get('a', bad)
    const b = m.get('a', bad)
    reject(new Error('down'))
    await expect(a).rejects.toThrow('down')
    await expect(b).rejects.toThrow('down')
    expect(m.size).toBe(0)
    const good = vi.fn(async () => 'ok')
    expect(await m.get('a', good)).toBe('ok')
    expect(good).toHaveBeenCalledTimes(1)
  })
  it('TTL=0: אין מטמון בכלל (כל קריאה טוענת)', async () => {
    const m = memo(0)
    const load = vi.fn(async () => 'v')
    await m.get('a', load)
    await m.get('a', load)
    expect(load).toHaveBeenCalledTimes(2)
    expect(m.size).toBe(0)
  })
  it('תקרת ערכים: הישן ביותר נפלט', async () => {
    const m = memo(20_000, 2)
    const load = vi.fn(async () => 'v')
    await m.get('a', load); await m.get('b', load); await m.get('c', load)
    expect(m.size).toBe(2)
    await m.get('a', load)
    expect(load).toHaveBeenCalledTimes(4)
  })
  it('clear() מאפס', async () => {
    const m = memo()
    const load = vi.fn(async () => 'v')
    await m.get('a', load)
    m.clear()
    await m.get('a', load)
    expect(load).toHaveBeenCalledTimes(2)
  })
})

describe('viewerMemoTtlMs: ברירות מחדל ומתג', () => {
  afterEach(() => { delete process.env.ANALYTICS_V2_VIEWER_TTL_MS })
  it('בבדיקות (VITEST) המטמון כבוי כברירת מחדל; ברירת המחדל בייצור היא 20 שניות', () => {
    expect(process.env.VITEST).toBeTruthy()
    expect(viewerMemoTtlMs()).toBe(0)
    expect(VIEWER_MEMO_DEFAULT_TTL_MS).toBe(20_000)
  })
  it('ANALYTICS_V2_VIEWER_TTL_MS גובר: 0 מכבה, מספר חיובי קובע, ערך פגום חוזר לברירת המחדל', () => {
    process.env.ANALYTICS_V2_VIEWER_TTL_MS = '5000'
    expect(viewerMemoTtlMs()).toBe(5000)
    process.env.ANALYTICS_V2_VIEWER_TTL_MS = '0'
    expect(viewerMemoTtlMs()).toBe(0)
    process.env.ANALYTICS_V2_VIEWER_TTL_MS = 'abc'
    expect(viewerMemoTtlMs()).toBe(20_000)
    process.env.ANALYTICS_V2_VIEWER_TTL_MS = '-3'
    expect(viewerMemoTtlMs()).toBe(20_000)
  })
})

/* ══ resolveV2Context: מטמון לפי משתמש ══ */
const req = (staff: Record<string, unknown>, query: Record<string, string> = {}): Request => ({ staff, query } as unknown as Request)
const tg = (classId: string, over: { homeroom?: boolean } = {}): [string, TeachGrant] =>
  [classId, { classId, homeroom: over.homeroom ?? false, subjectIds: new Set(), unspecified: !over.homeroom }]
const viewer = (over: Partial<Viewer> = {}): Viewer => ({ userId: 'u1', role: 'teacher', schoolId: 's1', grants: new Map([tg('A', { homeroom: true })]), seesSynthetic: false, ...over })
const klass = (id: string): Record<string, unknown> => ({ id, name: `כיתה ${id}`, school_id: 's1', is_active: true, is_fictitious: false })
const staff = (over: Record<string, unknown> = {}): Record<string, unknown> => ({ userId: 'u1', role: 'teacher', schoolId: 's1', isGuest: false, ...over })

describe('resolveV2Context: הצופה נשמר לפי משתמש', () => {
  beforeEach(() => {
    process.env.ANALYTICS_V2_VIEWER_TTL_MS = '20000'
    delete process.env.ANALYTICS_V2
    delete process.env.ANALYTICS_V2_LIVE
    delete process.env.DEMO_ANALYTICS
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-21T08:00:00Z'))
    resetViewerCaches()
    h.state.classes = [klass('A'), klass('B')]
    h.state.error = false
    h.state.queries = 0
    vi.mocked(loadViewer).mockReset()
    vi.mocked(loadViewer).mockImplementation(async () => viewer())
  })
  afterEach(() => { vi.useRealTimers(); delete process.env.ANALYTICS_V2_VIEWER_TTL_MS; resetViewerCaches() })

  it('בקשות עוקבות של אותו משתמש: טעינה אחת של הצופה וקריאת classes אחת — והתוצאה זהה', async () => {
    const c1 = await resolveV2Context(req(staff()))
    const c2 = await resolveV2Context(req(staff()))
    expect(loadViewer).toHaveBeenCalledTimes(1)
    expect(h.state.queries).toBe(1)
    expect(c2!.viewer).toBe(c1!.viewer)
    expect(c2!.authz).toBe(c1!.authz)
    expect(c1!.provider).toBe('live')
  })

  it('בקשות מקבילות: טעינה אחת', async () => {
    const all = await Promise.all([1, 2, 3, 4].map(() => resolveV2Context(req(staff()))))
    expect(loadViewer).toHaveBeenCalledTimes(1)
    expect(h.state.queries).toBe(1)
    expect(new Set(all.map((c) => c!.viewer)).size).toBe(1)
  })

  it('משתמש אחר, תפקיד אחר או בית ספר אחר = מפתח אחר (אין זליגה בין משתמשים)', async () => {
    vi.mocked(loadViewer).mockImplementation(async (r) => viewer({ userId: (r as unknown as { staff: { userId: string } }).staff.userId }))
    const a = await resolveV2Context(req(staff({ userId: 'u1' })))
    const b = await resolveV2Context(req(staff({ userId: 'u2' })))
    expect(a!.authz!.userId).toBe('u1')
    expect(b!.authz!.userId).toBe('u2')
    expect(loadViewer).toHaveBeenCalledTimes(2)
    await resolveV2Context(req(staff({ userId: 'u1', schoolId: 's2' })))
    await resolveV2Context(req(staff({ userId: 'u1', role: 'admin' })))
    expect(loadViewer).toHaveBeenCalledTimes(4)
  })

  it('שינוי הרשאות תופס רק אחרי ה-TTL (20 שניות) — לא לפני, ותמיד אחרי', async () => {
    const first = await resolveV2Context(req(staff()))
    expect(first!.viewer.classGrants!.map((g) => g.classId)).toEqual(['A'])
    vi.mocked(loadViewer).mockImplementation(async () => viewer({ grants: new Map([tg('A', { homeroom: true }), tg('B')]) }))
    vi.setSystemTime(new Date('2026-10-21T08:00:19Z'))
    expect((await resolveV2Context(req(staff())))!.viewer.classGrants!.map((g) => g.classId)).toEqual(['A'])
    vi.setSystemTime(new Date('2026-10-21T08:00:21Z'))
    const later = await resolveV2Context(req(staff()))
    expect(later!.viewer.classGrants!.map((g) => g.classId)).toEqual(['A', 'B'])
    expect(loadViewer).toHaveBeenCalledTimes(2)
  })

  it('כשל בטעינה (או בקריאת classes → 503) לא נשמר: הבקשה הבאה מנסה שוב', async () => {
    h.state.error = true
    await expect(resolveV2Context(req(staff()))).rejects.toMatchObject({ status: 503 })
    h.state.error = false
    const ok = await resolveV2Context(req(staff()))
    expect(ok!.viewer.classGrants!.map((g) => g.classId)).toEqual(['A'])
    vi.mocked(loadViewer).mockRejectedValueOnce(new Error('db down'))
    vi.setSystemTime(new Date('2026-10-21T08:01:00Z'))
    await expect(resolveV2Context(req(staff()))).rejects.toThrow('db down')
    expect((await resolveV2Context(req(staff())))!.provider).toBe('live')
  })

  it('מורה אורח לא נוגע במטמון ולא ב-authz; צוות בלי userId עוקף את המטמון', async () => {
    await resolveV2Context(req({ role: 'teacher', isGuest: true }, { lens: 'homeroom' }))
    expect(loadViewer).not.toHaveBeenCalled()
    await resolveV2Context(req(staff({ userId: undefined })))
    await resolveV2Context(req(staff({ userId: undefined })))
    expect(loadViewer).toHaveBeenCalledTimes(2)
  })

  it('מנהל-על נשאר מחוץ ל-v2 גם דרך המטמון', async () => {
    vi.mocked(loadViewer).mockImplementation(async () => viewer({ role: 'super_admin' }))
    expect(await resolveV2Context(req(staff({ role: 'teacher' })))).toBeNull()
  })

  it('TTL=0 (ברירת המחדל בבדיקות): כל בקשה טוענת מחדש', async () => {
    process.env.ANALYTICS_V2_VIEWER_TTL_MS = '0'
    await resolveV2Context(req(staff()))
    await resolveV2Context(req(staff()))
    expect(loadViewer).toHaveBeenCalledTimes(2)
    expect(h.state.queries).toBe(2)
  })
})
