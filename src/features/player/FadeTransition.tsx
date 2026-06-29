import { useEffect, useState } from 'react'

/* מעבר בין שקופיות — fade-out to white → fade-in (במקום סריקת ה-clip-path הישנה).
   שכבה לבנה מלאה: opacity 0→1 (הלבנה) → 1→0 (חשיפת הסצנה החדשה). התוכן מתחלף
   בשיא ההלבנה (מסונכרן עם ה-setTimeout ב-goToScene). pointer-events:none. */
export default function FadeTransition({ trigger }: { trigger: number }) {
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (!trigger) return
    setActive(true)
    const t = window.setTimeout(() => setActive(false), 560)
    return () => window.clearTimeout(t)
  }, [trigger])

  if (!active) return null
  return (
    <div
      key={trigger}
      aria-hidden
      style={{ position: 'fixed', inset: 0, zIndex: 60, pointerEvents: 'none', background: '#ffffff', animation: 'holo-fadewhite 540ms ease' }}
    >
      <style>{`@keyframes holo-fadewhite { 0% { opacity: 0; } 44% { opacity: 1; } 56% { opacity: 1; } 100% { opacity: 0; } }`}</style>
    </div>
  )
}
