import { useEffect, useRef, useState } from 'react'

/* ──────────────────────────────────────────────────────────────────────────
   משוב חזותי על טעות — הבזק אדום קצר + גליץ' קל, אחיד לכל סוגי האתגרים.
   טריגר גלובלי מבוסס-אירוע (triggerErrorFlash) כדי לחווט בקלות מכל אתגר;
   overlay יחיד (ErrorFlashOverlay) מותקן פעם אחת ב-GameScreen.

   בטיחות (מוצר לילדים): **הבזק בודד** ~220ms (לא רצף — בטיחות אפילפסיה, WCAG),
   אדום *בהיר* ולא מסך-אדום-מלא, גליץ' קל ולא רעידה אלימה.
   prefers-reduced-motion → גרסה מרוככת (הבזק חלש בלבד, בלי גליץ'/תזוזה).
   ────────────────────────────────────────────────────────────────────────── */

const EVT = 'holo-error-flash'

/* קריאה מאתגר כשיורדת פסילה/נעשתה טעות */
export function triggerErrorFlash() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(EVT))
}

export function ErrorFlashOverlay() {
  const [active, setActive] = useState(false)
  const [reduce, setReduce] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    setReduce(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
    function handler() {
      /* איפוס ואז הפעלה מחדש בפריים הבא — כדי שאנימציית ה-CSS תתחיל מחדש בכל טעות */
      window.clearTimeout(timer.current)
      setActive(false)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setActive(true)
          /* הבזק בודד — נכבה אחרי שהאנימציה מסתיימת (לא חוזר על עצמו) */
          timer.current = window.setTimeout(() => setActive(false), 320)
        })
      })
    }
    window.addEventListener(EVT, handler)
    return () => { window.removeEventListener(EVT, handler); window.clearTimeout(timer.current) }
  }, [])

  if (!active) return null

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed', inset: 0, zIndex: 90, pointerEvents: 'none',
        animation: reduce ? 'holo-err-soft 280ms ease-out 1' : 'holo-err-flash 240ms ease-out 1',
        background: 'radial-gradient(ellipse at center, rgba(255,40,70,0) 35%, rgba(255,40,70,0.42) 100%)',
      }}
    >
      <style>{`
        @keyframes holo-err-flash {
          0%   { opacity: 0; }
          18%  { opacity: 1; transform: translateX(0); }
          26%  { transform: translateX(-5px) skewX(-1.4deg); }
          38%  { transform: translateX(4px) skewX(1deg); }
          52%  { transform: translateX(0) skewX(0); }
          100% { opacity: 0; }
        }
        @keyframes holo-err-soft {
          0% { opacity: 0; } 30% { opacity: 0.55; } 100% { opacity: 0; }
        }
        @keyframes holo-err-bar {
          0% { opacity: 0; transform: translateX(0); }
          20% { opacity: 0.9; transform: translateX(-12px); }
          55% { opacity: 0.7; transform: translateX(10px); }
          100% { opacity: 0; transform: translateX(0); }
        }
      `}</style>
      {/* גליץ' קל — שני פסים אופקיים מתחלפים; מושמט ב-reduced-motion */}
      {!reduce && (
        <>
          <div style={{ position: 'absolute', left: 0, right: 0, top: '34%', height: 2, background: 'rgba(255,60,90,0.85)', boxShadow: '0 0 10px rgba(255,60,90,0.7)', animation: 'holo-err-bar 200ms ease-out 1' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, top: '61%', height: 3, background: 'rgba(0,246,255,0.6)', boxShadow: '0 0 10px rgba(0,246,255,0.5)', animation: 'holo-err-bar 220ms ease-out 1 reverse' }} />
        </>
      )}
    </div>
  )
}
