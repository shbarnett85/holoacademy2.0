import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { trackFunnel } from '../../shared/lib/funnel'
import { CrystalBar, ItemSlots } from './BottomHUD'
import TopHUD from './TopHUD'
import CrystalGauge from './CrystalGauge'
import PuzzleModal from './PuzzleModal'
import { type Placement } from './stageRouting'
import PortalTransition from './PortalTransition'
import WormholeTransition from './WormholeTransition'
import CrystalFusion from './CrystalFusion'
import CrystalRain from './CrystalRain'
import CrystalCharge from './CrystalCharge'
import { TOTAL_CRYSTALS, useGameEngine, type GameData, type EngineInitialState, type GameAnalytics } from './useGameEngine'
import { typingDelayMs } from '../../shared/lib/difficultyScaling'
import DrHoloEmblem from '../../shared/ui/DrHoloEmblem'
import DigitalEntrance from '../../shared/components/DigitalEntrance'
import { ErrorFlashOverlay } from './challenges/errorFlash'
import { homePathForRole } from '../../shared/lib/homePath'
import { initSound, playSound } from '../../shared/lib/sound'

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/* רצף הופעה מדורג (visual-novel): קופסת הטקסט מתחילה DigitalEntrance *מיד* עם עליית
   הסצנה (במקביל) → הקלדה → materialize של הכפתורים. כל הזמנים נגישים כאן לכוונון. */
const PANEL_MAT_MS = 800     /* משך הכניסה הדיגיטלית של קופסת הטקסט (ההקלדה מתחילה אחריו) — תואם ל-DigitalEntrance (~0.8s) */

/* טקסט נרטיב מוקלד אות-אחר-אות. הקצב נגזר מ-readingScale (1-10): נמוך=איטי, גבוה=מהיר
   (typingDelayMs, עם רצפה/תקרה). לחיצה בזמן ההקלדה משלימה מיד; לחיצה אחרי שהושלם
   מפעילה onAdvance (אם סופק — כשהפעולה היחידה היא "המשך"). reduced-motion → טקסט מיידי. */
