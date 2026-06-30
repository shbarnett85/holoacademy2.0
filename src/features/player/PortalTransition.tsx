import { useEffect, useRef, useState } from 'react'
import { playSound } from '../../shared/lib/sound'

/* ── PortalTransition ─────────────────────────────────────────────────────────
   מעבר "פורטל ניאון" יחיד בין שקופיות (מחליף את Scene/Wipe/Wormhole). overlay מלא-מסך.
   שלושה שלבים (~3.07s):
     1) exit  (0–1400ms):  השקופית הישנה נדחפת קדימה לשחור — scale 1→2, opacity 1→0,
                            brightness 1→0 (CSS transition).
     2) enter (1400–3000): השקופית החדשה + מסגרת הפורטל עולות מהעומק יחד — scale 0.5→1
                            (אותו מכל → תמיד צמודות), והשקופית גם brightness 0→1.
     3) flash (3000–3072): הבזק היעלמות של המסגרת — שכבות ה-box-shadow מתרחבות ודועכות
                            (requestAnimationFrame, לא CSS).
   skip-on-click: לחיצה בכל שלב → קופץ למצב הסופי (onComplete) ומסיר את ה-overlay.
   prefers-reduced-motion: ללא scale/zoom — cross-fade פשוט בין שחור לשקופית החדשה.
   ניקוי מלא: כל setTimeout וה-RAF מנוקים ב-cleanup (מעבר סצנה לא משאיר טיימרים).
   ─────────────────────────────────────────────────────────────────────────── */

interface Props {
  trigger: number
  oldImageUrl?: string
  newImageUrl?: string
  onComplete?: () => void
}

type Phase = 'idle' | 'exit' | 'enter' | 'flash'

const EXIT_MS = 1400
const ENTER_MS = 1600
const FLASH_MS = 72

const prefersReduced = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const fill: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }

