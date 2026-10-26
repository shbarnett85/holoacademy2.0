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

/* ── שבועות (רשימת סיכום שיעור: "השבוע" / "שבוע שעבר" / "מוקדם יותר") — שבוע ישראלי: מראשון 00:00 עד שבת, שעון ישראל ── */
/* תחילת השבוע (ראשון 00:00 שעון ישראל) שבו נמצא הרגע הנתון, כרגע UTC */
export function israelWeekStart(at: Date | number | string): Date {
  const d = new Date(at)
  const p = new Intl.DateTimeFormat('en-US', { timeZone: ISRAEL_TZ, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(d)
  const v = (t: string): string => p.find((x) => x.type === t)?.value ?? ''
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(v('weekday'))
  const day = new Date(Date.UTC(Number(v('year')), Number(v('month')) - 1, Number(v('day')) - Math.max(0, dow)))
  return israelLocalToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), 0, 0)
}

export type WeekGroup = 'this' | 'last' | 'earlier'
/* הקבוצה של שליחה לפי תאריך השליחה: השבוע, השבוע שעבר (7 הימים שלפני תחילת השבוע), או מוקדם יותר */
export function weekGroupOf(sentAt: Date | number | string, now: Date | number | string): WeekGroup {
  const start = israelWeekStart(now).getTime()
  const t = new Date(sentAt).getTime()
  if (t >= start) return 'this'
  /* שבוע שעבר = השבוע הקודם בלוח (גם סביב מעבר שעון: משווים לתחילת השבוע הקודם, לא ל-7×24 שעות) */
  const lastStart = israelWeekStart(start - 12 * 3600_000).getTime()
  return t >= lastStart ? 'last' : 'earlier'
}

/* החודש הלועזי של הרגע הנתון בשעון ישראל: [start, end) כרגעי UTC + השנה והחודש (1..12) */
export function israelMonthRange(at: Date | number | string): { start: Date; end: Date; year: number; month1: number } {
  const [y, m] = israelDay(new Date(at)).split('-').map(Number)
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  return { start: israelLocalToUtc(y, m, 1, 0, 0), end: israelLocalToUtc(ny, nm, 1, 0, 0), year: y, month1: m }
}
