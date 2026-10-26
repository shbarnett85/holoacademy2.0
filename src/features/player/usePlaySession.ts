import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  startSession, completeSession, retryPendingComplete, reportLive, type LiveReport,
  
  saveResumeLocal, loadResumeLocal, clearResumeLocal,
  type SessionStart, type CompletePayload,
} from './sessionTracker'
import type { CollectableItem, GameAnalytics, ChallengeResult } from './useGameEngine'
import { ANSWER_SCHEMA_VERSION, type TelemetrySnapshot } from '../../shared/lib/answerTelemetry'
import { LIVE_RULES } from '../../shared/lib/analyticsConfig'

export interface InitialState {
  currentSceneId: string
  inventory: CollectableItem[]
  visitedScenes: string[]
  challengeResults?: ChallengeResult[]
  /* טלמטריית תשובות שנשמרה לפני refresh */
  telemetry?: TelemetrySnapshot
}

interface ResumeState {
  currentSceneId: string
  inventory: unknown[]
  visitedScenes: unknown[]
  crystals: number
  /* מילוי הקריסטלים החלקי — נשמר ומשוחזר כדי שלא יתאפס ביציאה-וחזרה */
  challengeResults?: unknown[]
  telemetry?: unknown
}

interface PlaySession {
  sessionId: string | null
  initialState?: InitialState
  /* settled=true ברגע שניסיון יצירת/שחזור ה-session הסתיים (בהצלחה או בכישלון) */
  settled: boolean
  /* וריאציה מותאמת-תלמיד (game_data שכתוב לרמת הקריאה+מגדר+קושי) — null אם אין */
  variantGameData?: unknown
  /* שמירת מצב ביניים ל-resume — מקומי בלבד (sessionStorage), ללא קריאת רשת */
  saveResume: (s: ResumeState) => void
  /* שליחה מרוכזת אחת בסיום — רקעית, לא חוסמת את מסך הסיכום */
  complete: (analytics: GameAnalytics, totalScore: number, crystalsFull: number) => void
  /* "תצוגה חיה" של המורה — undefined כשאין session (מבקר/מקרן/תצוגה מקדימה) */
  live?: LiveApi
}

/* מה ש-GameScreen מדווח: הסצנה הנוכחית, בדיקה חיה של הטעויות ברצף באתגר הפתוח, וסוף כל אתגר */
export interface LiveApi {
  setScene: (sceneId: string) => void
  setProbe: (probe: (() => number) | null) => void
  challengeEnd: (sceneId: string, outcome: NonNullable<LiveReport['outcome']>) => void
}

/* מחזור חיי ה-session במודל המרוכז:
   - בתחילה: start (sessionId + resume). אין תיעוד events שוטף ואין קריאות רשת במהלך המשחק.
   - resume נשמר מקומית ב-sessionStorage; השרת אינו מתעדכן תוך כדי משחק.
   - בסיום: complete יחיד עם סיכום האנליטיקה (רקעי, best-effort, retry בטעינה הבאה). */
export function usePlaySession(questId: string | undefined): PlaySession {
  const [state, setState] = useState<{ sessionId: string | null; initialState?: InitialState; settled: boolean; variantGameData?: unknown }>({
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
            challengeResults: ((snap as { challengeResults?: unknown[] }).challengeResults as ChallengeResult[]) ?? [],
            telemetry: (snap as { telemetry?: TelemetrySnapshot }).telemetry,
          }
        : undefined
      setState({ sessionId: s.sessionId, initialState, settled: true, variantGameData: s.variantGameData ?? undefined })
    })

    return () => { cancelled = true }
  }, [questId])

  /* ── "תצוגה חיה": פעימה כל LIVE_RULES.heartbeatMs + סוף כל אתגר. בלי session — אין כלום ── */
  const liveCtx = useRef<{ sceneId: string | null; probe: (() => number) | null }>({ sceneId: null, probe: null })
  const doneRef = useRef(false)
  const beat = useCallback((event: LiveReport['event'] = 'beat', outcome?: LiveReport['outcome']) => {
    const sid = sessionIdRef.current
    const c = liveCtx.current
    if (!sid || doneRef.current || !c.sceneId) return
    const mistakes = c.probe ? c.probe() : 0
    void reportLive(sid, { sceneId: c.sceneId, inPuzzle: c.probe !== null, mistakes, event, ...(outcome ? { outcome } : {}) })
  }, [])
  useEffect(() => {
    if (!state.sessionId) return
    doneRef.current = false
    const iv = window.setInterval(() => { if (document.visibilityState === 'visible') beat() }, LIVE_RULES.heartbeatMs)
    return () => window.clearInterval(iv)
  }, [state.sessionId, beat])
  const live = useMemo<LiveApi>(() => ({
    setScene: (sceneId) => { const changed = liveCtx.current.sceneId !== sceneId; liveCtx.current.sceneId = sceneId; if (changed) beat() },
    setProbe: (probe) => { liveCtx.current.probe = probe },
    challengeEnd: (sceneId, outcome) => { liveCtx.current.sceneId = sceneId; beat('challenge_end', outcome) },
  }), [beat])

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
      /* 1B — מערכים נפרדים (לא מזינים כיול). clientEventId = session + מזהה מקומי → אידמפוטנטי ב-retry */
      answers: (analytics.answers ?? []).map((a) => ({
        clientEventId: `${sid}:${a.localId}`,
        sceneId: a.sceneId, itemIndex: a.itemIndex, puzzleType: a.puzzleType,
        selectedOptionId: a.selectedOptionId, selectedPosition: a.selectedPosition, correctPosition: a.correctPosition,
        displayedOrder: a.displayedOrder, isCorrect: a.isCorrect, attemptNo: a.attemptNo, responseMs: a.responseMs,
        outcome: a.outcome, interaction: a.interaction as Record<string, unknown> | null,
        ...(a.levelAtPlay != null ? { levelAtPlay: a.levelAtPlay, levelDimension: a.levelDimension ?? a.puzzleType } : {}),
      })),
      moralChoices: analytics.moralChoices ?? [],
      gateEvents: (analytics.gateEvents ?? []).map((g) => ({ type: g.type, sceneId: g.sceneId, payload: g.payload, clientTs: g.clientTs })),
    }
    void ANSWER_SCHEMA_VERSION /* גרסת הסכמה נקבעת בשרת (schema_version) */
    /* הגנה על ה-complete: גוף הבקשה מוגבל (2MB בשרת). אם הטלמטריה גדולה — מורידים קודם את פירוט
       האינטראקציה ואז את השורות, כדי שהכיול והאנליטיקה המסוכמת לעולם לא יאבדו בגללה. */
    try {
      if (JSON.stringify(payload).length > 1_500_000) {
        payload.answers = (payload.answers ?? []).map((a) => ({ ...a, interaction: null }))
        if (JSON.stringify(payload).length > 1_500_000) payload.answers = []
      }
    } catch { payload.answers = [] }
    doneRef.current = true /* אחרי ה-complete אין עוד פעימות (והשרת ממילא מתעלם מסשן שהושלם) */
    /* רקעי — לא ממתינים, לא חוסם את מסך הסיכום */
    void completeSession(sid, payload)
    if (questId) clearResumeLocal(questId)
  }, [questId])

  return { ...state, saveResume, complete, live: state.sessionId ? live : undefined }
}
