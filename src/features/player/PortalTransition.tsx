import { useEffect, useRef, useState } from 'react'
import { playSound } from '../../shared/lib/sound'

/* ── PortalTransition ─────────────────────────────────────────────────────────
   מעבר "פורטל ניאון" בין שקופיות. overlay מלא-מסך, ~1.52s (היה 3.07s — נחתך
   בחצי: על הדמיית 8 סצנות זה ~12 שניות המתנה פחות).
   כוריאוגרפיה **חופפת** — אין פריים שחור מת בין היציאה לכניסה:
     exit  (0–700ms):        השקופית הישנה טסה אל המצלמה ומעבר לה — scale 1→1.9,
                             opacity→0, brightness→0.15 (שכבה עליונה).
     enter (480–1430ms):     עוד בזמן שהישנה חולפת, החדשה + מסגרת הפורטל עולות
                             מהעומק מתחתיה — scale 0.55→1, brightness 0→1.
                             220ms של חפיפה = תנועה רציפה אחת, לא שני שלבים.
     flash (1430–1520ms):    הבזק היעלמות המסגרת — שכבות ה-box-shadow מתרחבות
                             ודועכות (requestAnimationFrame).
   skip-on-click: לחיצה בכל שלב → קופץ למצב הסופי (onComplete) ומסיר את ה-overlay.
   prefers-reduced-motion: cross-fade פשוט (450ms) ללא scale.
   ניקוי מלא: כל setTimeout וה-RAF מנוקים ב-cleanup (מעבר סצנה לא משאיר טיימרים).
   ─────────────────────────────────────────────────────────────────────────── */

interface Props {
  trigger: number
  oldImageUrl?: string
  newImageUrl?: string
  onComplete?: () => void
}

type Phase = 'idle' | 'run' | 'flash'

const EXIT_MS = 700
const ENTER_START = 480 /* הכניסה מתחילה 220ms לפני סוף היציאה — חפיפה */
const ENTER_MS = 950
const FLASH_MS = 90

const prefersReduced = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const fill: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }

