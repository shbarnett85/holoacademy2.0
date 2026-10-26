/* GET /api/sessions/assigned — רשימת השיעורים של התלמיד (CLAUDE.md "שפה חזותית של מקצועות" + "תאריך יעד ומצב שיעור").
   · כל שיעור נושא subjectCode (למסגרת ולסמל), thumbUrl (הסצנה השנייה), dueAt, state (פונקציית המצב היחידה) ו-late.
   · ההקצאה האחרונה לאותו שיעור קובעת את המועד. · סשן שהושלם לראשונה אחרי המועד = late. · אין DB: Supabase מוחלף ב-fake בזיכרון. */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import express from 'express'

const h = vi.hoisted(() => {
  const db: Record<string, Record<string, unknown>[]> = {}
  class Q {
    private filters: ((r: Record<string, unknown>) => boolean)[] = []
    constructor(private t: string) {}
    select() { return this }
    eq(k: string, v: unknown) { this.filters.push((r) => r[k] === v); return this }
    in(k: string, a: unknown[]) { this.filters.push((r) => a.includes(r[k])); return this }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    then(ok?: any, bad?: any) { return Promise.resolve({ data: (db[this.t] ?? []).filter((r) => this.filters.every((f) => f(r))), error: null }).then(ok, bad) }
  }
  return { db, client: { from: (t: string) => new Q(t) } }
})

vi.mock('../lib/supabase.js', () => ({ supabaseAdmin: h.client, supabaseAnon: {} }))
vi.mock('../middleware/studentAuth.js', () => ({
  requireStudent: (req: { student?: unknown }, _res: unknown, next: () => void) => { req.student = { userId: 'stu-1', classId: 'c-1' }; next() },
}))
vi.mock('../lib/activeColumn.js', async (orig) => {
  const m = await orig<Record<string, unknown>>()
  return { ...m, hasAssignmentDueAt: async () => true, hasQuestSubject: async () => true, hasQuestSubjectId: async () => true, hasQuestGrade: async () => true, hasQuestThumb: async () => true }
})
vi.mock('../lib/subjects.js', () => ({
  questSubjectOut: async (r: { subject_id?: string | null }) => (r.subject_id ? { subject: 'מדעים', subjectCode: 'science' } : { subject: null, subjectCode: null }),
}))

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

const GAME = { entrySceneId: 'a', scenes: [{ id: 'a', imageUrl: 'lab.png', nextSceneId: 'b' }, { id: 'b', imageUrl: 'world.png' }] }
const DUE = '2026-10-17T20:59:00.000Z'

beforeEach(() => {
  for (const k of Object.keys(h.db)) delete h.db[k]
  h.db.assignments = [
    { quest_id: 'q-1', class_id: 'c-1', created_at: '2026-10-01T08:00:00Z', due_at: '2026-10-05T20:59:00.000Z' },
    { quest_id: 'q-1', class_id: 'c-1', created_at: '2026-10-10T08:00:00Z', due_at: DUE }, /* ההקצאה האחרונה קובעת */
    { quest_id: 'q-2', class_id: 'c-1', created_at: '2026-10-10T08:00:00Z', due_at: null },
  ]
  h.db.quests = [
    { id: 'q-1', title: 'מסע המים', game_data: GAME, art_style: 'storybook', created_by: 't-1', subject: 'מדעים', subject_id: 'sid-sci', difficulty_settings: { writingLevel: 11 }, grade_min: null, grade_max: null, thumb_url: null, thumb_src: null },
    { id: 'q-2', title: 'בלי מקצוע', game_data: { scenes: [{ id: 'x' }] }, art_style: 'anime', created_by: 't-1', subject: null, subject_id: null, difficulty_settings: {}, thumb_url: null, thumb_src: null },
  ]
  h.db.users = [{ id: 't-1', name: 'המורה רון' }]
  h.db.sessions = []
})

const get = async (): Promise<{ quests: Record<string, unknown>[] }> => (await (await fetch(`${base}/assigned`)).json()) as { quests: Record<string, unknown>[] }
const byId = (qs: Record<string, unknown>[], id: string): Record<string, unknown> => qs.find((q) => q.id === id)!
const now = (iso: string): void => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(iso)) }

