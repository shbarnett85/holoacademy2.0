import { useEffect, useRef } from 'react'

/* ──────────────────────────────────────────────────────────────────────────
   טעינת הקריסטל במסך הניצחון — חלקיקים עדינים מתכנסים מהמסך אל שורת הקריסטלים
   ו"ממלאים" אותה. עדין (עשרות חלקיקים, תנועה רכה, ~1.2ש'), לא נפיץ.
   - count: מספר הקריסטלים שנצברו → קובע כמות חלקיקים (משמעותי, לא אקראי).
   - targetRef: שורת הקריסטלים (יעד ההתכנסות).
   - prefers-reduced-motion / מכשיר חלש → לא מצייר כלל (המילוי הסטטי נשאר).
   cleanup מלא ב-unmount + בתום האנימציה (לא משאיר חלקיקים רצים).
   ────────────────────────────────────────────────────────────────────────── */
export default function CrystalCharge({ count, targetRef }: { count: number; targetRef: React.RefObject<HTMLElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    if (reduce || count <= 0) return /* גרסה סטטית — בלי חלקיקים מעופפים */
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = (canvas.width = window.innerWidth)
    const h = (canvas.height = window.innerHeight)
    /* יעד: מרכז שורת הקריסטלים (אם זמין), אחרת מרכז-המסך מעט מעל האמצע */
    const rect = targetRef.current?.getBoundingClientRect()
    const tx = rect ? rect.left + rect.width / 2 : w / 2
    const ty = rect ? rect.top + rect.height / 2 : h * 0.45

    const DURATION = 1300
    /* כמות מבוקרת: ~14 חלקיקים לכל קריסטל, תקרה 90 (ידידותי לטאבלט זול) */
    const COUNT = Math.min(90, Math.max(20, count * 14))

    interface P { x: number; y: number; delay: number; size: number; color: string }
    const particles: P[] = []
    for (let i = 0; i < COUNT; i++) {
      const ang = Math.random() * Math.PI * 2
      const dist = (0.35 + Math.random() * 0.65) * Math.hypot(w, h) * 0.5
      particles.push({
        x: tx + Math.cos(ang) * dist,
        y: ty + Math.sin(ang) * dist,
        delay: Math.random() * 0.35, /* כניסה מדורגת — תחושת זרימה רכה */
        size: 1.2 + Math.random() * 2.3,
        color: Math.random() > 0.5 ? '0,246,255' : '120,180,255',
      })
    }

    let raf = 0
    const start = performance.now()
    function frame(now: number) {
      const t = (now - start) / DURATION
      if (t >= 1) { ctx!.clearRect(0, 0, w, h); return }
      ctx!.clearRect(0, 0, w, h)
      for (const p of particles) {
        /* ease-in-out על הזמן האישי (אחרי ה-delay) — תנועה רכה אל היעד */
        const lt = Math.max(0, Math.min(1, (t - p.delay) / (1 - p.delay)))
        const e = lt < 0.5 ? 2 * lt * lt : 1 - Math.pow(-2 * lt + 2, 2) / 2
        const x = p.x + (tx - p.x) * e
        const y = p.y + (ty - p.y) * e
        const alpha = lt < 0.85 ? 0.85 : 0.85 * (1 - (lt - 0.85) / 0.15) /* דועך עם ההגעה */
        ctx!.beginPath()
        ctx!.arc(x, y, p.size * (1 - e * 0.4), 0, Math.PI * 2)
        ctx!.fillStyle = `rgba(${p.color},${alpha})`
        ctx!.fill()
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); ctx.clearRect(0, 0, w, h) }
  }, [count, targetRef])

  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 40 }} />
}
