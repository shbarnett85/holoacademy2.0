import { getSession } from './staffSession'

/* בית המשתמש לפי רול — מקור יחיד לניווט "הביתה" (יציאה מהדמיה וכו').
   המשתמש הפעיל בלשונית קובע: אם יש token תלמיד (PIN) — הוא תלמיד ויחזור ל-/student
   (גם אם יש session צוות ישן ב-localStorage ממכשיר משותף). אחרת, צוות מחובר →
   super_admin → /admin, teacher/admin → /creator.
   (תצוגה מקדימה/מקרן של מורה = staff session בלי token תלמיד → /creator.)
   אנונימי (לא תלמיד ולא צוות — למשל הדמיית דמו מהעמוד הראשי) → '/' (עמוד הבית). */
export function homePathForRole(): string {
  try {
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('holo_token')) return '/student'
  } catch { /* sessionStorage לא זמין */ }
  const s = getSession()
  if (s) return s.staff.role === 'super_admin' ? '/admin' : '/creator'
  return '/'
}
