/* POST /api/sessions/:id/live — הפעימה של "תצוגה חיה" (שלב R). האם התלמיד/ה כותב/ת רק ל-session שלו/ה, איך נקבעים progressAt / lastChallenge,
   הגנה מפני הצפה, ושסשן שהושלם / מסד בלי העמודות לא נכתב. אין DB: Supabase מוחלף ב-fake בזיכרון. */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import express from 'express'

type Row = Record<string, unknown>
const h = vi.hoisted(() => {
  const db: Record<string, Row[]> = {}
  const flags = { live: true }
  class Q {
    private filters: ((r: Row) => boolean)[] = []
    private upd: Row | null = null
    private one = false
    constructor(private t: string) {}
    select() { return this }
    update(p: Row) { this.upd = p; return this }
    eq(k: string, v: unknown) { this.filters.push((r) => r[k] === v); return this }
    single() { this.one = true; return this }
    maybeSingle() { this.one = true; return this }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    then(ok?: any, bad?: any) {
      const rows = (db[this.t] ?? []).filter((r) => this.filters.every((f) => f(r)))
      if (this.upd) { for (const r of rows) Object.assign(r, this.upd); return Promise.resolve({ data: null, error: null }).then(ok, bad) }
      return Promise.resolve({ data: this.one ? (rows[0] ?? null) : rows, error: this.one && rows.length === 0 ? { message: 'none' } : null }).then(ok, bad)
    }
  }
  return { db, flags, client: { from: (t: string) => new Q(t) } }
})

vi.mock('../lib/supabase.js', () => ({ supabaseAdmin: h.client, supabaseAnon: {} }))
vi.mock('../middleware/studentAuth.js', () => ({
  requireStudent: (req: { student?: unknown }, _res: unknown, next: () => void) => { req.student = { userId: 'stu-1', classId: 'c-1' }; next() },
}))
vi.mock('../lib/activeColumn.js', async (orig) => {
  const m = await orig<Record<string, unknown>>()
  return { ...m, hasSessionLive: async () => h.flags.live }
})

import { errorHandler } from '../middleware/errors.js'
import { sessionsRouter } from './sessions.js'

let server: Server
let base = ''
beforeAll(async () => {
  const app = express()
  app.use(express.json())
  app.use('/api/sessions', sessionsRouter)
  app.use(errorHandler)
  await new Promise<void>((r) => { server = app.listen(0, () => r()) })
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/sessions`
})
afterAll(async () => { await new Promise<void>((r) => server.close(() => r())) })
afterEach(() => { vi.useRealTimers() })

const T0 = '2026-10-26T10:00:00.000Z'
const at = (iso: string): void => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(iso)) }
const plus = (sec: number): string => new Date(Date.parse(T0) + sec * 1000).toISOString()
let n = 0
/* כל בדיקה עם session משלה (מפת ההגנה מהצפה היא לפי session) */
const fresh = (o: Row = {}): string => { const id = `s-${++n}`; h.db.sessions.push({ id, user_id: 'stu-1', quest_id: 'q-1', completed_at: null, live: null, last_seen_at: null, ...o }); return id }
const post = async (id: string, body: unknown): Promise<Response> => fetch(`${base}/${id}/live`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const row = (id: string): Row => h.db.sessions.find((s) => s.id === id)!
const live = (id: string): Record<string, unknown> => row(id).live as Record<string, unknown>

beforeEach(() => { h.db.sessions = []; h.flags.live = true })

describe('POST /sessions/:id/live', () => {
  it('פעימה ראשונה: נשמרים last_seen_at ו-live; progressAt = עכשיו', async () => {
    at(T0)
    const id = fresh()
    const r = await post(id, { sceneId: 's1', inPuzzle: false, mistakes: 0 })
    expect(r.status).toBe(204)
    expect(row(id).last_seen_at).toBe(T0)
    expect(live(id)).toEqual({ sceneId: 's1', inPuzzle: false, mistakes: 0, progressAt: T0, lastChallenge: null })
  })

  it('פעימה באותה סצנה: progressAt לא זז (כך "3 דקות בלי התקדמות" נמדד); מעבר סצנה — כן', async () => {
    const id = fresh()
    at(T0); await post(id, { sceneId: 's1', inPuzzle: true, mistakes: 1 })
    at(plus(30)); await post(id, { sceneId: 's1', inPuzzle: true, mistakes: 2 })
    expect(live(id)).toMatchObject({ mistakes: 2, progressAt: T0 })
    expect(row(id).last_seen_at).toBe(plus(30))
    at(plus(60)); await post(id, { sceneId: 's2', inPuzzle: false, mistakes: 0 })
    expect(live(id)).toMatchObject({ sceneId: 's2', progressAt: plus(60) })
  })

  it('סוף אתגר: מקדם את progressAt ורושם את התוצאה (ויתור וכו׳); פעימה אחריו שומרת על lastChallenge', async () => {
    const id = fresh()
    at(T0); await post(id, { sceneId: 's1', inPuzzle: true, mistakes: 0 })
    at(plus(10)); await post(id, { sceneId: 's1', inPuzzle: false, mistakes: 0, event: 'challenge_end', outcome: 'gave_up' })
    expect(live(id)).toMatchObject({ progressAt: plus(10), lastChallenge: { sceneId: 's1', outcome: 'gave_up', at: plus(10) } })
    at(plus(40)); await post(id, { sceneId: 's1', inPuzzle: false, mistakes: 0 })
    expect(live(id)).toMatchObject({ progressAt: plus(10), lastChallenge: { outcome: 'gave_up' } })
  })

  it('הגנה מפני הצפה: פעימה שנייה בתוך 2 שניות מתעלמת; סוף אתגר תמיד נכתב', async () => {
    const id = fresh()
    at(T0); await post(id, { sceneId: 's1', inPuzzle: true, mistakes: 0 })
    at(plus(1)); await post(id, { sceneId: 's1', inPuzzle: true, mistakes: 3 })
    expect(live(id)).toMatchObject({ mistakes: 0 })
    at(plus(1.5)); await post(id, { sceneId: 's1', inPuzzle: false, mistakes: 3, event: 'challenge_end', outcome: 'wrong' })
    expect(live(id)).toMatchObject({ lastChallenge: { outcome: 'wrong' } })
  })

  it('רק ל-session שלי: של תלמיד אחר — 403; לא קיים — 404; גוף לא תקין — 400', async () => {
    at(T0)
    const other = fresh({ user_id: 'someone-else' })
    expect((await post(other, { sceneId: 's1', inPuzzle: false, mistakes: 0 })).status).toBe(403)
    expect(row(other).live).toBeNull()
    expect((await post('nope', { sceneId: 's1', inPuzzle: false, mistakes: 0 })).status).toBe(404)
    const mine = fresh()
    expect((await post(mine, { inPuzzle: false })).status).toBe(400)
    expect((await post(mine, { sceneId: 's1', inPuzzle: false, mistakes: -1 })).status).toBe(400)
    expect((await post(mine, { sceneId: 's1', inPuzzle: false, mistakes: 0, outcome: 'bogus' })).status).toBe(400)
  })

  it('סשן שהושלם, או מסד בלי העמודות: 204 בלי כתיבה', async () => {
    at(T0)
    const done = fresh({ completed_at: T0 })
    expect((await post(done, { sceneId: 's1', inPuzzle: false, mistakes: 0 })).status).toBe(204)
    expect(row(done).live).toBeNull()
    h.flags.live = false
    const id = fresh()
    expect((await post(id, { sceneId: 's1', inPuzzle: false, mistakes: 0 })).status).toBe(204)
    expect(row(id).live).toBeNull()
  })
})
