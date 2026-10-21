import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Request } from 'express'
import { createFakeSupabase, seedSchool, seedStaff } from '../test-utils/fakeSupabase.js'

const h = vi.hoisted(() => ({ fake: null as unknown as ReturnType<typeof import('../test-utils/fakeSupabase.js').createFakeSupabase> }))
vi.mock('../lib/supabase.js', () => ({
  get supabaseAdmin() { return h.fake.supabaseAdmin },
  get supabaseAnon() { return h.fake.supabaseAnon },
}))
vi.mock('../lib/activeColumn.js', () => ({ hasCanShare: async () => false, hasApprovalStatus: async () => true }))

import { adminMayManageCreator, ensureOwner } from './staffAuth.js'
import { ensureQuestAccess } from '../lib/creatorAccess.js'
import { AppError } from './errors.js'

const asReq = (staff: Record<string, unknown>) => ({ staff } as unknown as Request)

describe('adminMayManageCreator — מנהל מנהל רק יוצרים מבית הספר שלו', () => {
  it('אותו בית ספר בלבד; null לעולם לא שווה ל-null', () => {
    expect(adminMayManageCreator('s1', 's1')).toBe(true)
    expect(adminMayManageCreator('s1', 's2')).toBe(false)
    expect(adminMayManageCreator(null, null)).toBe(false)
    expect(adminMayManageCreator('s1', null)).toBe(false)
    expect(adminMayManageCreator(null, 's1')).toBe(false)
    expect(adminMayManageCreator(undefined, undefined)).toBe(false)
  })
})

describe('ensureOwner / ensureQuestAccess — מנהל כבר לא עוקף בעלות על כל המערכת', () => {
  beforeEach(() => { h.fake = createFakeSupabase() })

  function setup() {
    const db = h.fake.db
    const A = seedSchool(db, 'A')
    const B = seedSchool(db, 'B')
    const victimTeacher = seedStaff(db, { role: 'teacher', schoolId: A })
    const adminSameSchool = seedStaff(db, { role: 'admin', schoolId: A })
    const adminOtherSchool = seedStaff(db, { role: 'admin', schoolId: B })
    const adminNoSchool = seedStaff(db, { role: 'admin', schoolId: null })
    const staff = (u: { userId: string }, role: string, schoolId: string | null) => asReq({ userId: u.userId, role, schoolId })
    return { victimTeacher, A, B, staff, adminSameSchool, adminOtherSchool, adminNoSchool }
  }

  it('בעלים תמיד; הדמיה ללא בעלים (ישנה) — כל צוות', async () => {
    const s = setup()
    await expect(ensureOwner(s.staff(s.victimTeacher, 'teacher', s.A), s.victimTeacher.userId)).resolves.toBeUndefined()
    await expect(ensureOwner(s.staff(s.victimTeacher, 'teacher', s.A), null)).resolves.toBeUndefined()
  })

  it('מורה אחר — 403', async () => {
    const s = setup()
    const other = seedStaff(h.fake.db, { role: 'teacher', schoolId: s.A })
    await expect(ensureOwner(s.staff(other, 'teacher', s.A), s.victimTeacher.userId)).rejects.toMatchObject({ status: 403 })
  })

  it('מנהל של אותו בית ספר רשאי לערוך הדמיה של מורה בבית ספרו', async () => {
    const s = setup()
    await expect(ensureOwner(s.staff(s.adminSameSchool, 'admin', s.A), s.victimTeacher.userId)).resolves.toBeUndefined()
    await expect(ensureQuestAccess(s.staff(s.adminSameSchool, 'admin', s.A), { created_by: s.victimTeacher.userId })).resolves.toBeUndefined()
  })

  it('מנהל של בית ספר אחר (כולל זה שנוצר בהרשמה עצמית) נחסם — היה עוקף בעלות גלובלית', async () => {
    const s = setup()
    const err = await ensureOwner(s.staff(s.adminOtherSchool, 'admin', s.B), s.victimTeacher.userId).catch((e) => e)
    expect(err).toBeInstanceOf(AppError)
    expect((err as AppError).status).toBe(403)
    await expect(ensureQuestAccess(s.staff(s.adminOtherSchool, 'admin', s.B), { created_by: s.victimTeacher.userId })).rejects.toMatchObject({ status: 403 })
  })

  it('מנהל בלי בית ספר, ומנהל ארגון — אין עקיפה', async () => {
    const s = setup()
    await expect(ensureOwner(s.staff(s.adminNoSchool, 'admin', null), s.victimTeacher.userId)).rejects.toMatchObject({ status: 403 })
    const municipal = seedStaff(h.fake.db, { role: 'municipal_admin', schoolId: s.A })
    await expect(ensureOwner(s.staff(municipal, 'municipal_admin', s.A), s.victimTeacher.userId)).rejects.toMatchObject({ status: 403 })
  })

  it('יוצר ללא שורת users (נמחק) — מנהל זר לא נכנס דרך "אין בית ספר"', async () => {
    const s = setup()
    await expect(ensureOwner(s.staff(s.adminOtherSchool, 'admin', s.B), '99999999-9999-4999-8999-999999999999')).rejects.toMatchObject({ status: 403 })
  })

  it('מבקר אנונימי: רק הדמיה שלו (anon_id)', async () => {
    const req = { anonId: 'anon-1' } as unknown as Request
    await expect(ensureQuestAccess(req, { anon_id: 'anon-1' })).resolves.toBeUndefined()
    await expect(ensureQuestAccess(req, { anon_id: 'anon-2', created_by: null })).rejects.toMatchObject({ status: 403 })
  })
})
