/* GET /api/quests (ספריית המורה) ו-GET /api/library (הציבורית): כרטיס השיעור מקבל תמונה ממוזערת שמורה ושכבות.
   · thumbUrl = הממוזערת השמורה כשהיא מהמקור הנוכחי; אחרת תמונת המקור (בלי לחסום את הרשימה) · gradeMin/gradeMax מהמטא או משכבת היעד ·
   · שיעור בלי תמונה → thumbUrl null · העתקה מהספרייה הציבורית נושאת את הממוזערת השמורה (לא יוצרים ומעלים שוב). אין DB: Supabase ב-fake בזיכרון. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import express from 'express'

const h = vi.hoisted(() => {
  const db: Record<string, Record<string, unknown>[]> = {}
  const inserts: Record<string, unknown>[] = []
  class Q {
    private filters: ((r: Record<string, unknown>) => boolean)[] = []
    private isInsert = false
    private payload: Record<string, unknown> | null = null
    private singleRow = false
    constructor(private t: string) {}
    select() { return this }
    insert(p: Record<string, unknown>) { this.isInsert = true; this.payload = p; inserts.push(p); return this }
    eq(k: string, v: unknown) { this.filters.push((r) => r[k] === v); return this }
    in(k: string, a: unknown[]) { this.filters.push((r) => a.includes(r[k])); return this }
    ilike() { return this }
    order() { return this }
    limit() { return this }
    single() { this.singleRow = true; return this }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    then(ok?: any, bad?: any) {
      if (this.isInsert) return Promise.resolve({ data: { id: 'new-1', title: String(this.payload?.title ?? '') }, error: null }).then(ok, bad)
      const rows = (db[this.t] ?? []).filter((r) => this.filters.every((f) => f(r)))
      return Promise.resolve({ data: this.singleRow ? (rows[0] ?? null) : rows, error: null }).then(ok, bad)
    }
  }
  return { db, inserts, client: { from: (t: string) => new Q(t) } }
})

vi.mock('../lib/supabase.js', () => ({ supabaseAdmin: h.client, supabaseAnon: {} }))
vi.mock('../lib/creatorAccess.js', () => ({
  requireCreator: (req: { staff?: unknown }, _res: unknown, next: () => void) => { req.staff = { userId: 'u-1', role: 'teacher', canShare: true }; next() },
  ensureQuestAccess: () => {},
  readAnonId: () => null,
}))
vi.mock('../middleware/staffAuth.js', async (orig) => {
  const m = await orig<Record<string, unknown>>()
  return { ...m, requireStaff: (req: { staff?: unknown }, _res: unknown, next: () => void) => { req.staff = { userId: 'u-1', role: 'teacher' }; next() } }
})
vi.mock('../lib/subjects.js', () => ({
  questSubjectOut: async (r: { subject_id?: string | null }) => (r.subject_id ? { subject: 'היסטוריה', subjectCode: 'history' } : { subject: null, subjectCode: null }),
  subjectFieldsOfQuest: async () => ({ fields: {} }), subjectByCode: vi.fn(), subjectByLegacyName: vi.fn(),
}))
vi.mock('../lib/activeColumn.js', async (orig) => {
  const m = await orig<Record<string, unknown>>()
  return { ...m, hasPublicQuests: async () => true, hasQuestSubject: async () => true, hasQuestSubjectId: async () => true, hasQuestGrade: async () => true, hasQuestThumb: async () => true }
})

import { errorHandler } from '../middleware/errors.js'
import { libraryRouter } from './library.js'
import { questsRouter } from './quests.js'

let server: Server
let base = ''
beforeAll(async () => {
  const app = express()
  app.use(express.json())
  app.use('/api/quests', questsRouter)
  app.use('/api/library', libraryRouter)
  app.use(errorHandler)
  await new Promise<void>((r) => { server = app.listen(0, () => r()) })
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`
})
afterAll(async () => { await new Promise<void>((r) => server.close(() => r())) })

const SCENES = [{ id: 'a', imageUrl: 'lab.png', nextSceneId: 'b' }, { id: 'b', imageUrl: 'world.png' }]
beforeEach(() => {
  h.inserts.length = 0
  for (const k of Object.keys(h.db)) delete h.db[k]
  h.db.quests = [
    { id: 'q-1', title: 'עם ממוזערת', status: 'published', created_at: '2026-10-01T00:00:00Z', created_by: 'u-1', is_public: true, published_at: '2026-10-02T00:00:00Z', original_author_id: null,
      subject: 'היסטוריה', subject_id: 'sid-h', game_data: { entrySceneId: 'a', scenes: SCENES }, difficulty_settings: { writingLevel: 12 }, grade_min: null, grade_max: null,
      thumb_url: 'https://res.cloudinary.com/x/holo-thumbs/q-1.jpg', thumb_src: 'world.png' },
    { id: 'q-2', title: 'ממוזערת ישנה + מטא שכבות', status: 'draft', created_at: '2026-10-03T00:00:00Z', created_by: 'u-1', is_public: false, published_at: null, original_author_id: null,
      subject: null, subject_id: null, game_data: { entrySceneId: 'a', scenes: SCENES }, difficulty_settings: {}, grade_min: 5, grade_max: 6,
      thumb_url: 'https://res.cloudinary.com/x/holo-thumbs/old.jpg', thumb_src: 'other-scene.png' },
    { id: 'q-3', title: 'בלי תמונה', status: 'draft', created_at: '2026-10-04T00:00:00Z', created_by: 'u-1', is_public: false, published_at: null, original_author_id: null,
      subject: null, subject_id: null, game_data: { entrySceneId: 'a', scenes: [{ id: 'a' }] }, difficulty_settings: { writingLevel: 4 }, grade_min: null, grade_max: null, thumb_url: null, thumb_src: null },
  ]
  h.db.users = [{ id: 'u-1', name: 'המורה רון' }]
})

const mine = async (): Promise<Record<string, unknown>[]> => ((await (await fetch(`${base}/quests`)).json()) as { quests: Record<string, unknown>[] }).quests
const byId = (qs: Record<string, unknown>[], id: string): Record<string, unknown> => qs.find((q) => q.id === id)!

describe('GET /api/quests — כרטיס השיעור בספרייה שלי', () => {
  it('thumbUrl = הממוזערת השמורה כשהיא מהמקור הנוכחי; מקור שהתחלף — כתובת המקור; בלי תמונה — null', async () => {
    const qs = await mine()
    expect(byId(qs, 'q-1').thumbUrl).toBe('https://res.cloudinary.com/x/holo-thumbs/q-1.jpg')
    expect(byId(qs, 'q-2').thumbUrl).toBe('world.png')
    expect(byId(qs, 'q-3').thumbUrl).toBeNull()
  })

  it('שכבות: מטא אם יש; אחרת שכבת היעד מהיצירה; גן/חסר → null', async () => {
    const qs = await mine()
    expect(byId(qs, 'q-1')).toMatchObject({ gradeMin: 8, gradeMax: 8 })
    expect(byId(qs, 'q-2')).toMatchObject({ gradeMin: 5, gradeMax: 6 })
    expect(byId(qs, 'q-3')).toMatchObject({ gradeMin: null, gradeMax: null })
  })
})

describe('הספרייה הציבורית', () => {
  it('GET /api/library: אותו כרטיס — ממוזערת שמורה ושכבות', async () => {
    const { quests } = (await (await fetch(`${base}/library`)).json()) as { quests: Record<string, unknown>[] }
    expect(byId(quests, 'q-1')).toMatchObject({ thumbUrl: 'https://res.cloudinary.com/x/holo-thumbs/q-1.jpg', gradeMin: 8, gradeMax: 8, subjectCode: 'history' })
  })

  it('העתקה: הממוזערת השמורה עוברת לעותק (אותן תמונות סצנה)', async () => {
    const r = await fetch(`${base}/library/q-1/copy`, { method: 'POST' })
    expect(r.status).toBe(201)
    expect(h.inserts[0]).toMatchObject({ thumb_url: 'https://res.cloudinary.com/x/holo-thumbs/q-1.jpg', thumb_src: 'world.png', is_public: false, created_by: 'u-1' })
  })
})
