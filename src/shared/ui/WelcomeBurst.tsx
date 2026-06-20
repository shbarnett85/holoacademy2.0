import { useEffect } from 'react'

/* מעבר חגיגי בכניסה (d-*) — מתוך home-screen: בזק רשת, קווי סריקה, טבעות פעימה,
   התפרצות פיקסלים, אייקון וי ו"ברוכים הבאים" עם glitch. מסתיים מעצמו (~2.2ש׳). */
const ACCENT = '#2ff3ff'
const ACC2 = '#9b8cff'
const RGB = '47,243,255'
const BRAND = ['#2ff3ff', '#9b8cff', '#ff45e6']

export default function WelcomeBurst({ name, role = 'teacher', onDone }: { name?: string; role?: 'teacher' | 'admin' | 'super_admin'; onDone: () => void }) {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const t = window.setTimeout(onDone, reduce ? 400 : 2200)
    return () => window.clearTimeout(t)
  }, [onDone])

  const accessLabel = role === 'teacher' ? 'TEACHER · ACCESS GRANTED' : 'STAFF · ACCESS GRANTED'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: 'rgba(4,6,14,.92)', backdropFilter: 'blur(6px)' }}>
      {/* בזק רשת רקע */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(rgba(${RGB},.06) 1px,transparent 1px),linear-gradient(90deg,rgba(${RGB},.06) 1px,transparent 1px)`, backgroundSize: '32px 32px', animation: 'd-grid 2.2s ease forwards', pointerEvents: 'none' }} />

      {/* קווי סריקה */}
      <div style={{ position: 'absolute', left: 0, right: 0, height: 3, background: `linear-gradient(90deg,transparent,${ACCENT},transparent)`, animation: 'd-scan .55s ease-in forwards', boxShadow: `0 0 18px ${ACCENT}`, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${ACC2},transparent)`, animation: 'd-scan2 .55s .12s ease-in forwards', pointerEvents: 'none' }} />

      {/* טבעות פעימה */}
      <div style={{ position: 'absolute', width: 140, height: 140, borderRadius: '50%', border: `2px solid ${ACCENT}`, boxShadow: `0 0 20px ${ACCENT}`, animation: 'd-ring 1.1s ease forwards', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', width: 140, height: 140, borderRadius: '50%', border: `1px solid ${ACC2}`, animation: 'd-ring2 1.1s .18s ease forwards', pointerEvents: 'none' }} />

      {/* התפרצות פיקסלים */}
      {Array.from({ length: 30 }, (_, i) => {
        const angle = (i / 30) * Math.PI * 2
        const dist = 60 + Math.random() * 90
        const color = BRAND[i % BRAND.length]
        const size = 4 + Math.random() * 8
        return (
          <div key={i} style={{
            position: 'absolute', width: size, height: size, background: color, boxShadow: `0 0 8px ${color}`,
            borderRadius: i % 3 === 0 ? 0 : 1,
            ['--dx' as string]: Math.cos(angle) * dist + 'px',
            ['--dy' as string]: Math.sin(angle) * dist + 'px',
            animation: `d-pixel ${0.5 + Math.random() * 0.7}s ${Math.random() * 0.25}s ease forwards`,
            pointerEvents: 'none',
          }} />
        )
      })}

      {/* אייקון וי */}
      <div style={{ position: 'relative', zIndex: 3, width: 100, height: 100, borderRadius: '50%', background: `linear-gradient(135deg,rgba(${RGB},.18),rgba(${RGB},.08))`, border: `2.5px solid ${ACCENT}`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 40px rgba(${RGB},.5),0 0 80px rgba(${RGB},.2)`, animation: 'd-check .65s cubic-bezier(.22,.7,.35,1) both' }}>
        <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
      </div>

      {/* טקסט ברכה עם glitch */}
      <div style={{ position: 'relative', zIndex: 3, textAlign: 'center', marginTop: 22, animation: 'd-text 2.2s ease forwards' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.28em', textTransform: 'uppercase', color: `rgba(${RGB},.7)`, marginBottom: 8 }}>{accessLabel}</div>
        <div style={{ fontSize: 26, fontWeight: 900, color: '#fff', textShadow: `0 0 20px rgba(${RGB},.7)`, animation: 'd-glitch 2.2s ease forwards' }}>ברוכים הבאים</div>
        {name && <div style={{ fontSize: 18, fontWeight: 700, color: ACCENT, marginTop: 6, textShadow: `0 0 14px rgba(${RGB},.9)`, fontFamily: 'var(--font-display)' }}>{name}</div>}
      </div>
    </div>
  )
}