export default function PortalTransition({ trigger, oldImageUrl, newImageUrl, onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [go, setGo] = useState(false)        /* flip שמניע את ה-CSS transition מ-initial ל-target */
  const [flashT, setFlashT] = useState(0)    /* 0..1 — התקדמות הבזק שלב 3 */

  const timers = useRef<number[]>([])
  const raf = useRef<number>(0)
  const done = useRef(false)
  const reduceRef = useRef(false)

  const clearAll = () => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
    if (raf.current) cancelAnimationFrame(raf.current)
    raf.current = 0
  }

  const finish = () => {
    if (done.current) return
    done.current = true
    clearAll()
    setPhase('idle')
    setFlashT(0)
    setGo(false)
    onComplete?.()
  }

  /* התחלה בכל bump של trigger */
  useEffect(() => {
    if (!trigger) return
    done.current = false
    reduceRef.current = prefersReduced()
    clearAll()
    playSound('portal')

    if (reduceRef.current) {
      setPhase('enter') /* רנדר cross-fade פשוט */
      timers.current.push(window.setTimeout(finish, 600))
    } else {
      setPhase('exit')
      /* מאפסים go=false *באותו batch* של המעבר ל-enter — כך הפריים הראשון של שלב הכניסה
         מצויר ב-scale(0.5)/brightness(0) (מתוך השחור), ורק אז ה-go-effect מניע אותו ל-1.
         בלי זה go נשאר true מסוף היציאה והשקופית מופיעה מיד בגודל מלא. */
      timers.current.push(window.setTimeout(() => { setGo(false); setPhase('enter') }, EXIT_MS))
      timers.current.push(window.setTimeout(startFlash, EXIT_MS + ENTER_MS))
    }
    return clearAll
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger])

  /* flip ה-go בכל כניסה לשלב מונפש (exit/enter) → מ-initial ל-target דרך ה-CSS transition */
  useEffect(() => {
    if (phase !== 'exit' && phase !== 'enter') return
    setGo(false)
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setGo(true)))
    return () => cancelAnimationFrame(r)
  }, [phase])

  function startFlash() {
    setPhase('flash')
    const start = performance.now()
    const loop = (now: number) => {
      const t = Math.min(1, (now - start) / FLASH_MS)
      setFlashT(t)
      if (t < 1) raf.current = requestAnimationFrame(loop)
      else finish()
    }
    raf.current = requestAnimationFrame(loop)
  }

  /* ניקוי ב-unmount — לא להשאיר RAF/טיימרים רצים אחרי שהרכיב יורד */
  useEffect(() => () => clearAll(), [])

  if (phase === 'idle') return null

  const reduce = reduceRef.current
  const k = 1 + flashT * 4
  const frameStyle: React.CSSProperties = {
    position: 'absolute', inset: 0, pointerEvents: 'none',
    border: '8px solid rgba(220,245,255,0.98)', borderRadius: 16,
    boxShadow:
      phase === 'flash'
        ? `0 0 ${6 * k}px rgba(255,255,255,${0.9 * (1 - flashT)}), 0 0 ${14 * k}px rgba(80,170,255,${0.9 * (1 - flashT)}), 0 0 ${34 * k}px rgba(40,120,255,${0.75 * (1 - flashT)}), 0 0 ${64 * k}px rgba(20,90,255,${0.5 * (1 - flashT)})`
        : '0 0 6px rgba(255,255,255,0.9), 0 0 14px rgba(80,170,255,0.9), 0 0 34px rgba(40,120,255,0.75), 0 0 64px rgba(20,90,255,0.5)',
    opacity: phase === 'flash' ? 1 - flashT : 1,
  }

  const oldSrc = oldImageUrl   /* היוצאת — יציבה למשך כל המעבר */
  const newSrc = newImageUrl   /* הנכנסת — יציבה (הסצנה כבר הוחלפה ב-engine מיד) */

  return (
    <div
      aria-hidden
      onPointerDown={finish}
      style={{ position: 'fixed', inset: 0, zIndex: 65, background: '#000', overflow: 'hidden', cursor: 'pointer' }}
    >
      {/* reduced-motion → cross-fade פשוט בלבד (ללא scale/frame) */}
      {reduce ? (
        newSrc && <img key={`r-${newSrc}`} src={newSrc} alt="" style={{ ...fill, opacity: go ? 1 : 0, transition: 'opacity 600ms ease' }} />
      ) : (
        <>
          {/* שלב 1 — השקופית הישנה נדחפת לשחור */}
          {phase === 'exit' && (oldSrc
            ? <img key={`out-${oldSrc}`} src={oldSrc} alt="" style={{
                ...fill,
                transform: go ? 'scale(2)' : 'scale(1)', opacity: go ? 0 : 1,
                filter: go ? 'brightness(0)' : 'brightness(1)',
                transition: 'transform 1.4s cubic-bezier(0.55,0,1,0.45), opacity 1.4s ease-in, filter 1.4s ease-in',
              }} />
            : <div style={{ ...fill, transform: go ? 'scale(2)' : 'scale(1)', opacity: go ? 0 : 1, transition: 'transform 1.4s cubic-bezier(0.55,0,1,0.45), opacity 1.4s ease-in', background: 'var(--holo-bg, #05060f)' }} />
          )}

          {/* שלב 2+3 — השקופית החדשה + מסגרת הפורטל באותו מכל (scale זהה תמיד) */}
          {(phase === 'enter' || phase === 'flash') && (
            <div style={{
              position: 'absolute', inset: 0,
              transform: go || phase === 'flash' ? 'scale(1)' : 'scale(0.5)',
              transition: phase === 'flash' ? 'none' : 'transform 1600ms cubic-bezier(0.16,1,0.3,1)',
            }}>
              {/* clip לפינות מעוגלות — השקופית כלואה בתוך המסגרת (overflow:hidden נפרד מהמסגרת
                  כדי לא לחתוך את ה-glow של ה-box-shadow היוצא החוצה) */}
              <div style={{ position: 'absolute', inset: 0, borderRadius: 16, overflow: 'hidden' }}>
                {newSrc
                  ? <img key={`in-${newSrc}`} src={newSrc} alt="" style={{
                      ...fill,
                      filter: go || phase === 'flash' ? 'brightness(1)' : 'brightness(0)',
                      transition: phase === 'flash' ? 'none' : 'filter 1600ms ease-out',
                    }} />
                  : <div style={{ ...fill, background: 'var(--holo-bg, #05060f)' }} />}
              </div>
              <div style={frameStyle} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
