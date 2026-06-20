import { useEffect, useRef, useState } from 'react'

/* הודעות ההתקדמות המתחלפות — נשמרות מהמסך הקיים (מחזוריות לכל אורך ההמתנה) */
const MESSAGES = [
  'ד״ר הולו מעצב את ההרפתקה…',
  'בונה את עולם הסימולציה…',
  'יוצר דמויות ומשימות…',
  'מכייל את רמת הקושי…',
  'כותב חידות מאתגרות…',
  'מחבר את ד״ר הולו לתרחיש…',
  'מלטש את הסיפור…',
  'עוד רגע קט…',
]

/* mm:ss */
function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/* מנוע החלקיקים (Claude Design): ליבת משושים מסתובבת, חלקיקים מקיפים, טבעות מקווקוות
   וזרמי דאטה נשאבים פנימה. מותאם למחשבים חלשים: פחות חלקיקים, ועצירה ב-prefers-reduced-motion. */
function useParticleCanvas(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) return /* נגישות + מחשבים חלשים — בלי אנימציית canvas */
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let raf = 0

    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight }
    resize()
    window.addEventListener('resize', resize)

    const PALETTE = ['#2ff3ff', '#ff45e6', '#ff9a2e', '#ffffff']
    /* כמויות מופחתות לעומת הרפרנס (120/40) לחלקלקות במחשבי בית ספר */
    const orbs = Array.from({ length: 70 }, (_, i) => ({
      angle: (i / 70) * Math.PI * 2,
      radius: 80 + Math.sin(i * 0.7) * 60,
      speed: 0.003 + Math.random() * 0.006,
      size: 1.5 + Math.random() * 3,
      color: PALETTE[i % 4],
      alpha: 0.3 + Math.random() * 0.7,
      layer: Math.floor(Math.random() * 3),
    }))
    const streams = Array.from({ length: 24 }, () => ({
      x: Math.random() * 2000 - 1000,
      y: Math.random() * 2000 - 1000,
      speed: 1.5 + Math.random() * 3,
      size: 2 + Math.random() * 4,
      color: PALETTE[Math.floor(Math.random() * 3)],
      alpha: 0,
    }))

    let t = 0
    const draw = () => {
      const w = canvas.width, h = canvas.height, cx = w / 2, cy = h / 2
      ctx.clearRect(0, 0, w, h)
      t += 0.016

      /* זוהר מרכזי */
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 120)
      grd.addColorStop(0, 'rgba(47,243,255,.18)')
      grd.addColorStop(0.5, 'rgba(255,69,230,.08)')
      grd.addColorStop(1, 'transparent')
      ctx.fillStyle = grd
      ctx.beginPath(); ctx.arc(cx, cy, 120, 0, Math.PI * 2); ctx.fill()

      /* ליבת משושים */
      const drawHex = (r: number, stroke: string, lw: number, rot: number) => {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.beginPath()
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2
          if (k === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r)
          else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
        }
        ctx.closePath(); ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); ctx.restore()
      }
      drawHex(44, 'rgba(47,243,255,.6)', 1.5, t * 0.4)
      drawHex(34, 'rgba(255,69,230,.4)', 1, -t * 0.6)
      drawHex(24, 'rgba(47,243,255,.35)', 0.8, t * 0.9)

      /* טבעות מסתובבות מקווקוות + שנתות */
      const rings: [number, number, string, number][] = [
        [130, 1.2, 'rgba(47,243,255,.35)', 0.5],
        [165, 0.8, 'rgba(255,69,230,.25)', 0.35],
        [200, 0.6, 'rgba(255,154,46,.2)', 0.25],
      ]
      rings.forEach(([r, lw, col, sp], ri) => {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * sp * (ri % 2 === 0 ? 1 : -1))
        ctx.beginPath(); ctx.setLineDash([12, 8]); ctx.arc(0, 0, r, 0, Math.PI * 2)
        ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke(); ctx.setLineDash([])
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2
          ctx.beginPath()
          ctx.moveTo(Math.cos(a) * (r - 4), Math.sin(a) * (r - 4))
          ctx.lineTo(Math.cos(a) * (r + 4), Math.sin(a) * (r + 4))
          ctx.strokeStyle = col.replace(/[\d.]+\)$/, '1)'); ctx.lineWidth = 1.2; ctx.stroke()
        }
        ctx.restore()
      })

      /* חלקיקים מקיפים */
      orbs.forEach((o) => {
        o.angle += o.speed * (o.layer === 0 ? 1 : o.layer === 1 ? -0.7 : 0.5)
        const r = o.radius + Math.sin(t * 1.5 + o.angle) * 12
        const x = cx + Math.cos(o.angle) * r
        const y = cy + Math.sin(o.angle) * r
        const pulse = (Math.sin(t * 3 + o.angle) + 1) / 2
        ctx.save()
        ctx.globalAlpha = o.alpha * (0.4 + pulse * 0.6)
        ctx.fillStyle = o.color; ctx.shadowColor = o.color; ctx.shadowBlur = 8
        ctx.beginPath(); ctx.arc(x, y, o.size * (0.8 + pulse * 0.4), 0, Math.PI * 2); ctx.fill()
        ctx.restore()
      })

      /* זרמי דאטה פנימה (ללא shadowBlur — חיסכון בעלות) */
      streams.forEach((s) => {
        const dx = -s.x, dy = -s.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        s.x += (dx / dist) * s.speed; s.y += (dy / dist) * s.speed
        const d2 = Math.sqrt(s.x * s.x + s.y * s.y)
        s.alpha = Math.min(1, d2 / 200)
        if (d2 < 20) { const a = Math.random() * Math.PI * 2; const r = 200 + Math.random() * 200; s.x = Math.cos(a) * r; s.y = Math.sin(a) * r }
        ctx.save(); ctx.globalAlpha = s.alpha * 0.7; ctx.fillStyle = s.color
        ctx.fillRect(cx + s.x - s.size / 2, cy + s.y - s.size / 2, s.size, s.size); ctx.restore()
      })

      /* נקודה מרכזית פועמת */
      const dotPulse = (Math.sin(t * 4) + 1) / 2
      ctx.save()
      ctx.globalAlpha = 0.9 + dotPulse * 0.1; ctx.fillStyle = '#fff'
      ctx.shadowColor = '#2ff3ff'; ctx.shadowBlur = 20 + dotPulse * 20
      ctx.beginPath(); ctx.arc(cx, cy, 5 + dotPulse * 2, 0, Math.PI * 2); ctx.fill(); ctx.restore()

      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [canvasRef])
}

