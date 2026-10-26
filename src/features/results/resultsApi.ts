/* קריאות לחוזה resultsV1. המסכים לא יודעים מי הספק (אמיתי / הדמיה) — רק את הצורה (src/shared/types/resultsV1.ts).
   · apiFetch מצרף את הטוקן; כאן נשמר גם קוד הסטטוס (403/404 מקבלים הודעה בעברית פשוטה ולא טקסט טכני).
   · בפיתוח כל תגובה מאומתת מול סכמת ה-zod (נטענת דינמית, כך שהיא לא נכנסת ל-bundle של הפרודקשן).
   · בורר העדשה של מורה האורח (lens / subject): הכתובת קודמת, ובלעדיה — הבחירה השמורה (teacherUi/guestLens).
     העדשה מצורפת לכל קריאת /api/results ולכל קישור פנימי (רשימה ‹› הדמיה ‹› תלמיד/ה) דרך guestLensParams,
     וכל עדשה שנטענה נכתבת חזרה למאגר המשותף כדי שתשרוד מעבר לטאב האנליטיקה. השרת הוא שגוזר את הצופה; הלקוח לא מחליט כלום.
     למורה שאינו אורח אין פרמטרים כלל. */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStaffAuth } from '../../shared/hooks/useStaffAuth'
import { apiFetch } from '../../shared/lib/api'
import type { ResultsEndpointName } from '../../shared/types/resultsV1'
import { GUEST_LENSES, guestLensParams, lensToParams, readGuestLens, useGuestLens, writeGuestLens } from '../teacherUi'
import type { GuestLens, GuestLensState } from '../teacherUi'
import { UI } from './text'

export class ResultsError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

/* הודעה בעברית פשוטה לפי הסטטוס. ברשימה, 403 מציג את ההסבר של השרת (למשל: "התמונה הכללית נמצאת באנליטיקה"). */
export function errorMessage(e: ResultsError, scope: 'list' | 'submission'): string {
  if (e.status === 404) return UI.errNotFound
  if (e.status === 403) return scope === 'list' && e.message ? e.message : UI.errForbidden
  return UI.errGeneric
}

export async function resultsGet<T>(ep: ResultsEndpointName, path: string): Promise<T> {
  let res: Response
  try { res = await apiFetch(path) } catch { throw new ResultsError(0, 'network') }
  const body = (await res.json().catch(() => null)) as { data?: T; error?: string } | null
  if (!res.ok) throw new ResultsError(res.status, body?.error ?? '')
  if (import.meta.env.DEV) {
    const { RESULTS_EP } = await import('../../shared/types/resultsV1')
    const r = RESULTS_EP[ep].response.safeParse(body)
    if (!r.success) console.error('[results] תגובה אינה עומדת בחוזה', ep, path, r.error.issues.slice(0, 3))
  }
  if (!body || body.data === undefined) throw new ResultsError(500, '')
  return body.data
}

/* מחרוזת שאילתה לרשימה: העדשה של האורח (apiQs) + מצב "כל השיעורים בכיתה שלי" + "שיעורים ישנים יותר" */
export function listQuery(apiQs: string, view: 'mine' | 'class', older: boolean): string {
  const p = new URLSearchParams(apiQs.replace(/^\?/, ''))
  if (view === 'class') p.set('view', 'class')
  if (older) p.set('older', '1')
  const s = p.toString()
  return s ? `?${s}` : ''
}

export interface ResultsState<T> { data: T | null; error: ResultsError | null; loading: boolean; reload: () => void }

/* טעינה לפי נתיב. "בטעינה" נגזר מכך שהתוצאה האחרונה שייכת למפתח אחר (בלי setState סינכרוני ב-effect).
   path=null → לא טוענים, והנתונים האחרונים נשארים (למשל נתוני הכיתה בזמן שמוצג מצב "לפי תלמיד").
   הנתונים הקודמים נשארים מוצגים בזמן טעינה של נתיב חדש (בלי הבהוב), ותשובות ישנות מתבטלות.
   scope: מי שרואה את הנתונים (העדשה של האורח). כשה-scope מתחלף, הנתונים הקודמים לא מוצגים — רשימה של "מחנך/ת" לא נשארת על המסך
   בזמן שנטענת הרשימה של "מורה מקצועי/ת". */
