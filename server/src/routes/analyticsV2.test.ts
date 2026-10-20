import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Request } from 'express'

vi.mock('../lib/authz.js', async (orig) => {
  const m = await orig<typeof import('../lib/authz.js')>()
  return { ...m, loadViewer: vi.fn() }
})
vi.mock('../lib/subjects.js', () => ({ subjectById: vi.fn(async (id: string) => (id === 'sid-history' ? { id, code: 'history', nameHe: 'היסטוריה' } : null)) }))

import { loadViewer, type Viewer } from '../lib/authz.js'
import { EP } from '../../../src/shared/types/analyticsV2.js'
import { analyticsV2Router, resolveV2Viewer } from './analyticsV2.js'

const req = (staff: Record<string, unknown>, query: Record<string, string> = {}): Request => ({ staff, query } as unknown as Request)
const viewer = (over: Partial<Viewer>): Viewer => ({ userId: 'u1', role: 'teacher', schoolId: 's1', grants: new Map(), seesSynthetic: false, ...over })

describe('דגל ANALYTICS_V2 — מי רואה את האנליטיקה החדשה', () => {
  beforeEach(() => { delete process.env.ANALYTICS_V2; delete process.env.DEMO_ANALYTICS })
  afterEach(() => vi.clearAllMocks())

  it('משתמש אמיתי (ארגון ללא demo_data_enabled): הדגל כבוי — נשאר במסכים הקיימים', async () => {
    vi.mocked(loadViewer).mockResolvedValue(viewer({ seesSynthetic: false }))
    expect(await resolveV2Viewer(req({ role: 'teacher', isGuest: false }))).toBeNull()
    vi.mocked(loadViewer).mockResolvedValue(viewer({ role: 'admin', seesSynthetic: false }))
    expect(await resolveV2Viewer(req({ role: 'admin', isGuest: false }))).toBeNull()
  })

  it('מנהל-על אינו נכלל (אין ארגון הדגמה)', async () => {
    vi.mocked(loadViewer).mockResolvedValue(viewer({ role: 'super_admin', seesSynthetic: false }))
    expect(await resolveV2Viewer(req({ role: 'super_admin' }))).toBeNull()
  })

  it('מורה אורח: העדשה נבחרת מהבורר, וכל עדשה נגזרת בשרת', async () => {
    const guest = { role: 'teacher', isGuest: true }
    expect((await resolveV2Viewer(req(guest, { lens: 'admin' })))?.lens).toBe('admin')
    const hr = await resolveV2Viewer(req(guest, { lens: 'homeroom' }))
    expect(hr).toMatchObject({ lens: 'homeroom', homeroomClassId: 'c-v2', subjectCodes: [] })
    const t = await resolveV2Viewer(req(guest, { lens: 'subject_teacher', subject: 'hebrew' }))
    expect(t).toMatchObject({ lens: 'subject_teacher', subjectCodes: ['hebrew'] })
    expect(t!.teachingClassIds.length).toBe(4)
    /* ברירת מחדל: מחנך; מקצוע לא חוקי → מתמטיקה */
    expect((await resolveV2Viewer(req(guest)))?.lens).toBe('homeroom')
    expect((await resolveV2Viewer(req(guest, { lens: 'subject_teacher', subject: 'arabic' })))?.subjectCodes).toEqual(['math'])
    expect((await resolveV2Viewer(req(guest, { lens: 'nonsense' })))?.lens).toBe('homeroom')
  })

  it('היסטוריה מלמדים רק בשכבה ו׳ — מורה היסטוריה לא מקבל כיתות ד׳', async () => {
    const t = await resolveV2Viewer(req({ role: 'teacher', isGuest: true }, { lens: 'subject_teacher', subject: 'history' }))
    expect(t!.teachingClassIds.sort()).toEqual(['c-v1', 'c-v2'])
  })

  it('ארגון הדגמה: העדשה נגזרת מהתפקיד האמיתי ולא ניתנת לעקיפה בשאילתה', async () => {
    vi.mocked(loadViewer).mockResolvedValue(viewer({ role: 'admin', seesSynthetic: true }))
    expect((await resolveV2Viewer(req({ role: 'admin', isGuest: false }, { lens: 'homeroom' })))).toMatchObject({ lens: 'admin', guest: false })

    vi.mocked(loadViewer).mockResolvedValue(viewer({ role: 'teacher', seesSynthetic: true, grants: new Map([['x', { classId: 'x', homeroom: true, subjectIds: new Set(), unspecified: false }]]) }))
    expect((await resolveV2Viewer(req({ role: 'teacher', isGuest: false }, { lens: 'admin' })))).toMatchObject({ lens: 'homeroom', guest: false })

    vi.mocked(loadViewer).mockResolvedValue(viewer({ role: 'teacher', seesSynthetic: true, grants: new Map([['x', { classId: 'x', homeroom: false, subjectIds: new Set(['sid-history']), unspecified: false }]]) }))
    expect((await resolveV2Viewer(req({ role: 'teacher', isGuest: false }, { lens: 'admin', subject: 'math' })))).toMatchObject({ lens: 'subject_teacher', subjectCodes: ['history'], guest: false })
  })

  it('kill-switch: ANALYTICS_V2=0 מכבה גם לאורח', async () => {
    process.env.ANALYTICS_V2 = '0'
    expect(await resolveV2Viewer(req({ role: 'teacher', isGuest: true }, { lens: 'admin' }))).toBeNull()
  })
})

