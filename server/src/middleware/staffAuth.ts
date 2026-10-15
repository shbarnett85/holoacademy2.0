import type { Request, Response, NextFunction } from 'express'
import { supabaseAdmin } from '../lib/supabase.js'
import { AppError } from './errors.js'
import { hasCanShare } from '../lib/activeColumn.js'

/* municipal_admin — מנהל עירוני מוגבל-ארגון: מנהל מורים/כיתות/תלמידים ואנליטיקה
   של הארגון שלו בלבד; אין לו גישה להדמיות של אחרים ולא לשינוי תפקידים/הרשאות. */
export type StaffRole = 'teacher' | 'admin' | 'municipal_admin' | 'super_admin'

/* תפקידים בעלי סמכות-ארגון (ניהול מורים/כיתות/תלמידים בתוך בית הספר/הארגון) */
export function isOrgAdminRole(role: string | undefined | null): boolean {
  return role === 'admin' || role === 'municipal_admin' || role === 'super_admin'
}

export interface StaffContext {
  userId: string
  authId: string
  name: string
  role: StaffRole
  schoolId: string | null
  /* רשאי לשתף/להקצות הדמיות לתלמידים — נקרא טרי מה-DB בכל בקשה (לעולם לא מהלקוח) */
  canShare: boolean
  /* חשבון הדמו המשותף (GUEST_EMAIL) — כל התחברות אליו, כולל בסיסמה, מסומנת
     כאורח: האנליטיקה שלו מוגשת מנתוני-הדגמה סינתטיים (demoAnalytics) ולא מה-DB. */
  isGuest?: boolean
}

/* האם הבקשה היא ממצב הדגמה (מורה אורח) והדמו מופעל (DEMO_ANALYTICS≠0) */
export function isDemoGuest(req: Request): boolean {
  return req.staff?.isGuest === true && process.env.DEMO_ANALYTICS !== '0'
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
const STAFF_ROLES = ['teacher', 'admin', 'municipal_admin', 'super_admin']

/* טוען את הקשר הצוות מ-JWT של Supabase. מחזיר null בכל כשל (token לא תקף /
   אינו צוות / מושבת) — הקורא מחליט אם לזרוק. מקור יחיד ל-requireStaff ול-tryStaff. */
async function loadStaffContext(token: string): Promise<{ ctx: StaffContext | null; reason?: string; status?: number }> {
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data.user) return { ctx: null, reason: 'ההתחברות אינה תקפה — התחבר/י מחדש', status: 401 }

  /* מנהל-על מבוסס-אימייל — אינו תלוי ברשומת users / ב-enum / ב-is_active */
  if (isSuperAdminEmail(data.user.email)) {
    return { ctx: { userId: data.user.id, authId: data.user.id, name: 'מנהל-על', role: 'super_admin', schoolId: null, canShare: true } }
  }

  const withShare = await hasCanShare()
  const { data: userRow, error: uErr } = await supabaseAdmin
    .from('users')
    .select(withShare ? 'id, name, role, school_id, auth_id, can_share' : 'id, name, role, school_id, auth_id')
    .eq('auth_id', data.user.id)
    .single()
  if (uErr || !userRow) return { ctx: null, reason: 'המשתמש אינו מורה/מנהל', status: 403 }
  const row = userRow as unknown as { id: string; name: string; role: StaffRole; school_id: string | null; auth_id: string; can_share?: boolean }
  if (!STAFF_ROLES.includes(row.role)) return { ctx: null, reason: 'אין הרשאת צוות', status: 403 }
  if (!(await isUserActive(row.id))) return { ctx: null, reason: 'החשבון הושבת — פנה למנהל המערכת', status: 403 }

  const guestEmail = (process.env.GUEST_EMAIL || 'teacher@demo.com').toLowerCase()
  return {
    ctx: {
      userId: row.id,
      authId: row.auth_id,
      name: row.name,
      role: row.role,
      schoolId: row.school_id,
      canShare: row.can_share !== false, /* עמודה חסרה / null → מותר (התנהגות קודמת) */
      isGuest: (data.user.email ?? '').toLowerCase() === guestEmail,
    },
  }
}

export async function requireStaff(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) throw new AppError(401, 'נדרשת התחברות צוות')
    const { ctx, reason, status } = await loadStaffContext(token)
    if (!ctx) throw new AppError(status ?? 401, reason ?? 'נדרשת התחברות צוות')
    req.staff = ctx
    next()
  } catch (err) {
    next(err)
  }
}

/* גרסה שאינה זורקת — לנתיבים ציבוריים שמתנהגים אחרת כשיש צוות מחובר (GET /quests/:id) */
export async function tryStaff(req: Request): Promise<StaffContext | null> {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return null
  try { return (await loadStaffContext(token)).ctx } catch { return null }
}

/* ── requireCanShare — שער ההרשאה לשיתוף/הקצאה/יצירת-גרסאות-לתלמיד ──────────
   מורה מוגבל (users.can_share=false) → 403 עם code=SHARING_DISABLED. נאכף בשרת
   על כל נתיב שמעביר הדמיה לתלמידים; הדגל נקרא מה-DB ב-requireStaff (לא מהלקוח).
   חייב לרוץ אחרי requireStaff. */
export const SHARING_DISABLED_MESSAGE = 'שיתוף הדמיות עם תלמידים אינו זמין בחשבון זה (גרסת הדגמה).'
export function requireCanShare(req: Request, _res: Response, next: NextFunction) {
  if (!req.staff) return next(new AppError(401, 'נדרשת התחברות צוות'))
  if (req.staff.canShare === false) return next(new AppError(403, SHARING_DISABLED_MESSAGE, 'SHARING_DISABLED'))
  next()
}

/* requireAdmin — requireStaff + ודא role=admin (או super_admin שמעליו) */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  void requireStaff(req, res, (err?: unknown) => {
    if (err) return next(err)
    if (!isOrgAdminRole(req.staff?.role)) {
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
