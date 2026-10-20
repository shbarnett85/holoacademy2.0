import { beforeEach, describe, expect, it, vi } from 'vitest'

/* החנות האמיתית (Supabase) מול DB מדומה: סינון אישי לפי צופה בכל קריאה/כתיבה, מיפוי עמודות, ועמידות לפני המיגרציה (אין טבלה → null, בלי לגעת ב-DB). */
interface Call { op: 'select' | 'upsert' | 'update'; table: string; filters: [string, unknown][]; payload?: Record<string, unknown>; opts?: Record<string, unknown>; head?: boolean }
const h = vi.hoisted(() => {
  const state = { has: true, calls: [] as Call[], respond: ((_c: Call) => ({ data: null as unknown, error: null as unknown, count: 0 as number | null })) as (c: Call) => { data: unknown; error: unknown; count?: number | null } }
  class Q {
    c: Call
    constructor(table: string) { this.c = { op: 'select', table, filters: [] }; state.calls.push(this.c) }
    select(_cols?: string, opts?: { head?: boolean }) { if (opts?.head) this.c.head = true; return this }
    eq(k: string, v: unknown) { this.c.filters.push([k, v]); return this }
    gte(k: string, v: unknown) { this.c.filters.push([`>=${k}`, v]); return this }
    upsert(p: Record<string, unknown>, o: Record<string, unknown>) { this.c.op = 'upsert'; this.c.payload = p; this.c.opts = o; return this }
    update(p: Record<string, unknown>) { this.c.op = 'update'; this.c.payload = p; return this }
    maybeSingle() { return Promise.resolve(state.respond(this.c)) }
    single() { return Promise.resolve(state.respond(this.c)) }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    then(ok?: any, bad?: any) { return Promise.resolve(state.respond(this.c)).then(ok, bad) }
  }
  return { state, Q }
})
vi.mock('../activeColumn.js', () => ({ hasAiSummaries: vi.fn(async () => h.state.has) }))
vi.mock('../supabase.js', () => ({ supabaseAdmin: { from: (t: string) => new h.Q(t) } }))

import { createMemoryStore, createSupabaseStore, type NewStoredSummary } from './store.js'

const ROW = {
  id: 'row-1', viewer_id: 'u-A', scope: 'student', entity_id: 'e-1', subject_code: '', audience_key: 'full', written_by: 'ai', paragraphs: ['פסקה'], edited_text: null,
  model: 'm', prompt_version: 'v1', input_hash: 'h', input_facts: [{ id: 'f1', kind: 'level', tone: 'neutral', text: 't', numbers: [] }], sample_size: 5, sample_unit: 'sessions',
  created_at: '2026-10-19T09:00:00.000Z', updated_at: '2026-10-19T09:00:00.000Z',
}
const NEW: NewStoredSummary = {
  viewerId: 'u-A', scope: 'student', entityId: 'e-1', subjectCode: '', audienceKey: 'full', writtenBy: 'ai', paragraphs: ['פסקה'], model: 'm', promptVersion: 'v1', inputHash: 'h',
  inputFacts: [], sampleSize: 5, sampleUnit: 'sessions', createdAt: '2026-10-19T09:00:00.000Z', updatedAt: '2026-10-19T09:00:00.000Z',
}

beforeEach(() => { h.state.has = true; h.state.calls = []; h.state.respond = () => ({ data: null, error: null, count: 0 }) })

