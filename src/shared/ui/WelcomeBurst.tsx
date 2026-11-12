import { useEffect } from 'react'
import { playSound } from '../lib/sound'
import { nameChip, panelStaff } from '../../styles/ui'

/* מעבר חגיגי בכניסה (d-*): קווי סריקה, טבעות פעימה, התפרצות ריבועים, אייקון וי ו"ברוכים הבאים".
   מסתיים מעצמו (~2.2ש׳). שטוח: בלי מעברי צבע, בלי זוהר ובלי גליץ'; הטקסט על משטח לבן. */
const BURST = ['var(--color-human)', 'var(--color-human-soft)', 'var(--color-surface)']

export default function WelcomeBurst({ name, role = 'teacher', onDone }: { name?: string; role?: 'teacher' | 'admin' | 'municipal_admin' | 'super_admin'; onDone: () => void }) {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    /* צליל קבלת-הפנים — נורה מיד; ההתחברות עצמה היא ה-user-gesture, אז אין
       בעיית autoplay */
    playSound('welcome')
    const t = window.setTimeout(onDone, reduce ? 400 : 2200)
    return () => window.clearTimeout(t)
  }, [onDone])

  const accessLabel = role === 'teacher' ? 'TEACHER · ACCESS GRANTED' : 'STAFF · ACCESS GRANTED'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' /* מעל שכבת ההכהיה של EntryShell — הרקע נשאר הדף הראשי */ }}>
      {/* קווי סריקה: מעבר אחד מלמעלה למטה */}
      <div style={{ position: 'absolute', left: 0, right: 0, height: 3, background: 'var(--color-surface)', animation: 'd-scan .55s ease-in forwards', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, height: 2, background: 'var(--color-human-soft)', animation: 'd-scan2 .55s .12s ease-in forwards', pointerEvents: 'none' }} />

      {/* טבעות פעימה */}
      <div style={{ position: 'absolute', width: 140, height: 140, borderRadius: '50%', border: '2px solid var(--color-surface)', animation: 'd-ring 1.1s ease forwards', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', width: 140, height: 140, borderRadius: '50%', border: '1px solid var(--color-human-soft)', animation: 'd-ring2 1.1s .18s ease forwards', pointerEvents: 'none' }} />

      {/* התפרצות פיקסלים */}
      {Array.from({ length: 30 }, (_, i) => {
        const angle = (i / 30) * Math.PI * 2
        const dist = 60 + Math.random() * 90
        const color = BURST[i % BURST.length]
        const size = 4 + Math.random() * 8
        return (
          <div key={i} style={{
            position: 'absolute', width: size, height: size, background: color,
            borderRadius: i % 3 === 0 ? 0 : 1,
            ['--dx' as string]: Math.cos(angle) * dist + 'px',
            ['--dy' as string]: Math.sin(angle) * dist + 'px',
            animation: `d-pixel ${0.5 + Math.random() * 0.7}s ${Math.random() * 0.25}s ease forwards`,
            pointerEvents: 'none',
          }} />
        )
      })}

      {/* אייקון וי */}
      <div style={{ position: 'relative', zIndex: 3, width: 100, height: 100, borderRadius: '50%', background: 'var(--color-surface)', color: 'var(--color-ink)', border: 'var(--border-staff)', boxShadow: 'var(--shadow-staff)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'd-check .65s cubic-bezier(.22,.7,.35,1) both' }}>
        <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
      </div>

      {/* טקסט ברכה, על משטח לבן */}
      <div style={{ ...panelStaff, position: 'relative', zIndex: 3, textAlign: 'center', marginTop: 22, padding: '14px 28px', animation: 'd-text 2.2s ease forwards' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.28em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 8 }}>{accessLabel}</div>
        <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--color-machine-deep)' }}>ברוכים הבאים</div>
        {name && <div style={{ ...nameChip, display: 'inline-block', padding: '1px 14px', borderRadius: 999, fontSize: 18, fontWeight: 700, marginTop: 6, fontFamily: 'var(--font-display)' }}>{name}</div>}
      </div>
    </div>
  )
}