function Typewriter({ text, scale, onAdvance, instant, start = true, onDone }: { text: string; scale: number; onAdvance?: () => void; instant?: boolean; start?: boolean; onDone?: () => void }) {
  /* instant=true (ביקור חוזר בשקופית, reduced-motion, או דילוג) → הצגת הטקסט במלואו מיד.
     start=false → ההקלדה ממתינה (בזמן fade-in של הפאנל ברצף המדורג). onDone → סיום הקלדה. */
  const skipAnim = prefersReducedMotion() || !!instant
  const [count, setCount] = useState(() => (skipAnim ? text.length : 0))
  const done = count >= text.length
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  /* caret (נקודת אור) — justSkipped מבדיל בין סיום-בלחיצה (נעלם מיידית, בלי fade)
     לסיום טבעי של ההקלדה (fade-out עדין). caretGone מסיר את הקאret מה-DOM לגמרי
     אחרי שהדעיכה הסתיימה, כדי שלא יישאר רווח קבוע בקצה הטקסט. */
  const [justSkipped, setJustSkipped] = useState(false)
  const [caretGone, setCaretGone] = useState(false)

  useEffect(() => {
    setCount(skipAnim ? text.length : 0)
    setJustSkipped(false)
  }, [text, skipAnim])

  useEffect(() => {
    if (!done) { setCaretGone(false); return }
    if (justSkipped) { setCaretGone(true); return } /* דילוג — נעלם מיידית */
    const t = window.setTimeout(() => setCaretGone(true), 220) /* סיום טבעי — אחרי ה-fade */
    return () => window.clearTimeout(t)
  }, [done, justSkipped])

  useEffect(() => {
    if (done || skipAnim || !start) return
    const delay = typingDelayMs(scale)
    const timer = setInterval(() => setCount((c) => Math.min(c + 1, text.length)), delay)
    return () => clearInterval(timer)
  }, [text, done, skipAnim, scale, start])

  /* צליל הקלדה — מתנגן כל 3 תווים (שלא יהפוך לזמזום בעברית מהירה), מדלג על רווח/שורה.
     לא רץ ב-reduced-motion/instant (skipAnim) ולא בזמן המתנה (start=false). בדילוג count
     קופץ ל-length → התנאי count>=length עוצר מיד את הצלילים (ואין interval סאונד נפרד לנקות). */
  useEffect(() => {
    if (skipAnim || !start) return
    if (count === 0 || count >= text.length) return
    const ch = text[count - 1]
    if (count % 3 === 0 && ch !== ' ' && ch !== '\n' && ch !== ' ') playSound('type')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count])

  /* דיווח סיום ההקלדה (גם כשהטקסט מיידי/ריק) — מניע את שלב הכפתורים ברצף */
  useEffect(() => { if (done) onDoneRef.current?.() }, [done])

  function handleClick() {
    if (!done) { setJustSkipped(true); setCount(text.length) } /* skip — השלמה מיידית, caret נעלם בלי fade */
    else onAdvance?.() /* לחיצה שנייה — המשך לסצנה הבאה (רק כשזו הפעולה הזמינה) */
  }

  /* caret מוצג רק בזמן הקלדה פעילה בפועל (לא ב-instant/reduced-motion, ולא לפני start) */
  const showCaret = !skipAnim && start && !caretGone

  /* הקופסה בגודלה הסופי מההתחלה (כמו דף נייר שמתמלא): טקסט-רפאים מלא וקבוע שומר את
     הגובה/הרוחב, והטקסט המוקלד מוצג מעליו — כך הקופסה לא "גדלה" תוך כדי ההקלדה.
     ה-caret מרונדר *inline* מיד אחרי המחרוזת החלקית (לא במיקום אבסולוטי) — כך הוא
     נגרר טבעית עם קצה הטקסט בזרימת ה-RTL, בלי חישוב מיקום ידני. */
  return (
    <div className="relative cursor-pointer" onClick={handleClick}>
      <p className="text-lg leading-relaxed" aria-hidden style={{ visibility: 'hidden', whiteSpace: 'pre-line', margin: 0 }}>{text}</p>
      <p className="text-lg leading-relaxed" style={{ position: 'absolute', inset: 0, color: 'var(--holo-text)', whiteSpace: 'pre-line', margin: 0 }}>
        {text.slice(0, count)}
        {showCaret && (
          <span
            aria-hidden
            className={done ? '' : 'typewriter-caret'}
            style={{
              display: 'inline-block',
              width: 8, height: 8, borderRadius: '50%',
              background: '#2ff3ff',
              boxShadow: '0 0 8px #2ff3ff, 0 0 16px rgba(47,243,255,0.6)',
              marginInlineStart: 4,
              verticalAlign: 'middle',
              opacity: done ? 0 : 1,
              transition: justSkipped ? 'none' : 'opacity 0.2s ease',
            }}
          />
        )}
      </p>
    </div>
  )
}

interface Props {
  gameData: GameData
  questTitle: string
  /* תיעוד אנליטיקה — מודל מרוכז: צבירה מקומית, שליחה אחת בסיום (best-effort) */
  initialState?: EngineInitialState
  /* שמירת מצב ביניים ל-resume — מקומי בלבד, ללא רשת */
  saveResume?: (s: { currentSceneId: string; inventory: unknown[]; visitedScenes: unknown[]; crystals: number }) => void
  /* נקרא פעם אחת בסיום — שולח את סיכום האנליטיקה ברקע */
  onComplete?: (analytics: GameAnalytics, totalScore: number, crystalsFull: number) => void
  /* נתיב חזרה בסיום/יציאה (ברירת מחדל: ספריית המורה) */
  backPath?: string
  /* משחק ללא session (מבקר קר / קישור משותף / מקרן) — מסך הסיום מקבל פוטר המרה:
     שיתוף וואטסאפ, עוד הדמיות, ו-CTA למורים. לתלמיד אמיתי (יש session) — ללא שינוי. */
  visitorMode?: boolean
}

/* כפתור העין — תמיד גלוי (עמום); מסתיר/מציג את ה-UI. זהה במסך המשחק ובמסך הסיום */