/* מסך טעינת יצירת ההדמיה — אנימציית Claude Design + הודעות מתחלפות + מונה זמן.
   פעיל לכל אורך ההמתנה ל-Claude; ההורה מחליף ל-QuestPreview כשהיצירה מסתיימת. */
export default function GeneratingScreen({ title }: { title?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [idx, setIdx] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  useParticleCanvas(canvasRef)

  /* החלפת הודעות — ממשיכה ללא הגבלה כל עוד היצירה רצה */
  useEffect(() => {
    const timer = setInterval(() => setIdx((i) => (i + 1) % MESSAGES.length), 3500)
    return () => clearInterval(timer)
  }, [])

  /* מונה זמן — מראה שהמערכת עובדת (החיווי הכן: אין אחוז מזויף) */
  useEffect(() => {
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div
      dir="rtl"
      className="flex flex-col items-center justify-center min-h-screen overflow-hidden relative"
      style={{ background: 'var(--holo-bg-deep)', fontFamily: 'var(--font-display)' }}
    >
      <style>{`
        @keyframes ld-scanline { 0%{top:0%;opacity:1} 100%{top:100%;opacity:0} }
        @keyframes ld-blink { 0%,49%{opacity:1} 50%,100%{opacity:0} }
        @keyframes ld-fadein { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none} }
        @keyframes ld-sweep { 0%{transform:translateX(-120%)} 100%{transform:translateX(420%)} }
      `}</style>

      {/* קו סריקה */}
      <div style={{ position: 'absolute', left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,transparent,rgba(47,243,255,.5),transparent)', animation: 'ld-scanline 2.4s linear infinite', pointerEvents: 'none' }} />

      {/* קנבס החלקיקים */}
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />

      {/* תוכן */}
      <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', width: 420, maxWidth: '90vw' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.28em', textTransform: 'uppercase', color: 'rgba(47,243,255,.55)', marginBottom: 14 }}>◇ יוצר הדמיה</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 36, textAlign: 'center', textShadow: '0 0 20px rgba(47,243,255,.3)' }}>{title?.trim() || 'ההדמיה שלך'}</div>

        {/* מרווח לליבת ההולוגרמה (מצוירת בקנבס שמאחור) */}
        <div style={{ width: 240, height: 240, marginBottom: 36 }} />

        {/* סטטוס — ההודעות המתחלפות */}
        <div key={idx} style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '.12em', color: 'var(--holo-cyan-bright)', marginBottom: 18, textAlign: 'center', animation: 'ld-fadein .3s ease both', minHeight: 20, textShadow: '0 0 14px rgba(47,243,255,.6)' }}>
          {MESSAGES[idx]}
          <span style={{ animation: 'ld-blink .8s infinite' }}>_</span>
        </div>

        {/* בר התקדמות בלתי-מוגדר (משך היצירה אינו ידוע מראש) */}
        <div style={{ width: '100%', height: 4, borderRadius: 4, background: 'rgba(47,243,255,.1)', border: '1px solid rgba(47,243,255,.15)', overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ width: '30%', height: '100%', borderRadius: 4, background: 'linear-gradient(90deg,#ff45e6,#2ff3ff)', boxShadow: '0 0 16px rgba(47,243,255,.7)', animation: 'ld-sweep 1.6s ease-in-out infinite' }} />
        </div>

        {/* מונה זמן + הערת המתנה */}
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgba(47,243,255,.7)', letterSpacing: '.12em' }}>
          יוצר… {formatElapsed(elapsed)}
        </div>
        <p style={{ fontSize: 12, color: 'rgba(180,220,255,.4)', marginTop: 8, textAlign: 'center' }}>
          יצירות עשירות יכולות לקחת כמה דקות — שווה לחכות ✨
        </p>
      </div>
    </div>
  )
}
