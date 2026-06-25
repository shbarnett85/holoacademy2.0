import { getSession } from './staffSession'

/* בית המשתמש לפי רול — מקור יחיד לניווט "הביתה" (יציאה מהדמיה וכו').
   צוות מחובר גובר על תלמיד (אם יש session צוות בלשונית — תצוגה מקדימה/מקרן).
   super_admin → /admin; teacher/admin → /creator; אחרת (תלמיד) → /student. */
export function homePathForRole(): string {
  const s = getSession()
  if (s) return s.staff.role === 'super_admin' ? '/admin' : '/creator'
  return '/student'
}
