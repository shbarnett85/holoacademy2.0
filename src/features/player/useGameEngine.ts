import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChallengeRecord, SceneTime, AnalyticsSummary } from './sessionTracker'

/* סוגי האירועים הנאספים מקומית (תואם enum event_type בשרת) */
type LocalEventType =
  | 'scene_enter' | 'scene_exit' | 'choice_made' | 'puzzle_attempt'
  | 'puzzle_solved' | 'puzzle_failed' | 'item_collected' | 'item_used'
  | 'item_used_wrong' | 'session_completed'

interface LocalEvent {
  type: LocalEventType
  sceneId: string | null
  payload: Record<string, unknown> & { clientTs: number }
}

export interface EngineInitialState {
  currentSceneId: string
  inventory: CollectableItem[]
  visitedScenes: string[]
}

export interface EngineOptions {
  initialState?: EngineInitialState
}

/* תוצאת getAnalytics — סיכום מעובד שנשלח פעם אחת בסיום */
export interface GameAnalytics {
  summary: Omit<AnalyticsSummary, 'crystalsEarned' | 'completed'>
  challenges: ChallengeRecord[]
  sceneTimes: SceneTime[]
}

export interface CollectableItem {
  id: string
  name: string
  icon: string
  imageUrl?: string
}

export interface NavChoice {
  id: string
  text: string
  nextSceneId?: string | null
  requiredItemIds?: string[]
  unlockText?: string
}

/* שאלה בודדת במבחן הסיכום */
export interface QuizQuestion {
  question: string
  options: string[]
  correctIndex: number
  explanationCorrect?: string
  explanationIncorrect?: string
}

/* אתגר בסצנה — שדות משותפים + שדות ייעודיים לכל סוג */
export interface Puzzle {
  type?: string
  question: string
  /* multipleChoice / trueFalse */
  choices?: { id: string; text: string; isCorrect: boolean }[]
  points?: number
  explanationCorrect?: string
  explanationIncorrect?: string
  /* tileSwap — גודל הרשת (2/3/4); משתמש בתמונת הסצנה */
  gridSize?: number
  /* wordSearch — מילים מוסתרות בעברית */
  words?: string[]
  /* memory — זוגות להתאמה (מושג↔הגדרה) */
  pairs?: { a: string; b: string }[]
  /* wordCompletion — משפט עם ___ , התשובה/ות, ובנק מילים אופציונלי */
  sentence?: string
  answer?: string
  answers?: string[]
  wordBank?: string[]
  /* hangman — answer (המילה לניחוש) + מספר טעויות מותר */
  maxWrong?: number
  /* moralDilemma — דילמה ערכית ללא תשובה נכונה; כל בחירה עם ההשלכה שלה */
  situation?: string
  moralChoices?: { text: string; consequence: string }[]
  /* רמת הקושי (1-10) שהוזרקה בעת היצירה — לחישוב פרמטרי תצוגה בקליינט */
  difficulty?: number
  /* sequenceOrder — סידור פריטים ברצף הנכון */
  items?: { id: string; text: string; imagePrompt?: string }[]
  correctOrder?: string[]
  orderType?: string
  /* finalQuiz — רצף שאלות סיכום */
  questions?: QuizQuestion[]
}

export interface GameScene {
  id: string
  title: string
  narrative?: string
  imageUrl?: string
  /* הבעת הפנים של ד"ר הולו בסצנה (לשימוש יצירת התמונה בלבד; לא מוצג לתלמיד) */
  drHoloExpression?: string
  drHoloDialog?: string
  puzzle?: Puzzle
  collectableItem?: CollectableItem
  choices?: NavChoice[]
  requiresItemId?: string | null
  unlockText?: string
  nextSceneId?: string | null
}

export interface EndingScene {
  title: string
  narrative: string
  drHoloDialog?: string
  /* תמונת סיום ייעודית (שונה מסצנת הפתיחה) + הבעת הדוקטור התואמת לסוג הסיום */
  imagePrompt?: string
  imageUrl?: string
  drHoloExpression?: string
}

