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
vi.mock('../subjects.js', () => {
  const rows: Record<string, { id: string; code: string; nameHe: string }> = {
    'sid-history': { id: 'sid-history', code: 'history', nameHe: 'היסטוריה' },
    'sid-math': { id: 'sid-math', code: 'math', nameHe: 'מתמטיקה' },
    'sid-hidden': { id: 'sid-hidden', code: 'not-a-subject', nameHe: 'x' },
  }
  return { subjectById: vi.fn(async (id: string) => rows[id] ?? null) }
})

import { loadViewer, type TeachGrant, type Viewer } from '../authz.js'
import { ERR_V2_UNAVAILABLE } from '../../../../src/shared/lib/findingsNarrative.js'
import { DEMO_HOMEROOM_CLASS, grantOf } from './access.js'
import { toV2Viewer } from './liveViewer.js'
import { resolveV2Context, resolveV2Viewer } from './viewer.js'

const req = (staff: Record<string, unknown>, query: Record<string, string> = {}): Request => ({ staff, query } as unknown as Request)
const tg = (classId: string, over: { homeroom?: boolean; unspecified?: boolean; subjectIds?: string[] } = {}): [string, TeachGrant] =>
  [classId, { classId, homeroom: over.homeroom ?? false, subjectIds: new Set(over.subjectIds ?? []), unspecified: over.unspecified ?? false }]
