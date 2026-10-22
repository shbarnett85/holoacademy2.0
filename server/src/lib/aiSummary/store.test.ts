import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '../../middleware/errors.js'

/* החנות האמיתית (Supabase) מול DB מדומה: סינון אישי לפי צופה בכל קריאה/כתיבה, מיפוי עמודות, עמידות לפני המיגרציה (סכמה חסרה → null, בלי לגעת ב-DB),
   וכשל DB אחר (לא "סכמה חסרה") שמתפשט כ-503 ולא נבלע (R4#10). */
interface Call { op: 'select' | 'upsert' | 'update' | 'insert'; table: string; filters: [string, unknown][]; payload?: Record<string, unknown>; opts?: Record<string, unknown>; head?: boolean; limit?: number }
type Resp = { data: unknown; error: unknown; count?: number | null }
const h = vi.hoisted(() => {
  const state = { calls: [] as Call[], respond: (() => ({ data: null, error: null, count: 0 })) as (c: Call) => Resp }
  class Q {
    c: Call
    constructor(table: string) { this.c = { op: 'select', table, filters: [] }; state.calls.push(this.c) }
    select(_cols?: string, opts?: { head?: boolean }) { if (opts?.head) this.c.head = true; return this }
    limit(n: number) { this.c.limit = n; return this }
    eq(k: string, v: unknown) { this.c.filters.push([k, v]); return this }
    gte(k: string, v: unknown) { this.c.filters.push([`>=${k}`, v]); return this }
    upsert(p: Record<string, unknown>, o: Record<string, unknown>) { this.c.op = 'upsert'; this.c.payload = p; this.c.opts = o; return this }
    update(p: Record<string, unknown>) { this.c.op = 'update'; this.c.payload = p; return this }
    insert(p: Record<string, unknown>) { this.c.op = 'insert'; this.c.payload = p; return this }
    maybeSingle() { return Promise.resolve(state.respond(this.c)) }
    single() { return Promise.resolve(state.respond(this.c)) }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    then(ok?: any, bad?: any) { return Promise.resolve(state.respond(this.c)).then(ok, bad) }
  }
  return { state, Q }
})
vi.mock('../supabase.js', () => ({ supabaseAdmin: { from: (t: string) => new h.Q(t) } }))

import { createMemoryStore, createSupabaseStore, resetStoreAvailabilityCache, type NewStoredSummary } from './store.js'

const ROW = {
  id: 'row-1', viewer_id: 'u-A', scope: 'student', entity_id: 'e-1', subject_code: '', audience_key: 'full', written_by: 'ai', paragraphs: ['פסקה'], edited_text: null,
  model: 'm', prompt_version: 'v1', input_hash: 'h', input_facts: [{ id: 'f1', kind: 'level', tone: 'neutral', text: 't', numbers: [] }], sample_size: 5, sample_unit: 'sessions',
  created_at: '2026-10-19T09:00:00.000Z', updated_at: '2026-10-19T09:00:00.000Z',
}
const NEW: NewStoredSummary = {
  viewerId: 'u-A', scope: 'student', entityId: 'e-1', subjectCode: '', audienceKey: 'full', writtenBy: 'ai', paragraphs: ['פסקה'], model: 'm', promptVersion: 'v1', inputHash: 'h',
  inputFacts: [], sampleSize: 5, sampleUnit: 'sessions', createdAt: '2026-10-19T09:00:00.000Z', updatedAt: '2026-10-19T09:00:00.000Z',
}
const KEY = { viewerId: 'u-A', scope: 'student' as const, entityId: 'e-1', subjectCode: '', audienceKey: 'full' }
const MISSING = { code: 'PGRST205', message: 'Could not find the table' }
const BOOM = { code: '57014', message: 'canceling statement due to statement timeout' }

/* בדיקת הקיום (probe): select('id') עם limit(1) ובלי סינונים */
const isProbe = (c: Call): boolean => c.op === 'select' && c.limit === 1 && c.filters.length === 0

beforeEach(() => {
  resetStoreAvailabilityCache()
  h.state.calls = []
  h.state.respond = () => ({ data: null, error: null, count: 0 })
})
const failsWith503 = async (p: Promise<unknown>): Promise<void> => {
  const e = await p.then(() => null, (x: unknown) => x)
  expect(e).toBeInstanceOf(AppError)
  expect((e as AppError).status).toBe(503)
}

