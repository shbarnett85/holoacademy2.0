import type { Request, Response, NextFunction } from 'express'
import { supabaseAdmin } from '../lib/supabase.js'
import { AppError } from './errors.js'

export type StaffRole = 'teacher' | 'admin' | 'super_admin'

export interface StaffContext {
  userId: string
  authId: string
  name: string
  role: StaffRole
  schoolId: string | null
}

/* הרחבת Request עם פרופיל הצוות המאומת */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      staff?: StaffContext
    }
  }
}

/* מנהלי-על מזוהים לפי אימייל ממשתנה הסביבה SUPERADMIN_EMAILS (מופרד בפסיקים).
   כך מנהל-על עובד גם ללא ערך ה-enum 'super_admin' ב-DB / ללא רשומת users. */
export function isSuperAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false
  const list = (process.env.SUPERADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  return list.includes(email.toLowerCase())
}

/* בדיקת is_active עמידה לפני/אחרי המיגרציה: אם העמודה עדיין לא קיימת (שגיאת PostgREST),
   נחשב את המשתמש פעיל — כדי שהאפליקציה לא תישבר לפני הרצת schema.sql. */
export async function isUserActive(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from('users').select('is_active').eq('id', userId).maybeSingle()
  if (error) return true /* העמודה חסרה (טרם migration) → פעיל */
  return (data as { is_active?: boolean } | null)?.is_active !== false
}

/* requireStaff — מאמת JWT של Supabase מה-Authorization header, שולף את רשומת ה-users
   לפי auth_id, ומצרף אותה ל-request (role + school_id). */
export async function requireStaff(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) throw new AppError(401, 'נדרשת התחברות צוות')

    const { data, error } = await supabaseAdmin.auth.getUser(token)
    if (error || !data.user) throw new AppError(401, 'ההתחברות אינה תקפה — התחבר/י מחדש')

    /* מנהל-על מבוסס-אימייל — אינו תלוי ברשומת users / ב-enum / ב-is_active */
    if (isSuperAdminEmail(data.user.email)) {
      req.staff = { userId: data.user.id, authId: data.user.id, name: 'מנהל-על', role: 'super_admin', schoolId: null }
      return next()
    }

    const { data: userRow, error: uErr } = await supabaseAdmin
      .from('users')
      .select('id, name, role, school_id, auth_id')
      .eq('auth_id', data.user.id)
      .single()
    if (uErr || !userRow) throw new AppError(403, 'המשתמש אינו מורה/מנהל')
    if (!['teacher', 'admin', 'super_admin'].includes(userRow.role)) {
      throw new AppError(403, 'אין הרשאת צוות')
    }
    if (!(await isUserActive(userRow.id))) throw new AppError(403, 'החשבון הושבת — פנה למנהל המערכת')

    req.staff = {
      userId: userRow.id,
      authId: userRow.auth_id,
      name: userRow.name,
      role: userRow.role,
      schoolId: userRow.school_id,
    }
    next()
  } catch (err) {
    next(err)
  }
}

/* requireAdmin — requireStaff + ודא role=admin (או super_admin שמעליו) */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  void requireStaff(req, res, (err?: unknown) => {
    if (err) return next(err)
    if (req.staff?.role !== 'admin' && req.staff?.role !== 'super_admin') {
      return next(new AppError(403, 'נדרשת הרשאת מנהל'))
    }
    next()
  })
}

/* requireSuperAdmin — requireStaff + ודא role=super_admin בלבד */
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  void requireStaff(req, res, (err?: unknown) => {
    if (err) return next(err)
    if (req.staff?.role !== 'super_admin') return next(new AppError(403, 'נדרשת הרשאת מנהל-על'))
    next()
  })
}

/* עזר: ודא שהמשתמש הוא הבעלים של ההדמיה (או מנהל). הדמיות ישנות ללא created_by — מותרות לכל צוות. */
export function ensureOwner(req: Request, createdBy: string | null | undefined): void {
  const s = req.staff
  if (!s) throw new AppError(401, 'נדרשת התחברות צוות')
  if (s.role === 'admin') return
  if (createdBy && createdBy !== s.userId) {
    throw new AppError(403, 'אין לך הרשאה לערוך הדמיה זו')
  }
}