export default function GameScreen({ gameData, questTitle, initialState, saveResume, onComplete, backPath = '/creator/library', visitorMode = false }: Props) {
  const engine = useGameEngine(gameData, { initialState })
  const navigate = useNavigate()
  const [puzzleOpen, setPuzzleOpen] = useState(false)
  /* רצף הופעה מדורג: 'panel' (fade-in פאנל) → 'typing' (הקלדה) → 'buttons' (כפתורים).
     ביקור חוזר/reduced-motion → מתחיל מיד ב-'buttons'. skipped → דילוג מיידי לסוף. */
  const [reveal, setReveal] = useState<'scene' | 'panel' | 'typing' | 'buttons'>(
    () => (engine.transitionDir === 'back' || prefersReducedMotion() ? 'buttons' : 'scene'),
  )
  const [skipped, setSkipped] = useState(false)
  /* מצב עין — הסתרת ה-UI כדי לצפות בתמונת הרקע נקייה */
  /* מצב-עין הוסר: הוא נועד לנקות את הממשק מעל תמונה מלוא-מסך. עכשיו התמונה
     חיה במלבן משלה ולא מוסתרת בכלל, ולכן הכפתור איבד את תפקידו. */
  const eyeMode = false
  const preloadedRef = useRef(false)
  /* אנימציית היתוך היהלומים — נורית פעם אחת כשהקריסטל השלישי מתמלא לגמרי */
  const [fusion, setFusion] = useState(false)
  const fusionFiredRef = useRef(false)
  /* מעבר-סצנה שנדחה עד לסיום ההיתוך — כשההמשך מגיע למסה קריטית, הפורטל וההיתוך היו
     רצים יחד וההיתוך התאפס בסצנה הבאה. שומרים כאן את פעולת המעבר ומריצים ב-onDone. */
  const pendingAdvanceRef = useRef<null | (() => void)>(null)
  /* טעינת הקריסטל במסך הניצחון — chargeT מטפס 0→1 (≈1.2ש') כך שהקריסטלים מתמלאים
     בסנכרון עם החלקיקים המתכנסים. reduced-motion → קופץ ל-1 (מילוי סטטי). */
  const crystalRowRef = useRef<HTMLDivElement>(null)
  const [chargeT, setChargeT] = useState(0)

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

  useEffect(() => {
    saveResume?.({ currentSceneId: sceneId, inventory: engine.inventory, visitedScenes: engine.visitedScenes, crystals: crystalsFull })
    advancingRef.current = false /* סצנה חדשה — מאפסים את נעילת המעבר-האוטומטי */
    setAdvancing(false)
    setContentVisible(true) /* סצנה חדשה מתחילה גלויה (לא באמצע fade של החלפת אתגר) */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneId])

  /* רצף ההופעה המדורג — מופעל מ-revealTick (בסיום הפורטל): panel → (אחרי PANEL_MAT_MS) → typing.
     ההקלדה מדווחת onDone → buttons. ביקור חוזר/reduced-motion → מיד buttons.
     ה-timeout מנוקה ב-cleanup (מעבר סצנה לא משאיר טיימר). */
  useEffect(() => {
    setSkipped(false)
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

  /* דילוג-בלחיצה: עוצר את הרצף ומציג הכול מיד (skipped→הטקסט מיידי, reveal→buttons) */
  const skipReveal = useCallback(() => { setSkipped(true); setReveal('buttons') }, [])
  /* כשמדלגים / ביקור חוזר / reduced-motion — בלי אנימציית materialize (הכול מיד) */
  const stageInstant = skipped || engine.transitionDir === 'back' || prefersReducedMotion()

  /* מילוי הקריסטל בסיום — ramp רך 0→1 (או קפיצה ב-reduced-motion) */
  useEffect(() => {
    if (!engine.finished) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    if (reduce) { setChargeT(1); return }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1200)
      setChargeT(t)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [engine.finished])

  /* סיום — שליחה מרוכזת אחת של סיכום האנליטיקה (רקעי, פעם אחת) */
  const completedRef = useRef(false)
  useEffect(() => {
    if (!engine.finished || completedRef.current) return
    completedRef.current = true
    const totalScore = engine.challengeResults.filter((r) => r.correct).length
    onComplete?.(engine.getAnalytics(), totalScore, engine.crystalsFull)
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
      const totalScore = engine.challengeResults.filter((r) => r.correct).length
      onComplete?.(engine.getAnalytics(), totalScore, engine.crystalsFull)
    }
    /* יעד מחושב טרי בזמן היציאה (לא ב-mount) — משקף את session הצוות החי: מורה/מנהל →
       התפריט הראשי שלהם (/creator), super_admin → /admin, תלמיד → /student. backPath הוא
       ברירת-מחדל אם אין session. */
    navigate(homePathForRole() || backPath)
  }

  /* היתוך יהלומים — פעם אחת, **רק אחרי שאנימציית המילוי של הקריסטל השלישי הסתיימה
     במלואה**. המילוי בתצוגה נדחה עד הגעת הרסיסים (BottomHUD), ולכן ה-engine.crystalsFull
     מקדים את הוויזואל; לכן ממתינים לאירוע 'holo-crystal-filled' (משודר בסיום מעבר-המילוי
     של כל קריסטל, עם fullCount) ומפעילים כש-fullCount≥3. */
  useEffect(() => {
    const onFilled = (e: Event) => {
      const full = (e as CustomEvent<{ fullCount?: number }>).detail?.fullCount ?? 0
      if (full >= 3 && !fusionFiredRef.current) {
        fusionFiredRef.current = true
        setFusion(true)
      }
    }
    window.addEventListener('holo-crystal-filled', onFilled)
    return () => window.removeEventListener('holo-crystal-filled', onFilled)
  }, [])

  /* חריג — חידוש משחק שכבר מעבר למסה הקריטית (התצוגה נטענת מלאה, בלי אנימציית מילוי):
     מפעילים פעם אחת ב-mount כדי שלא נאבד את ההיתוך. אינו יורה בזמן משחק רגיל (crystalsFull
     מתחיל <3, וה-effect רץ פעם אחת בלבד). */
  const fusionMountRef = useRef(false)
  useEffect(() => {
    if (fusionMountRef.current) return
    fusionMountRef.current = true
    if (crystalsFull >= 3 && !fusionFiredRef.current) {
      fusionFiredRef.current = true
      setFusion(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  /* מסך סיום — endingGood/endingBad מהמעבדה, או fallback להדמיות ישנות */
  if (engine.finished) {
    const good = engine.crystalsFull >= 3
    const ending = good ? gameData.endingGood : gameData.endingBad
    /* רקע מסך הסיכום — תמונת הסיום הייעודית (חוגגת/קודרת), עם fallback לסצנת הפתיחה בהדמיות ישנות */
    const labImage = gameData.scenes.find((s) => s.id === gameData.entrySceneId)?.imageUrl
    const endImage = ending?.imageUrl ?? labImage

    /* סיכום מותאם אישית מנתוני ה-session */
    const failed = engine.challengeResults.filter((r) => !r.correct)
    const summaryLine =
      engine.challengeResults.length === 0
        ? null
        : failed.length === 0
          ? 'פתרת את כל האתגרים בניסיון ראשון! מדהים! 🌟'
          : `האתגר${failed.length > 1 ? 'ים' : ''} על ${failed.map((f) => `"${f.sceneTitle}"`).join(', ')} ${failed.length > 1 ? 'היו קשים' : 'היה קשה'} — שווה לחזור עליו במסע הבא!`

    return (
      <div className="flex flex-col items-center justify-center min-h-dvh gap-6 p-6 relative">
        {/* מעבר חור-תולעת (חלקיקים) אל מסך הסיום — חזרה "מההדמיה לתפריט" */}
        <WormholeTransition trigger={engine.transitionKey} />
        {endImage && (
          <>
            {/* אותו מיקוד כמו תמונות הסצנה — ד"ר הולו במרכז הפריים, מוטה מעט למעלה */}
            <img src={endImage} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 45%' }} />
            {/* שכבת ה-overlay לקריאות הטקסט — נעלמת במצב עין לחשיפת התמונה הנקייה.
               סיום טוב: גוון חמים ובהיר יותר; סיום קודר: כהה ומלנכולי. */}
            <div style={{ position: 'absolute', inset: 0, background: good ? 'linear-gradient(180deg, rgba(10,14,40,0.55), rgba(20,8,40,0.7))' : 'rgba(8,8,20,0.82)', opacity: eyeMode ? 0 : 1, transition: 'opacity 0.5s ease' }} />
          </>
        )}

        {/* גשם קריסטלים + טעינת הקריסטל (חלקיקים מתכנסים) — רק בסיום הטוב */}
        {good && <CrystalRain />}
        {good && <CrystalCharge count={Math.round(engine.crystalProgress * TOTAL_CRYSTALS)} targetRef={crystalRowRef} />}

        <div
          className="holo-panel text-center max-w-lg w-full relative"
          style={{
            boxShadow: 'var(--holo-glow)',
            opacity: eyeMode ? 0 : 1,
            pointerEvents: eyeMode ? 'none' : 'auto',
            transition: 'opacity 0.45s ease',
          }}
        >
          {ending ? (
            <>
              <div className="flex justify-center">{good ? <div style={{ fontSize: '3rem' }}>🏆</div> : <DrHoloEmblem size={56} />}</div>
              <h1 className="holo-text-glow text-2xl font-black mt-2">{ending.title}</h1>
              <p className="mt-3 text-start leading-relaxed" style={{ opacity: 0.85 }}>{ending.narrative}</p>
              {ending.drHoloDialog && (
                <div className="flex items-start gap-3 mt-4 text-start">
                  <div className="shrink-0"><DrHoloEmblem size={34} /></div>
                  <div className="holo-panel flex-1" style={{ borderColor: 'rgba(136,85,255,0.45)', padding: '0.8rem' }}>
                    <span className="text-xs" style={{ color: 'var(--holo-purple)' }}>ד״ר הולו</span>
                    <p className="mt-1">{ending.drHoloDialog}</p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ fontSize: '3rem' }}>🏆</div>
              <h1 className="holo-text-glow text-2xl font-black mt-2">כל הכבוד!</h1>
              <p className="mt-3" style={{ opacity: 0.7 }}>סיימת את "{questTitle}"</p>
            </>
          )}

          {/* הקריסטלים שנאספו — מתמלאים בסנכרון עם chargeT (החלקיקים המתכנסים) */}
          <div ref={crystalRowRef} className="flex justify-center gap-1 mt-5" dir="ltr">
            {Array.from({ length: TOTAL_CRYSTALS }).map((_, i) => (
              <CrystalGauge key={i} fill={Math.max(0, Math.min(1, engine.crystalProgress * TOTAL_CRYSTALS * chargeT - i))} size={30} />
            ))}
          </div>

          {/* שורת סיכום מותאמת אישית */}
          {summaryLine && (
            <p className="text-sm mt-4 rounded-lg p-2" style={{ background: 'rgba(0,136,255,0.12)', border: '1px solid rgba(0,136,255,0.3)' }}>
              {summaryLine}
            </p>
          )}

          <div className="flex justify-center gap-3 mt-6 flex-wrap">
            {!good && ending && (
              <button className="holo-button text-lg" onClick={() => engine.restart()}>
                צא למסע שוב 🔄
              </button>
            )}
            {visitorMode ? (
              <>
                <button
                  className="holo-button"
                  onClick={() => {
                    trackFunnel('cta_whatsapp')
                    const url = window.location.href
                    const text = `🎮 "${questTitle}" — הדמיית למידה אינטראקטיבית ב-HoloAcademy. שחקו:\n${url}`
                    navigator.clipboard?.writeText(url).catch(() => {})
                    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
                  }}
                >
                  שתפו בוואטסאפ 💬
                </button>
                <button
                  className="holo-button"
                  style={{ background: 'transparent', border: '1px solid rgba(0,246,255,0.35)' }}
                  onClick={() => navigate('/')}
                >
                  עוד הדמיות 🎮
                </button>
              </>
            ) : (
              <button
                className="holo-button"
                style={!good && ending ? { background: 'transparent', border: '1px solid rgba(0,246,255,0.35)' } : {}}
                onClick={handleExit}
              >
                חזרה למעבדה
              </button>
            )}
          </div>

          {/* פוטר המרה למבקרים — הרגע חוו את ה-wow; זו נקודת ההצטרפות הטבעית של מורה */}
          {visitorMode && (
            <div className="text-start" style={{ marginTop: 18, padding: '14px 16px', borderRadius: 12, background: 'rgba(255,154,46,.09)', border: '1px solid rgba(255,154,46,.35)' }}>
              <div style={{ fontWeight: 800, fontSize: 14.5, color: '#ffcf7d' }}>מורים — דמיינו הרפתקה כזו על החומר שלכם 🚀</div>
              <div style={{ fontSize: 12.5, opacity: 0.78, marginTop: 4, lineHeight: 1.6 }}>
                מתארים את חומר הלימוד במשפט-שניים, וד״ר הולו בונה הדמיה שלמה — סצנות, אתגרים ותמונות — תוך דקות.
              </div>
              <button className="holo-button" style={{ marginTop: 10, fontSize: 13.5 }} onClick={() => { trackFunnel('cta_create'); navigate('/staff/login') }}>
                צרו הדמיה משלכם — חינם ✨
              </button>
            </div>
          )}
        </div>

      </div>
    )
  }


  /* אותו אתגר, שני מקומות אפשריים: פאנל (תשובת טקסט/בחירה) או במה (מניפולציה).
     ראו stageRouting.ts — הניתוב לפי סוג האינטראקציה, לא לפי סוג האתגר. */
  /* כלל אחד, בלי יוצא מן הכלל: **כל** אתגר מופיע במרכז עמוד התמונה — בחירה
     מרובה, דילמה, גרירה, סידור, התאמה, פענוח. התלמיד לומד כלל מרחבי יחיד
     ("אתגרים קורים במרכז") במקום למפות סוג-אתגר למקום. */
  const onStage = puzzleOpen && !!scene.puzzle

  const puzzleEl = (placement: Placement) => (
    <PuzzleModal
      placement={placement}
        puzzle={scene.puzzle!}
        imageUrl={scene.imageUrl}
        onSolve={engine.solvePuzzle}
        onClose={() => fadeSwap(() => setPuzzleOpen(false))}
        onContinue={() => {
          const hasItem = !!scene.collectableItem
          const hasChoices = !!scene.choices?.length
          const willAdvance = !hasItem && !hasChoices && !engine.gateLocked
          if (willAdvance) {
            const advanceNow = () => { setPuzzleOpen(false); engine.advance() } /* מעבר סצנה (fade-to-black) */
            /* המשך שמגיע למסה קריטית → ההיתוך עומד להתנגן. מעכבים את מעבר הסצנה
               עד שההיתוך יסתיים (onDone), כדי שהפורטל לא ירוץ במקביל ויאפס אותו. */
            if (engine.crystalsFull >= 3 && !fusionFiredRef.current) {
              pendingAdvanceRef.current = advanceNow
              /* רשת ביטחון — אם ההיתוך לא נורה מסיבה כלשהי, מתקדמים בכל זאת */
              window.setTimeout(() => {
                const p = pendingAdvanceRef.current
                if (p) { pendingAdvanceRef.current = null; setFusion(false); p() }
              }, 5000)
            } else {
              advanceNow()
            }
          } else fadeSwap(() => setPuzzleOpen(false)) /* חזרה לטקסט באותה סצנה — fade */
        }}
        /* אתגר שמסתיים במפתח: כפתור איסוף ישיר במקום "המשך" — אוסף וסוגר, והסצנה
           ממשיכה לפעולה הבאה (בחירות/המשך) */
        onCollect={engine.canCollect ? collectAndAdvance : undefined}
        collectLabel={scene.collectableItem ? `${scene.collectableItem.icon} אספו את ${scene.collectableItem.name}` : undefined}
      />
  )

  return (
    <div className="min-h-dvh flex flex-col">
      <ErrorFlashOverlay />
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
          to   { transform: scale(1.055) translate(0.6%, -0.5%); }
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
        /* caret ה-typewriter — נקודת אור פועמת שרצה בקצה הטקסט תוך כדי ההקלדה */
        @keyframes typewriter-caret-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.55; transform: scale(0.8); }
        }
        .typewriter-caret { animation: typewriter-caret-pulse 0.9s ease-in-out infinite; }
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
          }}
        >
          {/* כותרת הסצנה עברה לפס העליון (TopHUD) — אין כותרת מרחפת כפולה */}
          {/* עטיפת fade — מעבר fade-out→fade-in בין הטקסט לאתגר (החלפת inline) */}
          <div style={{ opacity: contentVisible ? 1 : 0, transition: 'opacity 0.22s ease' }}>
          {/* כשהאתגר פתוח — הוא מחליף את הנרטיב/הפעולות במקום (inline), ללא שכבת כיסוי */}
          {/* עמוד הטקסט מחזיק נרטיב בלבד ואינו נמחק כשאתגר פעיל — התלמיד יכול
              לחזור ולקרוא את ההקשר תוך כדי פתרון. */}
          {(
          <>
          {/* חלון טקסט אחד — הנרטיב + דיבור ד"ר הולו מקופלים לתוכו כדיבור מצוטט.
             מופיע רק אחרי שהסצנה "נחה" (reveal !== 'scene'), ב-materialize מרשים. */}
          {reveal !== 'scene' && !transitioning && (scene.narrative || scene.drHoloDialog) && (
            <DigitalEntrance instant={stageInstant} className="mt-6">
            <div className="holo-panel text-start">
              {scene.drHoloDialog && (
                <div className="flex items-center gap-2 mb-2">
                  <DrHoloEmblem size={26} />
                  <span className="text-xs" style={{ color: 'var(--holo-purple)' }}>ד״ר הולו</span>
                </div>
              )}
              <Typewriter
                text={[
                  scene.narrative,
                  scene.drHoloDialog ? `ד״ר הולו אומר: "${scene.drHoloDialog}"` : null,
                ].filter(Boolean).join('\n\n')}
                scale={gameData.readingScale ?? 6}
                /* ההקלדה מתחילה רק אחרי ה-materialize של הקופסה (שלב 'typing'); בסיומה → 'buttons' */
                start={reveal === 'typing' || reveal === 'buttons'}
                onDone={() => setReveal('buttons')}
                /* ביקור חוזר/דילוג → הטקסט במלואו מיד, בלי הקלדה */
                instant={engine.transitionDir === 'back' || skipped}
                /* לחיצה שנייה מתקדמת רק כשהפעולה הזמינה היא "המשך" לינארי — אותו תנאי
                   בדיוק של כפתור המשך/סיום, כך שאין שינוי בלוגיקת המשחק (רק טריגר חלופי). */
                onAdvance={
                  (!scene.puzzle || engine.puzzleSolved) && !engine.canCollect && !scene.choices?.length && !engine.gateLocked
                    ? engine.advance
                    : undefined
                }
              />
            </div>
            </DigitalEntrance>
          )}

          {/* פעולות — מרונדרות **רק** בשלב 'buttons', כלומר אחרי שההקלדה הסתיימה.
             קודם הן היו תמיד ב-DOM עם visibility:hidden כדי "לשמור מקום", אבל
             בפריסה החדשה עמוד הטקסט בגובה קבוע עם גלילה פנימית — אין מה לשמור,
             והקופסה השמורה דחפה את "פתרו את האתגר" לראש העמוד עוד לפני הטקסט. */}
          {reveal === 'buttons' && !advancing && (
          <div>
          <DigitalEntrance
            key={reveal === 'buttons' ? 'btns-in' : 'btns-wait'}
            instant={stageInstant || reveal !== 'buttons'}
            delay={0.05}
            className="flex flex-col items-center gap-3 mt-8"
          >
            {scene.puzzle && !engine.puzzleSolved && (
              <button className="holo-button text-lg" style={{ padding: '0.8rem 2rem' }} onClick={openPuzzle}>
                {scene.puzzle.type === 'finalQuiz' ? '📝 התחילו את מבחן הסיכום' : '🧩 פתרו את האתגר'}
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
                /* בחירות ניווט — מבנה Hub */
                <div className="flex flex-col gap-3 w-full max-w-md">
                  {scene.choices.map((c) => {
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
                  })}
                </div>
              ) : engine.gateLocked ? (
                /* שער נעול לינארי — אין כפתור; הלחיצה על החפץ ב-HUD היא הפעולה */
                <div
                  className={`holo-panel ${engine.shakeGate ? 'gate-shake' : ''} ${engine.gateGlow ? 'gate-glow' : ''}`}
                  style={{ padding: '0.8rem 2rem', borderColor: 'rgba(255,200,0,0.35)' }}
                >
                  🔒 השער נעול — השתמשו בחפץ מהתיק למטה
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
          </div>
          )}

          {/* הודעות מערכת */}
          {engine.message && (
            <div
              className="holo-panel mt-5 mx-auto inline-block"
              style={{ padding: '0.6rem 1.2rem', borderColor: 'rgba(255,200,0,0.4)' }}
            >
              {engine.message}
            </div>
          )}
          </>
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
                    : `holo-kenburns 18s ease-in-out infinite ${(scene.id.charCodeAt(scene.id.length - 1) % 2 === 1) ? 'alternate-reverse' : 'alternate'}`,
                }}
              />
            </div>
          )}
          {/* ── מעבר הסצנה, כלוא במלבן ──
              הרכיבים היו position:fixed (מלוא המסך) ולכן המעבר "בלע" גם את עמוד
              הטקסט. עכשיו הם absolute בתוך עמוד התמונה, וה-overflow:hidden שלו
              כולא אותם — התמונה מתחלפת בתוך המלבן בזמן שהטקסט נמחק ונכתב מחדש
              בעמוד שלו, בלי שהעמוד יזוז או יהבהב. */}
      {engine.transitionType === 'wormhole'
            ? <WormholeTransition trigger={engine.transitionKey} onComplete={onTransitionDone} />
            : <PortalTransition
                trigger={engine.transitionKey}
                oldImageUrl={prevImg}
                newImageUrl={scene.imageUrl}
                onComplete={onTransitionDone}
              />}

          {/* שכבת כהיה **מקומית** למלבן — האתגר קריא, והתמונה נשארת נוכחת מאחוריו */}
          {onStage && <div className="holo-stage-scrim" />}
          {onStage && <div className="holo-stage">{puzzleEl('stage')}</div>}
        </div>
        </div>{/* holo-scene-band */}

        {/* שכבת דילוג שקופה — קיימת רק בזמן הרצף (לא ב-'buttons'), כך שאינה בולעת קליקים
            על הכפתורים אחרי שהופיעו. לחיצה/טאץ' מקפיצים לסוף הרצף. */}
        {reveal !== 'buttons' && (
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
            <div style={{ fontSize: '2rem' }}>✨</div>
            <p className="text-lg mt-2">{engine.unlockBubble}</p>
            <p className="text-xs mt-3" style={{ opacity: 0.4 }}>לחצו להמשך</p>
          </div>
        </div>
      )}

      {/* כפתור העין במשחק נמצא עכשיו בתוך ה-TopHUD (שורה כחולה עליונה) */}

      {/* היתוך יהלומים — מסה קריטית (קריסטל שלישי מלא) */}
      {fusion && <CrystalFusion onDone={() => {
        setFusion(false)
        /* ההיתוך הסתיים — עכשיו מריצים את מעבר-הסצנה שנדחה (אם היה) */
        const pend = pendingAdvanceRef.current
        pendingAdvanceRef.current = null
        pend?.()
      }} />}

      {/* מעברים: חור תולעת בקצוות (כניסה/יציאה מהמעבדה); fade-to-black בין שקופיות רגילות */}
      {/* מעבר סצנה: חור-תולעת חלקיקים בכניסה/יציאה מהמעבדה (wormhole), פורטל ניאון בין
          שקופית לשקופית (fade). בסיום כל אחד (onComplete) מתחיל הרצף המדורג (DigitalEntrance). */}
      {/* המעבר עבר אל תוך עמוד התמונה — ראו .holo-image-page */}

      <TopHUD
        title={scene.title}
        onExit={handleExit}
        hudSlot={<>
          <CrystalBar progress={engine.crystalProgress} shardEvent={engine.shardEvent} />
          <ItemSlots inventory={engine.inventory} justCollected={engine.justCollected} onUseItem={engine.useItem} />
        </>}
      />

      {/* הפס התחתון בוטל: הגבישים עלו לרצועה העליונה (hudSlot). במצב רוחבי
          במובייל הגובה הוא המשאב הנדיר, ורצועה שנייה גזלה ~50px. */}
    </div>
  )
}
