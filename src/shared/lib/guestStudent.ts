/* תלמיד אורח: כניסה בלי קוד כיתה ובלי PIN, כדי לראות את הצד של התלמיד. הכול בדפדפן בלבד:
   · אין חשבון, אין טוקן ואין קריאה לשרת שכותבת משהו — משחק של אורח לא נרשם (כמו מבקר), ולכן לא נכנס לאנליטיקה ולכיול.
   · הספרייה של האורח היא שיעורי ההתנסות הרשמיים (GET /api/quests/showcase), באותו מסך של תלמיד רגיל (StudentHome).
   · מה שהאורח סיים נשמר ב-sessionStorage של הלשונית בלבד (כדי שהפורטל יציג "הושלם" והגבישים), ונמחק ביציאה. */

const FLAG = 'holo_guest_student'
const PROGRESS = 'holo_guest_progress'
const NAME = 'holo_student_name'

const store = (): Storage | null => { try { return typeof sessionStorage !== 'undefined' ? sessionStorage : null } catch { return null } }

export function isGuestStudent(): boolean {
  const s = store()
  /* תלמיד שמחובר עם טוקן אמיתי הוא לא אורח, גם אם הדגל נשאר מכניסה קודמת באותה לשונית */
  return !!s && s.getItem(FLAG) === '1' && !s.getItem('holo_token')
}

export function enterGuestStudent(displayName: string): void {
  const s = store()
  if (!s) return
  s.removeItem('holo_token')
  s.setItem(FLAG, '1')
  s.setItem(NAME, displayName)
}

export function leaveGuestStudent(): void {
  const s = store()
  if (!s) return
  s.removeItem(FLAG)
  s.removeItem(PROGRESS)
  s.removeItem(NAME)
}

/* הגבישים של המשחק הטוב ביותר, לכל שיעור שהאורח סיים בלשונית הזאת */
export function guestProgress(): Record<string, number> {
  try {
    const raw = store()?.getItem(PROGRESS)
    const v = raw ? JSON.parse(raw) as unknown : null
    if (!v || typeof v !== 'object') return {}
    const out: Record<string, number> = {}
    for (const [k, n] of Object.entries(v as Record<string, unknown>)) if (typeof n === 'number' && Number.isFinite(n)) out[k] = n
    return out
  } catch { return {} }
}

export function recordGuestResult(questId: string, gems: number): void {
  const s = store()
  if (!s || !isGuestStudent()) return
  const all = guestProgress()
  all[questId] = Math.max(all[questId] ?? 0, Math.max(0, Math.round(gems)))
  try { s.setItem(PROGRESS, JSON.stringify(all)) } catch { /* אחסון מלא: ההתקדמות של האורח פשוט לא נשמרת */ }
}
