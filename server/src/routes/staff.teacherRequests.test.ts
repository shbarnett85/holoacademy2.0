import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createFakeSupabase, seedSchool, seedStaff } from '../test-utils/fakeSupabase.js'
import { startApp, call } from '../test-utils/httpHarness.js'

const h = vi.hoisted(() => ({ fake: null as unknown as ReturnType<typeof import('../test-utils/fakeSupabase.js').createFakeSupabase>, noIsActive: false }))

vi.mock('../lib/supabase.js', () => ({
  get supabaseAdmin() { return h.fake.supabaseAdmin },
  get supabaseAnon() { return h.fake.supabaseAnon },
}))
/* hasIsActive נשמרת ב-cache חיובי-בלבד במודול האמיתי; כאן שולטים בה כדי לדמות DB בלי העמודה */
vi.mock('../lib/activeColumn.js', async (orig) => ({ ...(await orig<typeof import('../lib/activeColumn.js')>()), hasIsActive: async () => !h.noIsActive }))
vi.mock('../lib/log.js', () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, logger: {} }))

import { staffRouter } from './staff.js'

let app: Awaited<ReturnType<typeof startApp>>
beforeAll(async () => { app = await startApp((a) => a.use('/api/staff', staffRouter)) })
afterAll(async () => { await app.close() })

/* עולם קטן: שני בתי ספר (נפגע A, תוקף B), מנהל לכל אחד, מנהל-על, מורה פעיל ב-A, ובקשות הצטרפות ל-A ול-B */
function world() {
  h.noIsActive = false
  h.fake = createFakeSupabase()
  const db = h.fake.db
  const A = seedSchool(db, 'school-A')
  const B = seedSchool(db, 'school-B')
  const adminA = seedStaff(db, { role: 'admin', schoolId: A, name: 'adminA' })
  const adminB = seedStaff(db, { role: 'admin', schoolId: B, name: 'adminB' })
  const superAdmin = seedStaff(db, { role: 'super_admin', schoolId: null, name: 'super' })
  const teacherA = seedStaff(db, { role: 'teacher', schoolId: A, name: 'teacherA' })
  const pending = (schoolId: string, name: string, confirmed = true) =>
    seedStaff(db, { role: 'teacher', schoolId, name, confirmed, extra: { is_active: false, approval_status: 'pending' } })
  return { db, A, B, adminA, adminB, superAdmin, teacherA, pendingA: pending(A, 'pendingA'), pendingB: pending(B, 'pendingB'), pending }
}
const row = (db: ReturnType<typeof world>['db'], userId: string) => db.tables.users.find((u) => u.id === userId)

describe('GET /teacher-requests', () => {
  it('מנהל רואה רק בקשות של בית הספר שלו, כולל אימייל וסטטוס אימות', async () => {
    const w = world()
    const r = await call(app.base, 'GET', '/api/staff/teacher-requests', { token: w.adminA.token })
    expect(r.status).toBe(200)
    const reqs = r.json.requests as { id: string; email: string; emailVerified: boolean; schoolName: string }[]
    expect(reqs.map((x) => x.id)).toEqual([w.pendingA.userId])
    expect(reqs[0]).toMatchObject({ email: w.pendingA.email, emailVerified: true, schoolName: 'school-A' })
  })

  it('מנהל-על רואה את כל הבקשות; מורה ובלי טוקן — נחסמים', async () => {
    const w = world()
    const all = await call(app.base, 'GET', '/api/staff/teacher-requests', { token: w.superAdmin.token })
    expect((all.json.requests as { id: string }[]).map((x) => x.id).sort()).toEqual([w.pendingA.userId, w.pendingB.userId].sort())
    expect((await call(app.base, 'GET', '/api/staff/teacher-requests', { token: w.teacherA.token })).status).toBe(403)
    expect((await call(app.base, 'GET', '/api/staff/teacher-requests')).status).toBe(401)
  })

  it('בקשות ממתינות לא מופיעות ברשימת המורים הרגילה', async () => {
    const w = world()
    const r = await call(app.base, 'GET', '/api/staff/teachers', { token: w.adminA.token })
    expect((r.json.teachers as { id: string }[]).map((t) => t.id)).toEqual([w.teacherA.userId])
  })
})

