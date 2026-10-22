/* G1 (UX#4): PATCH /api/quests/:id עם subjectCode (שיוך מקצוע מהספרייה) מבטל את מטמון ניתוחי האנליטיקה — המורה חוזרת ורואה את השינוי.
   שינוי שם בלבד, בקשה שנכשלה או בעלות שגויה — לא מבטלים. אין DB: Supabase, ההרשאה והמטמון מוחלפים ב-mocks. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import express from 'express'

const h = vi.hoisted(() => {
  const state = { quest: { id: 'q-1', created_by: 'u-1', anon_id: null } as Record<string, unknown> | null, updateError: null as { message: string } | null, patches: [] as Record<string, unknown>[] }
  const client = {
    from: (table: string) => ({
      select: () => ({ eq: () => ({ single: async () => (table === 'quests' && state.quest ? { data: state.quest, error: null } : { data: null, error: { message: 'x' } }) }) }),
      update: (patch: Record<string, unknown>) => ({ eq: async () => { state.patches.push(patch); return { error: state.updateError } } }),
    }),
  }
  return { state, client, invalidate: vi.fn() }
})

vi.mock('../lib/supabase.js', () => ({ supabaseAdmin: h.client, supabaseAnon: {} }))
vi.mock('../lib/analyticsV2/analysisCache.js', () => ({ invalidateAllClassAnalyses: h.invalidate }))
vi.mock('../lib/creatorAccess.js', async () => {
  const { AppError } = await import('../middleware/errors.js')
  return {
    requireCreator: (req: { staff?: unknown }, _res: unknown, next: () => void) => { req.staff = { userId: 'u-1', role: 'teacher' }; next() },
    ensureQuestAccess: (_req: unknown, quest: { created_by?: string | null }) => { if (quest.created_by !== 'u-1') throw new AppError(403, 'אין הרשאה') },
    readAnonId: () => null,
  }
})
vi.mock('../lib/subjects.js', () => ({
  subjectByCode: vi.fn(async (code: string) => ({ id: `sid-${code}`, code, nameHe: 'מתמטיקה' })),
  subjectFieldsOfQuest: vi.fn(), questSubjectOut: vi.fn(),
}))
vi.mock('../lib/activeColumn.js', async (orig) => {
  const m = await orig<Record<string, unknown>>()
  return { ...m, hasQuestSubject: vi.fn(async () => true), hasQuestSubjectId: vi.fn(async () => true) }
})

import { errorHandler } from '../middleware/errors.js'
import { questsRouter } from './quests.js'

let server: Server
let base = ''
beforeAll(async () => {
  const app = express()
  app.use(express.json())
  app.use('/api/quests', questsRouter)
  app.use(errorHandler)
  await new Promise<void>((r) => { server = app.listen(0, () => r()) })
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/quests`
})
afterAll(async () => { await new Promise<void>((r) => server.close(() => r())) })
beforeEach(() => {
  h.invalidate.mockClear()
  h.state.quest = { id: 'q-1', created_by: 'u-1', anon_id: null }
  h.state.updateError = null
  h.state.patches = []
})

const patch = async (body: unknown): Promise<{ status: number; json: Record<string, unknown> }> => {
  const r = await fetch(`${base}/q-1`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { status: r.status, json: (await r.json()) as Record<string, unknown> }
}

describe('PATCH /api/quests/:id — ביטול מטמון האנליטיקה בשיוך מקצוע', () => {
  it('שיוך מקצוע: נשמר subject_id, והמטמון מתבטל פעם אחת', async () => {
    const r = await patch({ subjectCode: 'math' })
    expect(r.status).toBe(200)
    expect(r.json).toMatchObject({ ok: true, subjectCode: 'math' })
    expect(h.state.patches[0]).toMatchObject({ subject_id: 'sid-math' })
    expect(h.invalidate).toHaveBeenCalledTimes(1)
  })

  it('שינוי שם בלבד: לא משפיע על האנליטיקה — אין ביטול', async () => {
    const r = await patch({ title: 'שם חדש' })
    expect(r.status).toBe(200)
    expect(h.invalidate).not.toHaveBeenCalled()
  })

  it('שם ומקצוע יחד: מתבטל', async () => {
    expect((await patch({ title: 'שם', subjectCode: 'history' })).status).toBe(200)
    expect(h.invalidate).toHaveBeenCalledTimes(1)
  })

  it('כשל בשמירה (500) / מקצוע לא מוכר (400) / הדמיה של מורה אחר (403): אין ביטול, כי שום דבר לא השתנה', async () => {
    h.state.updateError = { message: 'db' }
    expect((await patch({ subjectCode: 'math' })).status).toBe(500)
    h.state.updateError = null
    expect((await patch({ subjectCode: 'not-a-subject' })).status).toBe(400)
    h.state.quest = { id: 'q-1', created_by: 'u-2', anon_id: null }
    expect((await patch({ subjectCode: 'math' })).status).toBe(403)
    expect(h.invalidate).not.toHaveBeenCalled()
  })
})
