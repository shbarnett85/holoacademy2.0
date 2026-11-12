import { useEffect, useRef, useState } from 'react'
import { tokenRgba, tokenValue } from '../../styles/tokens'
import { modalBackdrop, panelAi, panelStaff, progressFill, progressTrack } from '../../styles/ui'

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

/* מנוע החלקיקים: ליבת משושים מסתובבת, חלקיקים מקיפים, טבעות מקווקוות וזרמי דאטה נשאבים פנימה.
   מצויר שטוח על רקע הממשק (בלי זוהר ובלי מעברי צבע); הצבעים נקראים מהטוקנים בזמן ריצה.
   מותאם למחשבים חלשים: פחות חלקיקים, ועצירה ב-prefers-reduced-motion. */
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

    /* צבעים מהטוקנים: דיו וסגול המכונה, ומעט תכלת הולוגרמה ("המכונה חושבת") */
    const INK = tokenValue('--color-ink')
    const DEEP = tokenValue('--color-machine-deep')
    const SURFACE = tokenValue('--color-surface')
    const HOLO = tokenValue('--color-holo')
    const PALETTE = [DEEP, INK, SURFACE, DEEP, INK, HOLO]
    /* כמויות מופחתות לעומת הרפרנס (120/40) לחלקלקות במחשבי בית ספר */
    const orbs = Array.from({ length: 70 }, (_, i) => ({
      angle: (i / 70) * Math.PI * 2,
      radius: 80 + Math.sin(i * 0.7) * 60,
      speed: 0.003 + Math.random() * 0.006,
      size: 1.5 + Math.random() * 3,
      color: PALETTE[i % PALETTE.length],
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

      /* לוח הליבה: עיגול שטוח עם קו דיו */
      ctx.beginPath(); ctx.arc(cx, cy, 58, 0, Math.PI * 2)
      ctx.fillStyle = SURFACE; ctx.fill()
      ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke()

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
      drawHex(44, INK, 2, t * 0.4)
      drawHex(34, DEEP, 1.5, -t * 0.6)
      drawHex(24, tokenRgba('--color-ink', 0.55), 1, t * 0.9)

      /* טבעות מסתובבות מקווקוות + שנתות */
      const rings: [number, number, `--${string}`, number, number][] = [
        [130, 1.6, '--color-machine-deep', 0.75, 0.5],
        [165, 1.2, '--color-ink', 0.4, 0.35],
        [200, 1, '--color-machine-deep', 0.4, 0.25],
      ]
      rings.forEach(([r, lw, token, a0, sp], ri) => {
        const col = tokenRgba(token, a0)
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * sp * (ri % 2 === 0 ? 1 : -1))
        ctx.beginPath(); ctx.setLineDash([12, 8]); ctx.arc(0, 0, r, 0, Math.PI * 2)
        ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke(); ctx.setLineDash([])
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2
          ctx.beginPath()
          ctx.moveTo(Math.cos(a) * (r - 4), Math.sin(a) * (r - 4))
          ctx.lineTo(Math.cos(a) * (r + 4), Math.sin(a) * (r + 4))
          ctx.strokeStyle = tokenRgba(token, 1); ctx.lineWidth = 1.2; ctx.stroke()
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
        ctx.fillStyle = o.color
        ctx.beginPath(); ctx.arc(x, y, o.size * (0.8 + pulse * 0.4), 0, Math.PI * 2); ctx.fill()
        ctx.restore()
      })

      /* זרמי דאטה פנימה */
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

      /* נקודה מרכזית פועמת: תכלת ההולוגרמה עם קו דיו */
      const dotPulse = (Math.sin(t * 4) + 1) / 2
      ctx.beginPath(); ctx.arc(cx, cy, 6 + dotPulse * 2, 0, Math.PI * 2)
      ctx.fillStyle = HOLO; ctx.fill()
      ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke()

      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [canvasRef])
}

/* מסך טעינת יצירת השיעור — אנימציית החלקיקים + הודעות מתחלפות + מונה זמן.
   פעיל לכל אורך ההמתנה ל-Claude; ההורה מחליף ל-QuestPreview כשהיצירה מסתיימת. */
