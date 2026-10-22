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

  it('אורח עם שני המגבילים על אותו נתיב (כמו analytics-v2/ai-summary): כל בקשה נספרת פעם אחת בכל מונה, לא פעמיים על אותו מפתח', () => {
    const ipMw = rateLimitByIp('t-pair-a', 4)
    const userMw = rateLimitByUser('t-pair-a', 4)
    const guest = req({ userId: 'guest', guest: true, ip: '11.0.0.1' })
    /* לפני התיקון: מפתח זהה → אחרי 2 בקשות המונה כבר ב-4 ובקשה 3 נחסמה */
    for (let i = 0; i < 4; i++) {
      expect(hit(ipMw, guest), `ip #${i}`).toBeNull()
      expect(hit(userMw, guest), `user #${i}`).toBeNull()
    }
    expect(hit(ipMw, guest)).toMatchObject({ status: 429 })
  })

  it('בקשות אורח לא שוחקות את המונה הכללי של ה-IP (בית ספר שלם מאחורי NAT): מורה אמיתי מאותו IP נשאר פנוי', () => {
    const ipMw = rateLimitByIp('t-pair-b', 3)
    const userMw = rateLimitByUser('t-pair-b', 100)
    const guest = req({ userId: 'guest', guest: true, ip: '11.0.0.2' })
    const teacher = req({ userId: 'u-t', ip: '11.0.0.2' })
    for (let i = 0; i < 2; i++) { hit(ipMw, guest); hit(userMw, guest) }
    /* המונה הכללי ספר 2 בקשות בלבד (אחת לכל בקשת אורח) — נשארה בקשה אחת פנויה, ואין ספירה כפולה מהמגביל לפי משתמש */
    expect(hit(ipMw, teacher)).toBeNull()
    expect(hit(ipMw, teacher)).toMatchObject({ status: 429 })
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
