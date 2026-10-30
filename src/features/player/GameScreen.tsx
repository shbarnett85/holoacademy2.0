import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { trackFunnel } from '../../shared/lib/funnel'
import { GemBar } from './GemBar'
import { ItemSlots } from './ItemSlots'
import TopHUD from './TopHUD'
import PuzzleModal from './PuzzleModal'
import { type Placement } from './stageRouting'
import { useScenePages } from './useScenePages'
import LoadingQuest from './LoadingQuest'
import PortalTransition from './PortalTransition'
import WormholeTransition from './WormholeTransition'
import EndScreen from './EndScreen'
import DrHoloHologram from './DrHoloHologram'
import { GateUnlock, StreakBadge } from './FeelBits'
import { useGameEngine, type GameData, type EngineInitialState, type GameAnalytics } from './useGameEngine'
import type { LiveApi } from './usePlaySession'
import DigitalEntrance from '../../shared/components/DigitalEntrance'
import { GemDefs } from '../../shared/ui/Gem'
import { GEM_TOTAL, effectLevelOf } from '../../shared/lib/gemModel'
import { homePathForRole } from '../../shared/lib/homePath'
import { initSound } from '../../shared/lib/sound'
import { KEN_BURNS_SECONDS, resetFeel, setFeelLevel, setReading, sounds, startFpsProbe } from './gameFeel/engine'

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/* רצף הופעה מדורג (visual-novel): קופסת הטקסט מתחילה DigitalEntrance *מיד* עם עליית
   הסצנה (במקביל) → הקלדה → materialize של הכפתורים. כל הזמנים נגישים כאן לכוונון. */
const PANEL_MAT_MS = 800     /* משך הכניסה הדיגיטלית של קופסת הטקסט (ההקלדה מתחילה אחריו) — תואם ל-DigitalEntrance (~0.8s) */

/* טקסט הסצנה. בזמן קריאה שום דבר לא זז (CLAUDE.md "תחושת משחק: כללים", כלל 1): הטקסט מוצג שלם, בלי הקלדה, בלי סמן ובלי צליל.
   אחרי שהפאנל נכנס (start) מדווחים onDone, וזה מניע את שלב הכפתורים. לחיצה על טקסט מפעילה onAdvance, כשהפעולה היחידה היא "המשך". */
function SceneText({ text, onAdvance, start = true, onDone }: { text: string; onAdvance?: () => void; start?: boolean; onDone?: () => void }) {
  const onDoneRef = useRef(onDone)
  useEffect(() => { onDoneRef.current = onDone })
  useEffect(() => { if (start) onDoneRef.current?.() }, [start, text])
  return (
    <div className="relative cursor-pointer" onClick={() => { if (start) onAdvance?.() }}>
      <p className="text-lg leading-relaxed" style={{ color: 'var(--holo-text)', whiteSpace: 'pre-line', margin: 0 }}>{text}</p>
    </div>
  )
}

interface Props {
  gameData: GameData
  questTitle: string
  /* תיעוד אנליטיקה — מודל מרוכז: צבירה מקומית, שליחה אחת בסיום (best-effort) */
  initialState?: EngineInitialState
  /* שמירת מצב ביניים ל-resume — מקומי בלבד, ללא רשת */
  saveResume?: (s: { currentSceneId: string; inventory: unknown[]; visitedScenes: unknown[]; crystals: number; challengeResults?: unknown[]; telemetry?: unknown }) => void
  /* נקרא פעם אחת בסיום — שולח את סיכום האנליטיקה ברקע. finished=false: יציאה באמצע, לא נספרת כמשחק לגבישים */
  onComplete?: (analytics: GameAnalytics, totalScore: number, crystalsFull: number, finished: boolean) => Promise<void> | void
  /* "שחקו שוב" במסך הסיום: מתחיל משחק חדש (session חדש כשיש) */
  onPlayAgain?: (saved: Promise<void> | null) => void
  questId?: string
  /* יש session של תלמיד/ה: גבישי הכיתה והמסע */
  hasSession?: boolean
  /* עוצמת האפקטים שהמורה בחר/ה לכיתה */
  effectsLevel?: string
  /* "תצוגה חיה" של המורה (פעימה + סוף כל אתגר). undefined = אין session */
  live?: LiveApi
  /* נתיב חזרה בסיום/יציאה (ברירת מחדל: ספריית המורה) */
  backPath?: string
  /* משחק ללא session (מבקר קר / קישור משותף / מקרן) — מסך הסיום מקבל פוטר המרה:
     שיתוף וואטסאפ, עוד הדמיות, ו-CTA למורים. לתלמיד אמיתי (יש session) — ללא שינוי. */
  visitorMode?: boolean
}

/* כפתור העין — תמיד גלוי (עמום); מסתיר/מציג את ה-UI. זהה במסך המשחק ובמסך הסיום */