export default function GeneratingScreen({ title, onCancel }: { title?: string; onCancel?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [idx, setIdx] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [confirmOpen, setConfirmOpen] = useState(false)
  useParticleCanvas(canvasRef)

  /* Escape = אותה פעולה כמו כפתור ה-X (פתיחת האישור); Escape שני סוגר וממשיך */
  useEffect(() => {
    if (!onCancel) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setConfirmOpen((open) => !open)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

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
      style={{ background: 'var(--color-machine-bg)', fontFamily: 'var(--font-display)' }}
    >
      <style>{`
        @keyframes ld-blink { 0%,49%{opacity:1} 50%,100%{opacity:0} }
        @keyframes ld-fadein { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none} }
        /* המקטע 30% מרוחב המסלול — הטווח ‎-120%..420%‎ (יחסי למקטע) מכסה את כל המסלול; ימין→שמאל, טבעי ב-RTL */
        @keyframes ld-sweep { 0%{transform:translateX(420%)} 100%{transform:translateX(-120%)} }
      `}</style>

      {/* X לביטול — פינה שמאלית-עליונה (מוסכמת הסגירה ב-RTL); מטרת מגע 44px */}
      {onCancel && (
        <button
          aria-label="ביטול יצירה"
          className="holo-button holo-button--staff"
          onClick={() => setConfirmOpen(true)}
          style={{
            position: 'absolute', top: 14, left: 14, zIndex: 4,
            width: 44, height: 44, padding: 0, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, lineHeight: 1, fontFamily: 'inherit',
          }}
        >✕</button>
      )}

      {/* דיאלוג אישור הביטול — לחיצה בטעות מאבדת דקה וחצי של יצירה */}
      {confirmOpen && onCancel && (
        <div
          role="alertdialog"
          aria-label="אישור ביטול יצירה"
          style={{ ...modalBackdrop, position: 'absolute', inset: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setConfirmOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ ...panelStaff, width: 340, maxWidth: '86vw', padding: '1.4rem 1.5rem', textAlign: 'center' }}
          >
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--color-machine-deep)', marginBottom: 6 }}>לבטל את היצירה?</div>
            <div style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 18 }}>ההתקדמות תאבד.</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                className="holo-button holo-button--staff"
                onClick={onCancel}
                style={{ minHeight: 44, padding: '0 1.1rem', fontSize: 13.5, fontFamily: 'inherit' }}
              >ביטול יצירה</button>
              <button
                className="holo-button holo-button--staff"
                onClick={() => setConfirmOpen(false)}
                style={{ minHeight: 44, padding: '0 1.4rem', fontSize: 13.5, fontFamily: 'inherit' }}
              >המשך</button>
            </div>
          </div>
        </div>
      )}

      {/* קנבס החלקיקים */}
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />

      {/* תוכן */}
      <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', width: 420, maxWidth: '90vw' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '.28em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 14 }}>◇ יוצר שיעור</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-machine-deep)', marginBottom: 36, textAlign: 'center' }}>{title?.trim() || 'השיעור שלך'}</div>

        {/* מרווח לליבת ההולוגרמה (מצוירת בקנבס שמאחור) */}
        <div style={{ width: 240, height: 240, marginBottom: 36 }} />

        {/* סטטוס — ההודעות המתחלפות (אזור של ה-AI: רקע machine-tint) */}
        <div key={idx} style={{ ...panelAi, padding: '7px 16px', fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '.12em', marginBottom: 18, textAlign: 'center', animation: 'ld-fadein .3s ease both', minHeight: 20 }}>
          {MESSAGES[idx]}
          <span style={{ animation: 'ld-blink .8s infinite' }}>_</span>
        </div>

        {/* בר התקדמות בלתי-מוגדר (משך היצירה אינו ידוע מראש) */}
        <div style={{ ...progressTrack, position: 'relative', width: '100%', height: 12, marginBottom: 12 }}>
          {/* מעוגן ל-left:0 — בלי זה, ב-RTL המקטע נצמד לימין וההחלקה מכסה רק את מרכז המסלול */}
          <div style={{ ...progressFill, position: 'absolute', left: 0, top: 0, width: '30%', borderRadius: 999, animation: 'ld-sweep 1.6s ease-in-out infinite' }} />
        </div>

        {/* מונה זמן + הערת המתנה */}
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-ink)', letterSpacing: '.12em' }}>
          יוצר… {formatElapsed(elapsed)}
        </div>
        <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 8, textAlign: 'center' }}>
          יצירות עשירות יכולות לקחת כמה דקות — שווה לחכות ✨
        </p>
      </div>
    </div>
  )
}
