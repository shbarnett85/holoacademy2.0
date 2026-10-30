/* חלקים קטנים של תחושת המשחק: תג הרצף, ואנימציית פתיחת השער */
import { useEffect, useState } from 'react'
import { STREAK_EVENT, prefersReducedMotion } from './gameFeel/engine'
import { HUD_TEXT } from './gameFeel/text'

/* רצף של 3 תשובות ומעלה: תג קצר. בלי פרס על מהירות */
export function StreakBadge() {
  const [shown, setShown] = useState<{ n: number; key: number } | null>(null)
  useEffect(() => {
    let timer = 0
    const on = (e: Event) => {
      const n = (e as CustomEvent<{ streak?: number }>).detail?.streak ?? 0
      setShown({ n, key: Date.now() })
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setShown(null), 1700)
    }
    window.addEventListener(STREAK_EVENT, on)
    return () => { window.removeEventListener(STREAK_EVENT, on); window.clearTimeout(timer) }
  }, [])
  if (!shown) return null
  return (
    <div
      key={shown.key}
      data-streak-badge
      role="status"
      style={{
        position: 'fixed', top: '4rem', insetInlineEnd: '1.2rem', zIndex: 84, pointerEvents: 'none',
        fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: '#0A1322', background: '#2FF3FF', borderRadius: 999, padding: '6px 16px',
        animation: prefersReducedMotion() ? undefined : 'holo-streak-badge 1.7s ease-out forwards',
      }}
    >
      <style>{`@keyframes holo-streak-badge { 0% { opacity: 0; transform: scale(.4) } 14% { opacity: 1; transform: scale(1.15) } 24% { transform: scale(1) } 80% { opacity: 1 } 100% { opacity: 0; transform: translateY(-8px) } }`}</style>
      {HUD_TEXT.streak(shown.n)}
    </div>
  )
}

/* המפתח מסתובב והשער נפתח */
export function GateUnlock() {
  return (
    <div aria-hidden="true" data-gate-unlock style={{ display: 'flex', justifyContent: 'center' }}>
      <style>{`
        @keyframes gate-key-turn { from { transform: rotate(0) } to { transform: rotate(90deg) } }
        @keyframes gate-door-r { to { transform: perspective(240px) rotateY(68deg) } }
        @keyframes gate-door-l { to { transform: perspective(240px) rotateY(-68deg) } }
        .gate-key { transform-box: fill-box; transform-origin: 18% 50%; animation: gate-key-turn .55s ease-in-out .1s both; }
        .gate-door-r { transform-box: fill-box; transform-origin: 100% 50%; animation: gate-door-r .7s ease-in-out .6s both; }
        .gate-door-l { transform-box: fill-box; transform-origin: 0% 50%; animation: gate-door-l .7s ease-in-out .6s both; }
        @media (prefers-reduced-motion: reduce) { .gate-key, .gate-door-r, .gate-door-l { animation: none; } }
      `}</style>
      <svg width="96" height="72" viewBox="0 0 96 72" fill="none">
        <rect x="6" y="4" width="84" height="64" rx="6" stroke="#2FF3FF" strokeWidth="2" opacity=".55" />
        <rect x="10" y="8" width="76" height="56" rx="3" fill="#BFF9FF" opacity=".18" />
        <rect className="gate-door-r" x="10" y="8" width="38" height="56" fill="#15243F" stroke="#2FF3FF" strokeWidth="1.5" />
        <rect className="gate-door-l" x="48" y="8" width="38" height="56" fill="#15243F" stroke="#2FF3FF" strokeWidth="1.5" />
        <g className="gate-key" stroke="#F3B76A" strokeWidth="3" strokeLinecap="round">
          <circle cx="36" cy="36" r="6" fill="#0A1322" />
          <path d="M42 36 H60 M54 36 V42 M60 36 V41" />
        </g>
      </svg>
    </div>
  )
}
