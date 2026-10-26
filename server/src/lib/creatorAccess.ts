import type { NextFunction, Request, Response } from 'express'
import { randomUUID } from 'node:crypto'
import { requireStaff, ensureOwner } from '../middleware/staffAuth.js'
import { AppError } from '../middleware/errors.js'

/* ── גישת "יוצר" — מורה מחובר או מבקר אנונימי ────────────────────────────────
   מדיניות המוצר: יצירת הדמיות (ועריכתן) פתוחה לכולם בלי הרשמה; שיתוף לכיתה
   דורש חשבון. מבקר אנונימי מזוהה בעוגיית דפדפן httpOnly ‏(holo_anon, ‏uuid,
   שנה) — ההדמיות שלו נכתבות עם anon_id ועוברות לחשבון בהרשמה (claim). */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      anonId?: string
    }
  }
}

const COOKIE = 'holo_anon'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function readAnonId(req: Request): string | null {
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([0-9a-fA-F-]{36})`).exec(req.headers.cookie ?? '')
  return m && UUID_RE.test(m[1]) ? m[1].toLowerCase() : null
}

export function ensureAnonId(req: Request, res: Response): string {
  const existing = readAnonId(req)
  if (existing) return existing
  const id = randomUUID()
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  res.append('Set-Cookie', `${COOKIE}=${id}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`)
  return id
}

/* מורה מחובר (Bearer) → מסלול הצוות הרגיל; אחרת — זהות אנונימית מהעוגייה */
export function requireCreator(req: Request, res: Response, next: NextFunction): void {
  if (req.headers.authorization) { requireStaff(req, res, next); return }
  req.anonId = ensureAnonId(req, res)
  next()
}

/* בדיקת בעלות על הדמיה בהקשר יוצר: מורה — הכלל הקיים (בעלים/מנהל);
   אנונימי — התאמת anon_id בלבד. הדמיות ישנות ללא בעלים מותרות לצוות בלבד. */
export async function ensureQuestAccess(req: Request, quest: { created_by?: string | null; anon_id?: string | null }): Promise<void> {
  if (req.staff) {
    await ensureOwner(req, quest.created_by)
    return
  }
  if (req.anonId && quest.anon_id && quest.anon_id === req.anonId) return
  throw new AppError(403, 'השיעור הזה לא נוצר בדפדפן הזה — התחברו כדי לערוך אותו')
}
