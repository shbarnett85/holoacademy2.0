/* רוסטר הניהול ומסכי האנליטיקה: GET /api/staff/students ו-/classes מחזירים v2Linked (+ הסיבה כשאין) כדי שהלקוח לא ינווט לעמוד שמחזיר 404.
   ארגון הדגמה מקבל שורות DB פיקטיביות שהאנליטיקה (ספק ההדגמה בזיכרון) לא מכירה; מורה אמיתי — כן; מורה אורח — הרוסטר שלו מעולם ההדגמה.
   אין DB: האימות, ה-authz ו-Supabase מוחלפים ב-mocks. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import express from 'express'

type Row = Record<string, unknown>
const h = vi.hoisted(() => {
  const db: Record<string, Row[]> = {}
  const users = new Map<string, { staff: Record<string, unknown>; authz: Record<string, unknown>; v2: unknown }>()
  const flags = { viewerFails: false }

  class Q {
    private filters: ((r: Row) => boolean)[] = []
    private cols = ''
    constructor(private t: string) {}
    select(c = '*') { this.cols = c; return this }
    eq(k: string, v: unknown) { this.filters.push((r) => r[k] === v); return this }
    in(k: string, a: unknown[]) { this.filters.push((r) => a.includes(r[k])); return this }
    order() { return this }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    then(ok?: any, bad?: any) {
      let rows = (db[this.t] ?? []).filter((r) => this.filters.every((f) => f(r)))
      if (this.t === 'class_members' && /users\(/.test(this.cols)) {
        rows = rows.map((r) => ({ ...r, users: (db.users ?? []).find((u) => u.id === r.user_id) ?? null }))
      }
      return Promise.resolve({ data: rows, error: null }).then(ok, bad)
    }
  }
  return { db, users, flags, client: { from: (t: string) => new Q(t) } }
})

vi.mock('../lib/supabase.js', () => ({ supabaseAdmin: h.client, supabaseAnon: {} }))
vi.mock('../lib/activeColumn.js', async (orig) => {
  const m = await orig<Record<string, unknown>>()
  return Object.fromEntries(Object.entries(m).map(([k, v]) => (typeof v === 'function' && k.startsWith('has') ? [k, vi.fn(async () => false)] : [k, v])))
})
vi.mock('../middleware/staffAuth.js', async () => {
  const { AppError } = await import('../middleware/errors.js')
  return {
    requireStaff: (req: { headers: Record<string, string | undefined>; staff?: unknown }, _res: unknown, next: (e?: unknown) => void) => {
      const u = h.users.get(req.headers['x-user'] ?? '')
      if (!u) return next(new AppError(401, 'נדרשת התחברות צוות'))
      req.staff = u.staff
      next()
    },
    isDemoGuest: (req: { staff?: { isGuest?: boolean } }) => req.staff?.isGuest === true && process.env.DEMO_ANALYTICS !== '0',
    isOrgAdminRole: (role: string | undefined) => role === 'admin' || role === 'municipal_admin' || role === 'super_admin',
  }
})
vi.mock('../lib/authz.js', async (orig) => {
  const m = await orig<typeof import('../lib/authz.js')>()
  const { AppError } = await import('../middleware/errors.js')
  return {
    ...m,
    loadViewer: vi.fn(async (req: { staff: { userId: string } }) => {
      if (h.flags.viewerFails) throw new AppError(503, 'down')
      return h.users.get(req.staff.userId)!.authz
    }),
  }
})
vi.mock('../lib/analyticsV2/liveViewer.js', async (orig) => ({
  ...(await orig<typeof import('../lib/analyticsV2/liveViewer.js')>()),
  toV2Viewer: vi.fn(async (base: { userId: string }) => h.users.get(base.userId)!.v2),
}))

import { errorHandler } from '../middleware/errors.js'
import { staffRouter } from './staff.js'

const LIVE_V2 = { guest: false, source: 'live', lens: 'homeroom', homeroomClassId: 'c-live', teachingClassIds: [], subjectCodes: [], classGrants: [] }
const ADMIN_V2 = { guest: false, source: 'live', lens: 'admin', homeroomClassId: null, teachingClassIds: [], subjectCodes: [] }
const addUser = (id: string, role: string, v2: unknown, extra: { isGuest?: boolean; seesSynthetic?: boolean } = {}): void => {
  h.users.set(id, {
    staff: { userId: id, role, schoolId: 'sch-1', isGuest: extra.isGuest ?? false, canShare: true },
    authz: { userId: id, role, schoolId: 'sch-1', grants: new Map(), seesSynthetic: extra.seesSynthetic ?? false },
    v2,
  })
}
addUser('u-live', 'teacher', LIVE_V2)
addUser('u-demo-org', 'teacher', null, { seesSynthetic: true })
addUser('u-admin', 'admin', ADMIN_V2)
addUser('u-super', 'super_admin', null)
addUser('u-guest', 'teacher', null, { isGuest: true })

let server: Server
let base = ''
beforeAll(async () => {
  const app = express()
  app.use('/api/staff', staffRouter)
  app.use(errorHandler)
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()) })
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/staff`
})
afterAll(async () => { await new Promise((r) => server.close(r)) })

const klass = (id: string, teacher: string, over: Row = {}): Row => ({ id, name: id, slug: id, url_code: `u-${id}`, school_id: 'sch-1', teacher_id: teacher, grade_label: null, ...over })
beforeEach(() => {
  delete process.env.ANALYTICS_V2
  delete process.env.ANALYTICS_V2_LIVE
  delete process.env.DEMO_ANALYTICS
  h.flags.viewerFails = false
  h.db.classes = [klass('c-live', 'u-live'), klass('c-demo', 'u-demo-org', { is_fictitious: true }), klass('c-adm', 'u-admin')]
  h.db.users = [
    { id: 's-live', name: 'תלמיד אמיתי', role: 'student', pin: '1234' },
    { id: 's-demo', name: 'תלמיד דמו', role: 'student', pin: '4321', is_fictitious: true },
    { id: 's-adm', name: 'תלמיד אחר', role: 'student', pin: '5555' },
    { id: 'u-live', name: 'מורה', role: 'teacher' }, { id: 'u-demo-org', name: 'מורה דמו', role: 'teacher' }, { id: 'u-admin', name: 'מנהל', role: 'admin' },
  ]
  h.db.class_members = [{ class_id: 'c-live', user_id: 's-live' }, { class_id: 'c-demo', user_id: 's-demo' }, { class_id: 'c-adm', user_id: 's-adm' }]
  h.db.sessions = []
})

async function get(path: string, user: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(base + path, { headers: { 'x-user': user } })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}
const LINKED = { v2Linked: true, v2UnlinkedReason: null }
const link = (b: Record<string, unknown>): Record<string, unknown> => ({ v2Linked: b.v2Linked, v2UnlinkedReason: b.v2UnlinkedReason })

describe('GET /api/staff/students — v2Linked', () => {
  it('מורה אמיתי: יש מסך תלמיד/ה לכל התלמידים בכיתותיו', async () => {
    const r = await get('/students', 'u-live')
    expect(r.status).toBe(200)
    expect(link(r.body)).toEqual(LINKED)
    expect((r.body.students as { id: string }[]).map((s) => s.id)).toEqual(['s-live'])
  })

  it('ארגון הדגמה: תלמידי ה-DB הפיקטיביים אינם בעולם ההדגמה של האנליטיקה — v2Linked=false, הסיבה demo_org, והרשימה עצמה נשארת', async () => {
    const r = await get('/students', 'u-demo-org')
    expect(r.status).toBe(200)
    expect(link(r.body)).toEqual({ v2Linked: false, v2UnlinkedReason: 'demo_org' })
    expect((r.body.students as { id: string; secret: string | null }[]).map((s) => [s.id, s.secret])).toEqual([['s-demo', '4321']])
  })

  it('מורה אורח: הרוסטר מעולם ההדגמה עצמו — v2Linked=true (חוויית האורח כפי שהייתה), והשדות הקודמים לא השתנו', async () => {
    const r = await get('/students', 'u-guest')
    expect(r.status).toBe(200)
    expect(link(r.body)).toEqual(LINKED)
    const students = r.body.students as { id: string; classId: string; name: string }[]
    expect(students.length).toBeGreaterThan(5)
    expect(students[0].id).toMatch(/^s-v2-/)
    expect(Object.keys(r.body).sort()).toEqual(['students', 'v2Linked', 'v2UnlinkedReason'])
  })

  it('מנהל (אגרגטים בלבד) ומנהל-על: אין מסך תלמיד/ה — unavailable', async () => {
    expect(link((await get('/students', 'u-admin')).body)).toEqual({ v2Linked: false, v2UnlinkedReason: 'unavailable' })
    expect(link((await get('/students', 'u-super')).body)).toEqual({ v2Linked: false, v2UnlinkedReason: 'unavailable' })
  })

  it('מתגי כיבוי: ANALYTICS_V2_LIVE=0 (מורה אמיתי) ו-ANALYTICS_V2=0 (גם אורח) — אין מסך, לא מנווטים', async () => {
    process.env.ANALYTICS_V2_LIVE = '0'
    expect(link((await get('/students', 'u-live')).body)).toEqual({ v2Linked: false, v2UnlinkedReason: 'unavailable' })
    expect(link((await get('/students', 'u-guest')).body)).toEqual(LINKED)
    delete process.env.ANALYTICS_V2_LIVE
    process.env.ANALYTICS_V2 = '0'
    expect(link((await get('/students', 'u-guest')).body)).toEqual({ v2Linked: false, v2UnlinkedReason: 'unavailable' })
  })

  it('כשל בבירור הצופה לא מפיל את הרוסטר: 200, הרשימה מלאה, והקישורים מוסתרים', async () => {
    h.flags.viewerFails = true
    const r = await get('/students', 'u-live')
    expect(r.status).toBe(200)
    expect(link(r.body)).toEqual({ v2Linked: false, v2UnlinkedReason: 'unavailable' })
    expect((r.body.students as unknown[]).length).toBe(1)
  })

  it('מורה בלי כיתות: רשימה ריקה, והדגל עדיין מוחזר', async () => {
    h.db.classes = []
    const r = await get('/students', 'u-live')
    expect(r.body.students).toEqual([])
    expect(link(r.body)).toEqual(LINKED)
  })
})

describe('GET /api/staff/classes — v2Linked בכל שורת כיתה', () => {
  it('מורה אמיתי: true; ארגון הדגמה: false עם הסיבה; אורח: true', async () => {
    const live = (await get('/classes', 'u-live')).body.classes as Record<string, unknown>[]
    expect(live.map((c) => [c.id, c.v2Linked, c.v2UnlinkedReason])).toEqual([['c-live', true, null]])
    const demo = (await get('/classes', 'u-demo-org')).body.classes as Record<string, unknown>[]
    expect(demo.map((c) => [c.id, c.v2Linked, c.v2UnlinkedReason])).toEqual([['c-demo', false, 'demo_org']])
    const guest = (await get('/classes', 'u-guest')).body.classes as Record<string, unknown>[]
    expect(guest.length).toBe(1)
    expect([guest[0].v2Linked, guest[0].v2UnlinkedReason]).toEqual([true, null])
  })

  it('השדות הקיימים של הכיתה נשמרים (תוספת בלבד)', async () => {
    const [c] = (await get('/classes', 'u-live')).body.classes as Record<string, unknown>[]
    for (const k of ['id', 'name', 'slug', 'url_code', 'gradeLabel', 'teachers', 'studentCount', 'is_active', 'is_fictitious']) expect(c).toHaveProperty(k)
    expect(c.studentCount).toBe(1)
  })
})
