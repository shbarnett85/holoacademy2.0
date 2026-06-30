import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BottomHUD from './BottomHUD'
import TopHUD from './TopHUD'
import CrystalGauge from './CrystalGauge'
import PuzzleModal from './PuzzleModal'
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
import { playSound, initSound } from '../../shared/lib/sound'

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/* רצף הופעה מדורג (visual-novel): הסצנה עולה במלואה → המתנה → materialize של קופסת
   הטקסט → הקלדה → materialize של הכפתורים. כל הזמנים נגישים כאן לכוונון. */
const SCENE_HOLD_MS = 1000   /* כמה זמן רואים את הסצנה/תמונת הרקע לבדה לפני שהקופסה מופיעה */
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

  useEffect(() => {
    setCount(skipAnim ? text.length : 0)
  }, [text, skipAnim])

  useEffect(() => {
    if (done || skipAnim || !start) return
    const delay = typingDelayMs(scale)
    const timer = setInterval(() => setCount((c) => Math.min(c + 1, text.length)), delay)
    return () => clearInterval(timer)
  }, [text, done, skipAnim, scale, start])

  /* דיווח סיום ההקלדה (גם כשהטקסט מיידי/ריק) — מניע את שלב הכפתורים ברצף */
  useEffect(() => { if (done) onDoneRef.current?.() }, [done])

  function handleClick() {
    if (!done) setCount(text.length) /* skip — השלמה מיידית */
    else onAdvance?.() /* לחיצה שנייה — המשך לסצנה הבאה (רק כשזו הפעולה הזמינה) */
  }

  /* הקופסה בגודלה הסופי מההתחלה (כמו דף נייר שמתמלא): טקסט-רפאים מלא וקבוע שומר את
     הגובה/הרוחב, והטקסט המוקלד מוצג מעליו — כך הקופסה לא "גדלה" תוך כדי ההקלדה. */
  return (
    <div className="relative cursor-pointer" onClick={handleClick}>
      <p className="text-lg leading-relaxed" aria-hidden style={{ visibility: 'hidden', whiteSpace: 'pre-line', margin: 0 }}>{text}</p>
      <p className="text-lg leading-relaxed" style={{ position: 'absolute', inset: 0, color: 'var(--holo-text)', whiteSpace: 'pre-line', margin: 0 }}>{text.slice(0, count)}</p>
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
}

/* כפתור העין — תמיד גלוי (עמום); מסתיר/מציג את ה-UI. זהה במסך המשחק ובמסך הסיום */
function EyeButton({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      title={active ? 'הצג ממשק' : 'הסתר ממשק וצפה בתמונה'}
      aria-label="מצב עין"
      className="fixed cursor-pointer flex items-center justify-center"
      style={{
        top: '0.75rem', left: '0.75rem', zIndex: 55,
        width: '2.6rem', height: '2.6rem', borderRadius: '50%',
        fontSize: '1.2rem',
        background: 'rgba(10,10,31,0.55)',
        border: '1px solid rgba(0,246,255,0.3)',
        backdropFilter: 'blur(4px)',
        opacity: active ? 0.85 : 0.45,
        transition: 'opacity 0.3s ease, transform 0.15s ease',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = active ? '0.85' : '0.45')}
    >
      {active ? '🙈' : '👁️'}
    </button>
  )
}

