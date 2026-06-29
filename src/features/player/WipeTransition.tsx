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
    const dur = reduce ? 320 : 470
    const t = window.setTimeout(() => setActive(false), dur)
    /* skip — לחיצה/מקש כלשהו משלים את המעבר מיד */
    const skip = () => setActive(false)
    window.addEventListener('pointerdown', skip)
    window.addEventListener('keydown', skip)
    return () => { window.clearTimeout(t); window.removeEventListener('pointerdown', skip); window.removeEventListener('keydown', skip) }
  }, [trigger, reduce])

  if (!active) return null

  const anim = reduce ? 'holo-wipe-fade 320ms ease-out 1' : `holo-wipe-${dir} 470ms cubic-bezier(.7,0,.3,1) 1`
  /* הקצה המוביל: ב-forward (נכנס מימין, נע שמאלה) — הקצה השמאלי מוביל; ב-back — ההפך */
  const leadSide = dir === 'forward' ? { left: 0 } : { right: 0 }
  return (
    <div
      key={trigger}
      aria-hidden
      style={{
        position: 'fixed', inset: 0, zIndex: 50, pointerEvents: 'none', willChange: 'transform, opacity',
        animation: anim,
        /* קיר אטום מלא — לא שקוף-בקצוות (שנראה כמו קווים מהבהבים מעל תמונה) */
        background: 'linear-gradient(135deg, #081228 0%, #0c1a3c 50%, #0a1430 100%)',
      }}
    >
      <style>{`
        @keyframes holo-wipe-forward {
          0% { transform: translateX(100%); } 40% { transform: translateX(0); }
          60% { transform: translateX(0); } 100% { transform: translateX(-100%); }
        }
        @keyframes holo-wipe-back {
          0% { transform: translateX(-100%); } 40% { transform: translateX(0); }
          60% { transform: translateX(0); } 100% { transform: translateX(100%); }
        }
        @keyframes holo-wipe-fade { 0% { opacity: 0; } 42% { opacity: 1; } 58% { opacity: 1; } 100% { opacity: 0; } }
      `}</style>
      {/* קצה מוביל זוהר — קו סריקה הולוגרפי על שפת הקיר (מושמט ב-reduced-motion) */}
      {!reduce && (
        <div style={{ position: 'absolute', top: 0, bottom: 0, ...leadSide, width: 4, background: 'var(--holo-cyan, #2ff3ff)', boxShadow: '0 0 24px 5px rgba(0,246,255,0.85)' }} />
      )}
    </div>
  )
}
