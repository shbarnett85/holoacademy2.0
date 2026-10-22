import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeSupabase, seedSchool, seedStaff } from '../test-utils/fakeSupabase.js'
import { startApp, call } from '../test-utils/httpHarness.js'

const h = vi.hoisted(() => ({
  fake: null as unknown as ReturnType<typeof import('../test-utils/fakeSupabase.js').createFakeSupabase>,
  flags: { approval: true, isActive: true },
}))

vi.mock('../lib/supabase.js', () => ({
  get supabaseAdmin() { return h.fake.supabaseAdmin },
  get supabaseAnon() { return h.fake.supabaseAnon },
}))
vi.mock('../lib/activeColumn.js', () => ({
  hasCanShare: async () => false,
  hasApprovalStatus: async () => h.flags.approval,
  hasIsActive: async () => h.flags.isActive,
}))
vi.mock('../middleware/rateLimit.js', () => ({
  rateLimitByIp: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  recordFailure: () => {}, isLocked: () => false, RATE_LIMIT_MESSAGE: 'rate',
}))
vi.mock('../lib/log.js', () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, logger: {} }))

import { authRouter } from './auth.js'
import { signupMail } from '../lib/staffSignup.js'

let app: Awaited<ReturnType<typeof startApp>>
const send = vi.spyOn(signupMail, 'sendConfirmation')

beforeAll(async () => { app = await startApp((a) => a.use('/api', authRouter)) })
afterAll(async () => { await app.close() })
beforeEach(() => {
  h.fake = createFakeSupabase()
  h.flags.approval = true
  h.flags.isActive = true
  send.mockReset()
  send.mockResolvedValue({ ok: true })
})

const signup = (body: Record<string, unknown>) =>
  call(app.base, 'POST', '/api/auth/staff-signup', { body: { email: 'new@test.local', password: 'secret123', name: 'New Person', ...body } })
const users = () => h.fake.db.tables.users
const authUsers = () => [...h.fake.db.authUsers.values()]

describe('הרשמת צוות — הצטרפות לבית ספר קיים', () => {
  it('מורה שמצטרף נוצר ממתין + לא פעיל + מייל לא מאושר, ונשלח מייל אימות', async () => {
    const schoolId = seedSchool(h.fake.db, 'victim-school')
    const r = await signup({ role: 'teacher', schoolId })
    expect(r.status).toBe(201)
    expect(r.json).toMatchObject({ ok: true, needsEmailVerification: true, pendingApproval: true })
    expect(users()).toHaveLength(1)
    expect(users()[0]).toMatchObject({ role: 'teacher', school_id: schoolId, is_active: false, approval_status: 'pending' })
    expect(authUsers()).toHaveLength(1)
    expect(authUsers()[0].confirmed).toBe(false) /* אף פעם לא email_confirm:true בהרשמה ציבורית */
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0]).toBe('new@test.local')
    expect(send.mock.calls[0][1]).toMatch(/\/staff\/login\?verified=1$/)
  })

  it('role=admin עם schoolId של בית ספר קיים נדחה — ולא נוצר שום דבר', async () => {
    const schoolId = seedSchool(h.fake.db, 'victim-school')
    const r = await signup({ role: 'admin', schoolId })
    expect(r.status).toBe(400)
    expect(r.json.code).toBe('ADMIN_JOIN_FORBIDDEN')
    expect(authUsers()).toHaveLength(0)
    expect(users()).toHaveLength(0)
    expect(send).not.toHaveBeenCalled()
  })

  it('בלי role בהצטרפות — מורה ממתין (ברירת מחדל בטוחה)', async () => {
    const schoolId = seedSchool(h.fake.db, 'victim-school')
    const r = await signup({ schoolId })
    expect(r.status).toBe(201)
    expect(users()[0]).toMatchObject({ role: 'teacher', approval_status: 'pending', is_active: false })
  })

  it('schoolId ו-newSchoolName יחד — 400', async () => {
    const schoolId = seedSchool(h.fake.db, 'victim-school')
    const r = await signup({ role: 'teacher', schoolId, newSchoolName: 'Other School' })
    expect(r.status).toBe(400)
    expect(authUsers()).toHaveLength(0)
  })

  it('נכשל סגור כשעמודת approval_status חסרה: 503 ולא נוצר שום חשבון פעיל', async () => {
    const schoolId = seedSchool(h.fake.db, 'victim-school')
    h.flags.approval = false
    const r = await signup({ role: 'teacher', schoolId })
    expect(r.status).toBe(503)
    expect(r.json.code).toBe('JOIN_UNAVAILABLE')
    expect(authUsers()).toHaveLength(0)
    expect(users()).toHaveLength(0)
  })

  it('בלי עמודת is_active (כמו ב-DB החי) ההצטרפות עדיין ממתינה — האכיפה על approval_status, לא על is_active', async () => {
    const schoolId = seedSchool(h.fake.db, 'victim-school')
    h.flags.isActive = false
    h.fake.db.missingColumns.add('users.is_active')
    const r = await signup({ role: 'teacher', schoolId, password: 'secret123' })
    expect(r.status).toBe(201)
    expect(users()[0]).toMatchObject({ role: 'teacher', approval_status: 'pending' })
    expect('is_active' in users()[0]).toBe(false)
    authUsers()[0].confirmed = true
    const login = await call(app.base, 'POST', '/api/auth/staff-login', { body: { email: 'new@test.local', password: 'secret123' } })
    expect(login.status).toBe(403)
    expect(login.json.code).toBe('PENDING_APPROVAL')
  })

  it('ארגון מוגבל (is_restricted_org) — 403', async () => {
    const schoolId = seedSchool(h.fake.db, 'pilot-org', { is_restricted_org: true })
    const r = await signup({ role: 'teacher', schoolId })
    expect(r.status).toBe(403)
    expect(authUsers()).toHaveLength(0)
  })

  it('בית ספר שלא קיים — 404 ולא נוצר חשבון', async () => {
    const r = await signup({ role: 'teacher', schoolId: '11111111-1111-4111-8111-111111111111' })
    expect(r.status).toBe(404)
    expect(authUsers()).toHaveLength(0)
  })
})

