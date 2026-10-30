/* גבישי הכיתה: שני מספרים בלבד (ועוד הגבישים של התלמיד/ה עצמו/ה), בלי דליפה של תלמיד אחר, ורק לכיתה שקיבלה את השיעור */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>
  const tables: Record<string, Row[]> = {}
  const calls: { table: string; filters: string[] }[] = []
  class Q {
    filters: ((r: Row) => boolean)[] = []
    desc: string[] = []
    constructor(public t: string) { calls.push({ table: t, filters: this.desc }) }
    select() { return this }
    eq(k: string, v: unknown) { this.desc.push(`eq:${k}`); this.filters.push((r) => r[k] === v); return this }
    in(k: string, v: unknown[]) { this.desc.push(`in:${k}`); this.filters.push((r) => v.includes(r[k])); return this }
    not(k: string) { this.filters.push((r) => r[k] !== null && r[k] !== undefined); return this }
    gte(k: string, v: number) { this.filters.push((r) => Number(r[k]) >= v); return this }
    limit() { return this }
    then(res: (v: { data: Row[]; error: null }) => void) { res({ data: (tables[this.t] ?? []).filter((r) => this.filters.every((f) => f(r))), error: null }) }
  }
  return { tables, calls, client: { from: (t: string) => new Q(t) }, gems: { on: true } }
})

vi.mock('./supabase.js', () => ({ supabaseAdmin: h.client, supabaseAnon: {} }))
vi.mock('./activeColumn.js', async (orig) => ({ ...(await orig<Record<string, unknown>>()), hasSessionGems: async () => h.gems.on }))
vi.mock('./authz.js', async (orig) => await orig<Record<string, unknown>>())

import { classGemsFor, classGemsForLessons, summarizeClassGems } from './classGems.js'
import { mayReadClassGems } from './authz.js'

const QUEST = '11111111-1111-4111-8111-111111111111'
const student = (id: string) => ({ user_id: id, class_id: 'c1', users: { role: 'student' } })

beforeEach(() => {
  h.gems.on = true
  h.calls.length = 0
  h.tables.assignments = [{ quest_id: QUEST, class_id: 'c1' }]
  h.tables.class_members = [student('me'), student('dana'), student('yoav'), { user_id: 't1', class_id: 'c1', users: { role: 'teacher' } }, { user_id: 'zar', class_id: 'c2', users: { role: 'student' } }]
  h.tables.sessions = [
    { quest_id: QUEST, user_id: 'me', gems: 2 }, { quest_id: QUEST, user_id: 'me', gems: 4 },
    { quest_id: QUEST, user_id: 'dana', gems: 3 }, { quest_id: QUEST, user_id: 'dana', gems: 1 },
    { quest_id: QUEST, user_id: 'zar', gems: 5 },
    { quest_id: QUEST, user_id: 'yoav', gems: null },
  ]
})

describe('summarizeClassGems', () => {
  it('המשחק הטוב ביותר של כל תלמיד/ה; מי שלא בכיתה לא נספר', () => {
    const r = summarizeClassGems([{ user_id: 'a', gems: 2 }, { user_id: 'a', gems: 5 }, { user_id: 'b', gems: 3 }, { user_id: 'x', gems: 5 }], ['a', 'b', 'c'], 'a')
    expect(r).toEqual({ available: true, classGems: 8, mine: 5, target: 9, allClosed: false })
  })
  it('allClosed רק כשכולם סגרו', () => {
    expect(summarizeClassGems([{ user_id: 'a', gems: 3 }, { user_id: 'b', gems: 2 }], ['a', 'b'], 'a').allClosed).toBe(false)
    expect(summarizeClassGems([{ user_id: 'a', gems: 3 }, { user_id: 'b', gems: 2 }, { user_id: 'b', gems: 5 }], ['a', 'b'], 'a').allClosed).toBe(true)
    expect(summarizeClassGems([], [], 'a').allClosed).toBe(false)
  })
})

describe('classGemsFor', () => {
  it('מספרים נכונים: הטוב ביותר, בלי המורה ובלי כיתה אחרת', async () => {
    const r = await classGemsFor({ studentId: 'me', classId: 'c1' }, QUEST)
    expect(r).toEqual({ available: true, classGems: 7, mine: 4, target: 9, allClosed: false })
  })
  it('אין בתשובה שום נתון של תלמיד/ה אחר/ת: בדיוק השדות המותרים', async () => {
    const r = await classGemsFor({ studentId: 'me', classId: 'c1' }, QUEST)
    expect(Object.keys(r).sort()).toEqual(['allClosed', 'available', 'classGems', 'mine', 'target'])
    const body = JSON.stringify(r)
    for (const id of ['dana', 'yoav', 'zar', 't1']) expect(body).not.toContain(id)
    /* גם לא כמה תלמידים סיימו: שום שדה ספירה */
    expect(body).not.toMatch(/finished|completed|count|students/i)
  })
  it('שיעור שלא נשלח לכיתה של התלמיד/ה: אין נתון', async () => {
    h.tables.assignments = [{ quest_id: QUEST, class_id: 'c2' }]
    expect(await classGemsFor({ studentId: 'me', classId: 'c1' }, QUEST)).toEqual({ available: false })
    expect(h.calls.some((c) => c.table === 'sessions')).toBe(false)
  })
  it('תלמיד/ה בלי כיתה בטוקן: אין נתון', async () => {
    expect(await classGemsFor({ studentId: 'me', classId: null }, QUEST)).toEqual({ available: false })
    expect(h.calls).toEqual([])
  })
  it('טוקן עם כיתה שהתלמיד/ה לא חבר/ה בה: אין נתון', async () => {
    h.tables.assignments = [{ quest_id: QUEST, class_id: 'c1' }]
    expect(await classGemsFor({ studentId: 'zar', classId: 'c1' }, QUEST)).toEqual({ available: false })
  })
  it('לפני המיגרציה: אין נתון, בלי קריאות', async () => {
    h.gems.on = false
    expect(await classGemsFor({ studentId: 'me', classId: 'c1' }, QUEST)).toEqual({ available: false })
    expect(h.calls).toEqual([])
  })
  it('mayReadClassGems: רק הכיתה שלו/ה', () => {
    expect(mayReadClassGems('c1', { class_id: 'c1' })).toBe(true)
    expect(mayReadClassGems('c1', { class_id: 'c2' })).toBe(false)
    expect(mayReadClassGems('c1', null)).toBe(false)
    expect(mayReadClassGems(null, { class_id: 'c1' })).toBe(false)
  })
})

describe('classGemsForLessons: הסימון המשותף במסע', () => {
  it('מסומן רק כשכל התלמידים סגרו, ומשחק חוזר נספר', async () => {
    h.tables.sessions = [
      { quest_id: 'q1', user_id: 'me', gems: 3 }, { quest_id: 'q1', user_id: 'dana', gems: 5 }, { quest_id: 'q1', user_id: 'yoav', gems: 2 }, { quest_id: 'q1', user_id: 'yoav', gems: 3 },
      { quest_id: 'q2', user_id: 'me', gems: 5 }, { quest_id: 'q2', user_id: 'dana', gems: 5 }, { quest_id: 'q2', user_id: 'yoav', gems: 2 },
    ]
    expect([...await classGemsForLessons('c1', ['q1', 'q2'])]).toEqual(['q1'])
  })
  it('כיתה ריקה / בלי שיעורים: כלום', async () => {
    expect((await classGemsForLessons('c9', ['q1'])).size).toBe(0)
    expect((await classGemsForLessons('c1', [])).size).toBe(0)
  })
})