describe('POST /teacher-requests/:id/approve|reject', () => {
  it('מנהל אותו בית ספר מאשר: approval_status נמחק והמורה פעיל', async () => {
    const w = world()
    const r = await call(app.base, 'POST', `/api/staff/teacher-requests/${w.pendingA.userId}/approve`, { token: w.adminA.token })
    expect(r.status).toBe(200)
    expect(row(w.db, w.pendingA.userId)).toMatchObject({ approval_status: null, is_active: true, role: 'teacher' })
  })

  it('לא מאשרים בקשה שהמייל שלה טרם אומת (409) — ונשארת ממתינה', async () => {
    const w = world()
    const unverified = w.pending(w.A, 'unverified', false)
    const r = await call(app.base, 'POST', `/api/staff/teacher-requests/${unverified.userId}/approve`, { token: w.adminA.token })
    expect(r.status).toBe(409)
    expect(row(w.db, unverified.userId)).toMatchObject({ approval_status: 'pending', is_active: false })
  })

  it('מנהל של בית ספר אחר לא יכול לאשר ולא לדחות (404, בלי לחשוף) — הבקשה נשארת', async () => {
    const w = world()
    expect((await call(app.base, 'POST', `/api/staff/teacher-requests/${w.pendingA.userId}/approve`, { token: w.adminB.token })).status).toBe(404)
    expect((await call(app.base, 'POST', `/api/staff/teacher-requests/${w.pendingA.userId}/reject`, { token: w.adminB.token })).status).toBe(404)
    expect(row(w.db, w.pendingA.userId)).toMatchObject({ approval_status: 'pending', is_active: false })
    expect(w.db.authUsers.has(w.pendingA.authId)).toBe(true)
  })

  it('מורה רגיל לא יכול לאשר (403), גם לא את עצמו', async () => {
    const w = world()
    expect((await call(app.base, 'POST', `/api/staff/teacher-requests/${w.pendingA.userId}/approve`, { token: w.teacherA.token })).status).toBe(403)
  })

  it('מנהל-על מאשר בקשה של כל בית ספר', async () => {
    const w = world()
    expect((await call(app.base, 'POST', `/api/staff/teacher-requests/${w.pendingB.userId}/approve`, { token: w.superAdmin.token })).status).toBe(200)
    expect(row(w.db, w.pendingB.userId)).toMatchObject({ approval_status: null, is_active: true })
  })

  it('דחייה מוחקת את השורה ואת חשבון ה-Auth (הכתובת מתפנה)', async () => {
    const w = world()
    const r = await call(app.base, 'POST', `/api/staff/teacher-requests/${w.pendingA.userId}/reject`, { token: w.adminA.token })
    expect(r.status).toBe(200)
    expect(row(w.db, w.pendingA.userId)).toBeUndefined()
    expect(w.db.authUsers.has(w.pendingA.authId)).toBe(false)
  })

  it('אפשר לדחות/לאשר רק בקשה ממתינה — מורה פעיל לא נמחק ולא "מאושר" שוב', async () => {
    const w = world()
    expect((await call(app.base, 'POST', `/api/staff/teacher-requests/${w.teacherA.userId}/reject`, { token: w.adminA.token })).status).toBe(404)
    expect((await call(app.base, 'POST', `/api/staff/teacher-requests/${w.teacherA.userId}/approve`, { token: w.adminA.token })).status).toBe(404)
    expect(row(w.db, w.teacherA.userId)).toBeDefined()
    expect(w.db.authUsers.has(w.teacherA.authId)).toBe(true)
  })
})

describe('עקיפות אפשריות של האישור', () => {
  it('"הפעלה" רגילה של בקשה ממתינה נדחית (409) — גם ממנהל אותו בית ספר', async () => {
    const w = world()
    const r = await call(app.base, 'POST', `/api/staff/teachers/${w.pendingA.userId}/reactivate`, { token: w.adminA.token })
    expect(r.status).toBe(409)
    expect(row(w.db, w.pendingA.userId)).toMatchObject({ approval_status: 'pending', is_active: false })
  })

  it('מנהל של בית ספר אחר לא יכול להפעיל/להשבית מורים זרים (403) — היה IDOR חוצה-ארגונים', async () => {
    const w = world()
    expect((await call(app.base, 'POST', `/api/staff/teachers/${w.pendingA.userId}/reactivate`, { token: w.adminB.token })).status).toBe(403)
    expect((await call(app.base, 'POST', `/api/staff/teachers/${w.teacherA.userId}/deactivate`, { token: w.adminB.token })).status).toBe(403)
    expect(row(w.db, w.teacherA.userId)?.is_active).toBe(true)
    expect(row(w.db, w.pendingA.userId)).toMatchObject({ approval_status: 'pending', is_active: false })
    /* ואילו המנהל של אותו בית ספר רשאי */
    expect((await call(app.base, 'POST', `/api/staff/teachers/${w.teacherA.userId}/deactivate`, { token: w.adminA.token })).status).toBe(200)
    expect(row(w.db, w.teacherA.userId)?.is_active).toBe(false)
  })

  it('JWT תקף של בקשה ממתינה לא פותח שום נתיב צוות — גם אם is_active הוחזר ל-true בטעות', async () => {
    const w = world()
    expect((await call(app.base, 'GET', '/api/staff/classes', { token: w.pendingA.token })).status).toBe(403)
    row(w.db, w.pendingA.userId)!.is_active = true
    const r = await call(app.base, 'GET', '/api/staff/classes', { token: w.pendingA.token })
    expect(r.status).toBe(403)
    expect(String(r.json.error)).toContain('אישור')
  })

  it('בלי עמודת is_active בכלל (כמו ב-DB החי) בקשה ממתינה עדיין חסומה לגמרי', async () => {
    const w = world()
    delete row(w.db, w.pendingA.userId)!.is_active
    w.db.missingColumns.add('users.is_active')
    h.noIsActive = true
    expect((await call(app.base, 'GET', '/api/staff/classes', { token: w.pendingA.token })).status).toBe(403)
    /* והאישור עובד בלי לכתוב לעמודה שאינה קיימת */
    expect((await call(app.base, 'POST', `/api/staff/teacher-requests/${w.pendingA.userId}/approve`, { token: w.adminA.token })).status).toBe(200)
    expect(row(w.db, w.pendingA.userId)?.approval_status).toBeNull()
    expect((await call(app.base, 'GET', '/api/staff/classes', { token: w.pendingA.token })).status).toBe(200)
  })

  it('אחרי אישור — אותו טוקן עובד (מורה מאושר רואה רק את כיתותיו: אין)', async () => {
    const w = world()
    await call(app.base, 'POST', `/api/staff/teacher-requests/${w.pendingA.userId}/approve`, { token: w.adminA.token })
    const r = await call(app.base, 'GET', '/api/staff/classes', { token: w.pendingA.token })
    expect(r.status).toBe(200)
    expect(r.json.classes).toEqual([])
  })
})
