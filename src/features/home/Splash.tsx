import { useEffect, useRef, useState } from 'react'
import { tokenRgba } from '../../styles/tokens'

type Phase = 'entering' | 'hold' | 'disintegrate' | 'out'

/* ספלאש פתיחה — בנייה הולוגרפית של השם ואז התפוררות לחלקיקים (Claude Design).
   onDone נקרא בסיום כדי לחשוף את האפליקציה. החלקיקים רצים רק בפאזת ההתפוררות (~1ש׳)
   ואז ה-RAF נעצר — קל גם למחשבים חלשים. */
export default function Splash({ onDone }: { onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)
  /* onDone נקרא פעם אחת בלבד — בין אם מהטיימר, מקליק או ממגע (במגע נורים שניים) */
  const doneRef = useRef(false)
  const [phase, setPhase] = useState<Phase>('entering')

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase('hold'), 1400),
      setTimeout(() => setPhase('disintegrate'), 2600),
      setTimeout(() => setPhase('out'), 3700),
      setTimeout(() => { if (!doneRef.current) { doneRef.current = true; onDone() } }, 4100),
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

    /* צבעי החלקיקים נקראים מהטוקנים בזמן ריצה (אין ערך צבע קשיח): הכותרת ב-machine-deep
       עם מעט holo ודיו, שורת המשנה ב-muted. ציור רגיל על הרקע הבהיר, בלי זוהר ובלי מיזוג מוסיף. */
    const deep = tokenRgba('--color-machine-deep', 1)
    const holo = tokenRgba('--color-holo', 1)
    const ink = tokenRgba('--color-ink', 1)
    const muted = tokenRgba('--color-muted', 1)
    const subTop = H / 2 + 34 /* מתחת לקו הזה: שורת המשנה */

    /* דגימת הטקסט מ-canvas מחוץ-למסך → חלקיקים (הצבע כאן משמש רק כמסכה) */
    const off = document.createElement('canvas')
    off.width = W
    off.height = H
    const octx = off.getContext('2d')!
    octx.textAlign = 'center'
    octx.textBaseline = 'middle'
    octx.font = 'bold 88px Rubik, sans-serif'
    octx.fillStyle = ink
    octx.fillText('HoloAcademy', W / 2, H / 2 - 14)
    octx.font = '22px Rubik, sans-serif'
    octx.fillText('ממד חדש של למידה', W / 2, H / 2 + 52)
    const img = octx.getImageData(0, 0, W, H).data

    /* STEP=5 (מעט פחות חלקיקים מהרפרנס) — חלק יותר במחשבים חלשים */
    const STEP = 5
    const particles: { x: number; y: number; vx: number; vy: number; alpha: number; decay: number; size: number; color: string }[] = []
    for (let y = 0; y < H; y += STEP) {
      for (let x = 0; x < W; x += STEP) {
        const i = (y * W + x) * 4
        if (img[i + 3] < 40) continue
        const angle = Math.atan2(y - H / 2, x - W / 2)
        const speed = Math.random() * 6 + 1.5
        const tone = Math.random()
        particles.push({
          x, y,
          vx: Math.cos(angle) * speed * (0.4 + Math.random() * 0.6),
          vy: Math.sin(angle) * speed * (0.4 + Math.random() * 0.6) - Math.random() * 2,
          alpha: 1,
          decay: 0.012 + Math.random() * 0.018,
          size: Math.random() * 3 + 1,
          color: y > subTop ? muted : tone < 0.6 ? deep : tone < 0.85 ? holo : ink,
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
        ctx.fillStyle = p.color
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
     סיכוי מוקדם וטבעי למחווה כזו לפני שהמשחק בכלל עולה.
     במגע נורים גם onTouchStart וגם onClick — doneRef מבטיח ש-onDone נקרא פעם אחת. */
  function skip() {
    if (doneRef.current) return
    doneRef.current = true
    onDone()
  }

  return (
    <div
      onClick={skip}
      onTouchStart={skip}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--color-machine-bg)',
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
        @keyframes splash-scan { 0%{top:0%;opacity:1} 100%{top:100%;opacity:0} }
      `}</style>

      {entering && (
        <div style={{ position: 'absolute', left: 0, right: 0, height: 2, background: 'var(--color-machine-deep)', animation: 'splash-scan .9s ease-in forwards', pointerEvents: 'none' }} />
      )}
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', display: dissolving ? 'block' : 'none' }} />

      <div ref={textRef} style={{ textAlign: 'center', direction: 'rtl', opacity: dissolving ? 0 : 1, transition: dissolving ? 'opacity .05s' : 'none' }}>
        <h1
          style={{
            margin: 0, fontSize: 88, fontWeight: 900, letterSpacing: '.02em', lineHeight: 1,
            fontFamily: 'var(--font-display)',
            color: 'var(--color-machine-deep)',
            animation: entering ? 'splash-build .9s cubic-bezier(.22,.7,.35,1) forwards' : 'none',
          }}
        >HoloAcademy</h1>
        <p style={{ margin: '18px 0 0', fontSize: 22, fontWeight: 400, color: 'var(--color-muted)', letterSpacing: '.06em', fontFamily: 'var(--font-display)', animation: entering ? 'splash-sub 1.2s .5s both' : 'none' }}>ממד חדש של למידה</p>
      </div>

      {!dissolving && (
        <div style={{ position: 'absolute', bottom: 60, display: 'flex', gap: 10 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-machine-deep)', animation: `holo-dot-pulse 1.2s ${i * 0.25}s ease-in-out infinite` }} />
          ))}
        </div>
      )}
    </div>
  )
}