export default function GameScreen({ gameData, questTitle, initialState, saveResume, onComplete, backPath = '/creator/library' }: Props) {
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
  const [eyeMode, setEyeMode] = useState(false)
  const studentName = sessionStorage.getItem('holo_student_name') ?? 'אורח/ת'
  const preloadedRef = useRef(false)
  /* אנימציית היתוך היהלומים — נורית פעם אחת כשהקריסטל השלישי מתמלא לגמרי */
  const [fusion, setFusion] = useState(false)
  const fusionFiredRef = useRef(false)
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

  /* preload של קבצי הסאונד בכניסה למשחק (אין lag באירוע הראשון) */
  useEffect(() => { initSound() }, [])

  useEffect(() => {
    saveResume?.({ currentSceneId: sceneId, inventory: engine.inventory, visitedScenes: engine.visitedScenes, crystals: crystalsFull })
    advancingRef.current = false /* סצנה חדשה — מאפסים את נעילת המעבר-האוטומטי */
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
    setReveal('scene') /* הסצנה/תמונה לבדה */
    const timers = [
      window.setTimeout(() => setReveal('panel'), SCENE_HOLD_MS), /* קופסת הטקסט עושה DigitalEntrance */
      window.setTimeout(() => setReveal(hasText ? 'typing' : 'buttons'), SCENE_HOLD_MS + PANEL_MAT_MS), /* ואז הקלדה */
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

  /* היתוך יהלומים — כשהקריסטל השלישי מתמלא לגמרי (מסה קריטית), פעם אחת */
  useEffect(() => {
    if (crystalsFull >= 3 && !fusionFiredRef.current) {
      fusionFiredRef.current = true
      setFusion(true)
    }
  }, [crystalsFull])

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
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 p-6 relative">
        {/* מעבר חור-תולעת (חלקיקים) אל מסך הסיום — חזרה "מההדמיה לתפריט" */}
        <WormholeTransition trigger={engine.transitionKey} />
        {endImage && (
          <>
            <img src={endImage} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
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
            <button
              className="holo-button"
              style={!good && ending ? { background: 'transparent', border: '1px solid rgba(0,246,255,0.35)' } : {}}
              onClick={handleExit}
            >
              חזרה למעבדה
            </button>
          </div>
        </div>

        <EyeButton active={eyeMode} onToggle={() => setEyeMode((v) => !v)} />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
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
          paddingBottom: '5.5rem',
          paddingTop: '4rem', /* מרווח מתחת לפס העליון (TopHUD) כדי שהתוכן לא ייחתך */
          background:
            'radial-gradient(ellipse at 30% 20%, rgba(0,136,255,0.15), transparent 60%), radial-gradient(ellipse at 70% 80%, rgba(136,85,255,0.12), transparent 60%), var(--holo-bg)',
        }}
      >
        {scene.imageUrl && (
          /* התמונה מוצגת נקייה וחיה (כמו מצב-עין) — אין עוד שכבת-כהות גלובלית על כל המסך.
             קריאוּת הטקסט מובטחת ע"י הפאנלים הייעודיים (holo-panel) של הנרטיב/הדיאלוג/הכפתורים,
             ולא ע"י החשכת התמונה כולה. */
          <img
            src={scene.imageUrl}
            alt=""
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              objectFit: 'cover', pointerEvents: 'none',
            }}
          />
        )}
        {/* רשת נקודות עדינה */}
        <div
          style={{
            position: 'absolute', inset: 0, opacity: eyeMode ? 0 : 0.05, pointerEvents: 'none',
            backgroundImage: 'radial-gradient(circle, var(--holo-cyan) 1px, transparent 1px)',
            backgroundSize: '35px 35px',
            transition: 'opacity 0.5s ease',
          }}
        />

        <div
          className="max-w-2xl w-full text-center z-10"
          style={{
            opacity: eyeMode ? 0 : 1,
            pointerEvents: eyeMode ? 'none' : 'auto',
            transition: 'opacity 0.45s ease',
          }}
        >
          {/* כותרת הסצנה עברה לפס העליון (TopHUD) — אין כותרת מרחפת כפולה */}
          {/* עטיפת fade — מעבר fade-out→fade-in בין הטקסט לאתגר (החלפת inline) */}
          <div style={{ opacity: contentVisible ? 1 : 0, transition: 'opacity 0.22s ease' }}>
          {/* כשהאתגר פתוח — הוא מחליף את הנרטיב/הפעולות במקום (inline), ללא שכבת כיסוי */}
          {puzzleOpen && scene.puzzle ? (
            <div className="mt-6">
              <PuzzleModal
                puzzle={scene.puzzle}
                imageUrl={scene.imageUrl}
                onSolve={engine.solvePuzzle}
                onClose={() => fadeSwap(() => setPuzzleOpen(false))}
                onContinue={() => {
                  const hasItem = !!scene.collectableItem
                  const hasChoices = !!scene.choices?.length
                  const willAdvance = !hasItem && !hasChoices && !engine.gateLocked
                  if (willAdvance) { setPuzzleOpen(false); engine.advance() } /* מעבר סצנה (fade-to-black) */
                  else fadeSwap(() => setPuzzleOpen(false)) /* חזרה לטקסט באותה סצנה — fade */
                }}
                /* אתגר שמסתיים במפתח: כפתור איסוף ישיר במקום "המשך" — אוסף וסוגר, והסצנה
                   ממשיכה לפעולה הבאה (בחירות/המשך) */
                onCollect={engine.canCollect ? collectAndAdvance : undefined}
                collectLabel={scene.collectableItem ? `${scene.collectableItem.icon} אספו את ${scene.collectableItem.name}` : undefined}
              />
            </div>
          ) : (
          <>
          {/* חלון טקסט אחד — הנרטיב + דיבור ד"ר הולו מקופלים לתוכו כדיבור מצוטט.
             מופיע רק אחרי שהסצנה "נחה" (reveal !== 'scene'), ב-materialize מרשים. */}
          {reveal !== 'scene' && (scene.narrative || scene.drHoloDialog) && (
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

          {/* פעולות — מרונדרות תמיד (שומרות את מקומן מראש כך שקופסת הטקסט לא זזה כשהן מופיעות),
             אך גלויות רק בשלב 'buttons' — אז fade-in באותו materialize הולוגרפי. */}
          <div style={{ visibility: reveal === 'buttons' ? 'visible' : 'hidden' }}>
          <DigitalEntrance
            key={reveal === 'buttons' ? 'btns-in' : 'btns-wait'}
            instant={stageInstant || reveal !== 'buttons'}
            delay={0.05}
            className="flex flex-col items-center gap-3 mt-8"
          >
            {scene.puzzle && !engine.puzzleSolved && (
              <button className="holo-button text-lg" style={{ padding: '0.8rem 2rem' }} onClick={() => { playSound('click'); openPuzzle() }}>
                {scene.puzzle.type === 'finalQuiz' ? '📝 התחילו את מבחן הסיכום' : '🧩 פתרו את האתגר'}
              </button>
            )}

            {engine.canCollect && (
              <button
                className="holo-button text-lg"
                style={{ padding: '0.8rem 2rem', background: 'linear-gradient(135deg, #6633cc, #0062cc)' }}
                onClick={() => { playSound('click'); collectAndAdvance() }}
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
                        onClick={() => { playSound('click'); engine.chooseChoice(c) }}
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
                  onClick={() => { playSound('click'); engine.advance() }}
                >
                  {isFinalScene ? 'סיום 🏁' : 'המשך ←'}
                </button>
              )
            )}
          </DigitalEntrance>
          </div>

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
      {fusion && <CrystalFusion onDone={() => setFusion(false)} />}

      {/* מעברים: חור תולעת בקצוות (כניסה/יציאה מהמעבדה); fade-to-black בין שקופיות רגילות */}
      {/* מעבר סצנה: חור-תולעת חלקיקים בכניסה/יציאה מהמעבדה (wormhole), פורטל ניאון בין
          שקופית לשקופית (fade). בסיום כל אחד (onComplete) מתחיל הרצף המדורג (DigitalEntrance). */}
      {engine.transitionType === 'wormhole'
        ? <WormholeTransition trigger={engine.transitionKey} onComplete={() => setRevealTick((t) => t + 1)} />
        : <PortalTransition
            trigger={engine.transitionKey}
            oldImageUrl={prevImg}
            newImageUrl={scene.imageUrl}
            onComplete={() => setRevealTick((t) => t + 1)}
          />}

      <TopHUD title={scene.title} onExit={handleExit} hidden={eyeMode} eyeActive={eyeMode} onToggleEye={() => setEyeMode((v) => !v)} />

      <BottomHUD
        crystalProgress={engine.crystalProgress}
        shardEvent={engine.shardEvent}
        inventory={engine.inventory}
        justCollected={engine.justCollected}
        studentName={studentName}
        onUseItem={engine.useItem}
        hidden={eyeMode}
      />
    </div>
  )
}