/* ── נקודות הקצה החדשות ב-router (חיווט + אימות תגובה מול הסכמה + הרשאות) ── */
interface Layer { route?: { path: string; stack: { handle: (req: Request, res: unknown, next: (e?: unknown) => void) => Promise<void> }[] } }
const layers = (): Layer[] => (analyticsV2Router as unknown as { stack: Layer[] }).stack.filter((l) => l.route)
async function callRoute(path: string, r: Request): Promise<{ body?: unknown; error?: { status?: number } }> {
  const layer = layers().find((l) => l.route!.path === path)
  if (!layer) throw new Error(`נתיב לא רשום: ${path}`)
  let body: unknown
  let error: { status?: number } | undefined
  await layer.route!.stack[0].handle(r, { json: (b: unknown) => { body = b } }, (e) => { error = e as { status?: number } })
  return { body, error }
}
const guestReq = (query: Record<string, string>, params: Record<string, string> = {}): Request => ({ staff: { role: 'teacher', isGuest: true }, query, params } as unknown as Request)

describe('נתיבי האנליטיקה החדשה: חיווט', () => {
  beforeEach(() => { delete process.env.ANALYTICS_V2; delete process.env.DEMO_ANALYTICS })

  it('כל נקודת קצה ברישום EP רשומה ב-router (GET)', () => {
    const registered = new Set(layers().map((l) => l.route!.path))
    for (const [name, ep] of Object.entries(EP)) {
      const local = ep.path.replace('/api/analytics-v2', '')
      expect(registered.has(local), `${name}: ${local}`).toBe(true)
    }
    expect(registered.has('/entry')).toBe(true)
    expect(registered.has('/class/:classId/overview')).toBe(true)
  })

  it('GET /entry: מחנך מקבל את כיתתו, מנהל מקבל מערכים ריקים (התגובה מאומתת מול הסכמה)', async () => {
    const hr = await callRoute('/entry', guestReq({ lens: 'homeroom' }))
    expect(hr.error).toBeUndefined()
    const data = (hr.body as { dataState: string; data: { classes: { id: string }[]; alerts: unknown[] } })
    expect(data.dataState).toBe('ok')
    expect(data.data.classes.map((c) => c.id)).toEqual(['c-v2'])
    expect(data.data.alerts.length).toBeLessThanOrEqual(3)
    expect(EP.entry.response.safeParse(hr.body).success).toBe(true)

    const ad = await callRoute('/entry', guestReq({ lens: 'admin' }))
    expect((ad.body as { data: unknown }).data).toEqual({ classes: [], alerts: [] })
  })

  it('GET /class/:classId/overview: מחנך — כן; מורה מקצועי ומנהל — 403', async () => {
    const ok = await callRoute('/class/:classId/overview', guestReq({ lens: 'homeroom' }, { classId: 'c-v2' }))
    expect(ok.error).toBeUndefined()
    expect(EP.classOverview.response.safeParse(ok.body).success).toBe(true)
    const t = await callRoute('/class/:classId/overview', guestReq({ lens: 'subject_teacher', subject: 'math' }, { classId: 'c-v2' }))
    expect(t.body).toBeUndefined()
    expect(t.error?.status).toBe(403)
    const a = await callRoute('/class/:classId/overview', guestReq({ lens: 'admin' }, { classId: 'c-v2' }))
    expect(a.error?.status).toBe(403)
    const other = await callRoute('/class/:classId/overview', guestReq({ lens: 'homeroom' }, { classId: 'c-v1' }))
    expect(other.error?.status).toBe(403)
  })

  it('משתמש אמיתי (הדגל כבוי): entry ו-overview מחזירים 403', async () => {
    vi.mocked(loadViewer).mockResolvedValue(viewer({ seesSynthetic: false }))
    const real = { staff: { role: 'teacher', isGuest: false }, query: {}, params: { classId: 'c-v2' } } as unknown as Request
    expect((await callRoute('/entry', real)).error?.status).toBe(403)
    expect((await callRoute('/class/:classId/overview', real)).error?.status).toBe(403)
  })
})