describe('חנות Supabase: אישית לצופה', () => {
  it('find: מסנן לפי כל חמשת חלקי המפתח (כולל viewer_id) וממפה עמודות', async () => {
    h.state.respond = () => ({ data: ROW, error: null })
    const got = await createSupabaseStore().find({ viewerId: 'u-A', scope: 'student', entityId: 'e-1', subjectCode: '', audienceKey: 'full' })
    expect(got).toMatchObject({ id: 'row-1', viewerId: 'u-A', writtenBy: 'ai', paragraphs: ['פסקה'], editedText: null, sampleSize: 5, sampleUnit: 'sessions', createdAt: ROW.created_at })
    const call = h.state.calls.find((c) => c.table === 'ai_summaries')!
    expect(Object.fromEntries(call.filters)).toEqual({ viewer_id: 'u-A', scope: 'student', entity_id: 'e-1', subject_code: '', audience_key: 'full' })
  })

  it('findById ו-setEdited: תמיד מסננים גם ב-viewer_id (צופה אחר לא מגיע לשורה)', async () => {
    h.state.respond = () => ({ data: ROW, error: null })
    const s = createSupabaseStore()
    await s.findById('row-1', 'u-B')
    await s.setEdited('row-1', 'u-B', 'טקסט', '2026-10-19T10:00:00.000Z')
    const [byId, upd] = h.state.calls.filter((c) => c.table === 'ai_summaries')
    expect(Object.fromEntries(byId.filters)).toEqual({ id: 'row-1', viewer_id: 'u-B' })
    expect(upd.op).toBe('update')
    expect(upd.payload).toEqual({ edited_text: 'טקסט', updated_at: '2026-10-19T10:00:00.000Z' })
    expect(Object.fromEntries(upd.filters)).toEqual({ id: 'row-1', viewer_id: 'u-B' })
  })

  it('upsert: מאפס edited_text, משתמש במפתח ה-conflict האישי, ומחזיר את השורה', async () => {
    h.state.respond = () => ({ data: ROW, error: null })
    const saved = await createSupabaseStore().upsert(NEW)
    expect(saved?.id).toBe('row-1')
    const call = h.state.calls.find((c) => c.op === 'upsert')!
    expect(call.payload).toMatchObject({ viewer_id: 'u-A', edited_text: null, written_by: 'ai', input_facts: [], sample_unit: 'sessions' })
    expect(call.opts).toEqual({ onConflict: 'viewer_id,scope,entity_id,subject_code,audience_key' })
  })

  it('countGeneratedSince: ספירה לפי צופה ומועד; שגיאה → null', async () => {
    h.state.respond = () => ({ data: null, error: null, count: 7 })
    expect(await createSupabaseStore().countGeneratedSince('u-A', '2026-10-19T00:00:00.000Z')).toBe(7)
    const call = h.state.calls.find((c) => c.head)!
    expect(Object.fromEntries(call.filters)).toEqual({ viewer_id: 'u-A', '>=created_at': '2026-10-19T00:00:00.000Z' })
    h.state.respond = () => ({ data: null, error: { message: 'x' }, count: null })
    expect(await createSupabaseStore().countGeneratedSince('u-A', 'x')).toBeNull()
  })

  it('שורה פגומה (בלי פסקאות) = אין סיכום', async () => {
    h.state.respond = () => ({ data: { ...ROW, paragraphs: [] }, error: null })
    expect(await createSupabaseStore().find({ viewerId: 'u-A', scope: 'student', entityId: 'e-1', subjectCode: '', audienceKey: 'full' })).toBeNull()
    h.state.respond = () => ({ data: { ...ROW, paragraphs: null }, error: null })
    expect(await createSupabaseStore().findById('row-1', 'u-A')).toBeNull()
  })

  it('שגיאת DB בקריאה → null (לא זורק, ולא מחזיר שורה)', async () => {
    h.state.respond = () => ({ data: null, error: { message: 'boom' } })
    const s = createSupabaseStore()
    expect(await s.find({ viewerId: 'u', scope: 'class', entityId: 'e', subjectCode: '', audienceKey: 'full' })).toBeNull()
    expect(await s.upsert(NEW)).toBeNull()
  })
})

describe('לפני המיגרציה (hasAiSummaries=false)', () => {
  it('כל הפעולות מחזירות null בלי לפנות לטבלה', async () => {
    h.state.has = false
    const s = createSupabaseStore()
    expect(await s.find({ viewerId: 'u', scope: 'class', entityId: 'e', subjectCode: '', audienceKey: 'full' })).toBeNull()
    expect(await s.findById('id', 'u')).toBeNull()
    expect(await s.upsert(NEW)).toBeNull()
    expect(await s.setEdited('id', 'u', 'x', 'now')).toBeNull()
    expect(await s.countGeneratedSince('u', 'x')).toBeNull()
    expect(h.state.calls).toHaveLength(0)
  })
})

describe('חנות הזיכרון (לבדיקות): אותו חוזה', () => {
  it('upsert מחליף ומאפס עריכה, שומר id יציב; setEdited ו-findById אישיים', async () => {
    const m = createMemoryStore()
    const a = (await m.upsert(NEW))!
    await m.setEdited(a.id, 'u-A', 'ערוך', 'now')
    expect((await m.findById(a.id, 'u-A'))!.editedText).toBe('ערוך')
    expect(await m.findById(a.id, 'u-B')).toBeNull()
    expect(await m.setEdited(a.id, 'u-B', 'x', 'now')).toBeNull()
    const b = (await m.upsert({ ...NEW, paragraphs: ['חדש'] }))!
    expect(b.id).toBe(a.id)
    expect(b.editedText).toBeNull()
    expect(await m.countGeneratedSince('u-A', '2000-01-01')).toBe(1)
  })
})
