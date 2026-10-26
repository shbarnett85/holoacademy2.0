/* POST /api/quests/:id/assign — מועד ההגשה (CLAUDE.md "תאריך יעד ומצב שיעור").
   · בלי dueDay: ברירת המחדל — שבוע מהיום, 23:59 שעון ישראל. · עם dueDay: סוף אותו יום ישראלי. · יום שעבר / תאריך פגום: 400 ושום הקצאה לא נוצרת.
   · סביבה בלי העמודה due_at: ההקצאה נוצרת בלעדיה (לא נכשלת). אין DB: Supabase וההרשאות מוחלפים ב-mocks. */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import express from 'express'

const CLASS_ID = '11111111-1111-4111-8111-111111111111'
const h = vi.hoisted(() => {
  const state = { inserted: [] as Record<string, unknown>[], existing: [] as { class_id: string }[], withDue: true }
  const client = {
    from: (table: string) => {
      if (table === 'quests') return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'q-1', created_by: 'u-1', anon_id: null }, error: null }) }) }) }
      if (table === 'classes') return { select: () => ({ in: async (_c: string, ids: string[]) => ({ data: ids.map((id) => ({ id, school_id: 's-1' })), error: null }) }) }
      return {
        select: () => ({ eq: () => ({ in: async () => ({ data: state.existing, error: null }) }) }),
        insert: (rows: Record<string, unknown>[]) => { state.inserted.push(...rows); return { select: async () => ({ data: rows.map((r, i) => ({ id: `a-${i}`, class_id: r.class_id }) ), error: null }) } },
      }
    },
  }
  return { state, client }
})

vi.mock('../lib/supabase.js', () => ({ supabaseAdmin: h.client, supabaseAnon: {} }))
vi.mock('../lib/creatorAccess.js', () => ({
  requireCreator: (_r: unknown, _s: unknown, next: () => void) => next(),
  ensureQuestAccess: async () => undefined,
  readAnonId: () => null,
}))
vi.mock('../middleware/staffAuth.js', async (orig) => {
  const m = await orig<Record<string, unknown>>()
  return {
    ...m,
    requireStaff: (req: { staff?: unknown }, _res: unknown, next: () => void) => { req.staff = { userId: 'u-1', role: 'teacher', schoolId: 's-1', canShare: true }; next() },
    requireCanShare: (_r: unknown, _s: unknown, next: () => void) => next(),
    isDemoGuest: () => false,
  }
})
vi.mock('../lib/authz.js', async (orig) => {
  const m = await orig<Record<string, unknown>>()
  return { ...m, loadViewer: async () => ({}), canAssignToClass: () => true }
})
vi.mock('../lib/activeColumn.js', async (orig) => {
  const m = await orig<Record<string, unknown>>()
  return { ...m, hasAssignmentDueAt: async () => h.state.withDue }
})

import { errorHandler } from '../middleware/errors.js'
import { ERR_DUE_INVALID, ERR_DUE_PAST } from '../../../src/shared/lib/findingsNarrative.js'
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
beforeEach(() => { h.state.inserted = []; h.state.existing = []; h.state.withDue = true })
afterEach(() => { vi.useRealTimers() })

const assign = async (body: Record<string, unknown>): Promise<{ status: number; json: Record<string, unknown> }> => {
  const r = await fetch(`${base}/q-1/assign`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { status: r.status, json: (await r.json()) as Record<string, unknown> }
}
const now = (iso: string): void => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(iso)) }

describe('הקצאה: מועד הגשה', () => {
  it('בלי dueDay — ברירת המחדל: שבוע מהיום ב-23:59 שעון ישראל (קיץ: UTC+3)', async () => {
    now('2026-07-01T09:00:00Z')
    const r = await assign({ classIds: [CLASS_ID] })
    expect(r.status).toBe(201)
    expect(r.json.dueAt).toBe('2026-07-08T20:59:00.000Z')
    expect(h.state.inserted[0]).toMatchObject({ quest_id: 'q-1', class_id: CLASS_ID, due_at: '2026-07-08T20:59:00.000Z' })
  })

  it('עם dueDay — סוף אותו יום ישראלי (חורף: UTC+2)', async () => {
    now('2026-12-01T09:00:00Z')
    const r = await assign({ classIds: [CLASS_ID], dueDay: '2027-01-15' })
    expect(r.status).toBe(201)
    expect(h.state.inserted[0].due_at).toBe('2027-01-15T21:59:00.000Z')
  })

  it('היום עצמו מותר (נגמר ב-23:59)', async () => {
    now('2026-07-01T09:00:00Z')
    expect((await assign({ classIds: [CLASS_ID], dueDay: '2026-07-01' })).status).toBe(201)
  })

  it('יום שעבר → 400 והודעה בעברית, ושום הקצאה לא נוצרה', async () => {
    now('2026-07-10T09:00:00Z')
    const r = await assign({ classIds: [CLASS_ID], dueDay: '2026-07-09' })
    expect(r.status).toBe(400)
    expect(r.json.error).toBe(ERR_DUE_PAST)
    expect(h.state.inserted).toHaveLength(0)
  })

  it('תאריך פגום / לא מחרוזת → 400', async () => {
    for (const bad of ['2026-02-30', '08/07/2026', 'garbage', 20260708]) {
      const r = await assign({ classIds: [CLASS_ID], dueDay: bad })
      expect(r.status, String(bad)).toBe(400)
      expect(r.json.error).toBe(ERR_DUE_INVALID)
    }
    expect(h.state.inserted).toHaveLength(0)
  })

  it('סביבה בלי העמודה due_at (לפני המיגרציה): ההקצאה נוצרת בלי המועד', async () => {
    h.state.withDue = false
    const r = await assign({ classIds: [CLASS_ID] })
    expect(r.status).toBe(201)
    expect(h.state.inserted[0]).not.toHaveProperty('due_at')
  })

  it('כיתה שכבר מוקצית לה השיעור מדולגת (בלי כפילות) — ואין שורה חדשה, גם לא מועד', async () => {
    h.state.existing = [{ class_id: CLASS_ID }]
    const r = await assign({ classIds: [CLASS_ID], dueDay: '2099-01-01' })
    expect(r.status).toBe(201)
    expect(h.state.inserted).toHaveLength(0)
  })
})
