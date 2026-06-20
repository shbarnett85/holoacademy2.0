import { useEffect, useRef, useState } from 'react'

/* ──────────────────────────────────────────────────────────────────────────
   מדי כישלון הולוגרפיים משותפים לכל סוגי האתגרים — שפה ויזואלית אחידה:
   - FailPips: רסיסי יהלום ◆/◇ שמסמנים כמה ניסיונות/פסילות נותרו (כמו ב-hangman).
   - Countdown: בר זמן יורד + שעון mm:ss (חיפוש מילים).
   ────────────────────────────────────────────────────────────────────────── */

/* מד פסילות/ניסיונות — נותרו remaining מתוך total */
export function FailPips({ remaining, total, label }: { remaining: number; total: number; label: string }) {
  const safeTotal = Math.max(0, total)
  const safeRemaining = Math.max(0, Math.min(safeTotal, remaining))
  return (
    <div className="flex flex-col items-center gap-1 mb-3">
      <div className="flex gap-1 flex-wrap justify-center" dir="ltr" style={{ maxWidth: '14rem' }}>
        {Array.from({ length: safeTotal }).map((_, i) => (
          <span
            key={i}
            style={{
              fontSize: '0.95rem',
              color: i < safeRemaining ? 'var(--holo-cyan)' : 'rgba(255,120,150,0.55)',
              textShadow: i < safeRemaining ? '0 0 6px rgba(0,246,255,0.8)' : 'none',
              transition: 'color 0.3s',
            }}
          >
            {i < safeRemaining ? '◆' : '◇'}
          </span>
        ))}
      </div>
      <span className="text-xs" style={{ color: safeRemaining <= 1 ? '#ff9bb3' : 'var(--holo-text)', opacity: 0.7 }}>
        {label}: {safeRemaining}/{safeTotal}
      </span>
    </div>
  )
}

function mmss(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/* טיימר ספירה-לאחור — קורא ל-onExpire פעם אחת בתום הזמן. עוצר כשעוצרים את ה-running. */
export function Countdown({ seconds, running, onExpire }: { seconds: number; running: boolean; onExpire: () => void }) {
  const [left, setLeft] = useState(seconds)
  const expiredRef = useRef(false)
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => {
      setLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(id)
          if (!expiredRef.current) { expiredRef.current = true; onExpireRef.current() }
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [running])

  const frac = seconds > 0 ? left / seconds : 0
  const low = frac <= 0.2
  return (
    <div className="flex flex-col items-center gap-1 mb-3">
      <div className="flex items-center gap-2" dir="ltr">
        <span style={{ fontSize: '1rem' }}>⏳</span>
        <span className="text-sm font-bold" style={{ color: low ? '#ff9bb3' : 'var(--holo-cyan)', textShadow: low ? 'none' : '0 0 6px rgba(0,246,255,0.7)' }}>
          {mmss(left)}
        </span>
      </div>
      <div className="rounded-full overflow-hidden" style={{ height: '0.4rem', width: '12rem', background: 'rgba(0,0,0,0.4)' }}>
        <div
          style={{
            height: '100%',
            width: `${frac * 100}%`,
            background: low ? 'linear-gradient(90deg,#ff5c8a,#ff9bb3)' : 'linear-gradient(90deg, var(--holo-blue), var(--holo-cyan))',
            boxShadow: low ? '0 0 8px rgba(255,92,138,0.7)' : '0 0 8px rgba(0,246,255,0.6)',
            transition: 'width 1s linear, background 0.4s',
          }}
        />
      </div>
    </div>
  )
}