describe('חנות Supabase: אישית לצופה', () => {
  it('find: מסנן לפי כל חמשת חלקי המפתח (כולל viewer_id) וממפה עמודות', async () => {
    h.state.respond = (c) => (isProbe(c) ? { data: [], error: null } : { data: ROW, error: null })
    const got = await createSupabaseStore().find(KEY)
    expect(got).toMatchObject({ id: 'row-1', viewerId: 'u-A', writtenBy: 'ai', paragraphs: ['פסקה'], editedText: null, sampleSize: 5, sampleUnit: 'sessions', createdAt: ROW.created_at })
    const call = h.state.calls.find((c) => c.table === 'ai_summaries' && c.filters.length > 0)!
    expect(Object.fromEntries(call.filters)).toEqual({ viewer_id: 'u-A', scope: 'student', entity_id: 'e-1', subject_code: '', audience_key: 'full' })
  })

  it('findById ו-setEdited: תמיד מסננים גם ב-viewer_id (צופה אחר לא מגיע לשורה)', async () => {
    h.state.respond = (c) => (isProbe(c) ? { data: [], error: null } : { data: ROW, error: null })
    const s = createSupabaseStore()
    await s.findById('row-1', 'u-B')
    await s.setEdited('row-1', 'u-B', 'טקסט', '2026-10-19T10:00:00.000Z')
    const [byId, upd] = h.state.calls.filter((c) => c.table === 'ai_summaries' && !isProbe(c))
    expect(Object.fromEntries(byId.filters)).toEqual({ id: 'row-1', viewer_id: 'u-B' })
    expect(upd.op).toBe('update')
    expect(upd.payload).toEqual({ edited_text: 'טקסט', updated_at: '2026-10-19T10:00:00.000Z' })
    expect(Object.fromEntries(upd.filters)).toEqual({ id: 'row-1', viewer_id: 'u-B' })
  })

  it('upsert: מפתח ה-conflict האישי; resetEdit=true מאפס edited_text, resetEdit=false משאיר עריכה קיימת (השדה לא נשלח)', async () => {
    h.state.respond = (c) => (isProbe(c) ? { data: [], error: null } : { data: ROW, error: null })
    const s = createSupabaseStore()
    const saved = await s.upsert(NEW, { resetEdit: true })
    expect(saved?.id).toBe('row-1')
    await s.upsert(NEW, { resetEdit: false })
    const [reset, keep] = h.state.calls.filter((c) => c.op === 'upsert')
    expect(reset.payload).toMatchObject({ viewer_id: 'u-A', edited_text: null, written_by: 'ai', input_facts: [], sample_unit: 'sessions' })
    expect(keep.payload).not.toHaveProperty('edited_text')
    expect(reset.opts).toEqual({ onConflict: 'viewer_id,scope,entity_id,subject_code,audience_key' })
  })

  it('יומן שימוש: recordGeneration מוסיף שורה לטבלת ai_summary_usage; הספירה לפי צופה ומועד, מאותה טבלה (כולל כתיבות מחדש)', async () => {
    h.state.respond = (c) => (isProbe(c) ? { data: [], error: null } : { data: null, error: null, count: 7 })
    const s = createSupabaseStore()
    await s.recordGeneration('u-A', '2026-10-19T09:00:00.000Z')
    const ins = h.state.calls.find((c) => c.op === 'insert')!
    expect(ins.table).toBe('ai_summary_usage')
    expect(ins.payload).toEqual({ viewer_id: 'u-A', created_at: '2026-10-19T09:00:00.000Z' })
    expect(await s.countGeneratedSince('u-A', '2026-10-19T00:00:00.000Z')).toBe(7)
    const count = h.state.calls.find((c) => c.head)!
    expect(count.table).toBe('ai_summary_usage')
    expect(Object.fromEntries(count.filters)).toEqual({ viewer_id: 'u-A', '>=created_at': '2026-10-19T00:00:00.000Z' })
  })

  it('שורה פגומה (בלי פסקאות) = אין סיכום', async () => {
    h.state.respond = (c) => (isProbe(c) ? { data: [], error: null } : { data: { ...ROW, paragraphs: [] }, error: null })
    expect(await createSupabaseStore().find(KEY)).toBeNull()
    h.state.respond = (c) => (isProbe(c) ? { data: [], error: null } : { data: { ...ROW, paragraphs: null }, error: null })
    expect(await createSupabaseStore().findById('row-1', 'u-A')).toBeNull()
  })

  it('אין שורה = null (לא שגיאה)', async () => {
    h.state.respond = (c) => (isProbe(c) ? { data: [], error: null } : { data: null, error: null })
    expect(await createSupabaseStore().find(KEY)).toBeNull()
  })
})

