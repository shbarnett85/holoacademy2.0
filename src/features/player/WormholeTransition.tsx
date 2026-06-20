import { useEffect, useRef } from 'react'

/* אפקט חור תולעת — חלקיקים נשאבים לערבולת מרכזית ומתפרצים החוצה.
   Canvas 2D בלבד, ~1100ms, ידידותי למחשבים חלשים */
export default function WormholeTransition({ trigger }: { trigger: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (trigger === 0) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = (canvas.width = window.innerWidth)
    const h = (canvas.height = window.innerHeight)
    const cx = w / 2
    const cy = h / 2

    const COUNT = 500
    const DURATION = 1100

    interface Particle {
      angle: number      /* זווית סביב המרכז */
      radius: number     /* מרחק מהמרכז בתחילה */
      spin: number       /* מהירות סיבוב */
      size: number
      color: string
      burstAngle: number /* כיוון ההתפרצות החוצה */
      burstSpeed: number
    }

    const maxR = Math.hypot(cx, cy)
    const particles: Particle[] = []
    for (let i = 0; i < COUNT; i++) {
      particles.push({
        angle: Math.random() * Math.PI * 2,
        radius: maxR * (0.25 + Math.random() * 0.85),
        spin: 2.5 + Math.random() * 3.5,
        size: 1 + Math.random() * 2.5,
        color: Math.random() > 0.45 ? '0,246,255' : '136,85,255',
        burstAngle: Math.random() * Math.PI * 2,
        burstSpeed: (0.5 + Math.random()) * maxR,
      })
    }

    let raf = 0
    const start = performance.now()

    function frame(now: number) {
      const t = (now - start) / DURATION /* 0..1 */
      if (t >= 1) {
        ctx!.clearRect(0, 0, w, h)
        return
      }

      ctx!.clearRect(0, 0, w, h)

      /* שלב 1 (0–0.55): ספירלה פנימה אל הערבולת | שלב 2: התפרצות החוצה */
      const inhale = Math.min(1, t / 0.55)
      const burst = Math.max(0, (t - 0.55) / 0.45)
      const globalAlpha = burst > 0.7 ? 0.95 * (1 - (burst - 0.7) / 0.3) : 0.95

      for (const p of particles) {
        let x: number, y: number
        if (burst === 0) {
          /* שאיבה פנימה — הרדיוס מתכווץ, הזווית מסתחררת מהר יותר ככל שמתקרבים */
          const r = p.radius * (1 - inhale * inhale)
          const a = p.angle + inhale * p.spin
          x = cx + Math.cos(a) * r
          y = cy + Math.sin(a) * r
        } else {
          /* התפרצות החוצה — קרניים ישרות מהמרכז, מאיצות */
          const d = burst * burst * p.burstSpeed
          x = cx + Math.cos(p.burstAngle) * d
          y = cy + Math.sin(p.burstAngle) * d
        }

        ctx!.beginPath()
        ctx!.arc(x, y, p.size * (burst > 0 ? 1 + burst : 1), 0, Math.PI * 2)
        ctx!.fillStyle = `rgba(${p.color},${globalAlpha})`
        ctx!.fill()
      }

      /* ליבת הערבולת — עיגול זוהר שגדל בשאיבה ומתפוגג בהתפרצות */
      const coreR = burst === 0 ? 6 + inhale * 22 : 28 * (1 - burst)
      if (coreR > 0) {
        const grad = ctx!.createRadialGradient(cx, cy, 0, cx, cy, coreR)
        grad.addColorStop(0, `rgba(232,244,255,${0.9 * globalAlpha})`)
        grad.addColorStop(1, 'rgba(0,246,255,0)')
        ctx!.beginPath()
        ctx!.arc(cx, cy, coreR, 0, Math.PI * 2)
        ctx!.fillStyle = grad
        ctx!.fill()
      }

      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      ctx.clearRect(0, 0, w, h)
    }
  }, [trigger])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 50 }}
    />
  )
}
