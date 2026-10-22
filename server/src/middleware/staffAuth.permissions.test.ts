import { describe, it, expect, vi } from 'vitest'

/* supabase נטען ע"י staffAuth — מדמים כדי שהבדיקה תהיה טהורה (בלי רשת/.env) */
vi.mock('../lib/supabase.js', () => ({ supabaseAdmin: {}, supabaseAnon: {} }))
vi.mock('../lib/activeColumn.js', () => ({ hasCanShare: async () => true, hasApprovalStatus: async () => true }))

import { requireCanShare, isOrgAdminRole, SHARING_DISABLED_MESSAGE } from './staffAuth.js'
import { AppError } from './errors.js'
import type { Request, Response } from 'express'

function run(staff: Partial<NonNullable<Request['staff']>> | undefined) {
  const req = { staff } as Request
  let err: unknown
  requireCanShare(req, {} as Response, (e?: unknown) => { err = e })
  return err
}

describe('requireCanShare — שער ההרשאה לשיתוף', () => {
  it('מורה עם can_share=false נחסם ב-403 עם code=SHARING_DISABLED', () => {
    const err = run({ canShare: false }) as AppError
    expect(err).toBeInstanceOf(AppError)
    expect(err.status).toBe(403)
    expect(err.code).toBe('SHARING_DISABLED')
    expect(err.message).toBe(SHARING_DISABLED_MESSAGE)
  })
  it('מורה רגיל (can_share=true) עובר', () => {
    expect(run({ canShare: true })).toBeUndefined()
  })
  it('בלי הקשר צוות → 401', () => {
    expect((run(undefined) as AppError).status).toBe(401)
  })
})

describe('isOrgAdminRole', () => {
  it('מנהל עירוני נחשב סמכות-ארגון; מורה ותלמיד לא', () => {
    expect(isOrgAdminRole('municipal_admin')).toBe(true)
    expect(isOrgAdminRole('admin')).toBe(true)
    expect(isOrgAdminRole('super_admin')).toBe(true)
    expect(isOrgAdminRole('teacher')).toBe(false)
    expect(isOrgAdminRole('student')).toBe(false)
    expect(isOrgAdminRole(undefined)).toBe(false)
  })
})