export interface GameData {
  scenes: GameScene[]
  entrySceneId: string
  endingGood?: EndingScene
  endingBad?: EndingScene
  /* רמת קריאה (1-10) שמוזרקת בשרת (יצירה=קושי המורה; וריאציה=רמת התלמיד) — קובעת קצב הקלדה */
  readingScale?: number
}

export const TOTAL_CRYSTALS = 5

export interface ChallengeResult {
  sceneId: string
  sceneTitle: string
  correct: boolean
  /* ציון חלקי 0..1 — 1 לאתגר בינארי שנפתר, יחס נכונות למבחן סיכום */
  score: number
}

/* מנוע המשחק — state ולוגיקת מעברים, חפצים ושערים */
export function useGameEngine(gameData: GameData, options?: EngineOptions) {
  const init = options?.initialState
  /* צבירת אנליטיקה מקומית — אין שום קריאת רשת במהלך המשחק.
     כל event נצבר ב-ref עם חותמת זמן לקוח מדויקת (לחישוב זמני שהייה). */
  const eventsRef = useRef<LocalEvent[]>([])
  const track = useCallback(
    (type: LocalEventType, sceneId?: string | null, payload: Record<string, unknown> = {}) => {
      eventsRef.current.push({ type, sceneId: sceneId ?? null, payload: { ...payload, clientTs: Date.now() } })
    },
    [],
  )

  const [currentSceneId, setCurrentSceneId] = useState(init?.currentSceneId ?? gameData.entrySceneId)
  const [inventory, setInventory] = useState<CollectableItem[]>(init?.inventory ?? [])
  /* תוצאות אתגרים — הבסיס לרסיסים ולקריסטלים */
  const [challengeResults, setChallengeResults] = useState<ChallengeResult[]>([])
  const [shardEvent, setShardEvent] = useState(0) /* טריגר לאנימציית רסיס עף */
  const [visitedScenes, setVisitedScenes] = useState<string[]>(init?.visitedScenes ?? [gameData.entrySceneId])
  const [unlockedGates, setUnlockedGates] = useState<Set<string>>(new Set())
  const [solvedPuzzles, setSolvedPuzzles] = useState<Set<string>>(new Set())
  /* ב-resume — סצנות שכבר נאסף מהן חפץ (לפי ה-inventory המשוחזר) מסומנות כנאספו */
  const [collectedScenes, setCollectedScenes] = useState<Set<string>>(() => {
    const s = new Set<string>()
    if (init?.inventory?.length) {
      for (const sc of gameData.scenes) {
        if (sc.collectableItem && init.inventory.some((i) => i.id === sc.collectableItem!.id)) s.add(sc.id)
      }
    }
    return s
  })
  const [message, setMessage] = useState<string | null>(null)
  const [shakeGate, setShakeGate] = useState(false)
  const [gateGlow, setGateGlow] = useState(false)
  const [transitionKey, setTransitionKey] = useState(0)
  /* 'wipe' = מעבר קל בין שקופיות בתוך ההדמיה; 'wormhole' = מעבר "גדול" בקצוות
     (כניסה/יציאה מההדמיה וממעבדת ד"ר הולו = סצנת הכניסה). */
  const [transitionType, setTransitionType] = useState<'wipe' | 'wormhole'>('wipe')
  const [transitionDir, setTransitionDir] = useState<'forward' | 'back'>('forward')
  const [justCollected, setJustCollected] = useState<CollectableItem | null>(null)
  const [finished, setFinished] = useState(false)
  /* בועת פתיחת שער — unlockText מוצג ~2 שניות (או דילוג בלחיצה) ואז מעבר אוטומטי */
  const [unlockBubble, setUnlockBubble] = useState<string | null>(null)

  /* מחסנית סצנות-צומת — לחזרה אחרי שימוש שגוי בחפץ */
  const junctionStack = useRef<string[]>([])
  /* זמן פתיחת האתגר הנוכחי — לחישוב משך הפתרון */
  const puzzleStartRef = useRef<number>(0)
  /* session_completed נשלח פעם אחת בלבד */
  const completedOnceRef = useRef(false)
  /* סצנת ה-Hub האחרונה שביקרנו בה (סצנה עם 2+ בחירות ניווט) */
  const lastHubRef = useRef<string | null>(null)
  const unlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sceneById = useMemo(() => {
    const map = new Map<string, GameScene>()
    for (const s of gameData.scenes) map.set(s.id, s)
    return map
  }, [gameData])

  const scene = sceneById.get(currentSceneId) ?? gameData.scenes[0]
  const nextScene = scene.nextSceneId ? sceneById.get(scene.nextSceneId) : undefined

  /* עדכון ה-Hub האחרון — סצנה עם 2+ בחירות ניווט *פתוחות* נחשבת צומת
     (סצנת מכשול עם בחירה נעולה + חזרה אינה צומת) */
  if ((scene.choices?.filter((c) => !(c.requiredItemIds?.length ?? 0)).length ?? 0) >= 2) {
    lastHubRef.current = scene.id
  }

  /* האם המעבר הבא חסום בשער נעול שטרם נפתח */
  const gateLocked = !!nextScene?.requiresItemId && !unlockedGates.has(nextScene.id)

  /* scene_enter לסצנה הראשונה (כניסה / resume) — פעם אחת */
  const enteredOnceRef = useRef(false)
  useEffect(() => {
    if (enteredOnceRef.current) return
    enteredOnceRef.current = true
    track('scene_enter', currentSceneId, {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const flashMessage = useCallback((text: string) => {
    setMessage(text)
    setTimeout(() => setMessage(null), 3000)
  }, [])

  const itemNameById = useCallback(
    (itemId: string): string => {
      for (const s of gameData.scenes) {
        if (s.collectableItem?.id === itemId) return s.collectableItem.name
      }
      return itemId
    },
    [gameData],
  )

  /* מעבר בפועל לסצנה — point cloud רגיל, או חור תולעת ביציאה מהמעבדה */
  const goToScene = useCallback(
    (sceneId: string) => {
      junctionStack.current.push(currentSceneId)
      track('scene_exit', currentSceneId, {})
      /* כניסה/יציאה ממעבדת ד"ר הולו (סצנת הכניסה) = פורטל; שקופית→שקופית = wipe קל.
         כיוון ה-wipe מודע ל-RTL: קדימה (סצנה חדשה) = ימין←שמאל; חזרה (סצנה שכבר ביקרנו,
         כמו חזרה ל-Hub) = הפוך. */
      const isPortal = currentSceneId === gameData.entrySceneId || sceneId === gameData.entrySceneId
      setTransitionType(isPortal ? 'wormhole' : 'wipe')
      setTransitionDir(visitedScenes.includes(sceneId) ? 'back' : 'forward')
      setTransitionKey((k) => k + 1)
      setTimeout(() => {
        setCurrentSceneId(sceneId)
        setVisitedScenes((v) => (v.includes(sceneId) ? v : [...v, sceneId]))
        track('scene_enter', sceneId, {})
      }, isPortal ? 350 : 165) /* התוכן מתחלף בשיא כיסוי ה-wipe (35%×470ms), ואז הקיר נסוג וחושף את הסצנה החדשה */
    },
    [currentSceneId, gameData.entrySceneId, visitedScenes, track],
  )

  /* סיום ההדמיה — חזרה למעבדה דרך חור תולעת */
  const finishQuest = useCallback(() => {
    if (!completedOnceRef.current) {
      completedOnceRef.current = true
      track('session_completed', currentSceneId, {})
    }
    setTransitionType('wormhole')
    setTransitionKey((k) => k + 1)
    setTimeout(() => setFinished(true), 450)
  }, [track, currentSceneId])

  /* איסוף חפץ מהסצנה הנוכחית (לאחר חידה אם יש) */
  const collectCurrentItem = useCallback(() => {
    const item = scene.collectableItem
    if (!item || collectedScenes.has(scene.id)) return
    setCollectedScenes((prev) => new Set(prev).add(scene.id))
    setInventory((inv) => (inv.some((i) => i.id === item.id) ? inv : [...inv, item]))
    setJustCollected(item)
    track('item_collected', scene.id, { itemId: item.id })
    setTimeout(() => setJustCollected(null), 1200)
  }, [scene, collectedScenes, track])

  /* בחירת ניווט (מבנה Hub) — בחירה נעולה דורשת את כל החפצים ברשימה */
  const chooseChoice = useCallback(
    (choice: NavChoice) => {
      if (!choice.nextSceneId) {
        track('choice_made', currentSceneId, { choiceId: choice.id, blocked: false })
        finishQuest()
        return
      }
      const required = choice.requiredItemIds ?? []
      if (required.length > 0 && !unlockedGates.has(choice.id)) {
        /* בחירה נעולה — הפתיחה רק דרך לחיצה על החפץ ב-HUD */
        track('choice_made', currentSceneId, { choiceId: choice.id, blocked: true })
        const missing = required.filter((id) => !inventory.some((i) => i.id === id))
        flashMessage(
          missing.length > 0
            ? `🔒 השער נעול! חסר לך: ${missing.map(itemNameById).join(', ')}`
            : '🔒 השער נעול — לחצו על החפץ המתאים בתיק למטה',
        )
        setShakeGate(true)
        setTimeout(() => setShakeGate(false), 500)
        return
      }
      track('choice_made', currentSceneId, { choiceId: choice.id, blocked: false })
      /* בחירת סיום: שער נעול שמוביל חזרה למעבדה = סיום ההרפתקה */
      if (choice.nextSceneId === gameData.entrySceneId && required.length > 0) {
        finishQuest()
      } else {
        goToScene(choice.nextSceneId)
      }
    },
    [inventory, unlockedGates, flashMessage, itemNameById, goToScene, finishQuest, gameData.entrySceneId, track, currentSceneId],
  )

  /* ניסיון התקדמות לסצנה הבאה */
  const advance = useCallback(() => {
    if (!scene.nextSceneId) {
      /* חגורת ביטחון: סצנה לינארית מנותקת (אין nextSceneId ואין choices) שאינה האחרונה
         במערך הסצנות — קשר קדימה לסצנה הבאה במקום לסיים בטעות. מגן על הדמיות שבהן ה-AI
         השאיר את סצנת הכניסה/ביניים ללא קישור (הבאג: scene_lab.next=null → דילוג לסיום). */
      const idx = gameData.scenes.findIndex((s) => s.id === scene.id)
      if (idx >= 0 && idx < gameData.scenes.length - 1 && !(scene.choices?.length)) {
        goToScene(gameData.scenes[idx + 1].id)
        return
      }
      finishQuest()
      return
    }
    if (gateLocked && nextScene) {
      const requiredId = nextScene.requiresItemId!
      const hasItem = inventory.some((i) => i.id === requiredId)
      if (hasItem) {
        flashMessage(`🔒 השער נעול — לחצו על ${itemNameById(requiredId)} בתיק כדי לפתוח`)
      } else {
        flashMessage(`🔒 השער נעול! חסר לך: ${itemNameById(requiredId)}`)
      }
      setShakeGate(true)
      setTimeout(() => setShakeGate(false), 500)
      return
    }
    goToScene(scene.nextSceneId)
  }, [scene, gateLocked, nextScene, inventory, flashMessage, itemNameById, goToScene, finishQuest, gameData])

  /* אישור פתיחת השער — נקרא אוטומטית אחרי הבועה או בדילוג */
  const confirmUnlock = useCallback(
    (gateId: string, targetSceneId: string) => {
      if (unlockTimerRef.current) {
        clearTimeout(unlockTimerRef.current)
        unlockTimerRef.current = null
      }
      setUnlockBubble(null)
      setUnlockedGates((prev) => new Set(prev).add(gateId))
      setGateGlow(false)
      /* אם השער מוביל חזרה למעבדה (entrySceneId) — זה סיום ההרפתקה */
      if (targetSceneId === gameData.entrySceneId) {
        finishQuest()
      } else {
        goToScene(targetSceneId)
      }
    },
    [goToScene, finishQuest, gameData.entrySceneId],
  )

  /* פרטי הפתיחה הממתינה — לדילוג בלחיצה על הבועה */
  const pendingUnlockRef = useRef<{ gateId: string; targetSceneId: string } | null>(null)

  const skipUnlock = useCallback(() => {
    const pending = pendingUnlockRef.current
    if (pending) {
      pendingUnlockRef.current = null
      confirmUnlock(pending.gateId, pending.targetSceneId)
    }
  }, [confirmUnlock])

  /*
   * שימוש בחפץ מה-HUD — הלחיצה היא הפעולה עצמה, ללא שלב ביניים:
   * נכון  → בועת unlockText (~2 שניות / דילוג) → מעבר אוטומטי
   * שגוי  → הודעת כישלון + shake → חזרה אוטומטית ל-Hub האחרון
   * אין שער → רק שם החפץ, ללא עונש
   */
  const useItem = useCallback(
    (itemId: string) => {
      /* אבטחה — מוודאים שהחפץ באמת ב-inventory */
      const item = inventory.find((i) => i.id === itemId)
      if (!item) return
      if (unlockBubble) return /* פתיחה כבר בתהליך */

      /* איתור השער הנעול בסצנה: לינארי (nextScene) או בחירת Hub נעולה */
      let gateId: string | null = null
      let targetSceneId: string | null = null
      let requiredIds: string[] = []
      let unlockText: string | undefined

      if (nextScene?.requiresItemId && !unlockedGates.has(nextScene.id)) {
        gateId = nextScene.id
        targetSceneId = nextScene.id
        requiredIds = [nextScene.requiresItemId]
        unlockText = nextScene.unlockText
      } else {
        const lockedChoice = scene.choices?.find(
          (c) => (c.requiredItemIds?.length ?? 0) > 0 && !unlockedGates.has(c.id),
        )
        if (lockedChoice?.nextSceneId) {
          gateId = lockedChoice.id
          targetSceneId = lockedChoice.nextSceneId
          requiredIds = lockedChoice.requiredItemIds!
          unlockText = lockedChoice.unlockText
        }
      }

      /* אין שער נעול — רק הצגת שם החפץ */
      if (!gateId || !targetSceneId) {
        flashMessage(`${item.icon} ${item.name}`)
        return
      }

      if (requiredIds.includes(itemId)) {
        /* החפץ נדרש לשער — בדיקה שכל שאר המפתחות כבר נאספו */
        const missing = requiredIds.filter(
          (id) => id !== itemId && !inventory.some((i) => i.id === id),
        )
        if (missing.length > 0) {
          flashMessage(`${item.icon} מתאים! אבל עדיין חסר: ${missing.map(itemNameById).join(', ')}`)
          setShakeGate(true)
          setTimeout(() => setShakeGate(false), 500)
          return
        }
        /* פתיחה: בועת unlockText → מעבר אוטומטי */
        track('item_used', currentSceneId, { itemId, sceneId: gateId })
        const text = unlockText ?? `${item.name} פתח את השער!`
        setGateGlow(true)
        setUnlockBubble(text)
        pendingUnlockRef.current = { gateId, targetSceneId }
        unlockTimerRef.current = setTimeout(() => {
          pendingUnlockRef.current = null
          confirmUnlock(gateId!, targetSceneId!)
        }, 2000)
      } else {
        /* חפץ שגוי — כישלון + חזרה אוטומטית ל-Hub האחרון */
        track('item_used_wrong', currentSceneId, { itemId, sceneId: gateId })
        flashMessage(`${item.icon} ${item.name} לא עוזר כאן… אולי משהו אחר?`)
        setShakeGate(true)
        setTimeout(() => setShakeGate(false), 500)
        const backTo = lastHubRef.current
        if (backTo && backTo !== currentSceneId) {
          setTimeout(() => goToScene(backTo), 1500)
        }
      }
    },
    [
      inventory, unlockBubble, nextScene, unlockedGates, scene, currentSceneId,
      flashMessage, itemNameById, goToScene, confirmUnlock, track,
    ],
  )

  /* פתרון אתגר — תשובה שגויה = הרסיסים אבודים (אין retry באותו אתגר).
     score אופציונלי לאתגרים עם ציון חלקי (מבחן סיכום); ברירת מחדל בינארית. */
  const solvePuzzle = useCallback(
    (correct: boolean, score?: number) => {
      if (!scene.puzzle || solvedPuzzles.has(scene.id)) return
      const finalScore = score ?? (correct ? 1 : 0)
      setSolvedPuzzles((prev) => new Set(prev).add(scene.id))
      setChallengeResults((prev) => [
        ...prev,
        { sceneId: scene.id, sceneTitle: scene.title, correct, score: finalScore },
      ])
      if (finalScore > 0) setShardEvent((n) => n + 1)
      /* תיעוד: זמן פתרון מאז פתיחת האתגר, רסיסים שהוענקו (0..1), ניסיון יחיד (אין retry) */
      const durationMs = puzzleStartRef.current ? Date.now() - puzzleStartRef.current : null
      track(correct ? 'puzzle_solved' : 'puzzle_failed', scene.id, {
        puzzleType: scene.puzzle.type ?? 'multipleChoice',
        difficulty: scene.puzzle.difficulty ?? null,
        attempts: 1,
        durationMs,
        score: finalScore,
        shardsAwarded: finalScore,
      })
      puzzleStartRef.current = 0
    },
    [scene, solvedPuzzles, track],
  )

  /* תיעוד תחילת ניסיון פתרון — נקרא בעת פתיחת מודאל האתגר */
  const trackPuzzleAttempt = useCallback(() => {
    if (!scene.puzzle) return
    puzzleStartRef.current = Date.now()
    track('puzzle_attempt', scene.id, {
      puzzleType: scene.puzzle.type ?? 'multipleChoice',
      difficulty: scene.puzzle.difficulty ?? null,
    })
  }, [scene, track])

  /* ── חישוב קריסטלים: סך האתגרים מתחלק ל-5 קריסטלים לפי משקל ──
     מבחן סיכום (finalQuiz) שוקל קריסטל שלם אחד; שאר האתגרים חולקים את היתר. */
  const challengeWeights = useMemo(() => {
    const map = new Map<string, number>()
    const challengeScenes = gameData.scenes.filter((s) => s.puzzle)
    const regularCount = challengeScenes.filter((s) => s.puzzle!.type !== 'finalQuiz').length
    for (const s of challengeScenes) {
      /* finalQuiz = משקל שמקנה לו בדיוק קריסטל אחד מתוך 5 (1/5 מהמשקל הכולל).
         אם הוא האתגר היחיד — משקל 1 (כל ה-5 הקריסטלים). */
      const weight =
        s.puzzle!.type === 'finalQuiz' ? (regularCount > 0 ? regularCount / 4 : 1) : 1
      map.set(s.id, weight)
    }
    return map
  }, [gameData])

  const totalWeight = useMemo(
    () => [...challengeWeights.values()].reduce((a, b) => a + b, 0),
    [challengeWeights],
  )
  const earnedWeight = challengeResults.reduce(
    (a, r) => a + (challengeWeights.get(r.sceneId) ?? 0) * r.score,
    0,
  )
  const totalChallenges = challengeWeights.size
  /* התקדמות כוללת 0..1 — הקריסטלים מתמלאים ברצף */
  const crystalProgress = totalWeight > 0 ? earnedWeight / totalWeight : 0
  const crystalsFull = Math.floor(crystalProgress * TOTAL_CRYSTALS + 1e-9)

  /* בניית סיכום האנליטיקה מהאירועים הנצברים — נקרא פעם אחת בסיום, ללא רשת */
  const getAnalytics = useCallback((): GameAnalytics => {
    const events = eventsRef.current
    const ts = (e: LocalEvent) => e.payload.clientTs

    /* תוצאות אתגרים — רשומה תמציתית לכל אתגר */
    const challenges: ChallengeRecord[] = events
      .filter((e) => e.type === 'puzzle_solved' || e.type === 'puzzle_failed')
      .map((e) => ({
        sceneId: e.sceneId ?? '',
        puzzleType: String(e.payload.puzzleType ?? 'multipleChoice'),
        difficulty: (e.payload.difficulty as number | null) ?? null,
        correct: e.type === 'puzzle_solved',
        attempts: Number(e.payload.attempts ?? 1),
        solveTimeMs: (e.payload.durationMs as number | null) ?? null,
        shards: Number(e.payload.shardsAwarded ?? 0),
      }))

    /* זמני שהייה בסצנות — ההפרש בין scene_enter עוקבים (לפי clientTs) */
    const enters = events.filter((e) => e.type === 'scene_enter')
    const lastTs = events.length ? ts(events[events.length - 1]) : 0
    const sceneTimes: SceneTime[] = enters.map((e, i) => {
      const next = enters[i + 1]
      const end = next ? ts(next) : lastTs
      return { sceneId: e.sceneId ?? '', dwellMs: Math.max(0, end - ts(e)) }
    })

    const totalChallenges = challenges.length
    const correctChallenges = challenges.filter((c) => c.correct).length
    const successRate = totalChallenges > 0 ? correctChallenges / totalChallenges : 0
    const avgSceneMs = sceneTimes.length > 0 ? Math.round(sceneTimes.reduce((a, s) => a + s.dwellMs, 0) / sceneTimes.length) : 0
    const durationMs = events.length > 1 ? lastTs - ts(events[0]) : 0

    return {
      summary: { totalChallenges, correctChallenges, successRate, avgSceneMs, scenesVisited: visitedScenes.length, durationMs },
      challenges,
      sceneTimes,
    }
  }, [visitedScenes])

  /* אתחול session — "צא למסע שוב" */
  const restart = useCallback(() => {
    setCurrentSceneId(gameData.entrySceneId)
    setInventory([])
    setChallengeResults([])
    setShardEvent(0)
    setVisitedScenes([gameData.entrySceneId])
    setUnlockedGates(new Set())
    setSolvedPuzzles(new Set())
    setCollectedScenes(new Set())
    setMessage(null)
    setUnlockBubble(null)
    setFinished(false)
    setTransitionType('wipe')
    junctionStack.current = []
    lastHubRef.current = null
    pendingUnlockRef.current = null
    completedOnceRef.current = false
    puzzleStartRef.current = 0
    eventsRef.current = []
    enteredOnceRef.current = false
  }, [gameData.entrySceneId])

  const puzzleSolved = solvedPuzzles.has(scene.id)
  /* חפץ ללא חידה נאסף אוטומטית; עם חידה — רק אחרי פתרון */
  const canCollect = !!scene.collectableItem && !collectedScenes.has(scene.id) && (!scene.puzzle || puzzleSolved)

  return {
    scene,
    inventory,
    challengeResults,
    totalChallenges,
    crystalProgress,
    crystalsFull,
    shardEvent,
    visitedScenes,
    message,
    shakeGate,
    gateGlow,
    transitionKey,
    transitionType,
    transitionDir,
    justCollected,
    finished,
    gateLocked,
    puzzleSolved,
    canCollect,
    unlockBubble,
    advance,
    chooseChoice,
    useItem,
    skipUnlock,
    solvePuzzle,
    trackPuzzleAttempt,
    getAnalytics,
    collectCurrentItem,
    restart,
  }
}
