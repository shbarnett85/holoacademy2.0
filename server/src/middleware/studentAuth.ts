import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { AppError } from './errors.js'
import { isUserActive } from './staffAuth.js'

export interface StudentContext {
  userId: string
  role: string
  classId: string | null
}

/* הרחבת Request עם פרופיל התלמיד המאומת (JWT-PIN עצמי, לא Supabase Auth) */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      student?: StudentContext
    }
  }
}

/* requireStudent — מאמת את ה-JWT שהונפק ב-student-login (jsonwebtoken עם JWT_SECRET),
   מצרף את פרופיל התלמיד ל-request, וחוסם תלמיד מושבת. */
export async function requireStudent(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) throw new AppError(401, 'נדרשת התחברות תלמיד')

    const secret = process.env.JWT_SECRET
    if (!secret) throw new AppError(500, 'JWT_SECRET לא מוגדר')

    let payload: { userId?: string; role?: string; classId?: string | null }
    try {
      payload = jwt.verify(token, secret) as typeof payload
    } catch {
      throw new AppError(401, 'ההתחברות אינה תקפה — התחבר/י מחדש')
    }
    if (!payload.userId || payload.role !== 'student') throw new AppError(403, 'נדרשת התחברות תלמיד')
    if (!(await isUserActive(payload.userId))) throw new AppError(403, 'החשבון הושבת — פנה למורה')

    req.student = { userId: payload.userId, role: payload.role, classId: payload.classId ?? null }
    next()
  } catch (err) {
    next(err)
  }
}
