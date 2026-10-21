/* קריאות לחוזה analyticsV2. המסכים לא יודעים מי הספק — רק הצורה (src/shared/types/analyticsV2.ts).
   בפיתוח כל תגובה מאומתת מול סכמת ה-zod (נטענת דינמית, כך שהיא לא נכנסת ל-bundle של הפרודקשן). */
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../shared/lib/api'
import { toV2Error, V2Error } from './errors'
import type { Envelope } from '../../shared/types/analyticsV2'

export type V2Params = Record<string, string | undefined>

function qs(params: V2Params): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v)
  const s = p.toString()
  return s ? `?${s}` : ''
}

/* קוד הסטטוס נשמר (V2Error), כדי שההודעה למורה תהיה עברית פשוטה לפי הסטטוס ולא טקסט גולמי מהשרת (errors.ts) */
export async function v2Get<T>(path: string, params: V2Params = {}): Promise<Envelope<T>> {
  let res: Response
  try { res = await apiFetch(`/api/analytics-v2${path}${qs(params)}`) } catch { throw new V2Error(0, '') }
  const body = (await res.json().catch(() => null)) as (Envelope<T> & { error?: string }) | null
  if (!res.ok) throw new V2Error(res.status, body?.error ?? '')
  if (!body || body.data === undefined) throw new V2Error(500, '')
  const env: Envelope<T> = body
  if (import.meta.env.DEV) {
    const { EP } = await import('../../shared/types/analyticsV2')
    const schema = Object.values(EP).find((e) => matches(e.path, path))?.response
    const r = schema?.safeParse(env)
    if (r && !r.success) console.error('[analyticsV2] תגובה אינה עומדת בחוזה', path, r.error.issues.slice(0, 3))
  }
  return env
}

/* '/api/analytics-v2/student/:id' מול '/student/s-1' */
function matches(pattern: string, path: string): boolean {
  const re = new RegExp('^' + pattern.replace('/api/analytics-v2', '').replace(/:[a-zA-Z]+/g, '[^/]+') + '$')
  return re.test(path)
}

export interface V2State<T> { data: T | null; dataState: 'ok' | 'insufficient' | null; loading: boolean; error: V2Error | null; reload: () => void }

/* טעינה לפי נתיב+פרמטרים. "בטעינה" נגזר מכך שהתוצאה האחרונה שייכת למפתח אחר (בלי setState סינכרוני ב-effect);
   הנתונים הקודמים נשארים מוצגים בזמן טעינה של פרמטרים חדשים, ותשובות ישנות מתבטלות. */
export function useV2<T>(path: string | null, params: V2Params = {}): V2State<T> {
  const [tick, setTick] = useState(0)
  const query = qs(params)
  const key = path === null ? null : `${path}${query}#${tick}`
  const [res, setRes] = useState<{ key: string | null; data: T | null; dataState: 'ok' | 'insufficient' | null; error: V2Error | null }>({ key: null, data: null, dataState: null, error: null })
  const reload = useCallback(() => setTick((t) => t + 1), [])
  useEffect(() => {
    if (key === null || path === null) return
    let cancelled = false
    v2Get<T>(path, Object.fromEntries(new URLSearchParams(query)))
      .then((env) => { if (!cancelled) setRes({ key, data: env.data, dataState: env.dataState, error: null }) })
      .catch((e: unknown) => { if (!cancelled) setRes({ key, data: null, dataState: null, error: toV2Error(e) }) })
    return () => { cancelled = true }
  }, [key, path, query])
  return { data: res.data, dataState: res.dataState, loading: key !== null && res.key !== key, error: res.key === key ? res.error : null, reload }
}
