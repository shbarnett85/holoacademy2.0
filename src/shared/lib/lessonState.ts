/* ──────────────────────────────────────────────────────────────────────────
   lessonState — מצב שיעור שנשלח לכיתה ותאריך יעד (CLAUDE.md "תאריך יעד").
   פונקציה אחת, pure, שהשרת קורא לה ושכל המסכים מקבלים ממנה את התוצאה (`state`) — אין חישוב מצב בקליינט.
   · active_now: תלמיד היה פעיל בשיעור ב-5 הדקות האחרונות. "פעיל" = התחלת או השלמת משחק (אין דופק חי במודל
     התיעוד המרוכז — ראו "תיעוד משחק"), ולכן זהו המידע הקיים בלבד.
   · open: לפני מועד ההגשה. · ended: אחרי מועד ההגשה.
   עדיפות: active_now > ended > open (שיעור שמשחקים בו כרגע מוצג "פעיל עכשיו" גם אם המועד חלף).
   השיעור לא ננעל אחרי המועד — "באיחור" הוא סימון בלבד.
   ────────────────────────────────────────────────────────────────────────── */

export const ACTIVE_WINDOW_MS = 5 * 60 * 1000
export const DEFAULT_DUE_DAYS = 7
const ISRAEL_TZ = 'Asia/Jerusalem'

export type LessonState = 'active_now' | 'open' | 'ended'

/* היסט שעון ישראל מ-UTC בדקות, ברגע נתון (כולל שעון קיץ) */
function israelOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: ISRAEL_TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(at)
  const v = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const asUtc = Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute'), v('second'))
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000)
}

/* הרגע (UTC) שבו שעון ישראל מראה את התאריך/שעה הנתונים */
export function israelLocalToUtc(year: number, month1: number, day: number, hour: number, minute: number): Date {
  const naive = Date.UTC(year, month1 - 1, day, hour, minute)
  let guess = naive - israelOffsetMinutes(new Date(naive)) * 60000
  guess = naive - israelOffsetMinutes(new Date(guess)) * 60000 /* תיקון סביב מעבר שעון קיץ */
  return new Date(guess)
}

/* תאריך יעד ברירת מחדל: יום השליחה (שעון ישראל) + 7 ימים, ב-23:59 שעון ישראל */
export function defaultDueAt(sentAt: Date | string): Date {
  const d = new Date(sentAt)
  const p = new Intl.DateTimeFormat('en-US', { timeZone: ISRAEL_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
  const v = (t: string) => Number(p.find((x) => x.type === t)?.value)
  const day = new Date(Date.UTC(v('year'), v('month') - 1, v('day') + DEFAULT_DUE_DAYS))
  return israelLocalToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), 23, 59)
}

/* "YYYY-MM-DD" (יום ישראלי שנבחר בשדה תאריך) → סוף אותו יום: 23:59 שעון ישראל */
export function dueAtFromDay(day: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const probe = new Date(Date.UTC(y, mo - 1, d))
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null
  return israelLocalToUtc(y, mo, d, 23, 59)
}

/* היום הישראלי של רגע נתון, כ-"YYYY-MM-DD" (לשדה תאריך) */
export function israelDay(at: Date | string): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: ISRAEL_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at))
  return p
}

export function lessonState(input: { now: Date | number; dueAt: Date | string | null | undefined; lastActivityAt?: Date | string | null }): LessonState {
  const now = typeof input.now === 'number' ? input.now : input.now.getTime()
  const last = input.lastActivityAt ? new Date(input.lastActivityAt).getTime() : NaN
  if (Number.isFinite(last) && now - last >= 0 && now - last <= ACTIVE_WINDOW_MS) return 'active_now'
  if (input.dueAt && now > new Date(input.dueAt).getTime()) return 'ended'
  return 'open'
}

/* סשן שהושלם אחרי מועד ההגשה — "באיחור" */
export function isLate(completedAt: Date | string | null | undefined, dueAt: Date | string | null | undefined): boolean {
  if (!completedAt || !dueAt) return false
  return new Date(completedAt).getTime() > new Date(dueAt).getTime()
}

/* תאריך להצגה למשתמש ("8 ביולי") — לפי היום הישראלי של הרגע */
export function formatIsraelDate(at: Date | string): string {
  return new Intl.DateTimeFormat('he-IL', { timeZone: ISRAEL_TZ, day: 'numeric', month: 'long' }).format(new Date(at))
}
