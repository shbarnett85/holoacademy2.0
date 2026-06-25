import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BottomHUD from './BottomHUD'
import CrystalGauge from './CrystalGauge'
import PuzzleModal from './PuzzleModal'
import SceneTransition from './SceneTransition'
import WormholeTransition from './WormholeTransition'
import CrystalFusion from './CrystalFusion'
import CrystalRain from './CrystalRain'
import { TOTAL_CRYSTALS, useGameEngine, type GameData, type EngineInitialState, type GameAnalytics } from './useGameEngine'
import { typingDelayMs } from '../../shared/lib/difficultyScaling'

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/* טקסט נרטיב מוקלד אות-אחר-אות. הקצב נגזר מ-readingScale (1-10): נמוך=איטי, גבוה=מהיר
   (typingDelayMs, עם רצפה/תקרה). לחיצה בזמן ההקלדה משלימה מיד; לחיצה אחרי שהושלם
   מפעילה onAdvance (אם סופק — כשהפעולה היחידה היא "המשך"). reduced-motion → טקסט מיידי. */
function Typewriter({ text, scale, onAdvance }: { text: string; scale: number; onAdvance?: () => void }) {
  const reduce = prefersReducedMotion()
  const [count, setCount] = useState(() => (reduce ? text.length : 0))
  const done = count >= text.length

  useEffect(() => {
    setCount(reduce ? text.length : 0)
  }, [text, reduce])

  useEffect(() => {
    if (done || reduce) return
    const delay = typingDelayMs(scale)
    const timer = setInterval(() => setCount((c) => Math.min(c + 1, text.length)), delay)
    return () => clearInterval(timer)
  }, [text, done, reduce, scale])

  function handleClick() {
    if (!done) setCount(text.length) /* skip — השלמה מיידית */
    else onAdvance?.() /* לחיצה שנייה — המשך לסצנה הבאה (רק כשזו הפעולה הזמינה) */
  }

  return (
    <p
      className="text-lg leading-relaxed cursor-pointer"
      style={{ color: 'var(--holo-text)', minHeight: '3rem' }}
      onClick={handleClick}
    >
      {text.slice(0, count)}
    </p>
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
  /* מצב עין — הסתרת ה-UI כדי לצפות בתמונת הרקע נקייה */
  const [eyeMode, setEyeMode] = useState(false)
  const studentName = sessionStorage.getItem('holo_student_name') ?? 'אורח/ת'
  const preloadedRef = useRef(false)
  /* אנימציית היתוך היהלומים — נורית פעם אחת כשהקריסטל השלישי מתמלא לגמרי */
  const [fusion, setFusion] = useState(false)
  const fusionFiredRef = useRef(false)

  const { scene } = engine
  /* האם זו באמת סצנת הסיום? (אין next *וגם* זו הסצנה האחרונה במערך) — אחרת "המשך"
     משקף את חגורת הביטחון שמקשרת סצנה מנותקת לסצנה הבאה במקום לסיים */
  const sceneIdx = gameData.scenes.findIndex((s) => s.id === scene.id)
  const isFinalScene = !scene.nextSceneId && sceneIdx === gameData.scenes.length - 1

  /* פתיחת אתגר — מתעדת מקומית תחילת ניסיון (puzzle_attempt) ואז פותחת את המודאל */
  const openPuzzle = useCallback(() => {
    engine.trackPuzzleAttempt()
    setPuzzleOpen(true)
  }, [engine])

  /* שמירת מצב ביניים ל-resume בכל מעבר סצנה — מקומי בלבד (sessionStorage), ללא רשת */
  const crystalsFull = engine.crystalsFull
  const sceneId = scene.id
  useEffect(() => {
    saveResume?.({ currentSceneId: sceneId, inventory: engine.inventory, visitedScenes: engine.visitedScenes, crystals: crystalsFull })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneId])

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
    navigate(backPath)
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
        {/* השלמת אפקט חור התולעת מעל מסך הסיום */}
        <WormholeTransition trigger={engine.transitionKey} />
        {endImage && (
          <>
            <img src={endImage} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            {/* שכבת ה-overlay לקריאות הטקסט — נעלמת במצב עין לחשיפת התמונה הנקייה.
               סיום טוב: גוון חמים ובהיר יותר; סיום קודר: כהה ומלנכולי. */}
            <div style={{ position: 'absolute', inset: 0, background: good ? 'linear-gradient(180deg, rgba(10,14,40,0.55), rgba(20,8,40,0.7))' : 'rgba(8,8,20,0.82)', opacity: eyeMode ? 0 : 1, transition: 'opacity 0.5s ease' }} />
          </>
        )}

        {/* גשם קריסטלים — רק בסיום הטוב */}
        {good && <CrystalRain />}

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
              <div style={{ fontSize: '3rem' }}>{good ? '🏆' : '🤖'}</div>
              <h1 className="holo-text-glow text-2xl font-black mt-2">{ending.title}</h1>
              <p className="mt-3 text-start leading-relaxed" style={{ opacity: 0.85 }}>{ending.narrative}</p>
              {ending.drHoloDialog && (
                <div className="flex items-start gap-3 mt-4 text-start">
                  <div style={{ fontSize: '2rem' }}>🤖</div>
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

          {/* הקריסטלים שנאספו */}
          <div className="flex justify-center gap-1 mt-5" dir="ltr">
            {Array.from({ length: TOTAL_CRYSTALS }).map((_, i) => (
              <CrystalGauge key={i} fill={Math.max(0, Math.min(1, engine.crystalProgress * TOTAL_CRYSTALS - i))} size={30} />
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
    <div className="min-h-screen flex flex-col" style={{ paddingBottom: '4.5rem' }}>
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
      `}</style>

      {/* אזור הסצנה — תמונת רקע מלאה אם קיימת, אחרת גרדיאנט */}
      <div
        key={scene.id}
        className="scene-fade flex-1 flex flex-col items-center justify-center p-6 gap-6 relative"
        style={{
          background:
            'radial-gradient(ellipse at 30% 20%, rgba(0,136,255,0.15), transparent 60%), radial-gradient(ellipse at 70% 80%, rgba(136,85,255,0.12), transparent 60%), var(--holo-bg)',
        }}
      >
        {scene.imageUrl && (
          <>
            <img
              src={scene.imageUrl}
              alt=""
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                objectFit: 'cover', pointerEvents: 'none',
              }}
            />
            {/* gradient כהה לקריאות הטקסט — נעלם במצב עין כדי לחשוף את התמונה הנקייה */}
            <div
              style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                background:
                  'linear-gradient(to top, rgba(10,10,31,0.92) 0%, rgba(10,10,31,0.55) 45%, rgba(10,10,31,0.35) 100%)',
                opacity: eyeMode ? 0 : 1,
                transition: 'opacity 0.5s ease',
              }}
            />
          </>
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
          <h1 className="holo-text-glow text-3xl font-black">{scene.title}</h1>

          {scene.narrative && (
            <div className="holo-panel mt-6 text-start">
              <Typewriter
                text={scene.narrative}
                scale={gameData.readingScale ?? 6}
                /* לחיצה שנייה מתקדמת רק כשהפעולה הזמינה היא "המשך" לינארי — אותו תנאי
                   בדיוק של כפתור המשך/סיום, כך שאין שינוי בלוגיקת המשחק (רק טריגר חלופי). */
                onAdvance={
                  (!scene.puzzle || engine.puzzleSolved) && !engine.canCollect && !scene.choices?.length && !engine.gateLocked
                    ? engine.advance
                    : undefined
                }
              />
            </div>
          )}

          {/* ד"ר הולו — בועת דיבור */}
          {scene.drHoloDialog && (
            <div className="flex items-start gap-3 mt-4 text-start">
              <div style={{ fontSize: '2.5rem' }}>🤖</div>
              <div
                className="holo-panel flex-1"
                style={{ borderColor: 'rgba(136,85,255,0.45)', padding: '0.9rem' }}
              >
                <span className="text-xs" style={{ color: 'var(--holo-purple)' }}>ד״ר הולו</span>
                <p className="mt-1">{scene.drHoloDialog}</p>
              </div>
            </div>
          )}

          {/* פעולות */}
          <div className="flex flex-col items-center gap-3 mt-8">
            {scene.puzzle && !engine.puzzleSolved && (
              <button className="holo-button text-lg" style={{ padding: '0.8rem 2rem' }} onClick={openPuzzle}>
                {scene.puzzle.type === 'finalQuiz' ? '📝 התחילו את מבחן הסיכום' : '🧩 פתרו את האתגר'}
              </button>
            )}

            {engine.canCollect && (
              <button
                className="holo-button text-lg"
                style={{ padding: '0.8rem 2rem', background: 'linear-gradient(135deg, var(--holo-purple), var(--holo-blue))' }}
                onClick={() => engine.collectCurrentItem()}
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
        </div>
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

      {/* פאנלי החידות — נעלמים ב-fade במצב עין (opacity על העוטף חל גם על fixed) */}
      {puzzleOpen && scene.puzzle && (
        <div style={{ opacity: eyeMode ? 0 : 1, pointerEvents: eyeMode ? 'none' : 'auto', transition: 'opacity 0.45s ease' }}>
          <PuzzleModal
            puzzle={scene.puzzle}
            imageUrl={scene.imageUrl}
            onSolve={engine.solvePuzzle}
            onClose={() => setPuzzleOpen(false)}
            onContinue={() => {
              setPuzzleOpen(false)
              /* מעבר ישיר לסצנה הבאה — אלא אם בסצנה יש עוד אינטראקציה:
                 חפץ לאיסוף, בחירות ניווט, או שער נעול */
              const hasItem = !!scene.collectableItem
              const hasChoices = !!scene.choices?.length
              if (!hasItem && !hasChoices && !engine.gateLocked) {
                engine.advance()
              }
            }}
          />
        </div>
      )}

      <EyeButton active={eyeMode} onToggle={() => setEyeMode((v) => !v)} />

      {/* היתוך יהלומים — מסה קריטית (קריסטל שלישי מלא) */}
      {fusion && <CrystalFusion onDone={() => setFusion(false)} />}

      {/* חור תולעת רק במעברי מעבדה↔עולם; השאר point cloud רגיל */}
      {engine.transitionType === 'wormhole' ? (
        <WormholeTransition trigger={engine.transitionKey} />
      ) : (
        <SceneTransition trigger={engine.transitionKey} />
      )}

      <BottomHUD
        crystalProgress={engine.crystalProgress}
        shardEvent={engine.shardEvent}
        inventory={engine.inventory}
        justCollected={engine.justCollected}
        studentName={studentName}
        onUseItem={engine.useItem}
        onExit={handleExit}
        hidden={eyeMode}
      />
    </div>
  )
}
