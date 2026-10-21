/* FX1b (R5#5): loadViewer נכשל סגור על תקלה חולפת — צופה שנבנה בתקלה (grants חסרים / "אין כיתות") אינו מוחזר ואינו נכנס למטמון הצופה.
   "הטבלה / העמודה חסרה" (קוד סכמה, לפני מיגרציה) נשארת מסלול ההתנהגות הקיים. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Request } from 'express'

type Res = { data: unknown; error: { code?: string; message: string } | null }
const h = vi.hoisted(() => {
  const ok = (data: unknown): Res => ({ data, error: null })
  const state = { class_teachers: ok([]) as Res, classes: ok([]) as Res, schools: ok(null) as Res, queries: [] as string[] }
  const client = {
    from: (table: 'class_teachers' | 'classes' | 'schools') => {
      const b: Record<string, unknown> = {}
      const result = (): Promise<Res> => { state.queries.push(table); return Promise.resolve(state[table]) }
      b.select = () => b
      b.eq = () => b
      b.maybeSingle = result
      b.then = (resolve: (v: Res) => unknown, reject: (e: unknown) => unknown) => result().then(resolve, reject)
      return b
    },
  }
  return { state, client, ok }
})
vi.mock('./supabase.js', () => ({ supabaseAdmin: h.client, supabaseAnon: {} }))
vi.mock('./log.js', () => ({ warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() }))

import { ViewerMemo } from './analyticsV2/liveViewer.js'
import { loadViewer } from './authz.js'

const req = (over: Record<string, unknown> = {}): Request => ({ staff: { userId: 'u1', role: 'teacher', schoolId: 's1', ...over } } as unknown as Request)
const TRANSIENT = { message: 'TypeError: fetch failed' }
const MISSING_TABLE = { code: '42P01', message: 'relation "class_teachers" does not exist' }
const MISSING_COLUMN = { code: '42703', message: 'column schools.demo_data_enabled does not exist' }

beforeEach(() => {
  h.state.class_teachers = h.ok([
    { class_id: 'A', is_homeroom: true, subject_id: null },
    { class_id: 'B', is_homeroom: false, subject_id: 'sub-math' },
  ])
  h.state.classes = h.ok([{ id: 'LEGACY' }])
  h.state.schools = h.ok({ demo_data_enabled: false })
  h.state.queries.length = 0
})

describe('loadViewer: מסלול תקין', () => {
  it('מחנך בכיתה אחת + מקצוע בשנייה: grants מ-class_teachers', async () => {
    const v = await loadViewer(req())
    expect([...v.grants.keys()]).toEqual(['A', 'B'])
    expect(v.grants.get('A')).toMatchObject({ homeroom: true })
    expect([...v.grants.get('B')!.subjectIds]).toEqual(['sub-math'])
    expect(v.seesSynthetic).toBe(false)
  })
  it('ארגון הדגמה: seesSynthetic=true', async () => {
    h.state.schools = h.ok({ demo_data_enabled: true })
    expect((await loadViewer(req())).seesSynthetic).toBe(true)
  })
})

describe('loadViewer: כשל חולף ← 503, לא "אין הרשאות"', () => {
  it('regression (R5#5): תקלה זמנית בשאילתת class_teachers — הבקשה נכשלת (503), ואינה מחזירה צופה בלי כיתות', async () => {
    h.state.class_teachers = { data: null, error: TRANSIENT }
    await expect(loadViewer(req())).rejects.toMatchObject({ status: 503 })
    /* ובפרט לא נופלים למסלול הישן (classes.teacher_id) כאילו הטבלה חסרה */
    expect(h.state.queries).not.toContain('classes')
  })
  it('ובחזרה לתקינות — מקבלים את כל ה-grants (הכשל לא השאיר זכר)', async () => {
    h.state.class_teachers = { data: null, error: TRANSIENT }
    await expect(loadViewer(req())).rejects.toBeTruthy()
    h.state.class_teachers = h.ok([{ class_id: 'A', is_homeroom: true }, { class_id: 'B', is_homeroom: false, subject_id: 'sub-math' }])
    expect([...(await loadViewer(req())).grants.keys()]).toEqual(['A', 'B'])
  })
  it('תקלה זמנית בקריאת בית הספר (seesSynthetic) — 503; לא "ארגון רגיל"', async () => {
    h.state.schools = { data: null, error: TRANSIENT }
    await expect(loadViewer(req())).rejects.toMatchObject({ status: 503 })
  })
  it('מסלול ישן: תקלה זמנית גם בשאילתת classes.teacher_id — 503', async () => {
    h.state.class_teachers = { data: null, error: MISSING_TABLE }
    h.state.classes = { data: null, error: TRANSIENT }
    await expect(loadViewer(req())).rejects.toMatchObject({ status: 503 })
  })
})

describe('loadViewer: סכמה חסרה (לפני מיגרציה) — ההתנהגות הקיימת', () => {
  it('טבלת class_teachers חסרה: מורה הכיתה = מחנך (classes.teacher_id)', async () => {
    h.state.class_teachers = { data: null, error: MISSING_TABLE }
    const v = await loadViewer(req())
    expect([...v.grants.keys()]).toEqual(['LEGACY'])
    expect(v.grants.get('LEGACY')).toMatchObject({ homeroom: true, unspecified: false })
  })
  it('עמודת demo_data_enabled חסרה: לא ארגון הדגמה, בלי כשל', async () => {
    h.state.schools = { data: null, error: MISSING_COLUMN }
    expect((await loadViewer(req())).seesSynthetic).toBe(false)
  })
  it('מנהל: אין שאילתת grants בכלל', async () => {
    const v = await loadViewer(req({ role: 'admin' }))
    expect(v.grants.size).toBe(0)
    expect(h.state.queries).not.toContain('class_teachers')
  })
})

describe('מטמון הצופה (ViewerMemo) + loadViewer: תקלה חולפת לא נשמרת', () => {
  it('הבקשה הראשונה נכשלת; השנייה (אחרי שהתקלה חלפה) מקבלת צופה מלא ולא "אין כיתות" מהמטמון', async () => {
    let t = 1_000
    const memo = new ViewerMemo<Awaited<ReturnType<typeof loadViewer>>>({ ttlMs: () => 20_000, maxEntries: 10, now: () => t })
    const key = 'u1|teacher|s1'
    h.state.class_teachers = { data: null, error: TRANSIENT }
    await expect(memo.get(key, () => loadViewer(req()))).rejects.toMatchObject({ status: 503 })
    expect(memo.size).toBe(0)
    h.state.class_teachers = h.ok([{ class_id: 'A', is_homeroom: true }, { class_id: 'B', is_homeroom: false, subject_id: 'sub-math' }])
    t += 100
    const second = await memo.get(key, () => loadViewer(req()))
    expect([...second.grants.keys()]).toEqual(['A', 'B'])
    /* ועכשיו הוא כן נשמר */
    h.state.queries.length = 0
    await memo.get(key, () => loadViewer(req()))
    expect(h.state.queries).toEqual([])
  })
})
