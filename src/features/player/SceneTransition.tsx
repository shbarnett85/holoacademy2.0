import { useEffect, useRef } from 'react'

/* אפקט point cloud במעבר סצנה — Canvas 2D, ~900ms, ידידותי למחשבים חלשים */
export default function SceneTransition({ trigger }: { trigger: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (trigger === 0) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = (canvas.width = window.innerWidth)
    const h = (canvas.height = window.innerHeight)

    const COUNT = 550
    const DURATION = 900

    interface Particle {
      x: number; y: number
      tx: number; ty: number /* יעד התכנסות */
      vx: number; vy: number
      size: number
      color: string
    }

    const particles: Particle[] = []
    for (let i = 0; i < COUNT; i++) {
      const cx = w / 2 + (Math.random() - 0.5) * w * 0.3
      const cy = h / 2 + (Math.random() - 0.5) * h * 0.3
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        tx: cx,
        ty: cy,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.5) * 6,
        size: 1 + Math.random() * 2.5,
        color: Math.random() > 0.5 ? '0,246,255' : '0,136,255',
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

      /* שלב 1 (0–0.45): פיזור והתערבלות | שלב 2 (0.45–1): התכנסות ודעיכה */
      const converge = Math.max(0, (t - 0.45) / 0.55)
      const globalAlpha = t < 0.7 ? 0.9 : 0.9 * (1 - (t - 0.7) / 0.3)

      for (const p of particles) {
        if (converge === 0) {
          /* התערבלות קלה */
          p.vx += (Math.random() - 0.5) * 0.8
          p.vy += (Math.random() - 0.5) * 0.8
          p.x += p.vx
          p.y += p.vy
        } else {
          /* התכנסות לעבר היעד */
          p.x += (p.tx - p.x) * 0.08 * (1 + converge * 2)
          p.y += (p.ty - p.y) * 0.08 * (1 + converge * 2)
        }

        ctx!.beginPath()
        ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx!.fillStyle = `rgba(${p.color},${globalAlpha})`
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
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 50,
      }}
    />
  )
}
