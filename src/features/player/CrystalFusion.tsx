import { useEffect, useRef } from 'react'
import { playSound } from '../../shared/lib/sound'

/* "היתוך קריסטלים" — שלושה יהלומים מתנגשים אל המרכז ומתפוצצים בהתפרצות זוהר.
   מנוע canvas (פורט מ-design-reference/היתוך קריסטלים.html), מתנגן *פעם אחת* (~2.65ש׳)
   ואז קורא ל-onDone. מופעל כשהקריסטל השלישי בהדמיה מתמלא לגמרי.
   עוצר ב-prefers-reduced-motion (קצר). */
export default function CrystalFusion({ onDone }: { onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const doneRef = useRef(false)

  useEffect(() => {
    playSound('fusion')
    const finish = () => { if (!doneRef.current) { doneRef.current = true; onDone() } }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const t = window.setTimeout(finish, 500); return () => window.clearTimeout(t)
    }
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')!
    const DPR = Math.min(window.devicePixelRatio || 1, 2)
    let W = 0, H = 0
    function resize() { W = cv!.clientWidth; H = cv!.clientHeight; cv!.width = W * DPR; cv!.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0) }
    resize()
    window.addEventListener('resize', resize)

    /* יהלום Path2D ב-viewBox 220×210 (מרכז 110,105) — מתאר + פאות פנימיות */
    const CRW = 220, CRH = 210
    const crPath = new Path2D()
    crPath.moveTo(55, 18); crPath.lineTo(165, 18); crPath.lineTo(202, 82); crPath.lineTo(110, 196); crPath.lineTo(18, 82); crPath.closePath()
    crPath.moveTo(18, 82); crPath.lineTo(202, 82)
    crPath.moveTo(55, 18); crPath.lineTo(110, 82); crPath.lineTo(165, 18)
    crPath.moveTo(18, 82); crPath.lineTo(110, 196)
    crPath.moveTo(202, 82); crPath.lineTo(110, 196)
    crPath.moveTo(110, 82); crPath.lineTo(110, 196)

    const T_FLASH = 1200, T_END = 2650
    const TAU = Math.PI * 2
    const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
    const SRC = [{ a: -Math.PI * 0.5 }, { a: Math.PI * 0.5 - Math.PI * 0.165 }, { a: Math.PI * 0.5 + Math.PI * 0.165 }]

    interface P { x: number; y: number; vx: number; vy: number; life: number; size: number; col: number[]; drag: number; glow: boolean }
    interface F { ang: number; len: number; wob: number; width: number; cyan: boolean; life: number }
    let particles: P[] = []
    let filaments: F[] = []
    let burstMade = false
    const start = performance.now()

    function makeBurst(cx: number, cy: number, scaleRef: number) {
      particles = []; filaments = []
      for (let i = 0; i < 260; i++) {
        const ang = Math.random() * TAU
        const spd = (0.28 + Math.random() * 1.7) * scaleRef
        const r = Math.random()
        const col = r < 0.30 ? [255, 244, 210] : r < 0.62 ? [255, 150, 50] : [60, 240, 255]
        particles.push({ x: cx, y: cy, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 800 + Math.random() * 950, size: (1.6 + Math.random() * 3.4) * (scaleRef / 0.4), col, drag: 0.93 + Math.random() * 0.045, glow: r < 0.45 })
      }
      for (let i = 0; i < 20; i++) {
        const ang = Math.random() * TAU
        filaments.push({ ang, len: (120 + Math.random() * 200) * (scaleRef / 0.4), wob: Math.random() * TAU, width: 1.5 + Math.random() * 2.5, cyan: Math.random() > 0.5, life: 360 + Math.random() * 280 })
      }
    }

    function drawCrystal(x: number, y: number, scale: number, rot: number, glow: number, alpha: number) {
      ctx.save(); ctx.globalAlpha = alpha
      ctx.translate(x, y); ctx.rotate(rot); ctx.scale(scale, scale); ctx.translate(-CRW / 2, -CRH / 2)
      ctx.shadowColor = 'rgba(60,225,255,0.95)'; ctx.shadowBlur = glow
      const g = ctx.createLinearGradient(0, 0, CRW * 0.2, CRH)
      g.addColorStop(0, '#d6f7ff'); g.addColorStop(0.4, '#5fdcff'); g.addColorStop(1, '#1fb4f0')
      ctx.fillStyle = g; ctx.fill(crPath); ctx.shadowBlur = 0
      ctx.lineJoin = 'round'; ctx.lineCap = 'round'
      ctx.strokeStyle = 'rgba(238,253,255,0.95)'; ctx.lineWidth = 9; ctx.stroke(crPath)
      ctx.restore()
    }

    let raf = 0
    function frame(now: number) {
      const t = now - start
      const cx = W / 2, cy = H / 2
      const baseScale = Math.min(W, H) / 1100 * 0.42
      /* קנבס שקוף — האנימציה מתרחשת *מעל* הסצנה החיה (רקע/טקסט/חידה).
         לא צובעים רקע אטום; מנקים כל פריים ומוסיפים עמעום עדין למיקוד. */
      ctx.clearRect(0, 0, W, H)
      const vg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.7)
      vg.addColorStop(0, 'rgba(2,6,16,0.62)'); vg.addColorStop(0.6, 'rgba(2,6,16,0.32)'); vg.addColorStop(1, 'rgba(2,4,10,0)')
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H)

      if (t < T_FLASH) {
        const p = clamp(t / T_FLASH, 0, 1)
        const e = p * p
        const startDist = Math.max(W, H) * 0.66
        const dist = lerp(startDist, baseScale * 9, e)
        const prox = clamp(1 - dist / startDist, 0, 1)
        const heat = Math.pow(clamp((prox - 0.8) / 0.2, 0, 1), 1.5)
        if (heat > 0.02) {
          const coreR = lerp(6, 60, heat) * (1 + 0.12 * Math.sin(now / 40))
          const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 3)
          cg.addColorStop(0, `rgba(255,255,255,${0.55 * heat})`); cg.addColorStop(0.3, `rgba(120,240,255,${0.45 * heat})`)
          cg.addColorStop(0.7, `rgba(255,150,50,${0.2 * heat})`); cg.addColorStop(1, 'rgba(255,150,50,0)')
          ctx.fillStyle = cg; ctx.fillRect(0, 0, W, H)
        }
        SRC.forEach((s, i) => {
          const px = cx + Math.cos(s.a) * dist, py = cy + Math.sin(s.a) * dist
          const scl = baseScale * (1 + 0.16 * prox)
          const aIn = clamp(p * 2.2, 0, 1)
          const rot = s.a + Math.PI / 2 + (1 - e) * -1.1 + Math.sin(now / 140 + i) * 0.05 * prox
          const haloR = scl * CRW
          const hg = ctx.createRadialGradient(px, py, 0, px, py, haloR)
          hg.addColorStop(0, 'rgba(130,242,255,0.55)'); hg.addColorStop(0.5, 'rgba(60,210,255,0.2)'); hg.addColorStop(1, 'rgba(40,180,255,0)')
          ctx.save(); ctx.globalAlpha = aIn; ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(px, py, haloR, 0, TAU); ctx.fill(); ctx.restore()
          drawCrystal(px, py, scl, rot, 30 + 52 * heat, aIn)
        })
      } else {
        if (!burstMade) { makeBurst(cx, cy, baseScale); burstMade = true }
        const tb = t - T_FLASH
        const bp = clamp(tb / (T_END - T_FLASH), 0, 1)
        const flashA = Math.pow(1 - clamp(tb / 680, 0, 1), 2)
        if (flashA > 0.01) {
          const fr = lerp(60, Math.max(W, H) * 0.72, easeOut(clamp(tb / 680, 0, 1)))
          const fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, fr)
          fg.addColorStop(0, `rgba(255,255,255,${0.98 * flashA})`); fg.addColorStop(0.22, `rgba(165,248,255,${0.9 * flashA})`)
          fg.addColorStop(0.5, `rgba(255,160,60,${0.6 * flashA})`); fg.addColorStop(1, 'rgba(255,140,45,0)')
          ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H)
        }
        ctx.save()
        for (let r = 0; r < 4; r++) {
          const rp = clamp((tb - r * 95) / 950, 0, 1)
          if (rp <= 0 || rp >= 1) continue
          ctx.globalAlpha = (1 - rp) * 0.85; ctx.lineWidth = lerp(8, 0.6, rp)
          ctx.strokeStyle = (r % 2) ? 'rgba(255,160,55,0.95)' : 'rgba(90,242,255,0.95)'
          ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 22
          ctx.beginPath(); ctx.arc(cx, cy, easeOut(rp) * Math.min(W, H) * (0.46 + r * 0.07), 0, TAU); ctx.stroke()
        }
        ctx.restore()
        filaments.forEach((f) => {
          const fp = clamp(tb / f.life, 0, 1); if (fp >= 1) return
          ctx.save(); ctx.globalAlpha = (1 - fp) * 0.85
          ctx.strokeStyle = f.cyan ? 'rgba(110,245,255,0.9)' : 'rgba(255,165,60,0.9)'
          ctx.lineWidth = f.width; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 14
          ctx.beginPath(); const reach = easeOut(fp) * f.len; ctx.moveTo(cx, cy)
          for (let q = 1; q <= 6; q++) { const tt = q / 6, rr = reach * tt, wob = Math.sin(tt * 6 + f.wob) * 10 * (1 - tt); ctx.lineTo(cx + Math.cos(f.ang) * rr - Math.sin(f.ang) * wob, cy + Math.sin(f.ang) * rr + Math.cos(f.ang) * wob) }
          ctx.stroke(); ctx.restore()
        })
        particles.forEach((pt) => {
          if (tb > pt.life) return
          pt.x += pt.vx * 16; pt.y += pt.vy * 16; pt.vx *= pt.drag; pt.vy *= pt.drag
          const lp = tb / pt.life, a = 1 - lp
          ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size * (1 - 0.4 * lp), 0, TAU)
          ctx.fillStyle = `rgba(${pt.col[0]},${pt.col[1]},${pt.col[2]},${a})`
          ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = pt.glow ? 12 : 6; ctx.fill()
        })
        ctx.shadowBlur = 0
        const coreA = Math.pow(1 - bp, 1.6) * 0.6
        if (coreA > 0.01) {
          const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 70)
          cg.addColorStop(0, `rgba(200,250,255,${coreA})`); cg.addColorStop(0.5, `rgba(80,235,255,${coreA * 0.6})`); cg.addColorStop(1, 'rgba(255,150,55,0)')
          ctx.fillStyle = cg; ctx.fillRect(0, 0, W, H)
        }
      }

      if (t >= T_END) { finish(); return }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [onDone])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 90, pointerEvents: 'none', animation: 'holo-screen-fade .3s ease' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  )
}