describe('הרשמת צוות — בית ספר חדש (נשאר פתוח)', () => {
  it('יוצר בית ספר חדש כמנהל: בית ספר + מנהל פעיל (לא ממתין), מייל לא מאושר', async () => {
    const r = await signup({ role: 'admin', newSchoolName: 'My New School' })
    expect(r.status).toBe(201)
    expect(r.json).toMatchObject({ needsEmailVerification: true, pendingApproval: false })
    expect(h.fake.db.tables.schools).toHaveLength(1)
    expect(users()[0]).toMatchObject({ role: 'admin', school_id: h.fake.db.tables.schools[0].id })
    expect(users()[0].approval_status).toBeUndefined()
    expect(users()[0].is_active).not.toBe(false)
    expect(authUsers()[0].confirmed).toBe(false)
  })

  it('מורה בודד בבית ספר חדש נשאר teacher (כמו היום) — לא הופך למנהל', async () => {
    expect((await signup({ role: 'teacher', newSchoolName: 'Solo School' })).status).toBe(201)
    expect(users()[0].role).toBe('teacher')
    expect((await call(app.base, 'POST', '/api/auth/staff-signup', { body: { email: 'b@test.local', password: 'secret123', name: 'B', newSchoolName: 'Solo Two' } })).status).toBe(201)
    expect(users()[1].role).toBe('teacher') /* בלי role — teacher */
  })

  it('יצירת בית ספר חדש לא דורשת את עמודות האישור (נשאר עובד גם לפני המיגרציה)', async () => {
    h.flags.approval = false
    h.flags.isActive = false
    expect((await signup({ role: 'teacher', newSchoolName: 'Pre Migration' })).status).toBe(201)
  })
})

