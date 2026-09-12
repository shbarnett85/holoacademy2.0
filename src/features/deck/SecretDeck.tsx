import { useCallback, useEffect, useState } from 'react'

/* ── עמוד סודי: מצגת GESAwards 2026 (‎/ges2026, לא מקושר משום מקום) ──
   צופה שקפים מלא-מסך: חיצי מקלדת / לחיצה / החלקה, נקודות ניווט, מסך מלא.
   השקפים הם תמונות סטטיות ב-public/deck (רונדרו מה-PDF המקורי). */

const SLIDES = Array.from({ length: 10 }, (_, i) => `/deck/slide-${String(i + 1).padStart(2, '0')}.jpg`)

export default function SecretDeck() {
  const [idx, setIdx] = useState(0)
  const [touchX, setTouchX] = useState<number | null>(null)

  const go = useCallback((d: number) => {
    setIdx((i) => Math.max(0, Math.min(SLIDES.length - 1, i + d)))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') go(1)
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(-1)
      else if (e.key === 'Home') setIdx(0)
      else if (e.key === 'End') setIdx(SLIDES.length - 1)
      else if (e.key === 'f' || e.key === 'F') toggleFull()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go])

  /* טעינה מוקדמת של השכנים — מעבר חלק */
  useEffect(() => {
    for (const j of [idx + 1, idx - 1]) {
      if (j >= 0 && j < SLIDES.length) { const im = new Image(); im.src = SLIDES[j] }
    }
  }, [idx])

  useEffect(() => { document.title = 'HoloAcademy — GESAwards 2026' }, [])

  function toggleFull() {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen().catch(() => {})
  }

  const navBtn: React.CSSProperties = {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)', zIndex: 3,
    width: 46, height: 46, borderRadius: '50%', cursor: 'pointer', fontSize: 20,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(5,12,28,0.65)', border: '1px solid rgba(0,213,255,0.35)',
    color: '#bfe9ff', backdropFilter: 'blur(6px)', userSelect: 'none',
  }

  return (
    <div
      dir="ltr"
      style={{ position: 'fixed', inset: 0, background: 'radial-gradient(120% 120% at 50% 30%, #0a1734 0%, #050a18 60%, #03060f 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
      onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX === null) return
        const dx = e.changedTouches[0].clientX - touchX
        if (Math.abs(dx) > 45) go(dx < 0 ? 1 : -1)
        setTouchX(null)
      }}
    >
      {/* השקף */}
      <div
        onClick={(e) => go(e.clientX > window.innerWidth / 2 ? 1 : -1)}
        style={{ position: 'relative', width: 'min(96vw, calc((100vh - 76px) * 16 / 9))', aspectRatio: '16 / 9', cursor: 'pointer', borderRadius: 14, overflow: 'hidden', boxShadow: '0 0 60px rgba(0,150,255,0.22), 0 0 4px rgba(0,213,255,0.4)' }}
      >
        {SLIDES.map((src, i) => (
          <img key={src} src={src} alt={`שקף ${i + 1}`} draggable={false}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: i === idx ? 1 : 0, transition: 'opacity 0.3s ease', background: '#04091a' }} />
        ))}
      </div>

      {/* חיצים */}
      {idx > 0 && <button style={{ ...navBtn, left: 14 }} onClick={() => go(-1)} aria-label="הקודם">‹</button>}
      {idx < SLIDES.length - 1 && <button style={{ ...navBtn, right: 14 }} onClick={() => go(1)} aria-label="הבא">›</button>}

      {/* פס תחתון: נקודות + מונה + מסך מלא */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16, zIndex: 3 }}>
        <span style={{ fontSize: 12, color: 'rgba(160,210,255,0.6)', fontFamily: 'var(--font-mono, monospace)', minWidth: 48, textAlign: 'center' }}>{idx + 1} / {SLIDES.length}</span>
        <div style={{ display: 'flex', gap: 7 }}>
          {SLIDES.map((_, i) => (
            <button key={i} onClick={() => setIdx(i)} aria-label={`שקף ${i + 1}`}
              style={{ width: i === idx ? 22 : 8, height: 8, borderRadius: 5, cursor: 'pointer', border: 'none', transition: 'all 0.25s', background: i === idx ? 'linear-gradient(90deg,#00d5ff,#a86bff)' : 'rgba(120,170,220,0.3)' }} />
          ))}
        </div>
        <button onClick={toggleFull} title="מסך מלא (F)"
          style={{ width: 32, height: 32, borderRadius: 8, cursor: 'pointer', fontSize: 15, background: 'rgba(5,12,28,0.65)', border: '1px solid rgba(0,213,255,0.35)', color: '#bfe9ff' }}>⛶</button>
      </div>
    </div>
  )
}
