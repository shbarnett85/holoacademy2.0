/* FX1b (R2#7 / R5#1): טעינת טבלת המקצועות. ברירת המחדל סלחנית (שאר המערכת); strict (אנליטיקה / הרשאות) נכשל סגור על תקלה חולפת ואינו נשמר. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Err = { code?: string; message: string } | null
const h = vi.hoisted(() => {
  const state = { error: null as Err, rows: [] as { id: string; code: string; name_he: string }[], queries: [] as string[] }
  const client = {
    from: (table: string) => {
      const run = (): Promise<{ data: unknown; error: Err }> => { state.queries.push(table); return Promise.resolve(state.error ? { data: null, error: state.error } : { data: state.rows, error: null }) }
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.eq = () => b
      b.limit = () => b
      b.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => run().then(ok, bad)
      return b
    },
  }
  return { state, client }
})
vi.mock('./supabase.js', () => ({ supabaseAdmin: h.client, supabaseAnon: {} }))
vi.mock('./log.js', () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }))

type Mod = typeof import('./subjects.js')
let m: Mod
const TRANSIENT = { message: 'TypeError: fetch failed' }
const MISSING = { code: '42P01', message: 'relation "subjects" does not exist' }

beforeEach(async () => {
  vi.resetModules()
  h.state.error = null
  h.state.rows = [{ id: 'sid-math', code: 'math', name_he: 'מתמטיקה' }, { id: 'sid-hist', code: 'history', name_he: 'היסטוריה' }]
  h.state.queries.length = 0
  m = await import('./subjects.js')
})

describe('strict: כשל חולף ≠ "אין מקצוע"', () => {
  it('regression: תקלה זמנית בטעינת הטבלה — subjectById(strict) זורק 503 (ProbeUnavailableError), לא null', async () => {
    h.state.error = TRANSIENT
    await expect(m.subjectById('sid-math', { strict: true })).rejects.toMatchObject({ status: 503, name: 'ProbeUnavailableError' })
    await expect(m.questSubjectOut({ subject_id: 'sid-math' }, { strict: true })).rejects.toMatchObject({ status: 503 })
  })
  it('הכשל אינו נשמר: אחרי שהתקלה חלפה הטבלה נטענת ומחזירה את המקצוע', async () => {
    h.state.error = TRANSIENT
    await expect(m.subjectById('sid-math', { strict: true })).rejects.toBeTruthy()
    h.state.error = null
    expect(await m.subjectById('sid-math', { strict: true })).toMatchObject({ code: 'math' })
    expect(await m.questSubjectOut({ subject_id: 'sid-hist' }, { strict: true })).toEqual({ subject: 'היסטוריה', subjectCode: 'history' })
  })
  it('טבלה חסרה (לפני המיגרציה): strict מחזיר null כמו תמיד — לא שגיאה', async () => {
    h.state.error = MISSING
    expect(await m.subjectById('sid-math', { strict: true })).toBeNull()
    expect(await m.subjectByCode('math', { strict: true })).toBeNull()
  })
  it('אחרי שנטענה פעם אחת — המטמון משרת גם strict בלי שאילתה נוספת', async () => {
    await m.subjectById('sid-math', { strict: true })
    h.state.queries.length = 0
    h.state.error = TRANSIENT
    expect(await m.subjectById('sid-hist', { strict: true })).toMatchObject({ code: 'history' })
    expect(h.state.queries).toEqual([])
  })
})

describe('ברירת מחדל (סלחנית): שאר המערכת — כולל נתיב השחקן — נשארת ללא שינוי', () => {
  it('תקלה זמנית ← null (לא זורק), ואחרי שחלפה — נטען', async () => {
    h.state.error = TRANSIENT
    expect(await m.subjectById('sid-math')).toBeNull()
    expect(await m.questSubjectOut({ subject_id: 'sid-math' })).toEqual({ subject: null, subjectCode: null })
    h.state.error = null
    expect(await m.subjectById('sid-math')).toMatchObject({ code: 'math' })
  })
})