describe('הרשמת צוות — כשלים ושחזור', () => {
  it('שליחת מייל נכשלה → 503 וכל מה שנוצר מתבטל (חשבון, משתמש, בית ספר חדש)', async () => {
    send.mockResolvedValue({ ok: false, error: 'smtp down' })
    const r = await signup({ role: 'admin', newSchoolName: 'Rolled Back School' })
    expect(r.status).toBe(503)
    expect(r.json.code).toBe('EMAIL_SEND_FAILED')
    expect(authUsers()).toHaveLength(0)
    expect(users()).toHaveLength(0)
    expect(h.fake.db.tables.schools).toHaveLength(0)
  })

  it('כשל בהוספת הרשומה ל-users מוחק את חשבון ה-Auth', async () => {
    const schoolId = seedSchool(h.fake.db, 'victim-school')
    h.fake.db.missingColumns.add('users.approval_status') /* ההוספה תיכשל אחרי שהחשבון כבר נוצר */
    const r = await signup({ role: 'teacher', schoolId })
    expect(r.status).toBe(500)
    expect(authUsers()).toHaveLength(0)
  })

  it('אימייל קיים → 409 EMAIL_EXISTS, בלי שורות חדשות', async () => {
    const schoolId = seedSchool(h.fake.db, 'victim-school')
    await signup({ role: 'teacher', schoolId })
    const r = await signup({ role: 'teacher', schoolId })
    expect(r.status).toBe(409)
    expect(r.json.code).toBe('EMAIL_EXISTS')
    expect(authUsers()).toHaveLength(1)
    expect(users()).toHaveLength(1)
  })

  it('resend-confirmation: תמיד 200 (גם כשהשליחה נכשלת) כדי לא להדליף אילו כתובות רשומות', async () => {
    send.mockRejectedValue(new Error('boom'))
    const r = await call(app.base, 'POST', '/api/auth/resend-confirmation', { body: { email: 'who@test.local' } })
    expect(r.status).toBe(200)
    expect((await call(app.base, 'POST', '/api/auth/resend-confirmation', { body: { email: 'not-an-email' } })).status).toBe(400)
  })
})

describe('staff-login — אימות מייל ואישור הצטרפות', () => {
  it('מייל לא מאושר → 403 EMAIL_NOT_CONFIRMED בלי session', async () => {
    const schoolId = seedSchool(h.fake.db, 'victim-school')
    await signup({ role: 'teacher', schoolId, password: 'secret123' })
    const r = await call(app.base, 'POST', '/api/auth/staff-login', { body: { email: 'new@test.local', password: 'secret123' } })
    expect(r.status).toBe(403)
    expect(r.json.code).toBe('EMAIL_NOT_CONFIRMED')
    expect(r.json.session).toBeUndefined()
  })

  it('מייל מאושר אך הבקשה ממתינה → 403 PENDING_APPROVAL ואין session', async () => {
    const schoolId = seedSchool(h.fake.db, 'victim-school')
    await signup({ role: 'teacher', schoolId, password: 'secret123' })
    authUsers()[0].confirmed = true /* "לחץ על הקישור" */
    const r = await call(app.base, 'POST', '/api/auth/staff-login', { body: { email: 'new@test.local', password: 'secret123' } })
    expect(r.status).toBe(403)
    expect(r.json.code).toBe('PENDING_APPROVAL')
    expect(r.json.session).toBeUndefined()
    expect(JSON.stringify(r.json)).not.toContain('tok:')
  })

  it('אחרי אישור המנהל (approval_status נמחק + is_active) ההתחברות מצליחה כ-teacher', async () => {
    const schoolId = seedSchool(h.fake.db, 'victim-school')
    await signup({ role: 'teacher', schoolId, password: 'secret123' })
    authUsers()[0].confirmed = true
    Object.assign(users()[0], { approval_status: null, is_active: true })
    const r = await call(app.base, 'POST', '/api/auth/staff-login', { body: { email: 'new@test.local', password: 'secret123' } })
    expect(r.status).toBe(200)
    expect((r.json.staff as { role: string }).role).toBe('teacher')
  })

  it('סיסמה שגויה → 401; משתמש רגיל קיים (מאושר מראש) ממשיך להתחבר', async () => {
    const t = seedStaff(h.fake.db, { role: 'teacher', schoolId: seedSchool(h.fake.db, 'old'), email: 'old@test.local' })
    const pw = h.fake.db.authUsers.get(t.authId)!.password
    expect((await call(app.base, 'POST', '/api/auth/staff-login', { body: { email: 'old@test.local', password: 'wrong' } })).status).toBe(401)
    expect((await call(app.base, 'POST', '/api/auth/staff-login', { body: { email: 'old@test.local', password: pw } })).status).toBe(200)
  })
})