export default function PortalTransition({ trigger, oldImageUrl, newImageUrl, onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  /* שתי השכבות חיות במקביל בחלון החפיפה — לכל אחת מתג רינדור ומתג הנעה (go) משלה */
  const [exitOn, setExitOn] = useState(false)
  const [enterOn, setEnterOn] = useState(false)
  const [goExit, setGoExit] = useState(false)
  const [goEnter, setGoEnter] = useState(false)
  const [flashT, setFlashT] = useState(0) /* 0..1 — התקדמות הבזק הסיום */

  const timers = useRef<number[]>([])
  const rafs = useRef<number[]>([])
  const done = useRef(false)
  const reduceRef = useRef(false)

  const clearAll = () => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
    rafs.current.forEach((r) => cancelAnimationFrame(r))
    rafs.current = []
  }

  const finish = () => {
    if (done.current) return
    done.current = true
    clearAll()
    setPhase('idle')
    setExitOn(false)
    setEnterOn(false)
    setGoExit(false)
    setGoEnter(false)
    setFlashT(0)
    onComplete?.()
  }

  /* התחלה בכל bump של trigger */
  useEffect(() => {
    if (!trigger) return
    done.current = false
    reduceRef.current = prefersReduced()
    clearAll()

    if (reduceRef.current) {
      playSound('portal') /* cross-fade מיידי — הצליל בו-זמני עם החלפת השקופית */
      setPhase('run')
      setEnterOn(true)
      timers.current.push(window.setTimeout(finish, 450))
    } else {
      setPhase('run')
      setExitOn(true)
      setEnterOn(false)
      /* חפיפה: הכניסה נדלקת לפני שהיציאה מסתיימת */
      timers.current.push(window.setTimeout(() => { playSound('portal'); setEnterOn(true) }, ENTER_START))
      timers.current.push(window.setTimeout(() => setExitOn(false), EXIT_MS))
      timers.current.push(window.setTimeout(startFlash, ENTER_START + ENTER_MS))
    }
    return clearAll
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger])

  /* הנעת ה-CSS transition של כל שכבה: פריים ראשון במצב ההתחלתי, ואז flip ל-target
     (double-rAF — מבטיח שהדפדפן צייר את ה-initial לפני המעבר) */
  useEffect(() => {
    if (!exitOn) return
    setGoExit(false)
    const r = requestAnimationFrame(() => rafs.current.push(requestAnimationFrame(() => setGoExit(true))))
    rafs.current.push(r)
    return () => cancelAnimationFrame(r)
  }, [exitOn])
  useEffect(() => {
    if (!enterOn) return
    setGoEnter(false)
    const r = requestAnimationFrame(() => rafs.current.push(requestAnimationFrame(() => setGoEnter(true))))
    rafs.current.push(r)
    return () => cancelAnimationFrame(r)
  }, [enterOn])

  function startFlash() {
    setPhase('flash')
    const start = performance.now()
    const loop = (now: number) => {
      const t = Math.min(1, (now - start) / FLASH_MS)
      setFlashT(t)
      if (t < 1) rafs.current.push(requestAnimationFrame(loop))
      else finish()
    }
    rafs.current.push(requestAnimationFrame(loop))
  }

  /* ניקוי ב-unmount — לא להשאיר RAF/טיימרים רצים אחרי שהרכיב יורד */
  useEffect(() => () => clearAll(), [])

  if (phase === 'idle') return null

  const reduce = reduceRef.current
  const inFlash = phase === 'flash'
  const k = 1 + flashT * 4
  const frameStyle: React.CSSProperties = {
    position: 'absolute', inset: 0, pointerEvents: 'none',
    border: '8px solid rgba(220,245,255,0.98)', borderRadius: 16,
    boxShadow: inFlash
      ? `0 0 ${6 * k}px rgba(255,255,255,${0.9 * (1 - flashT)}), 0 0 ${14 * k}px rgba(80,170,255,${0.9 * (1 - flashT)}), 0 0 ${34 * k}px rgba(40,120,255,${0.75 * (1 - flashT)}), 0 0 ${64 * k}px rgba(20,90,255,${0.5 * (1 - flashT)})`
      : '0 0 6px rgba(255,255,255,0.9), 0 0 14px rgba(80,170,255,0.9), 0 0 34px rgba(40,120,255,0.75), 0 0 64px rgba(20,90,255,0.5)',
    opacity: inFlash ? 1 - flashT : 1,
  }

  const oldSrc = oldImageUrl /* היוצאת — יציבה למשך כל המעבר */
  const newSrc = newImageUrl /* הנכנסת — יציבה (הסצנה כבר הוחלפה ב-engine מיד) */

  return (
    <div
      aria-hidden
      onPointerDown={finish}
      style={{ position: 'fixed', inset: 0, zIndex: 65, background: '#000', overflow: 'hidden', cursor: 'pointer' }}
    >
      {/* reduced-motion → cross-fade פשוט בלבד (ללא scale/frame) */}
      {reduce ? (
        newSrc && <img key={`r-${newSrc}`} src={newSrc} alt="" style={{ ...fill, opacity: goEnter ? 1 : 0, transition: 'opacity 450ms ease' }} />
      ) : (
        <>
          {/* הנכנסת + מסגרת הפורטל — שכבה תחתונה, עולה מהעומק מתחת ליוצאת */}
          {(enterOn || inFlash) && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 0,
              transform: goEnter || inFlash ? 'scale(1)' : 'scale(0.55)',
              transition: inFlash ? 'none' : `transform ${ENTER_MS}ms cubic-bezier(0.16,1,0.3,1)`,
            }}>
              {/* clip לפינות מעוגלות — השקופית כלואה בתוך המסגרת (overflow:hidden נפרד מהמסגרת
                  כדי לא לחתוך את ה-glow של ה-box-shadow היוצא החוצה) */}
              <div style={{ position: 'absolute', inset: 0, borderRadius: 16, overflow: 'hidden' }}>
                {newSrc
                  ? <img key={`in-${newSrc}`} src={newSrc} alt="" style={{
                      ...fill,
                      filter: goEnter || inFlash ? 'brightness(1)' : 'brightness(0)',
                      transition: inFlash ? 'none' : `filter ${ENTER_MS}ms ease-out`,
                    }} />
                  : <div style={{ ...fill, background: 'var(--holo-bg, #05060f)' }} />}
              </div>
              <div style={frameStyle} />
            </div>
          )}

          {/* היוצאת — שכבה עליונה, טסה אל המצלמה ומעבר לה בזמן שהנכנסת עולה מתחתיה */}
          {exitOn && (oldSrc
            ? <img key={`out-${oldSrc}`} src={oldSrc} alt="" style={{
                ...fill, zIndex: 1,
                transform: goExit ? 'scale(1.9)' : 'scale(1)', opacity: goExit ? 0 : 1,
                filter: goExit ? 'brightness(0.15)' : 'brightness(1)',
                transition: `transform ${EXIT_MS}ms cubic-bezier(0.55,0,1,0.45), opacity ${EXIT_MS}ms ease-in, filter ${EXIT_MS}ms ease-in`,
              }} />
            : <div style={{
                ...fill, zIndex: 1,
                transform: goExit ? 'scale(1.9)' : 'scale(1)', opacity: goExit ? 0 : 1,
                transition: `transform ${EXIT_MS}ms cubic-bezier(0.55,0,1,0.45), opacity ${EXIT_MS}ms ease-in`,
                background: 'var(--holo-bg, #05060f)',
              }} />
          )}
        </>
      )}
    </div>
  )
}