const viewer = (over: Partial<Viewer> = {}): Viewer => ({ userId: 'u1', role: 'teacher', schoolId: 's1', grants: new Map(), seesSynthetic: false, ...over })
const withGrants = (...g: [string, TeachGrant][]): Viewer => viewer({ grants: new Map(g) })
const klass = (id: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({ id, name: `כיתה ${id}`, school_id: 's1', is_active: true, is_fictitious: false, ...over })
const REAL = { role: 'teacher', isGuest: false }
const GUEST = { role: 'teacher', isGuest: true }

beforeEach(() => {
  delete process.env.ANALYTICS_V2
  delete process.env.ANALYTICS_V2_LIVE
  delete process.env.DEMO_ANALYTICS
  h.state.classes = []
  h.state.error = false
  h.state.queries = 0
})
afterEach(() => vi.clearAllMocks())

describe('מורה אורח: ספק הדגמה, העדשה מהבורר, בלי DB', () => {
  it('העדשה והמקצוע מהשאילתה; ברירות מחדל: מחנך / מתמטיקה', async () => {
    expect((await resolveV2Context(req(GUEST, { lens: 'admin' })))?.viewer.lens).toBe('admin')
    expect((await resolveV2Context(req(GUEST, { lens: 'homeroom' })))?.viewer).toMatchObject({ lens: 'homeroom', homeroomClassId: DEMO_HOMEROOM_CLASS, subjectCodes: [], guest: true })
    const t = await resolveV2Context(req(GUEST, { lens: 'subject_teacher', subject: 'hebrew' }))
    expect(t?.viewer).toMatchObject({ lens: 'subject_teacher', subjectCodes: ['hebrew'] })
    expect(t?.viewer.teachingClassIds.length).toBe(4)
    expect(t?.provider).toBe('demo')
    expect((await resolveV2Context(req(GUEST)))?.viewer.lens).toBe('homeroom')
    expect((await resolveV2Context(req(GUEST, { lens: 'subject_teacher', subject: 'arabic' })))?.viewer.subjectCodes).toEqual(['math'])
    expect((await resolveV2Context(req(GUEST, { lens: 'nonsense' })))?.viewer.lens).toBe('homeroom')
  })
  it('אורח לא נוגע ב-DB ולא ב-authz, ואין לו אובייקט authz (אין רישום ביומן)', async () => {
    const c = await resolveV2Context(req(GUEST, { lens: 'homeroom' }))
    expect(c?.authz).toBeNull()
    expect(loadViewer).not.toHaveBeenCalled()
    expect(h.state.queries).toBe(0)
  })
  it('DEMO_ANALYTICS=0: חשבון ההדמיה הופך למשתמש רגיל — ספק חי עם ה-grants האמיתיים שלו', async () => {
    process.env.DEMO_ANALYTICS = '0'
    h.state.classes = [klass('x')]
    vi.mocked(loadViewer).mockResolvedValue(withGrants(tg('x', { homeroom: true })))
    const c = await resolveV2Context(req(GUEST, { lens: 'admin' }))
    expect(c?.provider).toBe('live')
    expect(c?.viewer.lens).toBe('homeroom')
  })
})

describe('מורה אמיתי → ספק חי עם grants פר-כיתה (לא null)', () => {
  it('מחנך: lens=homeroom, grant מחנך; סדר הכיתות לפי שם', async () => {
    h.state.classes = [klass('b', { name: 'ו׳2' }), klass('a', { name: 'ו׳1' })]
    vi.mocked(loadViewer).mockResolvedValue(withGrants(tg('b', { homeroom: true }), tg('a', { homeroom: true })))
    const c = await resolveV2Context(req(REAL))
    expect(c).not.toBeNull()
    expect(c!.provider).toBe('live')
    expect(c!.authz).not.toBeNull()
    expect(c!.viewer).toMatchObject({ lens: 'homeroom', guest: false, source: 'live', schoolId: 's1', seesSynthetic: false })
    expect(c!.viewer.classGrants!.map((g) => [g.classId, g.homeroom])).toEqual([['a', true], ['b', true]])
  })
  it('מקצועי: מזהי מקצוע מומרים לקודים פר-כיתה (היסטוריה@א׳ + מתמטיקה@ב׳ — בלי מכפלה)', async () => {
    h.state.classes = [klass('A', { name: 'א׳' }), klass('B', { name: 'ב׳' })]
    vi.mocked(loadViewer).mockResolvedValue(withGrants(tg('A', { subjectIds: ['sid-history'] }), tg('B', { subjectIds: ['sid-math'] })))
    const v = (await resolveV2Context(req(REAL)))!.viewer
    expect(v.lens).toBe('subject_teacher')
    expect(v.classGrants).toEqual([
      { classId: 'A', homeroom: false, subjects: ['history'], unspecified: false },
      { classId: 'B', homeroom: false, subjects: ['math'], unspecified: false },
    ])
    expect(grantOf(v, 'A')!.subjects).toEqual(['history'])
    expect(v.subjectCodes.sort()).toEqual(['history', 'math'])
  })
  it('מעורב: מחנך בכיתה אחת ומקצועי באחרת → עדשה מחנך, grant לכל כיתה', async () => {
    h.state.classes = [klass('A', { name: 'א׳' }), klass('B', { name: 'ב׳' })]
    vi.mocked(loadViewer).mockResolvedValue(withGrants(tg('A', { homeroom: true }), tg('B', { subjectIds: ['sid-math'] })))
    const v = (await resolveV2Context(req(REAL)))!.viewer
    expect(v.lens).toBe('homeroom')
    expect(v.classGrants!.map((g) => [g.classId, g.homeroom, g.subjects])).toEqual([['A', true, []], ['B', false, ['math']]])
    expect(v.homeroomClassId).toBe('A')
  })
  it('שיוך בלי מקצוע, או מקצוע לא מוכר: unspecified — אין ברירת מחדל "מתמטיקה"', async () => {
    h.state.classes = [klass('A', { name: 'א׳' }), klass('B', { name: 'ב׳' })]
    vi.mocked(loadViewer).mockResolvedValue(withGrants(tg('A', { unspecified: true }), tg('B', { subjectIds: ['sid-hidden', 'sid-unknown'] })))
    const v = (await resolveV2Context(req(REAL)))!.viewer
    expect(v.classGrants).toEqual([
      { classId: 'A', homeroom: false, subjects: [], unspecified: true },
      { classId: 'B', homeroom: false, subjects: [], unspecified: true },
    ])
    expect(v.subjectCodes).toEqual([])
  })
  it('מורה בלי שום שיוך: צופה תקף עם הרשאות ריקות (לא null), בלי שאילתת DB', async () => {
    vi.mocked(loadViewer).mockResolvedValue(viewer())
    const c = await resolveV2Context(req(REAL))
    expect(c?.provider).toBe('live')
    expect(c?.viewer).toMatchObject({ lens: 'subject_teacher', classGrants: [], homeroomClassId: null })
    expect(h.state.queries).toBe(0)
  })
  it('פרמטרי lens / subject / classId / schoolId בשאילתה מתעלמים אצל לא-אורח', async () => {
    h.state.classes = [klass('A')]
    vi.mocked(loadViewer).mockResolvedValue(withGrants(tg('A', { subjectIds: ['sid-history'] })))
    const v = (await resolveV2Context(req(REAL, { lens: 'admin', subject: 'math', classId: 'Z', schoolId: 'other' })))!.viewer
    expect(v.lens).toBe('subject_teacher')
    expect(v.schoolId).toBe('s1')
    expect(v.classGrants!.map((g) => g.classId)).toEqual(['A'])
    expect(v.subjectCodes).toEqual(['history'])
  })
})

describe('הגנת עומק על ה-grants', () => {
  it('כיתה לא פעילה, פיקטיבית, של בית ספר אחר או שאינה קיימת — נשמטות; כיתה בלי school_id נשארת', async () => {
    h.state.classes = [
      klass('ok', { name: 'א׳' }), klass('inactive', { is_active: false }), klass('fict', { is_fictitious: true }),
      klass('foreign', { school_id: 'other-school' }), klass('legacy', { school_id: null, name: 'ב׳' }),
    ]
    vi.mocked(loadViewer).mockResolvedValue(withGrants(...['ok', 'inactive', 'fict', 'foreign', 'legacy', 'deleted'].map((id) => tg(id, { homeroom: true }))))
    const v = (await resolveV2Context(req(REAL)))!.viewer
    expect(v.classGrants!.map((g) => g.classId)).toEqual(['ok', 'legacy'])
  })
  it('כשל בקריאת הכיתות → 503 (לא "אין כיתות")', async () => {
    h.state.error = true
    vi.mocked(loadViewer).mockResolvedValue(withGrants(tg('A', { homeroom: true })))
    await expect(resolveV2Context(req(REAL))).rejects.toMatchObject({ status: 503, message: ERR_V2_UNAVAILABLE })
  })
})

describe('מנהל / מנהל עירוני / מנהל-על', () => {
  it.each(['admin', 'municipal_admin'] as const)('%s: lens=admin, אגרגטים בלבד, בית הספר מהסשן, בלי grants וללא DB', async (role) => {
    vi.mocked(loadViewer).mockResolvedValue(viewer({ role, schoolId: 'sch-9' }))
    const c = await resolveV2Context(req({ role, isGuest: false }, { lens: 'homeroom', schoolId: 'sch-1' }))
    expect(c?.provider).toBe('live')
    expect(c?.viewer).toMatchObject({ lens: 'admin', schoolId: 'sch-9', homeroomClassId: null, teachingClassIds: [], subjectCodes: [] })
    expect(c?.viewer.classGrants).toBeUndefined()
    expect(h.state.queries).toBe(0)
  })
  it('מנהל-על: אין v2 (null) — גם בלי לטעון הרשאות', async () => {
    expect(await resolveV2Context(req({ role: 'super_admin' }))).toBeNull()
    expect(loadViewer).not.toHaveBeenCalled()
    vi.mocked(loadViewer).mockResolvedValue(viewer({ role: 'super_admin' }))
    expect(await resolveV2Context(req({ role: 'teacher', isGuest: false }))).toBeNull()
  })
})

describe('ארגון הדגמה: נשאר על ספק ההדגמה (עדשה מהתפקיד האמיתי, לא ניתנת לעקיפה)', () => {
  it('מנהל / מחנך / מקצועי ממופים לעולם ההדגמה; שאילתת lens מתעלמת', async () => {
    vi.mocked(loadViewer).mockResolvedValue(viewer({ role: 'admin', seesSynthetic: true }))
    expect(await resolveV2Context(req({ role: 'admin', isGuest: false }, { lens: 'homeroom' }))).toMatchObject({ provider: 'demo', viewer: { lens: 'admin', guest: false } })
    vi.mocked(loadViewer).mockResolvedValue(viewer({ seesSynthetic: true, grants: new Map([tg('x', { homeroom: true })]) }))
    expect(await resolveV2Context(req(REAL, { lens: 'admin' }))).toMatchObject({ provider: 'demo', viewer: { lens: 'homeroom', guest: false, homeroomClassId: DEMO_HOMEROOM_CLASS } })
    vi.mocked(loadViewer).mockResolvedValue(viewer({ seesSynthetic: true, grants: new Map([tg('x', { subjectIds: ['sid-history'] })]) }))
    expect(await resolveV2Context(req(REAL, { lens: 'admin', subject: 'math' }))).toMatchObject({ provider: 'demo', viewer: { lens: 'subject_teacher', subjectCodes: ['history'], guest: false } })
    expect(h.state.queries).toBe(0)
  })
  it('מורה בלי מקצוע ובלי מחנכות: צופה ריק — אין ברירת מחדל "מתמטיקה"', async () => {
    vi.mocked(loadViewer).mockResolvedValue(viewer({ seesSynthetic: true, grants: new Map([tg('x', { unspecified: true })]) }))
    const c = await resolveV2Context(req(REAL))
    expect(c?.provider).toBe('demo')
    expect(c?.viewer).toMatchObject({ lens: 'subject_teacher', subjectCodes: [], teachingClassIds: [] })
  })
})

describe('מתגי כיבוי', () => {
  it('ANALYTICS_V2=0 מכבה את הכול, גם אורח וארגון הדגמה', async () => {
    process.env.ANALYTICS_V2 = '0'
    expect(await resolveV2Context(req(GUEST, { lens: 'admin' }))).toBeNull()
    vi.mocked(loadViewer).mockResolvedValue(viewer({ seesSynthetic: true }))
    expect(await resolveV2Context(req(REAL))).toBeNull()
    vi.mocked(loadViewer).mockResolvedValue(withGrants(tg('A', { homeroom: true })))
    expect(await resolveV2Context(req(REAL))).toBeNull()
  })
  it('ANALYTICS_V2_LIVE=0 מכבה רק את הספק החי (→ הלקוח מציג את הפאנל הקודם); אורח וארגון הדגמה נשארים', async () => {
    process.env.ANALYTICS_V2_LIVE = '0'
    vi.mocked(loadViewer).mockResolvedValue(withGrants(tg('A', { homeroom: true })))
    expect(await resolveV2Context(req(REAL))).toBeNull()
    vi.mocked(loadViewer).mockResolvedValue(viewer({ role: 'admin' }))
    expect(await resolveV2Context(req({ role: 'admin', isGuest: false }))).toBeNull()
    expect(await resolveV2Context(req(GUEST, { lens: 'homeroom' }))).not.toBeNull()
    vi.mocked(loadViewer).mockResolvedValue(viewer({ seesSynthetic: true }))
    expect((await resolveV2Context(req(REAL)))?.provider).toBe('demo')
  })
})

describe('resolveV2Viewer (עטיפה תואמת-לאחור): רק צופה של ספק ההדגמה', () => {
  it('משתמש אמיתי → null (בלי שאילתות DB לחי); אורח וארגון הדגמה → צופה', async () => {
    vi.mocked(loadViewer).mockResolvedValue(withGrants(tg('A', { homeroom: true })))
    expect(await resolveV2Viewer(req(REAL))).toBeNull()
    expect(await resolveV2Viewer(req(REAL), { ignoreFlag: true })).toBeNull()
    expect(h.state.queries).toBe(0)
    expect((await resolveV2Viewer(req(GUEST, { lens: 'admin' })))?.lens).toBe('admin')
    vi.mocked(loadViewer).mockResolvedValue(viewer({ seesSynthetic: true, grants: new Map([tg('x', { homeroom: true })]) }))
    expect((await resolveV2Viewer(req(REAL)))?.lens).toBe('homeroom')
  })
  it('ignoreFlag: טאב "תוצאות" אינו תלוי בדגל', async () => {
    process.env.ANALYTICS_V2 = '0'
    expect(await resolveV2Viewer(req(GUEST, { lens: 'homeroom' }))).toBeNull()
    expect((await resolveV2Viewer(req(GUEST, { lens: 'homeroom' }), { ignoreFlag: true }))?.lens).toBe('homeroom')
  })
})

describe('toV2Viewer ישירות', () => {
  it('seesSynthetic מועבר (ארגון הדגמה על ספק חי בעתיד): כיתות פיקטיביות נשמרות רק אם מותר', async () => {
    h.state.classes = [klass('f', { is_fictitious: true })]
    const allowed = await toV2Viewer(viewer({ seesSynthetic: true, grants: new Map([tg('f', { homeroom: true })]) }))
    expect(allowed.classGrants!.map((g) => g.classId)).toEqual(['f'])
    expect(allowed.seesSynthetic).toBe(true)
    const denied = await toV2Viewer(viewer({ grants: new Map([tg('f', { homeroom: true })]) }))
    expect(denied.classGrants).toEqual([])
  })
})
