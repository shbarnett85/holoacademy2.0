import { useCallback, useEffect, useRef, useState } from 'react'
import {
  startSession, completeSession, retryPendingComplete,
  saveResumeLocal, loadResumeLocal, clearResumeLocal,
  type SessionStart, type CompletePayload,
} from './sessionTracker'
import type { CollectableItem, GameAnalytics } from './useGameEngine'

export interface InitialState {
  currentSceneId: string
  inventory: CollectableItem[]
  visitedScenes: string[]
}

interface ResumeState {
  currentSceneId: string
  inventory: unknown[]
  visitedScenes: unknown[]
  crystals: number
}

interface PlaySession {
  sessionId: string | null
  initialState?: InitialState
  /* settled=true ברגע שניסיון יצירת/שחזור ה-session הסתיים (בהצלחה או בכישלון) */
  settled: boolean
  /* שמירת מצב ביניים ל-resume — מקומי בלבד (sessionStorage), ללא קריאת רשת */
  saveResume: (s: ResumeState) => void
  /* שליחה מרוכזת אחת בסיום — רקעית, לא חוסמת את מסך הסיכום */
  complete: (analytics: GameAnalytics, totalScore: number, crystalsFull: number) => void
}

/* מחזור חיי ה-session במודל המרוכז:
   - בתחילה: start (sessionId + resume). אין תיעוד events שוטף ואין קריאות רשת במהלך המשחק.
   - resume נשמר מקומית ב-sessionStorage; השרת אינו מתעדכן תוך כדי משחק.
   - בסיום: complete יחיד עם סיכום האנליטיקה (רקעי, best-effort, retry בטעינה הבאה). */
export function usePlaySession(questId: string | undefined): PlaySession {
  const [state, setState] = useState<{ sessionId: string | null; initialState?: InitialState; settled: boolean }>({
    sessionId: null,
    settled: false,
  })
  const sessionIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!questId) return
    let cancelled = false

    /* ניסיון חוזר לשליחת אנליטיקה של משחק קודם שהושלם אך השליחה נכשלה */
    void retryPendingComplete()

    startSession(questId).then((s: SessionStart | null) => {
      if (cancelled) return
      if (!s) {
        setState({ sessionId: null, settled: true })
        return
      }
      sessionIdRef.current = s.sessionId
      /* resume — מעדיפים את ה-snapshot המקומי; אם אין, נופלים ל-snapshot מהשרת (אם קיים) */
      const local = loadResumeLocal(questId, s.sessionId)
      const snap = local ?? (s.resumed && s.currentSceneId
        ? { currentSceneId: s.currentSceneId, inventory: s.inventory, visitedScenes: s.visitedScenes, crystals: s.crystals }
        : null)
      const initialState: InitialState | undefined = snap?.currentSceneId
        ? {
            currentSceneId: snap.currentSceneId,
            inventory: (snap.inventory as CollectableItem[]) ?? [],
            visitedScenes: (snap.visitedScenes as string[]) ?? [],
          }
        : undefined
      setState({ sessionId: s.sessionId, initialState, settled: true })
    })

    return () => { cancelled = true }
  }, [questId])

  const saveResume = useCallback((s: ResumeState) => {
    if (!questId || !sessionIdRef.current) return
    saveResumeLocal(questId, { sessionId: sessionIdRef.current, ...s })
  }, [questId])

  const complete = useCallback((analytics: GameAnalytics, totalScore: number, crystalsFull: number) => {
    const sid = sessionIdRef.current
    if (!sid) return
    const payload: CompletePayload = {
      totalScore,
      crystalsFull,
      summary: { ...analytics.summary, crystalsEarned: crystalsFull, completed: true },
      challenges: analytics.challenges,
      sceneTimes: analytics.sceneTimes,
    }
    /* רקעי — לא ממתינים, לא חוסם את מסך הסיכום */
    void completeSession(sid, payload)
    if (questId) clearResumeLocal(questId)
  }, [questId])

  return { ...state, saveResume, complete }
}
