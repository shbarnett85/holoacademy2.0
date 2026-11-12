import { useEffect, useRef, useState } from 'react'
import { useIsPhonePortrait } from '../../../shared/lib/useIsMobile'
import { progressFill, progressTrack } from '../../../styles/ui'

/* ──────────────────────────────────────────────────────────────────────────
   מדי כישלון משותפים לכל סוגי האתגרים — שפה ויזואלית אחידה:
   - FailPips: רסיסי יהלום ◆/◇ בדיו (מלא = נותר, קו מתאר בלבד = נוצל), כמו ב-hangman.
   - Countdown: בר זמן יורד (מילוי כתום על מסילה עם קו דיו) + שעון mm:ss (חיפוש מילים).
   ────────────────────────────────────────────────────────────────────────── */

/* מד פסילות/ניסיונות — נותרו remaining מתוך total */
export function FailPips({ remaining, total, label }: { remaining: number; total: number; label: string }) {
  const safeTotal = Math.max(0, total)
  const safeRemaining = Math.max(0, Math.min(safeTotal, remaining))
  return (
    <div data-solution-hide className="flex flex-col items-center gap-1 mb-3">
      <div className="flex gap-1 flex-wrap justify-center" dir="ltr" style={{ maxWidth: '14rem' }}>
        {Array.from({ length: safeTotal }).map((_, i) => (
          <span
            key={i}
            style={{
              fontSize: '0.95rem',
              color: 'var(--color-ink)',
            }}
          >
            {i < safeRemaining ? '◆' : '◇'}
          </span>
        ))}
      </div>
      <span className="text-xs" style={{ color: safeRemaining <= 1 ? 'var(--color-wrong)' : 'var(--color-muted)' }}>
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
  /* השהיה כששער הסיבוב פתוח (טלפון לאורך): השער מכסה את המסך, והתלמיד לא יכול
     לשחק — ספירה שממשיכה מאחוריו הייתה מכשילה אותו בלי שיראה דבר. זה הטיימר
     היחיד במשחק, ולכן ההשהיה כאן מכסה את כל התרחיש בלי לגעת בלוגיקת האתגרים. */
  const gated = useIsPhonePortrait()

  useEffect(() => {
    if (!running || gated) return
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
  }, [running, gated])

  const frac = seconds > 0 ? left / seconds : 0
  const low = frac <= 0.2
  return (
    <div className="flex flex-col items-center gap-1 mb-3">
      <div className="flex items-center gap-2" dir="ltr">
        <span style={{ fontSize: '1rem' }}>⏳</span>
        <span className="text-sm font-bold" style={{ color: low ? 'var(--color-wrong)' : 'var(--color-ink)' }}>
          {mmss(left)}
        </span>
      </div>
      {/* המסילה גבוהה מעט מבעבר: קו המתאר בדיו תופס 2px מכל צד */}
      <div style={{ ...progressTrack, height: '0.7rem', width: '12rem' }}>
        <div style={{ ...progressFill, width: `${frac * 100}%`, transition: 'width 1s linear' }} />
      </div>
    </div>
  )
}
