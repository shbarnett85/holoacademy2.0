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

/* ── נעילת-מזהה מדורגת (escalating lockout) ──
   כל נעילה עוקבת ארוכה פי-3 מהקודמת: 1דק׳ → 3דק׳ → 9דק׳ → ... (תקרה 30דק׳).
   כך ניסיון brute-force מתמשך על אותו תלמיד נבלם אקספוננציאלית, בעוד טעות
   חד-פעמית של ילד אמיתי עולה רק דקה. הלוגיקה pure (now מוזרק) — נבדקת ביחידה. */

export interface LockState {
  fails: number /* כשלים בחלון הנוכחי */
  windowEnd: number /* סוף חלון ספירת הכשלים */
  lockedUntil: number /* 0 = לא נעול */
  lockLevel: number /* כמה נעילות רצופות היו (קובע את משך הבאה) */
}

export const LOCK_BASE_MS = 60_000
export const LOCK_MAX_MS = 30 * 60_000
export const LOCK_ESCALATION = 3

const lockStates = new Map<string, LockState>()

export function lockDurationMs(lockLevel: number): number {
  return Math.min(LOCK_BASE_MS * Math.pow(LOCK_ESCALATION, lockLevel), LOCK_MAX_MS)
}

/* צעד-מכונת-המצבים על כשל בודד — pure, ללא side effects */
export function nextLockState(prev: LockState | null, max: number, now: number, windowMs = 60_000): LockState {
  const s: LockState = prev && (prev.windowEnd > now || prev.lockedUntil > now || prev.lockLevel > 0)
    ? { ...prev }
    : { fails: 0, windowEnd: 0, lockLevel: 0, lockedUntil: 0 }

  /* חלון ספירה חדש אם הקודם פג */
  if (s.windowEnd <= now) {
    s.fails = 0
    s.windowEnd = now + windowMs
  }
  s.fails++

  if (s.fails >= max) {
    s.lockedUntil = now + lockDurationMs(s.lockLevel)
    s.lockLevel++
    s.fails = 0
    s.windowEnd = 0
  }
  return s
}

/* מניית כשל-אימות פר-מזהה — נקרא אחרי PIN/סיסמה שגויים */
export function recordFailure(routeName: string, id: string, max = 5, now = Date.now()): void {
  const key = `${routeName}:${id}`
  lockStates.set(key, nextLockState(lockStates.get(key) ?? null, max, now))
  if (lockStates.size >= 10_000) {
    for (const [k, s] of lockStates) {
      if (s.lockedUntil <= now && s.windowEnd <= now) lockStates.delete(k)
    }
  }
}

/* האם המזהה נעול כרגע */
export function isLocked(routeName: string, id: string, _max?: number, now = Date.now()): boolean {
  const s = lockStates.get(`${routeName}:${id}`)
  return !!s && s.lockedUntil > now
}
