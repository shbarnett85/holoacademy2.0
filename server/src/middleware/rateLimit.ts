import type { Request, Response, NextFunction } from 'express'
import { AppError } from './errors.js'

/* הגבלת קצב in-memory לנקודות האימות — בלי תלות חיצונית (שרת יחיד, לא cluster).
   שני מסלולים:
   - rateLimitByIp: מגביל כמות בקשות מאותו IP לנתיב (חלון קבוע).
   - recordFailure/isLocked: מונה *כשלונות* פר-מזהה (למשל studentId) — מונע
     brute-force על PIN של תלמיד ספציפי גם כשהתוקף מפזר IPs. התחברות מוצלחת
     לא נספרת ולא ננעלת. */

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

/* ניקוי עצל — מוחק דליים שפגו כשהמפה תופחת (מונע גידול זיכרון) */
function sweepIfNeeded(now: number): void {
  if (buckets.size < 10_000) return
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k)
  }
}

function increment(key: string, windowMs: number): number {
  const now = Date.now()
  sweepIfNeeded(now)
  const b = buckets.get(key)
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return 1
  }
  b.count++
  return b.count
}

export const RATE_LIMIT_MESSAGE = 'יותר מדי ניסיונות — נסו שוב בעוד דקה'

/* middleware פר-IP: עד max בקשות בחלון windowMs לכל נתיב+IP */
export function rateLimitByIp(routeName: string, max: number, windowMs = 60_000) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown'
    if (increment(`ip:${routeName}:${ip}`, windowMs) > max) {
      next(new AppError(429, RATE_LIMIT_MESSAGE))
      return
    }
    next()
  }
}

/* מניית כשל-אימות פר-מזהה — נקרא אחרי PIN/סיסמה שגויים */
export function recordFailure(routeName: string, id: string, windowMs = 60_000): void {
  increment(`id:${routeName}:${id}`, windowMs)
}

/* האם המזהה נעול כרגע (חצה את סף הכשלונות בחלון הפעיל) */
export function isLocked(routeName: string, id: string, max: number): boolean {
  const b = buckets.get(`id:${routeName}:${id}`)
  return !!b && b.resetAt > Date.now() && b.count >= max
}
