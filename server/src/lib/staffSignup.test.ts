import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase.js', () => ({ supabaseAdmin: {}, supabaseAnon: {} }))

import { canManageJoinRequest, confirmationRedirect, planSignup } from './staffSignup.js'
import { AppError } from '../middleware/errors.js'

describe('planSignup — מה מותר בהרשמה עצמית', () => {
  it('בית ספר חדש: teacher (ברירת מחדל) או admin — היוצר הבעלים של בית הספר החדש בלבד', () => {
    expect(planSignup({ newSchoolName: 'x' })).toEqual({ kind: 'new_school', role: 'teacher' })
    expect(planSignup({ role: 'teacher', newSchoolName: 'x' })).toEqual({ kind: 'new_school', role: 'teacher' })
    expect(planSignup({ role: 'admin', newSchoolName: 'x' })).toEqual({ kind: 'new_school', role: 'admin' })
  })

  it('בית ספר קיים: תמיד מורה ממתין; admin נדחה עם קוד ייעודי', () => {
    expect(planSignup({ schoolId: 's1' })).toEqual({ kind: 'join', role: 'teacher', schoolId: 's1' })
    expect(planSignup({ role: 'teacher', schoolId: 's1' })).toEqual({ kind: 'join', role: 'teacher', schoolId: 's1' })
    const err = (() => { try { planSignup({ role: 'admin', schoolId: 's1' }) } catch (e) { return e as AppError } })()
    expect(err).toBeInstanceOf(AppError)
    expect(err!.status).toBe(400)
    expect(err!.code).toBe('ADMIN_JOIN_FORBIDDEN')
  })

  it('חייבים בדיוק אחד מ-schoolId / newSchoolName', () => {
    expect(() => planSignup({})).toThrow(AppError)
    expect(() => planSignup({ schoolId: 's1', newSchoolName: 'x' })).toThrow(AppError)
  })
})

describe('canManageJoinRequest — מי מאשר/דוחה בקשות הצטרפות', () => {
  it('מנהל-על — לכל בית ספר', () => {
    expect(canManageJoinRequest({ role: 'super_admin', schoolId: null }, 's1')).toBe(true)
    expect(canManageJoinRequest({ role: 'super_admin', schoolId: null }, null)).toBe(true)
  })
  it('מנהל ומנהל ארגון — רק בית הספר שלהם', () => {
    expect(canManageJoinRequest({ role: 'admin', schoolId: 's1' }, 's1')).toBe(true)
    expect(canManageJoinRequest({ role: 'municipal_admin', schoolId: 's1' }, 's1')).toBe(true)
    expect(canManageJoinRequest({ role: 'admin', schoolId: 's1' }, 's2')).toBe(false)
    expect(canManageJoinRequest({ role: 'admin', schoolId: null }, null)).toBe(false)
    expect(canManageJoinRequest({ role: 'admin', schoolId: 's1' }, null)).toBe(false)
  })
  it('מורה / תלמיד / בלי תפקיד — אף פעם', () => {
    expect(canManageJoinRequest({ role: 'teacher', schoolId: 's1' }, 's1')).toBe(false)
    expect(canManageJoinRequest({ role: 'student', schoolId: 's1' }, 's1')).toBe(false)
    expect(canManageJoinRequest({}, 's1')).toBe(false)
  })
})

describe('confirmationRedirect', () => {
  it('Origin של הבקשה אם קיים, אחרת האתר הראשי; תמיד לעמוד ההתחברות עם verified=1', () => {
    expect(confirmationRedirect('http://localhost:5173')).toBe('http://localhost:5173/staff/login?verified=1')
    expect(confirmationRedirect(undefined)).toBe('https://holoacademy.ai/staff/login?verified=1')
    expect(confirmationRedirect('')).toBe('https://holoacademy.ai/staff/login?verified=1')
  })
})
