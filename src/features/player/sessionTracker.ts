/* תיעוד אנליטיקה — מודל מרוכז: אין שום קריאת רשת לתיעוד במהלך המשחק.
   start (בתחילה, לקבלת sessionId + resume) ו-complete (בסיום, שליחה אחת מרוכזת).
   הכל best-effort ולא חוסם את חווית המשחק; כשל בסיום נשמר ב-sessionStorage ומנוסה שוב. */

export interface ChallengeRecord {
  sceneId: string
  puzzleType: string
  difficulty: number | null
  correct: boolean
  attempts: number
  solveTimeMs: number | null
  shards: number
}

export interface SceneTime {
  sceneId: string
  dwellMs: number
}

export interface AnalyticsSummary {
  totalChallenges: number
  correctChallenges: number
  successRate: number /* 0..1 */
  avgSceneMs: number
  scenesVisited: number
  crystalsEarned: number
  completed: boolean
  durationMs: number
}

/* האובייקט התמציתי שנשלח פעם אחת ב-complete */
export interface CompletePayload {
  totalScore: number
  crystalsFull: number
  summary: AnalyticsSummary
  challenges: ChallengeRecord[]
  sceneTimes: SceneTime[]
}

export interface SessionStart {
  sessionId: string
  resumed: boolean
  currentSceneId: string | null
  inventory: unknown[]
  visitedScenes: unknown[]
  crystals: number
}

const API = '/api/sessions'
const PENDING_KEY = 'holo_pending_complete'

function authFetch(path: string, opts: RequestInit = {}) {
  const token = sessionStorage.getItem('holo_token')
  return fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  })
}

/* יצירה/resume של session בתחילת המשחק. null אם אין token או שהקריאה נכשלה (המשחק ימשיך ללא תיעוד). */
export async function startSession(questId: string, assignmentId?: string): Promise<SessionStart | null> {
  if (!sessionStorage.getItem('holo_token')) return null
  try {
    const res = await authFetch(`${API}/start`, {
      method: 'POST',
      body: JSON.stringify({ questId, ...(assignmentId ? { assignmentId } : {}) }),
    })
    if (!res.ok) return null
    return (await res.json()) as SessionStart
  } catch {
    return null
  }
}

/* שליחה מרוכזת אחת בסיום. כשל → שמירה ב-sessionStorage ל-retry. מחזיר האם הצליח. */
export async function completeSession(sessionId: string, payload: CompletePayload): Promise<boolean> {
  try {
    const res = await authFetch(`${API}/${sessionId}/complete`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(String(res.status))
    clearPending(sessionId)
    return true
  } catch {
    /* לא מאבדים אנליטיקה של משחק שהושלם — נשמר ל-retry בכניסה הבאה */
    savePending(sessionId, payload)
    return false
  }
}

function savePending(sessionId: string, payload: CompletePayload) {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ sessionId, payload }))
  } catch {
    /* אחסון מלא / לא זמין — מתעלמים */
  }
}

function clearPending(sessionId: string) {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY)
    if (raw && (JSON.parse(raw) as { sessionId?: string }).sessionId === sessionId) {
      sessionStorage.removeItem(PENDING_KEY)
    }
  } catch {
    /* ignore */
  }
}

/* ניסיון חוזר לשליחת אנליטיקה של משחק שהושלם אך השליחה נכשלה — נקרא בטעינת הדף. */
export async function retryPendingComplete(): Promise<void> {
  let pending: { sessionId: string; payload: CompletePayload } | null = null
  try {
    const raw = sessionStorage.getItem(PENDING_KEY)
    if (raw) pending = JSON.parse(raw) as { sessionId: string; payload: CompletePayload }
  } catch {
    return
  }
  if (!pending?.sessionId) return
  await completeSession(pending.sessionId, pending.payload)
}

/* ── resume מקומי (sessionStorage) — ללא קריאת רשת במהלך המשחק ── */

interface LocalResume {
  sessionId: string
  currentSceneId: string
  inventory: unknown[]
  visitedScenes: unknown[]
  crystals: number
}

const resumeKey = (questId: string) => `holo_resume_${questId}`

export function saveResumeLocal(questId: string, state: LocalResume) {
  try {
    sessionStorage.setItem(resumeKey(questId), JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

export function loadResumeLocal(questId: string, sessionId: string): LocalResume | null {
  try {
    const raw = sessionStorage.getItem(resumeKey(questId))
    if (!raw) return null
    const r = JSON.parse(raw) as LocalResume
    /* תקף רק לאותו session שהשרת החזיר */
    return r.sessionId === sessionId ? r : null
  } catch {
    return null
  }
}

export function clearResumeLocal(questId: string) {
  try {
    sessionStorage.removeItem(resumeKey(questId))
  } catch {
    /* ignore */
  }
}
