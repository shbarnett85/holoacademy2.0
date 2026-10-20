import { describe, expect, it } from 'vitest'
import type { Request, Response } from 'express'
import { RATE_LIMIT_MESSAGE, rateLimitByIp, rateLimitByUser } from './rateLimit.js'

/* req/res מינימליים; next מתעד אם נקרא עם שגיאה */
const req = (o: { userId?: string; guest?: boolean; ip?: string }): Request =>
  ({ ip: o.ip ?? '10.0.0.1', socket: { remoteAddress: o.ip ?? '10.0.0.1' }, staff: o.userId ? { userId: o.userId, isGuest: o.guest === true } : undefined }) as unknown as Request
function hit(mw: (r: Request, s: Response, n: (e?: unknown) => void) => void, r: Request): { status: number; message: string } | null {
  let err: { status: number; message: string } | null = null
  mw(r, {} as Response, (e) => { err = (e as { status: number; message: string }) ?? null })
  return err
}

describe('rateLimitByUser', () => {
  it('מגביל לפי משתמש: אחרי max בקשות — 429; משתמש אחר באותו IP לא מושפע', () => {
    const mw = rateLimitByUser('t-user-a', 3)
    for (let i = 0; i < 3; i++) expect(hit(mw, req({ userId: 'u1' }))).toBeNull()
    expect(hit(mw, req({ userId: 'u1' }))).toMatchObject({ status: 429, message: RATE_LIMIT_MESSAGE })
    expect(hit(mw, req({ userId: 'u2' }))).toBeNull()
  })

  it('אותו משתמש מ-IP אחר נספר יחד (המפתח הוא המשתמש)', () => {
    const mw = rateLimitByUser('t-user-b', 2)
    expect(hit(mw, req({ userId: 'u1', ip: '1.1.1.1' }))).toBeNull()
    expect(hit(mw, req({ userId: 'u1', ip: '2.2.2.2' }))).toBeNull()
    expect(hit(mw, req({ userId: 'u1', ip: '3.3.3.3' }))).toMatchObject({ status: 429 })
  })

  it('חשבון ההדגמה המשותף (guest) מוגבל לפי IP, לא לפי המשתמש — מבקר אחד לא חוסם אחרים', () => {
    const mw = rateLimitByUser('t-user-c', 2)
    expect(hit(mw, req({ userId: 'guest', guest: true, ip: '5.5.5.5' }))).toBeNull()
    expect(hit(mw, req({ userId: 'guest', guest: true, ip: '5.5.5.5' }))).toBeNull()
    expect(hit(mw, req({ userId: 'guest', guest: true, ip: '5.5.5.5' }))).toMatchObject({ status: 429 })
    expect(hit(mw, req({ userId: 'guest', guest: true, ip: '6.6.6.6' }))).toBeNull()
  })

  it('נתיבים שונים אינם חולקים מונה', () => {
    const a = rateLimitByUser('t-user-d1', 1)
    const b = rateLimitByUser('t-user-d2', 1)
    expect(hit(a, req({ userId: 'u9' }))).toBeNull()
    expect(hit(b, req({ userId: 'u9' }))).toBeNull()
    expect(hit(a, req({ userId: 'u9' }))).toMatchObject({ status: 429 })
  })
})

describe('rateLimitByIp (ללא שינוי)', () => {
  it('מגביל לפי IP', () => {
    const mw = rateLimitByIp('t-ip-a', 2)
    expect(hit(mw, req({ ip: '7.7.7.7' }))).toBeNull()
    expect(hit(mw, req({ ip: '7.7.7.7' }))).toBeNull()
    expect(hit(mw, req({ ip: '7.7.7.7' }))).toMatchObject({ status: 429 })
    expect(hit(mw, req({ ip: '8.8.8.8' }))).toBeNull()
  })
})