export default function GameScreen({ gameData, questTitle, initialState, saveResume, onComplete, onPlayAgain, questId, hasSession = false, effectsLevel, live, backPath = '/creator/library', visitorMode = false }: Props) {
  const engine = useGameEngine(gameData, { initialState })
  const navigate = useNavigate()
  /* עוצמת האפקטים של הכיתה, ומדידת ביצועים בשניות הראשונות של השיעור (מחשב חלש יורד אוטומטית לעדין) */
  useEffect(() => {
    setFeelLevel(effectLevelOf(effectsLevel))
    resetFeel()
    startFpsProbe()
  }, [effectsLevel])
  const [puzzleOpen, setPuzzleOpen] = useState(false)
  /* רצף הופעה מדורג: 'panel' (fade-in פאנל) → 'typing' (הקלדה) → 'buttons' (כפתורים).
     ביקור חוזר/reduced-motion → מתחיל מיד ב-'buttons'. skipped → דילוג מיידי לסוף. */
  /* גלילה שנצמדת לנקודת הכתיבה כל עוד ההקלדה רצה */
  const [reveal, setReveal] = useState<'scene' | 'panel' | 'typing' | 'buttons'>(
    () => (engine.transitionDir === 'back' || prefersReducedMotion() ? 'buttons' : 'scene'),
  )
  /* הכפתורים תלויים בהשלמת הטקסט בפועל ולא בשלב ה-reveal (שמאותחל ל-'buttons'
     תחת prefers-reduced-motion). שומרים את **מזהה הסצנה** שבה הטקסט הושלם ולא
     בוליאני: בוליאני נשאר true מהסצנה הקודמת — GameScreen אינו מתמאונט מחדש —
     ולכן הכפתור הבזיק בראש הסצנה החדשה עד שה-effect הספיק לאפס. הגזירה כאן
     סינכרונית, כך שאין פריים ביניים. */
  const [doneSceneId, setDoneSceneId] = useState<string | null>(null)
  /* דילוג הוא **פר-סצנה** (מזהה, לא בוליאני): בוליאני דלף לסצנה הבאה — הדילוג
     מתאפס רק ב-effect שרץ אחרי סיום הפורטל, ובינתיים הסצנה החדשה עלתה עם
     instant=true, ה-Typewriter נולד "גמור", onDone ירה מיד, והכפתור הופיע על
     חלון ריק לפני שההקלדה התחילה. הצמדה ל-scene.id הופכת ערך ישן לחסר-תוקף
     באופן סינכרוני — אותו דפוס שתיקן את doneSceneId. */
  const [skipSceneId, setSkipSceneId] = useState<string | null>(null)
  /* ── רצף הכניסה: "טוען הדמיה" → חור-תולעת → פריים לבן מלא → הסצנה ──
     מסך הטעינה (שהוצג ב-Player בזמן ה-fetch) נשאר כאן כשכבת-על (z 79, מתחת
     לקנבס ולהבזק) עד אמצע הפלטו הלבן של ההבזק (~830ms: delay 720 + עליית 77
     אל תוך פלטו 77). ההסרה מתרחשת כשהמסך כולו לבן — ולכן ההחלפה בלתי-נראית,
     והלבן "נפתח" ישר אל השקופית הראשונה. */
  const [entered, setEntered] = useState(false)
  /* ⚠️ חייב לפני ה-early-return של עמוד הסיכום (engine.finished): hook שמופיע
     אחרי return מותנה מדלג על עצמו ברגע הסיום — "Rendered fewer hooks than
     expected" — וכל ההדמיה קרסה ל-ErrorBoundary בדיוק במעבר לסיכום. */
  /* ── כלל אורך הטקסט לתלמיד: תיבת הטקסט **לעולם לא גוללת**. טקסט שלא נכנס בגובה התיבה (בגודל הגופן
     שנקבע — לא מוקטן) מתחלק לעמודים בגבולות משפט, עם "המשך ›" ו-"1/2". האתגר/הכפתורים מופיעים רק אחרי
     העמוד האחרון. ⚠️ ה-hooks כאן חייבים להיות לפני ה-early-return של עמוד הסיכום (engine.finished). */
  const textAreaRef = useRef<HTMLDivElement | null>(null)
  const curScene = engine.scene
  const sceneText = useMemo(
    () => [curScene.narrative, curScene.drHoloDialog ? `ד״ר הולו אומר: "${curScene.drHoloDialog}"` : null].filter(Boolean).join('\n\n'),
    [curScene.narrative, curScene.drHoloDialog],
  )
  const pages = useScenePages(sceneText, textAreaRef, !!sceneText)
  const [pageState, setPageState] = useState<{ sceneId: string; idx: number }>({ sceneId: curScene.id, idx: 0 })
  const pageIdx = pageState.sceneId === curScene.id ? Math.min(pageState.idx, Math.max(0, pages.length - 1)) : 0
  const lastPage = pageIdx >= pages.length - 1
  const pageKey = `${curScene.id}:${pageIdx}`
  const [donePageKey, setDonePageKey] = useState<string | null>(null)
  const pageDone = donePageKey === pageKey
  const goNextPage = useCallback(() => setPageState({ sceneId: curScene.id, idx: pageIdx + 1 }), [curScene.id, pageIdx])
  /* גובה אזור הפעולות שמור מראש לפי מספר הכפתורים המרבי בסצנה — כך תיבת הטקסט (ומספר העמודים) יציבה גם כשהבחירות מופיעות */
  const actionRows = Math.max(1, (curScene.puzzle ? 1 : 0) + (curScene.collectableItem ? 1 : 0))
  /* טלמטריה: זמן על כל עמוד (נרשם ביציאה מהעמוד/הסצנה/סיום המשחק) */
  const recordPageTime = engine.recordPageTime
  useEffect(() => {
    const enter = performance.now()
    const sid = curScene.id
    const idx = pageIdx
    return () => recordPageTime(sid, idx, performance.now() - enter)
  }, [curScene.id, pageIdx, engine.finished, recordPageTime])
  useEffect(() => {
    /* בלי חור-תולעת בכניסה (reduced-motion מקצר/משטח את ההבזק) — נכנסים מיד */
    if (prefersReducedMotion() || engine.transitionType !== 'wormhole') { setEntered(true); return }
    const t = window.setTimeout(() => setEntered(true), 830)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  /* מצב עין — הסתרת ה-UI כדי לצפות בתמונת הרקע נקייה */
  /* מצב-עין הוסר: הוא נועד לנקות את הממשק מעל תמונה מלוא-מסך. עכשיו התמונה
     חיה במלבן משלה ולא מוסתרת בכלל, ולכן הכפתור איבד את תפקידו. */
  const eyeMode = false
  const preloadedRef = useRef(false)

  const { scene } = engine
  /* האם זו באמת סצנת הסיום? (אין next *וגם* זו הסצנה האחרונה במערך) — אחרת "המשך"
     משקף את חגורת הביטחון שמקשרת סצנה מנותקת לסצנה הבאה במקום לסיים */
  const sceneIdx = gameData.scenes.findIndex((s) => s.id === scene.id)
  const isFinalScene = !scene.nextSceneId && sceneIdx === gameData.scenes.length - 1

  /* הגדלת כל טקסט-המשחק ב-80% — מוסיף קלאס ל-<html> שמגדיל את font-size של ה-root
     (כל מידות המשחק מבוססות rem וגדלות פרופורציונלית). מוסר ביציאה כדי שלא ישפיע על
     שאר האפליקציה (מורה/תלמיד). */
  useEffect(() => {
    document.documentElement.classList.add('holo-playing')
    return () => document.documentElement.classList.remove('holo-playing')
  }, [])

  /* מעבר fade-out→fade-in בין הטקסט לאתגר (החלפה inline): מעמעם את התוכן, מחליף באמצע,
     ומעלה חזרה. ~220ms לכל כיוון. */
  const [contentVisible, setContentVisible] = useState(true)
  const fadeSwap = useCallback((fn: () => void) => {
    setContentVisible(false)
    window.setTimeout(() => { fn(); setContentVisible(true) }, 220)
  }, [])

  /* פתיחת אתגר — מתעדת תחילת ניסיון ואז פותחת את האתגר ב-fade */
  const openPuzzle = useCallback(() => {
    engine.trackPuzzleAttempt()
    fadeSwap(() => setPuzzleOpen(true))
  }, [engine, fadeSwap])

  /* איסוף מפתח — אם הוא התנאי המספיק להתקדמות (פעולה-קדימה יחידה וברורה): אוסף, ואז
     ממתין לסיום אנימציית האיסוף (≈1.1ש') ועובר אוטומטית לסצנה הבאה — בלי לחיצה נוספת.
     • בחירת ניווט יחידה ופתוחה (לא נעולה) → עובר אליה (למשל "חזרו לתחנה המרכזית").
     • סצנה לינארית (nextSceneId, ללא choices/שער) → advance.
     • יותר מבחירה אחת → לא מקדם אוטומטית (התלמיד בוחר). */
  const advancingRef = useRef(false)
  /* מצב "מתקדם": בין לחיצת איסוף/המשך אוטומטי לבין המעבר בפועל — מסתיר את כל כפתורי
     הפעולה/בחירה כדי שלא יהבהבו אחרי איסוף המפתח (canCollect מתאפס → אחרת הבחירות צצות). */
  const [advancing, setAdvancing] = useState(false)
  const collectAndAdvance = useCallback(() => {
    if (advancingRef.current) return /* מניעת לחיצה כפולה → מעבר כפול */
    engine.collectCurrentItem()
    const ch = scene.choices
    const singleOpen = !!ch && ch.length === 1 && !ch[0].requiredItemIds?.length
    const linearNext = (!ch || ch.length === 0) && !!scene.nextSceneId && !engine.gateLocked
    if (!singleOpen && !linearNext) {
      /* אין פעולה-קדימה יחידה — סוגרים את האתגר, הסצנה תציג את הבחירות */
      setPuzzleOpen(false)
      return
    }
    /* מעבר אוטומטי: **משאירים את פאנל האתגר גלוי** במהלך אנימציית האיסוף, כדי שטקסט הסצנה
       לא ייטען-מחדש ויתחיל להיכתב שוב לפני המעבר. סוגרים+מעבירים רק כשהמעבר מתחיל. */
    advancingRef.current = true
    setAdvancing(true) /* מסתיר את כפתורי הבחירה/פעולה עד המעבר לסצנה הבאה */
    window.setTimeout(() => {
      setPuzzleOpen(false)
      if (singleOpen) engine.chooseChoice(ch![0])
      else engine.advance()
    }, 1100)
  }, [engine, scene])

  /* שמירת מצב ביניים ל-resume בכל מעבר סצנה — מקומי בלבד (sessionStorage), ללא רשת */
  const crystalsFull = engine.crystalsFull
  const sceneId = scene.id
  /* נכסי ההולוגרמה: טעינה מראש, כדי שהחלפת הבעה לא תהבהב */
  useEffect(() => { for (const m of ['neutral', 'happy', 'thinking', 'surprised']) new Image().src = `/dr-holo/${m}.webp` }, [])

  /* מעבר הפורטל: הסצנה מתחלפת *מיד* (engine), אז שומרים את תמונת הסצנה היוצאת (prevImg)
     ברגע שה-sceneId משתנה — PortalTransition מנפיש את היוצאת בשלב 1 ואת החדשה (scene.imageUrl)
     בשלב 2. שתיהן יציבות למשך כל האנימציה (אין stale-closure / אותה שקופית פעמיים). */
  const [prevImg, setPrevImg] = useState<string | undefined>(undefined)
  const lastImgRef = useRef<string | undefined>(scene.imageUrl)
  useEffect(() => {
    setPrevImg(lastImgRef.current) /* התמונה שהוצגה ברנדר הקודם = היוצאת */
    lastImgRef.current = scene.imageUrl
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneId])

  /* רצף ההופעה המדורג מתחיל רק בסיום הפורטל (onComplete → bump). revealTick=0 בטעינה
     הראשונה (סצנה ראשונה ללא פורטל) מריץ את הרצף מיד. */
  const [revealTick, setRevealTick] = useState(0)

  /* transitioning=true כל עוד מעבר (פורטל/חור-תולעת) פעיל. בזמן הזה הסצנה החדשה כבר
     הוחלפה במנוע אבל מוסתרת מתחת ל-overlay — מסתירים את פאנל הטקסט כדי שה-Typewriter
     לא יתחיל להקליד (ולהשמיע צליל) במהלך אנימציית המעבר. מתאפס ב-onComplete. */
  const [transitioning, setTransitioning] = useState(false)
  useEffect(() => {
    if (engine.transitionKey > 0) setTransitioning(true)
  }, [engine.transitionKey])
  const onTransitionDone = useCallback(() => { setTransitioning(false); setRevealTick((t) => t + 1) }, [])

  /* preload של קבצי הסאונד בכניסה למשחק (אין lag באירוע הראשון) */
  useEffect(() => { initSound() }, [])

  /* שלב הקריאה: אלמנטים "חיים" עוצרים בזמן קריאת טקסט */
  useEffect(() => { setReading(!puzzleOpen && !engine.finished) }, [puzzleOpen, engine.finished])
  useEffect(() => () => setReading(false), [])

  /* פתיחת שער: מפתח מסתובב, שער נפתח, וצליל */
  useEffect(() => { if (engine.unlockBubble) sounds.gate() }, [engine.unlockBubble])

  useEffect(() => {
    saveResume?.({ currentSceneId: sceneId, inventory: engine.inventory, visitedScenes: engine.visitedScenes, crystals: crystalsFull, challengeResults: engine.challengeResults, telemetry: engine.exportTelemetry() })
    live?.setScene(sceneId)
    advancingRef.current = false /* סצנה חדשה — מאפסים את נעילת המעבר-האוטומטי */
    setAdvancing(false)
    setContentVisible(true) /* סצנה חדשה מתחילה גלויה (לא באמצע fade של החלפת אתגר) */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneId])

  /* רצף ההופעה המדורג — מופעל מ-revealTick (בסיום הפורטל): panel → (אחרי PANEL_MAT_MS) → typing.
     ההקלדה מדווחת onDone → buttons. ביקור חוזר/reduced-motion → מיד buttons.
     ה-timeout מנוקה ב-cleanup (מעבר סצנה לא משאיר טיימר). */
  useEffect(() => {
    setSkipSceneId(null)
    if (engine.transitionDir === 'back' || prefersReducedMotion()) { setReveal('buttons'); return }
    /* revealTick===0 = טעינה ראשונה — ממתינים לסיום מעבר הכניסה (wormhole) שיקדם את revealTick. */
    if (revealTick === 0) { setReveal('scene'); return }
    const hasText = !!(scene.narrative || scene.drHoloDialog)
    /* קופסת הטקסט מתחילה את ה-DigitalEntrance *מיד* עם עליית הסצנה (לא אחרי המתנה) */
    setReveal('panel')
    const timers = [
      window.setTimeout(() => setReveal(hasText ? 'typing' : 'buttons'), PANEL_MAT_MS), /* ואז הקלדה */
    ]
    return () => timers.forEach((t) => window.clearTimeout(t))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealTick])

  /* אין הקלדה, ולכן שלב 'typing' נגמר מיד. חישוב העמודים יכול להתעדכן רגע אחרי שהשלב התחיל (או לחזור מ-2 עמודים ל-1),
     ובלי זה הרצף היה נתקע ושכבת הדילוג הייתה נשארת מעל הכפתורים */
  useEffect(() => {
    if (reveal === 'typing' && lastPage) { setDoneSceneId(scene.id); setReveal('buttons') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal, lastPage, scene.id])

  /* דילוג-בלחיצה: עוצר את הרצף ומציג הכול מיד (skipped→הטקסט מיידי, reveal→buttons) */
  const skipReveal = useCallback(() => { setSkipSceneId(scene.id); setReveal('buttons') }, [scene.id])
  /* כשמדלגים / ביקור חוזר / reduced-motion — בלי אנימציית materialize (הכול מיד) */
  const skipped = skipSceneId === scene.id
  const stageInstant = skipped || engine.transitionDir === 'back' || prefersReducedMotion()

  /* סיום — שליחה מרוכזת אחת של סיכום האנליטיקה (רקעי, פעם אחת) */
  const completedRef = useRef(false)
  /* ההבטחה של השמירה: גבישי הכיתה נטענים אחריה, ו"שחקו שוב" מחכה לה כדי שהמשחק החדש יזוהה כחוזר */
  const [saved, setSaved] = useState<Promise<void> | null>(null)
  useEffect(() => {
    if (!engine.finished || completedRef.current) return
    completedRef.current = true
    const totalScore = engine.challengeResults.filter((r) => r.correct).length
    setSaved(Promise.resolve(onComplete?.(engine.getAnalytics(), totalScore, engine.crystalsFull, true)))
    if (visitorMode) trackFunnel('visitor_finish')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.finished])

  /* יציאה מההדמיה (כפתור X באמצע / "חזרה" במסך הסיום) → בית לפי רול (backPath).
     יציאה באמצע: flush best-effort של האנליטיקה שנאספה עד כה לפני הניווט, פעם אחת.
     (לצוות/מקרן אין session — onComplete הוא no-op, כקיים.) הניווט גם מנקה את ה-resume
     המקומי (דרך complete) כך שכניסה חוזרת מתחילה נקי ולא קופצת לאמצע. */
  /* פונקציה רגילה (לא useCallback) כדי לתפוס את ה-engine העדכני בכל render — לא stale closure */
  function handleExit() {
    if (!completedRef.current) {
      completedRef.current = true
      engine.markSceneExit() /* סגירת הסצנה הנוכחית — שהייה סגורה (טלמטריה) */
      const totalScore = engine.challengeResults.filter((r) => r.correct).length
      void onComplete?.(engine.getAnalytics(), totalScore, engine.crystalsFull, false)
    }
    /* יעד מחושב טרי בזמן היציאה (לא ב-mount) — משקף את session הצוות החי: מורה/מנהל →
       התפריט הראשי שלהם (/creator), super_admin → /admin, תלמיד → /student. backPath הוא
       ברירת-מחדל אם אין session. */
    navigate(homePathForRole() || backPath)
  }

  /* preload כל תמונות הסצנות והחפצים בכניסה למשחק —
     כך המעבר (point cloud) לעולם לא חושף רקע ריק */
  useEffect(() => {
    if (preloadedRef.current) return
    preloadedRef.current = true
    for (const s of gameData.scenes) {
      if (s.imageUrl) new Image().src = s.imageUrl
      if (s.collectableItem?.imageUrl) new Image().src = s.collectableItem.imageUrl
    }
    /* תמונות הסיום — כדי שמסך הסיכום ייפתח מיד */
    if (gameData.endingGood?.imageUrl) new Image().src = gameData.endingGood.imageUrl
    if (gameData.endingBad?.imageUrl) new Image().src = gameData.endingBad.imageUrl
  }, [gameData])

  /* מסך הסיום: סצנת הסיום לפי מצב הסיפור */
  if (engine.finished) {
    return (
      <EndScreen
        gameData={gameData}
        questId={questId}
        questTitle={questTitle}
        results={engine.challengeResults}
        gemPoints={engine.gemPoints}
        gemPossible={engine.gemPossible}
        hasSession={hasSession}
        saved={saved}
        onPlayAgain={() => onPlayAgain?.(saved)}
        onExit={visitorMode ? undefined : handleExit}
        footer={visitorMode ? (
          <>
            <div className="flex justify-center gap-3 flex-wrap">
              <button
                className="holo-button"
                onClick={() => {
                  trackFunnel('cta_whatsapp')
                  const url = window.location.href
                  const text = `🎮 "${questTitle}" — שיעור למידה אינטראקטיבי ב-HoloAcademy. שחקו:\n${url}`
                  navigator.clipboard?.writeText(url).catch(() => {})
                  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
                }}
              >
                שתפו בוואטסאפ 💬
              </button>
              <button className="holo-button" style={{ background: 'transparent', border: '1px solid rgba(0,246,255,0.35)' }} onClick={() => navigate('/')}>
                עוד שיעורים 🎮
              </button>
            </div>
            {/* פוטר המרה למבקרים — הרגע חוו את ה-wow; זו נקודת ההצטרפות הטבעית של מורה */}
            <div className="text-start" style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(255,154,46,.09)', border: '1px solid rgba(255,154,46,.35)', width: '100%' }}>
              <div style={{ fontWeight: 800, fontSize: 14.5, color: '#ffcf7d' }}>מורים — דמיינו הרפתקה כזו על החומר שלכם 🚀</div>
              <div style={{ fontSize: 12.5, opacity: 0.78, marginTop: 4, lineHeight: 1.6 }}>
                מתארים את חומר הלימוד במשפט-שניים, וד״ר הולו בונה שיעור שלם — סצנות, אתגרים ותמונות — תוך דקות.
              </div>
              <button className="holo-button" style={{ marginTop: 10, fontSize: 13.5 }} onClick={() => { trackFunnel('cta_create'); navigate('/staff/login') }}>
                צרו שיעור משלכם — חינם ✨
              </button>
            </div>
          </>
        ) : undefined}
      />
    )
  }

  /* אותו אתגר, שני מקומות אפשריים: פאנל (תשובת טקסט/בחירה) או במה (מניפולציה).
     ראו stageRouting.ts — הניתוב לפי סוג האינטראקציה, לא לפי סוג האתגר. */
  /* כלל אחד, בלי יוצא מן הכלל: **כל** אתגר מופיע במרכז עמוד התמונה — בחירה
     מרובה, דילמה, גרירה, סידור, התאמה, פענוח. התלמיד לומד כלל מרחבי יחיד
     ("אתגרים קורים במרכז") במקום למפות סוג-אתגר למקום. */
  /* סצנה בלי טקסט — אין על מה לחכות; אחרת ממתינים לסיום ההקלדה של **הסצנה הזו** */
  const textDone = !(scene.narrative || scene.drHoloDialog) || doneSceneId === scene.id
  const onStage = puzzleOpen && !!scene.puzzle
  /* האתגר האחרון בשיעור: סצנת השיא (בלי המשך ובלי בחירות), או מבחן הסיכום, או האתגר האחרון במערך */
  const lastPuzzleScene = [...gameData.scenes].reverse().find((s) => s.puzzle)
  const isFinalChallenge = !!scene.puzzle && (scene.puzzle.type === 'finalQuiz' || scene.id === lastPuzzleScene?.id)

  const puzzleEl = (placement: Placement) => (
    <PuzzleModal
      placement={placement}
        puzzle={scene.puzzle!}
        imageUrl={scene.imageUrl}
        onSolve={engine.solvePuzzle}
        onLivePoints={engine.setLivePoints}
        gemsPerPoint={engine.gemPossible > 0 ? GEM_TOTAL / engine.gemPossible : 1}
        isFinalChallenge={isFinalChallenge}
        sceneId={scene.id}
        presentationSeq={engine.getPresentationSeq()}
        onTelemetry={(rec) => {
          engine.recordPresentation(rec)
          /* "תצוגה חיה": סוף אתגר — ויתר/ה גובר; אחרת נכון רק אם כל השורות נכונות */
          if (live) {
            const rows = rec.answers
            const outcome = rows.some((a) => a.outcome === 'gave_up') ? 'gave_up' : rows.some((a) => a.outcome === 'timeout') ? 'timeout' : rows.length === 0 ? (rec.puzzleType === 'moralDilemma' ? 'correct' : 'closed') : rows.every((a) => a.outcome === 'correct') ? 'correct' : rows.some((a) => a.outcome === 'closed') ? 'closed' : 'wrong'
            live.challengeEnd(rec.sceneId, outcome)
          }
        }}
        onLiveProbe={live ? live.setProbe : undefined}
        onClose={() => fadeSwap(() => setPuzzleOpen(false))}
        onContinue={() => {
          const hasItem = !!scene.collectableItem
          const hasChoices = !!scene.choices?.length
          const willAdvance = !hasItem && !hasChoices && !engine.gateLocked
          if (willAdvance) {
            setPuzzleOpen(false)
            engine.advance() /* מעבר סצנה */
          } else fadeSwap(() => setPuzzleOpen(false)) /* חזרה לטקסט באותה סצנה — fade */
        }}
        /* אתגר שמסתיים במפתח: כפתור איסוף ישיר במקום "המשך" — אוסף וסוגר, והסצנה
           ממשיכה לפעולה הבאה (בחירות/המשך) */
        onCollect={engine.canCollect ? collectAndAdvance : undefined}
        collectLabel={scene.collectableItem ? `${scene.collectableItem.icon} אספו את ${scene.collectableItem.name}` : undefined}
      />
  )

  /* כפתורי הבחירה (מבנה Hub) — משותפים לאזור הפעולות (בחירה יחידה) ולבמה (2+ בחירות) */
  const choiceButtons = (scene.choices ?? []).map((c) => {
    const locked =
      !!c.requiredItemIds?.length &&
      c.requiredItemIds.some((id) => !engine.inventory.some((i) => i.id === id))
    return (
      <button
        key={c.id}
        className={`holo-button ${locked && engine.shakeGate ? 'gate-shake' : ''} ${engine.gateGlow ? 'gate-glow' : ''}`}
        style={{
          padding: '0.8rem 1.5rem',
          opacity: locked ? 0.75 : 1,
          ...(locked ? { background: 'rgba(0,60,100,0.5)', border: '1px solid rgba(0,246,255,0.3)' } : {}),
        }}
        onClick={() => engine.chooseChoice(c)}
      >
        {locked ? '🔒 ' : ''}
        {c.text}
      </button>
    )
  })
  /* 2+ בחירות ניווט: מופיעות במרכז עמוד התמונה (כמו אתגרים) רק אחרי העמוד האחרון של הטקסט */
  const choicesOnStage =
    (scene.choices?.length ?? 0) > 1 && lastPage && textDone && reveal === 'buttons' && !advancing && !puzzleOpen &&
    (!scene.puzzle || engine.puzzleSolved) && !engine.canCollect

  return (
    <div className="min-h-dvh holo-scene-root flex flex-col">
      {/* מסך הטעינה נשאר מעל הסצנה עד הפריים הלבן המלא — ראו entered למעלה */}
      {!entered && <LoadingQuest overlay />}
      <GemDefs />
      <StreakBadge />
      <style>{`
        @keyframes gate-shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          50% { transform: translateX(8px); }
          75% { transform: translateX(-6px); }
        }
        .gate-shake { animation: gate-shake 0.45s ease; }
        @keyframes gate-open-glow {
          0% { box-shadow: 0 0 10px rgba(0,246,255,0.4); }
          50% { box-shadow: 0 0 50px rgba(0,246,255,1); }
          100% { box-shadow: 0 0 10px rgba(0,246,255,0.4); }
        }
        .gate-glow { animation: gate-open-glow 0.8s ease; }
        @keyframes scene-fade { from { opacity: 0; } to { opacity: 1; } }
        .scene-fade { animation: scene-fade 0.5s ease; }
        /* Ken Burns — סחיפת זום איטית על תמונת הסצנה החיה: התמונה "נושמת" בין המעברים
           במקום לקפוא. הלוך-ושוב אינסופי; הכיוון מתחלף פר-סצנה (alternate/alternate-reverse). */
        @keyframes holo-kenburns {
          from { transform: scale(1) translate(0, 0); }
          to   { transform: scale(1.07) translate(-1.6%, -1.1%); }
        }
        /* materialize — הופעת פאנל הטקסט: מטשטש→חד + הבזק זוהר הולוגרפי (opacity בלבד,
           ללא scale/translate). הקופסה כבר בגודלה הסופי, ה"דף" מתגבש ואז מתמלא בהקלדה. */
        @keyframes holo-materialize {
          0%   { opacity: 0; filter: blur(14px); box-shadow: 0 0 0 rgba(47,243,255,0); }
          55%  { opacity: 1; filter: blur(0); }
          72%  { box-shadow: 0 0 46px rgba(47,243,255,.6), inset 0 0 26px rgba(47,243,255,.18); }
          100% { opacity: 1; filter: blur(0); }
        }
        .holo-materialize { animation: holo-materialize var(--mat-ms, 480ms) cubic-bezier(.2,.7,.3,1); }
      `}</style>

      {/* אזור הסצנה — תמונת רקע מלאה אם קיימת, אחרת גרדיאנט */}
      <div
        key={scene.id}
        className="scene-fade flex-1 flex flex-col items-center justify-center p-6 gap-6 relative"
        style={{
          zIndex: 1,
          /* התמונה (absolute inset:0) ממלאת את כל ה-viewport; ה-padding התחתון שומר על התוכן
             מעל הפס התחתון (HUD) שמרחף שקוף מעל תחתית התמונה */
          paddingBottom: '1rem', /* אין יותר פס תחתון — הגובה מוחזר לבמה */
          paddingTop: '4rem', /* מרווח מתחת לפס העליון (TopHUD) כדי שהתוכן לא ייחתך */
          background:
            'radial-gradient(ellipse at 30% 20%, rgba(0,136,255,0.15), transparent 60%), radial-gradient(ellipse at 70% 80%, rgba(136,85,255,0.12), transparent 60%), var(--holo-bg)',
        }}
      >
        {/* התמונה עברה אל **עמוד התמונה** (מלבן סגור בתוך הפס) — היא לא
            גולשת יותר מאחורי עמוד הטקסט. ראו .holo-image-page. */}
        {/* רשת נקודות עדינה */}
        <div
          style={{
            position: 'absolute', inset: 0, opacity: eyeMode ? 0 : 0.05, pointerEvents: 'none',
            backgroundImage: 'radial-gradient(circle, var(--holo-cyan) 1px, transparent 1px)',
            backgroundSize: '35px 35px',
            transition: 'opacity 0.5s ease',
          }}
        />

        {/* פס התוכן: פאנל צדדי קבוע + במה מרכזית. שניהם שכבות **מעל** תמונת הרקע
            (שממלאת inset:0), ולכן הרקע נשאר full-bleed ואינו מתכווץ. */}
        <div
          className="holo-scene-band z-10"
          style={{
            opacity: eyeMode ? 0 : 1,
            pointerEvents: eyeMode ? 'none' : 'auto',
            transition: 'opacity 0.45s ease',
          }}
        >
        {/* הפאנל — תמיד באותו צד (התחלה ב-RTL). מתעמעם כשהבמה פעילה כדי שהתלמיד
            ירגיש שהסיפור מושהה, ולא שהוא עבר למסך אחר. */}
        <div
          className="holo-side-panel"
          style={{
            opacity: onStage ? 0.62 : 1,
            filter: onStage ? 'saturate(.85)' : 'none',
            transition: 'opacity .35s ease, filter .35s ease, flex-basis .35s ease',
            ['--actions-rows' as string]: actionRows,
          }}
        >
          {/* כותרת הסצנה עברה לפס העליון (TopHUD) — אין כותרת מרחפת כפולה.
              אזור הטקסט: גובה קבוע, **בלי גלילה**; הטקסט מתחלק לעמודים (useScenePages). הוא נשאר גלוי
              גם כשאתגר פעיל — התלמיד יכול לחזור לקרוא את ההקשר. */}
          <div ref={textAreaRef} className="holo-text-area" style={{ opacity: contentVisible ? 1 : 0, transition: 'opacity 0.22s ease' }}>
          {reveal !== 'scene' && !transitioning && !!sceneText && (
            <DigitalEntrance instant={stageInstant}>
            <div className="holo-panel text-start">
              {/* אין תווית "ד״ר הולו" מעל הטקסט: הנרטיב בגוף שלישי, והדיבור של הדוקטור כבר מסומן
                 בתוך הפרוזה עצמה (ד״ר הולו אומר: "…") — תווית קבועה אכלה גובה. */}
              <SceneText
                key={pageKey}
                text={pages[pageIdx] ?? sceneText}
                /* הכפתורים מופיעים אחרי שהקופסה נכנסה (שלב 'typing') */
                start={reveal === 'typing' || reveal === 'buttons'}
                onDone={() => {
                  setDonePageKey(pageKey)
                  if (lastPage) { setDoneSceneId(scene.id); setReveal('buttons') }
                }}
                /* לחיצה שנייה: עמוד ביניים ← העמוד הבא; עמוד אחרון ← המשך לסצנה הבאה, רק כשהפעולה הזמינה היא
                   "המשך" לינארי (אותו תנאי בדיוק של כפתור המשך/סיום — אין שינוי בלוגיקת המשחק) */
                onAdvance={
                  !lastPage
                    ? goNextPage
                    : (!scene.puzzle || engine.puzzleSolved) && !engine.canCollect && !scene.choices?.length && !engine.gateLocked
                      ? engine.advance
                      : undefined
                }
              />
            </div>
            </DigitalEntrance>
          )}
          {/* הודעות מערכת — מרחפות מעל תחתית אזור הטקסט (לא משנות את הפריסה) */}
          {engine.message && (
            <div
              className="holo-panel mx-auto"
              style={{ position: 'absolute', insetInline: '0.4rem', bottom: '0.3rem', zIndex: 3, padding: '0.5rem 0.9rem', borderColor: 'rgba(255,200,0,0.4)', background: 'rgba(7,13,28,0.94)' }}
            >
              {engine.message}
            </div>
          )}
          </div>

          {/* אזור הפעולות — גובה שמור (לפי מספר הכפתורים המרבי בסצנה) בתחתית החלון, כך שתיבת הטקסט שמעליו
              לא משנה גודל כשהם מופיעים. עמוד ביניים: "המשך ›" + "1/2". אחרי העמוד האחרון: כפתורי הסצנה.
              שער כפול: גם הטקסט הושלם **וגם** רצף החשיפה הגיע לשלב הכפתורים — כך שום נתיב לא מציג כפתור
              לפני שהטקסט נגמר בפועל. */}
          <div className="holo-panel-actions" style={{ opacity: contentVisible ? 1 : 0, transition: 'opacity 0.22s ease' }}>
          {pages.length > 1 && (
            <span className="holo-page-indicator" data-page-indicator aria-label={`עמוד ${pageIdx + 1} מתוך ${pages.length}`}>
              {pageIdx + 1}/{pages.length}
            </span>
          )}
          {!lastPage && pageDone && !advancing && (
            <DigitalEntrance key={`pg-${pageKey}`} instant={stageInstant} delay={0.05} className="flex flex-col items-center gap-3">
              <button className="holo-button text-lg" style={{ padding: '0.8rem 2rem' }} onClick={goNextPage} data-next-page>
                המשך ›
              </button>
            </DigitalEntrance>
          )}
          {lastPage && textDone && reveal === 'buttons' && !advancing && (
          <DigitalEntrance
            key={reveal === 'buttons' ? 'btns-in' : 'btns-wait'}
            instant={stageInstant || reveal !== 'buttons'}
            delay={0.05}
            className="flex flex-col items-center gap-3 w-full"
          >
            {scene.puzzle && !engine.puzzleSolved && (
              <button className="holo-button text-lg" style={{ padding: '0.8rem 2rem' }} onClick={openPuzzle}>
                {scene.puzzle.type === 'finalQuiz' ? 'התחילו את מבחן הסיכום' : 'פתרו את האתגר'}
              </button>
            )}

            {engine.canCollect && (
              <button
                className="holo-button text-lg"
                style={{ padding: '0.8rem 2rem', background: 'linear-gradient(135deg, #6633cc, #0062cc)' }}
                onClick={collectAndAdvance}
              >
                {scene.collectableItem!.icon} אספו את {scene.collectableItem!.name}
              </button>
            )}

            {(!scene.puzzle || engine.puzzleSolved) && !engine.canCollect && (
              scene.choices?.length ? (
                /* בחירת ניווט יחידה — כפתור באזור הפעולות. 2+ בחירות מוצגות על הבמה (ראו choicesOnStage):
                   רשימה אנכית של בחירות לא נכנסת בגובה אזור הפעולות, והגדלתו הייתה גוזלת את גובה הטקסט */
                scene.choices.length === 1 ? <div className="flex flex-col gap-3 w-full max-w-md">{choiceButtons}</div> : null
              ) : engine.gateLocked ? (
                /* שער נעול לינארי — אין כפתור; הלחיצה על החפץ ב-HUD היא הפעולה */
                <div
                  className={`holo-panel ${engine.shakeGate ? 'gate-shake' : ''} ${engine.gateGlow ? 'gate-glow' : ''}`}
                  style={{ padding: '0.8rem 2rem', borderColor: 'rgba(255,200,0,0.35)' }}
                >
                  🔒 השער נעול — השתמשו בחפץ מהתיק
                </div>
              ) : (
                <button
                  className={`holo-button text-lg ${engine.shakeGate ? 'gate-shake' : ''} ${engine.gateGlow ? 'gate-glow' : ''}`}
                  style={{ padding: '0.8rem 2.5rem' }}
                  onClick={() => engine.advance()}
                >
                  {isFinalScene ? 'סיום 🏁' : 'המשך ←'}
                </button>
              )
            )}
          </DigitalEntrance>
          )}
          </div>
        </div>
        {/* הבמה — אחרי הפאנל ב-DOM, כדי שב-RTL הפאנל יישאר תמיד בצד ההתחלה
            (ימין) והבמה במרכז/שמאל. סדר הפוך היה מקפיץ את הפאנל בין הצדדים
            לפי סוג האתגר — בדיוק מה שהעקביות המרחבית באה למנוע. */}
        {/* ── עמוד התמונה: מלבן סגור ── התמונה ממלאת אותו ב-cover (חותכים אם צריך,
            בלי פסים ובלי עיוות), ו-overflow:hidden כולא גם אותה וגם את סחיפת ה-Ken
            Burns וגם את מעבר-הסצנה בתוך המלבן — כך עמוד הטקסט לא מושפע. */}
        <div className="holo-image-page">
          {scene.imageUrl && (
            <div className="holo-image-fill">
              <img
                src={scene.imageUrl}
                alt=""
                style={{
                  position: 'absolute', inset: 0, width: '100%', height: '100%',
                  objectFit: 'cover',
                  /* התמונות נוצרות ב-1280×720 (16:9). cover מתאים את הצלע הצרה וחותך
                     את השנייה, וכמות החיתוך תלויה ביחס המסך: טלפון לרוחב 667×375 הוא
                     16:9 בדיוק → **אפס חיתוך**; 844×390 (19.5:9) חותך 17.9% מהגובה;
                     דסקטופ/טאבלט חותכים 25-29% מהרוחב. המיקוד מוטה מעט למעלה (45%)
                     ולא 50% — בחיתוך אנכי זה שומר על ראשי הדמויות ועל קו הרקיע, שהם
                     מרכז העניין בסצנה, במקום לחתוך אותם באופן סימטרי. */
                  objectPosition: 'center 45%',
                  animation: prefersReducedMotion()
                    ? undefined
                    : `holo-kenburns ${KEN_BURNS_SECONDS}s ease-in-out infinite ${(scene.id.charCodeAt(scene.id.length - 1) % 2 === 1) ? 'alternate-reverse' : 'alternate'}`,
                }}
              />
            </div>
          )}
          {/* ── מעבר סצנה רגיל (פורטל) — כלוא במלבן התמונה ──
              absolute בתוך העמוד; ה-overflow:hidden כולא את ה-crossfade, ועמוד
              הטקסט לא מושפע. חור-התולעת (כניסה/יציאה מהמעבדה) הוא רגע קולנועי
              של המסך כולו ולכן מרונדר בשורש — ראו למטה. */}
          {engine.transitionType !== 'wormhole' && (
            <PortalTransition
              trigger={engine.transitionKey}
              oldImageUrl={prevImg}
              newImageUrl={scene.imageUrl}
              onComplete={onTransitionDone}
            />
          )}

          {/* ד"ר הולו: עותק וירטואלי, ולכן תמיד הולוגרמה. נבנה מקווי סריקה בכניסה לשיעור, ומגיב לתשובות */}
          <div className="holo-dr-holo-spot"><DrHoloHologram build /></div>

          {/* שכבת כהיה **מקומית** למלבן — האתגר קריא, והתמונה נשארת נוכחת מאחוריו */}
          {onStage && <div className="holo-stage-scrim" />}
          {onStage && <div className="holo-stage">{puzzleEl('stage')}</div>}
          {choicesOnStage && <div className="holo-stage-scrim" />}
          {choicesOnStage && (
            <div className="holo-stage" data-choices-stage>
              <div className="holo-panel text-center" style={{ width: '100%', maxWidth: '30rem' }}>
                <div className="holo-stage-instruction">לאן ממשיכים?</div>
                <div className="flex flex-col gap-3 mt-3">{choiceButtons}</div>
              </div>
            </div>
          )}
        </div>
        </div>{/* holo-scene-band */}

        {/* שכבת דילוג שקופה — קיימת רק בזמן הרצף (לא ב-'buttons' ולא אחרי שעמוד ביניים הוקלד), כך שאינה בולעת
            קליקים על הכפתורים אחרי שהופיעו ("המשך ›" כולל). לחיצה/טאץ' מקפיצים לסוף הרצף. */}
        {reveal !== 'buttons' && !puzzleOpen && !(pageDone && !lastPage) && (
          <div
            aria-hidden
            onPointerDown={skipReveal}
            style={{ position: 'absolute', inset: 0, zIndex: 20, cursor: 'pointer' }}
          />
        )}
      </div>

      {/* בועת פתיחת שער — unlockText, לחיצה מדלגת */}
      {engine.unlockBubble && (
        <div
          className="fixed inset-0 flex items-center justify-center p-6 cursor-pointer"
          style={{ background: 'rgba(5,5,18,0.6)', backdropFilter: 'blur(3px)', zIndex: 48 }}
          onClick={() => engine.skipUnlock()}
        >
          <div
            className="holo-panel max-w-md w-full text-center"
            style={{ boxShadow: '0 0 40px rgba(0,246,255,0.7)', borderColor: 'var(--holo-cyan)' }}
          >
            <GateUnlock />
            <p className="text-lg mt-2">{engine.unlockBubble}</p>
            <p className="text-xs mt-3" style={{ opacity: 0.4 }}>לחצו להמשך</p>
          </div>
        </div>
      )}

      {/* כפתור העין במשחק נמצא עכשיו בתוך ה-TopHUD (שורה כחולה עליונה) */}

      {/* מעברים: חור תולעת בקצוות (כניסה/יציאה מהמעבדה); fade-to-black בין שקופיות רגילות */}
      {/* מעבר סצנה: חור-תולעת חלקיקים בכניסה/יציאה מהמעבדה (wormhole), פורטל ניאון בין
          שקופית לשקופית (fade). בסיום כל אחד (onComplete) מתחיל הרצף המדורג (DigitalEntrance). */}
      {/* המעבר עבר אל תוך עמוד התמונה — ראו .holo-image-page */}

      {/* חור-התולעת — מלוא המסך (fixed), מעל שני העמודים וה-HUD */}
      {engine.transitionType === 'wormhole' && (
        <WormholeTransition trigger={engine.transitionKey} onComplete={onTransitionDone} />
      )}

      <TopHUD
        title={scene.title}
        onExit={handleExit}
        hudSlot={<>
          <GemBar value={engine.gemValue} />
          <ItemSlots inventory={engine.inventory} justCollected={engine.justCollected} onUseItem={engine.useItem} />
        </>}
      />

      {/* הפס התחתון בוטל: הגבישים עלו לרצועה העליונה (hudSlot). במצב רוחבי
          במובייל הגובה הוא המשאב הנדיר, ורצועה שנייה גזלה ~50px. */}
    </div>
  )
}
