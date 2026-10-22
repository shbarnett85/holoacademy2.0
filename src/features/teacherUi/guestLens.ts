/* ──────────────────────────────────────────────────────────────────────────
   העדשה של מורה אורח (מחנך/ת | מורה מקצועי/ת | מנהל/ת + המקצוע של המורה המקצועי/ת): מאגר קטן אחד לכל מסכי המורה.
   למה: האורח בוחר תפקיד פעם אחת, והבחירה צריכה לשרוד מעבר בין הטאבים הראשיים (תוצאות ↔ אנליטיקה) בלי לבחור שוב.
   מקור האמת בכל מסך הוא הכתובת (?lens=&subject=); כשאין כתובת — הערך השמור. כל החלפה נכתבת לכאן.
   נשמר ב-sessionStorage (לשונית אחת, נעלם בסגירתה) תחת המפתח holo_guest_lens. כל גישה עטופה ב-try/catch:
   כשהאחסון חסום (חלון פרטי, נתוני אתר חסומים) הערך נשמר בזיכרון בלבד והמסכים ממשיכים לעבוד.
   מורה שאינו אורח לעולם לא מושפע: guestLensParams()/withGuestLens() מחזירים ריק כשאין session של אורח.
   ────────────────────────────────────────────────────────────────────────── */
import { useSyncExternalStore } from 'react'
import { getSession } from '../../shared/lib/staffSession'
import type { Lens } from '../../shared/types/analyticsV2'

export type GuestLens = Lens

/** סדר התצוגה של העדשות בבורר */
export const GUEST_LENSES: readonly GuestLens[] = ['homeroom', 'subject_teacher', 'admin']

/** תוויות הבורר (טקסט ממשק קבוע) */
export const GUEST_LENS_TEXT = {
  /* משפט הסבר קצר אחד (שורה אחת): מה הבורר עושה */
  sentence: 'תצוגת הדגמה: בחרו תפקיד',
  groupLabel: 'צפייה בתור',
  subject: 'מקצוע',
  names: { homeroom: 'מחנך/ת', subject_teacher: 'מורה מקצועי/ת', admin: 'מנהל/ת' } satisfies Record<GuestLens, string>,
} as const

export interface GuestLensState {
  lens: GuestLens
  /** קוד המקצוע של המורה המקצועי/ת. נשמר גם כשהעדשה אחרת (כדי לחזור לאותו מקצוע), ונשלח לשרת רק בעדשת מורה מקצועי */
  subject: string | null
}

export const GUEST_LENS_KEY = 'holo_guest_lens'

let memory: string | null = null
let cachedRaw: string | null | undefined
let cachedState: GuestLensState | null = null
const listeners = new Set<() => void>()

const isLens = (v: unknown): v is GuestLens => typeof v === 'string' && (GUEST_LENSES as readonly string[]).includes(v)

function readRaw(): string | null {
  try { return sessionStorage.getItem(GUEST_LENS_KEY) ?? memory } catch { return memory }
}

function parse(raw: string | null): GuestLensState | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as { lens?: unknown; subject?: unknown }
    if (!isLens(v.lens)) return null
    return { lens: v.lens, subject: typeof v.subject === 'string' && v.subject ? v.subject : null }
  } catch { return null }
}

/** הערך השמור, או null כשעוד לא נבחר דבר. מחזיר אותו אובייקט כל עוד הערך השמור לא השתנה (בטוח ל-useSyncExternalStore) */
export function readGuestLens(): GuestLensState | null {
  const raw = readRaw()
  if (raw !== cachedRaw) { cachedRaw = raw; cachedState = parse(raw) }
  return cachedState
}

/** שומר את הבחירה ומודיע לכל המסכים הפתוחים. ללא שינוי בפועל — לא עושה דבר */
export function writeGuestLens(next: GuestLensState): void {
  const state: GuestLensState = { lens: next.lens, subject: next.subject || null }
  const prev = readGuestLens()
  if (prev && prev.lens === state.lens && prev.subject === state.subject) return
  const raw = JSON.stringify(state)
  memory = raw
  try { sessionStorage.setItem(GUEST_LENS_KEY, raw) } catch { /* האחסון חסום — נשמר בזיכרון */ }
  listeners.forEach((l) => l())
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

/** הערך השמור (או null), עם רינדור מחדש בכל החלפה — בכל מסך שמציג את הבורר או קורא נתונים לפי העדשה */
export function useGuestLens(): GuestLensState | null {
  return useSyncExternalStore(subscribe, readGuestLens, () => null)
}

/** האם המשתמש הנוכחי הוא מורה אורח (חשבון הדגמה) */
export function isGuestSession(): boolean {
  return getSession()?.staff.isGuest === true
}

/** עדשה → פרמטרים של כתובת/API. מקצוע נשלח רק בעדשת מורה מקצועי */
export function lensToParams(lens: GuestLens, subject: string | null | undefined): Record<string, string> {
  const p: Record<string, string> = { lens }
  if (lens === 'subject_teacher' && subject) p.subject = subject
  return p
}

/**
 * הפרמטרים שיש לצרף לקריאות API של מסכי מורה: { lens, subject? } לאורח; אובייקט ריק לכל משתמש אחר
 * (כך אפשר לפזר אותם בכל קריאה בלי לבדוק מי המשתמש). בלי ארגומנט — מהערך השמור; בלי ערך שמור — ריק (השרת בוחר ברירת מחדל).
 */
export function guestLensParams(state?: GuestLensState | null): Record<string, string> {
  if (!isGuestSession()) return {}
  const s = state === undefined ? readGuestLens() : state
  return s ? lensToParams(s.lens, s.subject) : {}
}

/** מצרף את פרמטרי העדשה לנתיב (עם או בלי שאילתה קיימת): withGuestLens('/api/results/submissions') → '/api/results/submissions?lens=homeroom'.
 *  נתיב שכבר נושא lens מפורש נשאר כמות שהוא (העדשה בכתובת קודמת, ולא מערבבים עדשה אחת עם מקצוע של אחרת). */
export function withGuestLens(path: string, state?: GuestLensState | null): string {
  const params = guestLensParams(state)
  const keys = Object.keys(params)
  if (keys.length === 0) return path
  const hashAt = path.indexOf('#')
  const head = hashAt === -1 ? path : path.slice(0, hashAt)
  const tail = hashAt === -1 ? '' : path.slice(hashAt)
  const q = new URLSearchParams(head.includes('?') ? head.slice(head.indexOf('?') + 1) : '')
  if (q.has('lens')) return path
  for (const k of keys) q.set(k, params[k])
  const base = head.includes('?') ? head.slice(0, head.indexOf('?')) : head
  return `${base}?${q.toString()}${tail}`
}
