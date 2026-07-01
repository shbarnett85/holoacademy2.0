import { useEffect, useRef } from 'react'

interface Crystal {
  x: number
  y: number
  size: number
  speed: number
  opacity: number
  spin: number
  spinSpeed: number
  color: string
}

/* קריסטל הלוגו הוא ציאן — פלטה תואמת (ציאן/כחול-קרח/לבן), ללא מגנטה */
const COLORS = [
  'rgba(47,243,255,',    // cyan
  'rgba(200,240,255,',   // pale blue-white
  'rgba(255,255,255,',   // white
  'rgba(180,220,255,',   // ice blue
]

function makeCrystal(canvasWidth: number): Crystal {
  return {
    x: Math.random() * canvasWidth,
    y: -30 - Math.random() * 200,
    size: 6 + Math.random() * 18,
    speed: 0.8 + Math.random() * 2.2,
    opacity: 0.3 + Math.random() * 0.65,
    spin: Math.random() * Math.PI * 2,
    spinSpeed: (Math.random() - 0.5) * 0.04,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  }
}

/* קריסטל HoloAcademy — מעוין (diamond) + מבנה H, בקווי ציאן (כמו הלוגו).
   פרופורציות נגזרות מה-SVG (רדיוס 170): פסי H אנכיים ב-±0.5, קורה אמצעית ±0.094. */
function drawCrystal(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, spin: number, color: string, opacity: number) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(spin)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.strokeStyle = `${color}${opacity})`

  // מסגרת המעוין
  ctx.lineWidth = Math.max(1, size * 0.09)
  ctx.beginPath()
  ctx.moveTo(0, -size)
  ctx.lineTo(size, 0)
  ctx.lineTo(0, size)
  ctx.lineTo(-size, 0)
  ctx.closePath()
  ctx.stroke()

  // פסי ה-H — שני אנכיים + קורה אמצעית
  const vx = size * 0.5
  const vy = size * 0.5 /* קצה המעוין ב-x=±0.5 נמצא ב-y=±0.5 */
  ctx.beginPath()
  ctx.moveTo(-vx, -vy); ctx.lineTo(-vx, vy)
  ctx.moveTo(vx, -vy); ctx.lineTo(vx, vy)
  ctx.stroke()
  ctx.lineWidth = Math.max(1.4, size * 0.11)
  ctx.beginPath()
  ctx.moveTo(-vx, 0); ctx.lineTo(vx, 0)
  ctx.stroke()
  ctx.restore()
}

export default function CrystalRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx: CanvasRenderingContext2D | null = canvas.getContext('2d')
    if (!ctx) return
    const rc: CanvasRenderingContext2D = ctx

    const W = window.innerWidth
    const H = window.innerHeight
    canvas.width = W
    canvas.height = H

    const count = Math.min(60, Math.floor(W / 20))
    const crystals: Crystal[] = Array.from({ length: count }, () => {
      const c = makeCrystal(W)
      // scatter vertically at start so it doesn't all appear at once
      c.y = Math.random() * H
      return c
    })

    let raf: number
    let alive = true

    function frame() {
      if (!alive) return
      rc.clearRect(0, 0, W, H)

      for (const c of crystals) {
        c.y += c.speed
        c.spin += c.spinSpeed
        if (c.y > H + 40) {
          Object.assign(c, makeCrystal(W))
        }
        drawCrystal(rc, c.x, c.y, c.size, c.spin, c.color, c.opacity)
      }

      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => {
      alive = false
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 5,
        width: '100%',
        height: '100%',
      }}
    />
  )
}
