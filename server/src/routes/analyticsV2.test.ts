import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Request } from 'express'

vi.mock('../lib/authz.js', async (orig) => {
  const m = await orig<typeof import('../lib/authz.js')>()
  return { ...m, loadViewer: vi.fn() }
})
vi.mock('../lib/subjects.js', () => ({ subjectById: vi.fn(async (id: string) => (id === 'sid-history' ? { id, code: 'history', nameHe: 'היסטוריה' } : null)) }))

import { loadViewer, type Viewer } from '../lib/authz.js'
import { resolveV2Viewer } from './analyticsV2.js'

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
