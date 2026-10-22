/* wrapper מרכזי ל-fetch של קריאות הצוות — מצרף אוטומטית את ה-Bearer token.
   על 401 (טוקן פג/לא תקף) מנקה את ה-session כדי שה-ProtectedRoute יפנה להתחברות. */
import { getToken, setSession } from './staffSession'

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken()
  const headers = new Headers(options.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  const res = await fetch(path, { ...options, headers })
  if (res.status === 401) setSession(null)
  return res
}

/* שגיאת API: ההודעה מהשרת + קוד מכונה אופציונלי (למשל EMAIL_NOT_CONFIRMED) שהמסכים יכולים להסתעף לפיו */
export class ApiError extends Error {
  code?: string
  status?: number
  constructor(message: string, code?: string, status?: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

/* מחזיר JSON; זורק ApiError (תת-מחלקה של Error) עם הודעת השרת אם הקריאה נכשלה */
export async function apiJson<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, options)
  const body = (await res.json().catch(() => null)) as { error?: string; code?: string } | null
  if (!res.ok) throw new ApiError(body?.error ?? 'שגיאה בלתי צפויה', body?.code, res.status)
  return body as T
}
