/* כלל "אורך טקסט לתלמיד": POST /api/quests/:id/scene/:sceneId/shorten — הצעת קיצור לסצנה ארוכה מדי.
   · לא שומר ל-DB (אין update), מחזיר את תוצאת proposeSceneShortening כמות שהיא
   · הטקסט הנוכחי בעורך (שטרם נשמר) גובר על מה שב-DB; הרמה נלקחת מ-readingScale של ההדמיה
   · הרשאה: בעלות על ההדמיה; סצנה/הדמיה שלא קיימות → 404; גוף לא תקין → 400.
   אין DB: Supabase, ההרשאה והקיצור עצמו מוחלפים ב-mocks. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import express from 'express'

const h = vi.hoisted(() => {
  const state = {
    quest: null as Record<string, unknown> | null,
    updates: 0,
  }
  const client = {
    from: (table: string) => ({
      select: () => ({ eq: () => ({ single: async () => (table === 'quests' && state.quest ? { data: state.quest, error: null } : { data: null, error: { message: 'x' } }) }) }),
      update: () => ({ eq: async () => { state.updates++; return { error: null } } }),
    }),
  }
  return { state, client, propose: vi.fn(async (_scene: unknown, _opts: unknown) => ({ needed: true, ok: true })) }
})

vi.mock('../lib/supabase.js', () => ({ supabaseAdmin: h.client, supabaseAnon: {} }))
vi.mock('../lib/sceneShorten.js', () => ({ proposeSceneShortening: h.propose }))
vi.mock('../lib/creatorAccess.js', async () => {
  const { AppError } = await import('../middleware/errors.js')
  return {
    requireCreator: (req: { staff?: unknown }, _res: unknown, next: () => void) => { req.staff = { userId: 'u-1', role: 'teacher' }; next() },
    ensureQuestAccess: (_req: unknown, quest: { created_by?: string | null }) => { if (quest.created_by !== 'u-1') throw new AppError(403, 'אין הרשאה') },
    readAnonId: () => null,
  }
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
  h.propose.mockClear()
  h.state.updates = 0
  h.state.quest = {
    id: 'q-1', created_by: 'u-1', anon_id: null,
    game_data: { readingScale: 13, entrySceneId: 's1', scenes: [{ id: 's1', title: 'א', narrative: 'נרטיב שמור במסד.', drHoloDialog: 'דיבור שמור.', nextSceneId: null }] },
  }
})

const post = async (path: string, body: unknown = {}): Promise<{ status: number; json: Record<string, unknown> }> => {
  const r = await fetch(`${base}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { status: r.status, json: (await r.json()) as Record<string, unknown> }
}

describe('POST /api/quests/:id/scene/:sceneId/shorten', () => {
  it('מחזיר את ההצעה כמות שהיא, עם הרמה מ-readingScale — ולא שומר דבר', async () => {
    const r = await post('q-1/scene/s1/shorten')
    expect(r.status).toBe(200)
    expect(r.json).toEqual({ needed: true, ok: true })
    expect(h.propose).toHaveBeenCalledTimes(1)
    const [scene, opts] = h.propose.mock.calls[0] as [Record<string, unknown>, { level: number }]
    expect(opts.level).toBe(13)
    expect(scene).toMatchObject({ id: 's1', narrative: 'נרטיב שמור במסד.', drHoloDialog: 'דיבור שמור.' })
    expect(h.state.updates).toBe(0)
  })

  it('הטקסט שבעורך (שטרם נשמר) גובר על מה שבמסד', async () => {
    await post('q-1/scene/s1/shorten', { narrative: 'טקסט חי מהעורך', drHoloDialog: '' })
    const [scene] = h.propose.mock.calls[0] as [Record<string, unknown>, unknown]
    expect(scene).toMatchObject({ narrative: 'טקסט חי מהעורך', drHoloDialog: '' })
  })

  it('הדמיה בלי readingScale: ברירת מחדל ה׳–ו׳ (רמה 10)', async () => {
    h.state.quest = { id: 'q-1', created_by: 'u-1', anon_id: null, game_data: { scenes: [{ id: 's1', title: 'א', narrative: 'x' }] } }
    await post('q-1/scene/s1/shorten')
    expect((h.propose.mock.calls[0] as [unknown, { level: number }])[1].level).toBe(10)
  })

  it('סצנה לא קיימת → 404; הדמיה לא קיימת → 404; לא ניתן לקצר סצנה של אחר → 403', async () => {
    expect((await post('q-1/scene/nope/shorten')).status).toBe(404)
    h.state.quest = null
    expect((await post('q-1/scene/s1/shorten')).status).toBe(404)
    h.state.quest = { id: 'q-1', created_by: 'u-2', anon_id: null, game_data: { scenes: [{ id: 's1', title: 'א', narrative: 'x' }] } }
    expect((await post('q-1/scene/s1/shorten')).status).toBe(403)
    expect(h.propose).not.toHaveBeenCalled()
  })

  it('גוף לא תקין (נרטיב ארוך מדי) → 400', async () => {
    expect((await post('q-1/scene/s1/shorten', { narrative: 'x'.repeat(4001) })).status).toBe(400)
    expect(h.propose).not.toHaveBeenCalled()
  })
})