export function useResultsData<T>(ep: ResultsEndpointName, path: string | null, scope = ''): ResultsState<T> {
  const [tick, setTick] = useState(0)
  const key = path === null ? null : `${path}#${tick}`
  const [res, setRes] = useState<{ key: string | null; scope: string; data: T | null; error: ResultsError | null }>({ key: null, scope, data: null, error: null })
  const reload = useCallback(() => setTick((t) => t + 1), [])
  useEffect(() => {
    if (key === null || path === null) return
    let cancelled = false
    resultsGet<T>(ep, path)
      .then((data) => { if (!cancelled) setRes({ key, scope, data, error: null }) })
      .catch((e: unknown) => { if (!cancelled) setRes({ key, scope, data: null, error: e instanceof ResultsError ? e : new ResultsError(0, '') }) })
    return () => { cancelled = true }
  }, [key, path, ep, scope])
  return { data: res.scope === scope ? res.data : null, error: res.key === key ? res.error : null, loading: key !== null && res.key !== key, reload }
}

/* ── העדשה של מורה האורח ── */
const isGuestLens = (v: string | null): v is GuestLens => v !== null && (GUEST_LENSES as readonly string[]).includes(v)

/* העדשה שבכתובת (lens + subject), או null כשאין בה עדשה תקפה */
function lensInUrl(sp: URLSearchParams): GuestLensState | null {
  const lens = sp.get('lens')
  return isGuestLens(lens) ? { lens, subject: sp.get('subject') || null } : null
}

export interface LensContext {
  /** האם הצופה הוא מורה אורח (רק לו יש בורר עדשות) */
  isGuest: boolean
  /** העדשה הפעילה של האורח; null = עוד לא נבחרה (השרת בוחר ברירת מחדל: מחנך/ת) או שהצופה אינו אורח */
  state: GuestLensState | null
  /** מזהה יציב של העדשה — משמש לאיפוס הנתונים כשהעדשה מתחלפת */
  scope: string
  /** מחרוזת שאילתה לקריאות API: "?lens=…&subject=…" לאורח, "" לכל משתמש אחר */
  apiQs: string
  /** קישור פנימי שנושא את העדשה (ופרמטרים נוספים) */
  link: (path: string, extra?: Record<string, string>) => string
  /** החלפת עדשה בבורר: חוזרים לרשימה, כי שליחה של עדשה אחת לא בהכרח קיימת/מותרת בעדשה אחרת */
  goLens: (next: GuestLensState) => void
}

export function useLens(): LensContext {
  const [sp] = useSearchParams()
  const navigate = useNavigate()
  const { isGuest } = useStaffAuth()
  const stored = useGuestLens()
  /* הכתובת קודמת; בלעדיה — הבחירה האחרונה (גם מהאנליטיקה). לא-אורח: אין עדשה */
  const state = isGuest ? lensInUrl(sp) ?? stored : null
  const params = guestLensParams(state)
  const qs = new URLSearchParams(params).toString()
  return {
    isGuest,
    state,
    scope: state ? `${state.lens}:${state.subject ?? ''}` : 'default',
    apiQs: qs ? `?${qs}` : '',
    link: (path, extra) => {
      const p = new URLSearchParams(params)
      for (const [k, v] of Object.entries(extra ?? {})) if (v) p.set(k, v)
      const s = p.toString()
      return s ? `${path}?${s}` : path
    },
    goLens: (next) => { void navigate(`/results?${new URLSearchParams(lensToParams(next.lens, next.subject)).toString()}`) },
  }
}

/* עדשה שנטענה מהכתובת נכתבת למאגר המשותף (sessionStorage), כך שהיא שורדת מעבר לטאב האנליטיקה ובחזרה.
   המקצוע השמור נשמר גם כשהעדשה אינה "מורה מקצועי/ת" — כדי שחזרה אליה תחזיר לאותו מקצוע. נקרא פעם אחת, מ-index. */
export function useLensSync(): void {
  const [sp] = useSearchParams()
  const { isGuest } = useStaffAuth()
  const lens = sp.get('lens')
  const subject = sp.get('subject')
  useEffect(() => {
    if (!isGuest || !isGuestLens(lens)) return
    writeGuestLens({ lens, subject: lens === 'subject_teacher' ? subject || null : readGuestLens()?.subject ?? null })
  }, [isGuest, lens, subject])
}
