import { useEffect, useState } from 'react'

/* ──────────────────────────────────────────────────────────────────────────
   Wipe — מעבר קל ומהיר בין שקופיות *בתוך* ההדמיה (~420ms). פאנל הולוגרפי
   שסוחף על המסך; התוכן מתחלף מאחוריו באמצע. מודע ל-RTL:
   - forward (סצנה חדשה) = סחיפה ימין←שמאל (כיוון הקריאה בעברית).
   - back (חזרה ל-Hub/סצנה מוכרת) = ההפך.
   skip: לחיצה בזמן המעבר משלימה אותו מיד (לא חוסם, כמו אפקט ההקלדה).
   prefers-reduced-motion: fade עדין בלי סחיפה.
   ────────────────────────────────────────────────────────────────────────── */
export default function WipeTransition({ trigger, dir }: { trigger: number; dir: 'forward' | 'back' }) {
  const [active, setActive] = useState(false)
  const reduce = typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)

  useEffect(() => {
    if (!trigger) return
    setActive(true)
    const dur = reduce ? 300 : 430
    const t = window.setTimeout(() => setActive(false), dur)
    /* skip — לחיצה/מקש כלשהו משלים את המעבר מיד */
    const skip = () => setActive(false)
    window.addEventListener('pointerdown', skip)
    window.addEventListener('keydown', skip)
    return () => { window.clearTimeout(t); window.removeEventListener('pointerdown', skip); window.removeEventListener('keydown', skip) }
  }, [trigger, reduce])

  if (!active) return null

  const anim = reduce ? 'holo-wipe-fade 300ms ease-out 1' : `holo-wipe-${dir} 420ms cubic-bezier(.65,0,.35,1) 1`
  return (
    <div
      key={trigger}
      aria-hidden
      style={{
        position: 'fixed', top: 0, bottom: 0, left: '-15vw', width: '130vw', zIndex: 50, pointerEvents: 'none', willChange: 'transform, opacity',
        animation: anim,
        /* ליבה אטומה 10%–90% (מכסה את כל ה-viewport כשממורכזת) + קצוות רכים */
        background: 'linear-gradient(90deg, rgba(7,11,28,0) 0%, rgba(7,11,28,0.98) 10%, rgba(10,20,44,1) 50%, rgba(7,11,28,0.98) 90%, rgba(7,11,28,0) 100%)',
        boxShadow: 'inset 0 0 120px rgba(0,246,255,0.12)',
      }}
    >
      <style>{`
        @keyframes holo-wipe-forward { from { transform: translateX(120%); } to { transform: translateX(-120%); } }
        @keyframes holo-wipe-back    { from { transform: translateX(-120%); } to { transform: translateX(120%); } }
        @keyframes holo-wipe-fade    { 0% { opacity: 0; } 38% { opacity: 0.92; } 100% { opacity: 0; } }
      `}</style>
      {/* קצה מוביל זוהר — נותן תחושת סריקה הולוגרפית (מושמט ב-reduced-motion שבו אין סחיפה) */}
      {!reduce && (
        <div style={{ position: 'absolute', top: 0, bottom: 0, [dir === 'forward' ? 'left' : 'right']: '14%', width: 3, background: 'var(--holo-cyan, #2ff3ff)', boxShadow: '0 0 18px 3px rgba(0,246,255,0.8)' }} />
      )}
    </div>
  )
}
