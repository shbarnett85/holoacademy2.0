import { supabaseAnon } from './supabase.js'
import { AppError } from '../middleware/errors.js'

/* ── הרשמה עצמית של צוות — החלטות טהורות + שער המייל ────────────────────────────
   מדיניות (ראו CLAUDE.md "הרשמה עצמית ואישור הצטרפות"):
   - בית ספר חדש (newSchoolName): היוצר הוא הבעלים היחיד שלו ולכן מורשה לבחור 'teacher'
     (מורה בודד) או 'admin' (מנהל שיאשר מורים שיצטרפו אליו). אין לו שום גישה לבית ספר אחר.
   - בית ספר קיים (schoolId): אך ורק מורה, תמיד ממתין לאישור מנהל בית הספר / מנהל-על.
     'admin' בהצטרפות לבית ספר קיים נדחה — זה היה המסלול לתפיסת בית ספר זר.
   - המייל לעולם לא מסומן כמאושר בהרשמה ציבורית: התחברות נחסמת עד לחיצה על קישור האימות. */

export type SignupRole = 'teacher' | 'admin'

export type SignupPlan =
  | { kind: 'new_school'; role: SignupRole }
  | { kind: 'join'; role: 'teacher'; schoolId: string }

export const JOIN_UNAVAILABLE_MESSAGE = 'ההצטרפות לבית ספר קיים אינה זמינה כרגע — נסו שוב מאוחר יותר או פנו למנהל המערכת'

export function planSignup(input: { role?: SignupRole; schoolId?: string; newSchoolName?: string }): SignupPlan {
  const { schoolId, newSchoolName } = input
  if (schoolId && newSchoolName) throw new AppError(400, 'יש לבחור בית ספר קיים או להזין חדש — לא את שניהם')
  if (newSchoolName) return { kind: 'new_school', role: input.role ?? 'teacher' }
  if (!schoolId) throw new AppError(400, 'יש לבחור בית ספר או להזין חדש')
  if (input.role === 'admin') {
    throw new AppError(400, 'אפשר להירשם כמנהל רק בעת יצירת בית ספר חדש. כדי להצטרף לבית ספר קיים בחרו "מורה" — הבקשה תאושר על ידי מנהל בית הספר', 'ADMIN_JOIN_FORBIDDEN')
  }
  return { kind: 'join', role: 'teacher', schoolId }
}

/* מי רשאי לאשר/לדחות בקשת הצטרפות של מורה לבית ספר: מנהל-על (הכול), מנהל / מנהל ארגון
   של אותו בית ספר בלבד. מורה — אף פעם. שני הצדדים חייבים שיוך (null לא שווה ל-null). */
export function canManageJoinRequest(staff: { role?: string | null; schoolId?: string | null }, targetSchoolId: string | null | undefined): boolean {
  if (staff.role === 'super_admin') return true
  if (staff.role !== 'admin' && staff.role !== 'municipal_admin') return false
  return !!staff.schoolId && !!targetSchoolId && staff.schoolId === targetSchoolId
}

/* יעד קישור האימות — אותו מוסכמה כמו שחזור הסיסמה (Origin של הבקשה, ברירת מחדל האתר הראשי).
   Supabase מאמת את היעד מול ה-allow-list של הפרויקט ונופל ל-Site URL אם הוא לא ברשימה. */
export function confirmationRedirect(origin?: string | null): string {
  return (origin || 'https://holoacademy.ai') + '/staff/login?verified=1'
}

/* שליחת מייל האימות — דרך המייל של Supabase Auth (אותו ערוץ של resetPasswordForEmail).
   אובייקט מוחלף-בבדיקות: מרשימות example.com נדחות ע"י Supabase כ"כתובת לא תקינה",
   ובדיקות אינטגרציה לא אמורות לשלוח מייל אמיתי. */
export const signupMail = {
  async sendConfirmation(email: string, redirectTo: string): Promise<{ ok: boolean; error?: string }> {
    const { error } = await supabaseAnon.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectTo } })
    return error ? { ok: false, error: `${error.code ?? error.status ?? ''} ${error.message}`.trim() } : { ok: true }
  },
}
