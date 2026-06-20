/* ניהול ה-session של צוות (מורה/מנהל) — Supabase session ב-localStorage.
   חיצוני ל-React (external store) כדי שכל הקומפוננטות יסונכרנו. */

export type StaffRole = 'teacher' | 'admin' | 'super_admin'

export interface StaffProfile {
  userId: string
  name: string
  role: StaffRole
  schoolId: string | null
  email: string
}

export interface StaffSession {
  access_token: string
  refresh_token: string
  expires_at?: number /* unix seconds */
  staff: StaffProfile
}

const KEY = 'holo_staff_session'

function load(): StaffSession | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as StaffSession
    if (s.expires_at && s.expires_at * 1000 < Date.now()) {
      localStorage.removeItem(KEY)
      return null
    }
    return s
  } catch {
    return null
  }
}

let current: StaffSession | null = load()
const listeners = new Set<() => void>()

export function getSession(): StaffSession | null {
  return current
}

export function setSession(session: StaffSession | null): void {
  current = session
  try {
    if (session) localStorage.setItem(KEY, JSON.stringify(session))
    else localStorage.removeItem(KEY)
  } catch {
    /* localStorage לא זמין — נשמר בזיכרון בלבד */
  }
  for (const l of listeners) l()
}

export function getToken(): string | null {
  const s = current
  if (!s) return null
  if (s.expires_at && s.expires_at * 1000 < Date.now()) return null
  return s.access_token
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
