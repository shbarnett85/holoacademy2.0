import { useEffect, useRef, useState } from 'react'

type Phase = 'entering' | 'hold' | 'disintegrate' | 'out'

/* ספלאש פתיחה — בנייה הולוגרפית של השם ואז התפוררות לחלקיקים (Claude Design).
   onDone נקרא בסיום כדי לחשוף את האפליקציה. החלקיקים רצים רק בפאזת ההתפוררות (~1ש׳)
   ואז ה-RAF נעצר — קל גם למחשבים חלשים. */
export default function Splash({ onDone }: { onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)
  const [phase, setPhase] = useState<Phase>('entering')

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase('hold'), 1400),
      setTimeout(() => setPhase('disintegrate'), 2600),
      setTimeout(() => setPhase('out'), 3700),
      setTimeout(() => onDone(), 4100),
    ]
    return () => timers.forEach(clearTimeout)
  }, [onDone])

  useEffect(() => {
    if (phase !== 'disintegrate') return
    const canvas = canvasRef.current
    if (!canvas) return
    const W = (canvas.width = window.innerWidth)
    const H = (canvas.height = window.innerHeight)
    if (W <= 0 || H <= 0) return /* viewport לא מוכן/גודל-אפס — מדלגים על אפקט החלקיקים בלי לקרוס */
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    /* דגימת הטקסט מ-canvas מחוץ-למסך → חלקיקים */
    const off = document.createElement('canvas')
    off.width = W
    off.height = H
    const octx = off.getContext('2d')!
    octx.textAlign = 'center'
    octx.textBaseline = 'middle'
    octx.font = 'bold 88px Rubik, sans-serif'
    octx.fillStyle = '#2ff3ff'
    octx.fillText('HoloAcademy', W / 2, H / 2 - 14)
    octx.font = '22px Rubik, sans-serif'
    octx.fillStyle = 'rgba(180,220,255,.6)'
    octx.fillText('ממד חדש של למידה', W / 2, H / 2 + 52)
    const img = octx.getImageData(0, 0, W, H).data

    /* STEP=5 (מעט פחות חלקיקים מהרפרנס) — חלק יותר במחשבים חלשים */
    const STEP = 5
    const particles: { x: number; y: number; vx: number; vy: number; alpha: number; decay: number; size: number; r: number; g: number; b: number }[] = []
    for (let y = 0; y < H; y += STEP) {
      for (let x = 0; x < W; x += STEP) {
        const i = (y * W + x) * 4
        if (img[i + 3] < 40) continue
        const angle = Math.atan2(y - H / 2, x - W / 2)
        const speed = Math.random() * 6 + 1.5
        particles.push({
          x, y,
          vx: Math.cos(angle) * speed * (0.4 + Math.random() * 0.6),
          vy: Math.sin(angle) * speed * (0.4 + Math.random() * 0.6) - Math.random() * 2,
          alpha: 1,
          decay: 0.012 + Math.random() * 0.018,
          size: Math.random() * 3 + 1,
          r: img[i], g: img[i + 1], b: img[i + 2],
        })
      }
    }

    const draw = () => {
      ctx.clearRect(0, 0, W, H)
      let alive = false
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.vx *= 0.995; p.alpha -= p.decay
        if (p.alpha <= 0) continue
        alive = true
        ctx.globalAlpha = p.alpha
        ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`
        ctx.fillRect(p.x, p.y, p.size, p.size)
      }
      ctx.globalAlpha = 1
      if (alive) rafRef.current = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(rafRef.current)
  }, [phase])

  const entering = phase === 'entering'
  const dissolving = phase === 'disintegrate' || phase === 'out'

  /* לחיצה/מגע בכל מקום על הספלאש מדלגים ישר לסיום. חשוב לא רק ל-UX (למי שממהר) —
     זו גם ה"מחווית משתמש" הראשונה בכניסה קרה לדף (למשל קישור ישיר ל-/play/leonardo,
     בלי קליק קודם על שום דבר). בלי מחווה אמיתית על העמוד, מדיניות הדפדפן חוסמת אודיו
     לחלוטין — האנימציות האוטומטיות שרצות מיד אח"כ (חור-תולעת, כניסת הפאנל, הקלדה)
     מנסות להשמיע צליל *לפני* שהייתה הזדמנות למחווה, וה-Web Audio API משתיק אותן
     בשקט (לא ניתן לעקוף בקוד — זו מדיניות דפדפן, לא תקלה). הדילוג-בנגיעה כאן נותן
     סיכוי מוקדם וטבעי למחווה כזו לפני שהמשחק בכלל עולה. */
  function skip() { onDone() }

  return (
    <div
      onClick={skip}
      onTouchStart={skip}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, background: '#04060e',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        opacity: phase === 'out' ? 0 : 1,
        transition: phase === 'out' ? 'opacity .4s ease' : 'none',
        overflow: 'hidden',
        cursor: 'pointer',
      }}
    >
      <style>{`
        @keyframes splash-build { 0%{opacity:0;clip-path:inset(0 100% 0 0);letter-spacing:.6em} 60%{opacity:1;clip-path:inset(0 0% 0 0);letter-spacing:.04em} 100%{opacity:1;clip-path:inset(0 0 0 0);letter-spacing:.02em} }
        @keyframes splash-sub { 0%,40%{opacity:0;transform:translateY(10px)} 100%{opacity:1;transform:translateY(0)} }
        @keyframes splash-glow { 0%,100%{text-shadow:0 0 20px rgba(47,243,255,.4),0 0 60px rgba(47,243,255,.15)} 50%{text-shadow:0 0 40px rgba(47,243,255,.7),0 0 100px rgba(47,243,255,.3),0 0 4px #fff} }
        @keyframes splash-scan { 0%{top:0%;opacity:1} 100%{top:100%;opacity:0} }
        @keyframes splash-glitch { 0%,90%,100%{transform:translateX(0) skewX(0)} 92%{transform:translateX(-6px) skewX(-1deg)} 94%{transform:translateX(4px) skewX(.5deg)} 96%{transform:translateX(-3px)} 98%{transform:translateX(2px)} }
      `}</style>

      {entering && (
        <div style={{ position: 'absolute', left: 0, right: 0, height: 2, background: 'linear-gradient(90deg,transparent,#2ff3ff,transparent)', animation: 'splash-scan .9s ease-in forwards', pointerEvents: 'none' }} />
      )}

      <div style={{ position: 'absolute', left: '20%', top: '20%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle,rgba(47,243,255,.08),transparent 70%)', filter: 'blur(40px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', right: '20%', bottom: '20%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle,rgba(255,69,230,.06),transparent 70%)', filter: 'blur(40px)', pointerEvents: 'none' }} />

      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', display: dissolving ? 'block' : 'none' }} />

      <div ref={textRef} style={{ textAlign: 'center', direction: 'rtl', opacity: dissolving ? 0 : 1, transition: dissolving ? 'opacity .05s' : 'none' }}>
        <h1
          style={{
            margin: 0, fontSize: 88, fontWeight: 900, letterSpacing: '.02em', lineHeight: 1,
            fontFamily: 'var(--font-display)',
            background: 'linear-gradient(135deg,#ffffff 20%,#7ef6ff 55%,#ff45e6 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            filter: 'drop-shadow(0 0 28px rgba(47,243,255,.45))',
            animation: entering ? 'splash-build .9s cubic-bezier(.22,.7,.35,1) forwards, splash-glitch 4s infinite' : 'splash-glow 2s ease-in-out infinite, splash-glitch 4s infinite',
          }}
        >HoloAcademy</h1>
        <p style={{ margin: '18px 0 0', fontSize: 22, fontWeight: 400, color: 'rgba(180,220,255,.6)', letterSpacing: '.06em', fontFamily: 'var(--font-display)', animation: entering ? 'splash-sub 1.2s .5s both' : 'none' }}>ממד חדש של למידה</p>
      </div>

      {!dissolving && (
        <div style={{ position: 'absolute', bottom: 60, display: 'flex', gap: 10 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: '#2ff3ff', animation: `holo-dot-pulse 1.2s ${i * 0.25}s ease-in-out infinite`, boxShadow: '0 0 10px #2ff3ff' }} />
          ))}
        </div>
      )}
    </div>
  )
}