describe('שיעורים של התלמיד: מקצוע, תמונה, מועד ומצב', () => {
  it('subjectCode ו-thumbUrl (הסצנה השנייה, לא הפתיחה); שיעור בלי מקצוע → subjectCode null', async () => {
    now('2026-10-12T10:00:00Z')
    const { quests } = await get()
    expect(byId(quests, 'q-1')).toMatchObject({ subject: 'מדעים', subjectCode: 'science', thumbUrl: 'world.png', entryImageUrl: 'lab.png' })
    expect(byId(quests, 'q-2')).toMatchObject({ subject: null, subjectCode: null, thumbUrl: null })
  })

  it('תמונה ממוזערת שמורה מהמקור הנוכחי מחליפה את תמונת הסצנה; מקור שהתחלף — חוזרים לכתובת המקור', async () => {
    now('2026-10-12T10:00:00Z')
    h.db.quests[0] = { ...h.db.quests[0], thumb_url: 'https://res.cloudinary.com/x/holo-thumbs/q-1.jpg', thumb_src: 'world.png' }
    expect(byId((await get()).quests, 'q-1')).toMatchObject({ thumbUrl: 'https://res.cloudinary.com/x/holo-thumbs/q-1.jpg' })
    h.db.quests[0] = { ...h.db.quests[0], thumb_src: 'old-scene.png' }
    expect(byId((await get()).quests, 'q-1')).toMatchObject({ thumbUrl: 'world.png' })
  })

  it('שכבות השיעור לתגית: מטא שכבות אם יש; אחרת שכבת היעד מהיצירה (רמת כתיבה פחות 4); בלי נתון — null', async () => {
    now('2026-10-12T10:00:00Z')
    expect(byId((await get()).quests, 'q-1')).toMatchObject({ gradeMin: 7, gradeMax: 7 })
    expect(byId((await get()).quests, 'q-2')).toMatchObject({ gradeMin: null, gradeMax: null })
    h.db.quests[0] = { ...h.db.quests[0], grade_min: 5, grade_max: 6 }
    expect(byId((await get()).quests, 'q-1')).toMatchObject({ gradeMin: 5, gradeMax: 6 })
  })

  it('dueAt של ההקצאה האחרונה; state open לפני המועד, ended אחריו; בלי מועד — open', async () => {
    now('2026-10-12T10:00:00Z')
    expect(byId((await get()).quests, 'q-1')).toMatchObject({ dueAt: DUE, state: 'open', late: false })
    expect(byId((await get()).quests, 'q-2')).toMatchObject({ dueAt: null, state: 'open', late: false })
    now('2026-10-20T10:00:00Z')
    expect(byId((await get()).quests, 'q-1')).toMatchObject({ dueAt: DUE, state: 'ended' })
  })

  it('late: ההשלמה הראשונה אחרי המועד; השלמה בזמן + חזרה מאוחרת — לא late; לא הושלם — לא late', async () => {
    now('2026-10-25T10:00:00Z')
    h.db.sessions = [{ quest_id: 'q-1', user_id: 'stu-1', completed_at: '2026-10-18T09:00:00Z', crystals: 3, total_score: 3, max_score: 5 }]
    expect(byId((await get()).quests, 'q-1')).toMatchObject({ sessionStatus: 'completed', late: true })
    h.db.sessions = [
      { quest_id: 'q-1', user_id: 'stu-1', completed_at: '2026-10-11T09:00:00Z', crystals: 2, total_score: 2, max_score: 5 },
      { quest_id: 'q-1', user_id: 'stu-1', completed_at: '2026-10-19T09:00:00Z', crystals: 5, total_score: 5, max_score: 5 },
    ]
    expect(byId((await get()).quests, 'q-1')).toMatchObject({ sessionStatus: 'completed', late: false, crystals: 5 })
    h.db.sessions = [{ quest_id: 'q-1', user_id: 'stu-1', completed_at: null, crystals: null }]
    expect(byId((await get()).quests, 'q-1')).toMatchObject({ sessionStatus: 'in_progress', late: false })
  })
})