describe('כשל DB שאינו "סכמה חסרה": מתפשט כ-503 ולא נבלע (R4#10)', () => {
  it('שגיאה זמנית בקריאה/כתיבה/עריכה/ספירה → 503; לא null ("אין סיכום") ולא שורה', async () => {
    const s = createSupabaseStore()
    h.state.respond = (c) => (isProbe(c) ? { data: [], error: null } : { data: null, error: BOOM })
    await failsWith503(s.find(KEY))
    await failsWith503(s.findById('id', 'u-A'))
    await failsWith503(s.upsert(NEW, { resetEdit: false }))
    await failsWith503(s.setEdited('id', 'u-A', 'x', 'now'))
    await failsWith503(s.countGeneratedSince('u-A', 'x'))
    await failsWith503(s.recordGeneration('u-A', 'now'))
  })
  it('בדיקת הקיום עצמה נכשלת בשגיאה זמנית → 503 ולא "אין טבלה"; ולא נשמרת (הניסיון הבא בודק שוב)', async () => {
    const s = createSupabaseStore()
    h.state.respond = () => ({ data: null, error: BOOM })
    await failsWith503(s.find(KEY))
    h.state.respond = (c) => (isProbe(c) ? { data: [], error: null } : { data: ROW, error: null })
    expect((await s.find(KEY))?.id).toBe('row-1')
  })
})

describe('לפני המיגרציה (הטבלה חסרה: קוד סכמה חסרה)', () => {
  it('כל הפעולות מחזירות null / לא עושות כלום, והפנייה היחידה היא בדיקת הקיום', async () => {
    h.state.respond = () => ({ data: null, error: MISSING })
    const s = createSupabaseStore()
    expect(await s.find(KEY)).toBeNull()
    expect(await s.findById('id', 'u')).toBeNull()
    expect(await s.upsert(NEW, { resetEdit: false })).toBeNull()
    expect(await s.setEdited('id', 'u', 'x', 'now')).toBeNull()
    await s.recordGeneration('u', 'now')
    expect(await s.countGeneratedSince('u', 'x')).toBeNull()
    expect(h.state.calls.every(isProbe)).toBe(true)
  })
  it('אחרי המיגרציה (בלי ריסטרט): הבדיקה הבאה מוצאת את הטבלה', async () => {
    const s = createSupabaseStore()
    h.state.respond = () => ({ data: null, error: MISSING })
    expect(await s.find(KEY)).toBeNull()
    h.state.respond = (c) => (isProbe(c) ? { data: [], error: null } : { data: ROW, error: null })
    expect((await s.find(KEY))?.id).toBe('row-1')
  })
})

describe('חנות הזיכרון (לבדיקות): אותו חוזה', () => {
  it('upsert עם resetEdit מאפס עריכה, בלעדיו משאיר אותה; id יציב; setEdited ו-findById אישיים', async () => {
    const m = createMemoryStore()
    const a = (await m.upsert(NEW, { resetEdit: true }))!
    await m.setEdited(a.id, 'u-A', 'ערוך', 'now')
    expect((await m.findById(a.id, 'u-A'))!.editedText).toBe('ערוך')
    expect(await m.findById(a.id, 'u-B')).toBeNull()
    expect(await m.setEdited(a.id, 'u-B', 'x', 'now')).toBeNull()
    const kept = (await m.upsert({ ...NEW, paragraphs: ['חדש'] }, { resetEdit: false }))!
    expect(kept.id).toBe(a.id)
    expect(kept.editedText).toBe('ערוך')
    const b = (await m.upsert({ ...NEW, paragraphs: ['חדש'] }, { resetEdit: true }))!
    expect(b.editedText).toBeNull()
  })
  it('יומן שימוש: כל יצירה נרשמת (גם על אותה ישות), והספירה לפי צופה ומועד', async () => {
    const m = createMemoryStore()
    await m.recordGeneration('u-A', '2026-10-19T09:00:00.000Z')
    await m.recordGeneration('u-A', '2026-10-19T09:01:00.000Z')
    await m.recordGeneration('u-B', '2026-10-19T09:02:00.000Z')
    await m.recordGeneration('u-A', '2026-10-18T09:00:00.000Z')
    expect(await m.countGeneratedSince('u-A', '2026-10-19T00:00:00.000Z')).toBe(2)
    expect(await createMemoryStore({ available: false }).countGeneratedSince('u-A', 'x')).toBeNull()
  })
})
