/* קריאות לחוזה resultsV1. המסכים לא יודעים מי הספק (אמיתי / הדגמה) — רק את הצורה (src/shared/types/resultsV1.ts).
   · apiFetch מצרף את הטוקן; כאן נשמר גם קוד הסטטוס (403/404 מקבלים הודעה בעברית פשוטה ולא טקסט טכני).
   · בפיתוח כל תגובה מאומתת מול סכמת ה-zod (נטענת דינמית, כך שהיא לא נכנסת ל-bundle של הפרודקשן).
   · בורר העדשה של מורה האורח (?lens=&subject=) עובר מכתובת העמוד אל הקריאות ואל הקישורים הפנימיים;
     השרת הוא שגוזר את הצופה, והלקוח לא מחליט כלום. */
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiFetch } from '../../shared/lib/api'
import type { ResultsEndpointName } from '../../shared/types/resultsV1'
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

export interface ResultsState<T> { data: T | null; error: ResultsError | null; loading: boolean; reload: () => void }

/* טעינה לפי נתיב. "בטעינה" נגזר מכך שהתוצאה האחרונה שייכת למפתח אחר (בלי setState סינכרוני ב-effect).
   path=null → לא טוענים, והנתונים האחרונים נשארים (למשל נתוני הכיתה בזמן שמוצג מצב "לפי תלמיד").
   הנתונים הקודמים נשארים מוצגים בזמן טעינה של נתיב חדש (בלי הבהוב), ותשובות ישנות מתבטלות. */
export function useResultsData<T>(ep: ResultsEndpointName, path: string | null): ResultsState<T> {
  const [tick, setTick] = useState(0)
  const key = path === null ? null : `${path}#${tick}`
  const [res, setRes] = useState<{ key: string | null; data: T | null; error: ResultsError | null }>({ key: null, data: null, error: null })
  const reload = useCallback(() => setTick((t) => t + 1), [])
  useEffect(() => {
    if (key === null || path === null) return
    let cancelled = false
    resultsGet<T>(ep, path)
      .then((data) => { if (!cancelled) setRes({ key, data, error: null }) })
      .catch((e: unknown) => { if (!cancelled) setRes({ key, data: null, error: e instanceof ResultsError ? e : new ResultsError(0, '') }) })
    return () => { cancelled = true }
  }, [key, path, ep])
  return { data: res.data, error: res.key === key ? res.error : null, loading: key !== null && res.key !== key, reload }
}

/* בורר העדשה של האורח: מועבר כמו שהוא מהכתובת. משתמש רגיל — אין פרמטרים והשרת מתעלם מהם. */
export function useLens(): { apiQs: string; link: (path: string, extra?: Record<string, string>) => string } {
  const [sp] = useSearchParams()
  const lens = sp.get('lens')
  const subject = sp.get('subject')
  const keep = new URLSearchParams()
  if (lens) keep.set('lens', lens)
  if (subject) keep.set('subject', subject)
  const qs = keep.toString()
  return {
    apiQs: qs ? `?${qs}` : '',
    link: (path, extra) => {
      const p = new URLSearchParams(keep)
      for (const [k, v] of Object.entries(extra ?? {})) if (v) p.set(k, v)
      const s = p.toString()
      return s ? `${path}?${s}` : path
    },
  }
}
