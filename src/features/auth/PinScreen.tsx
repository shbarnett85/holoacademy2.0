import { useState } from 'react'
import { panelStudent } from '../../styles/ui'
import { EntryLogo } from '../../shared/ui/EntryShell'

/* שוליים סביב החלון: מקום לצל הקשיח (6px ימינה ולמטה) בתוך המסגרת הגוללת של EntryShell */
const PANEL_MARGIN = '2px 8px 8px 2px'

interface Props {
  student: { id: string; name: string }
  onBack: () => void
  onSuccess: (token: string) => void
}

/* מסך הזנת PIN — 4 משבצות + מקלדת. עיצוב Claude Design; אימות מול השרת נשמר. */
export default function PinScreen({ student, onBack, onSuccess }: Props) {
  const [pin, setPin] = useState('')
  const [shake, setShake] = useState(false)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(fullPin: string) {
    setBusy(true)
    try {
      const res = await fetch('/api/auth/student-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: student.id, pin: fullPin }),
      })
      if (!res.ok) throw new Error('wrong pin')
      const { token } = await res.json()
      onSuccess(token)
    } catch {
      /* PIN שגוי — אנימציית shake, צביעה אדומה וניקוי */
      setError(true)
      setShake(true)
      setTimeout(() => { setShake(false); setError(false); setPin('') }, 700)
    } finally {
      setBusy(false)
    }
  }

  function press(digit: string) {
    if (busy || pin.length >= 4) return
    const next = pin + digit
    setPin(next)
    if (next.length === 4) setTimeout(() => submit(next), 120)
  }

  function erase() {
    if (!busy) { setPin(pin.slice(0, -1)); setError(false) }
  }

  const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'] as const

  return (
      <div
        dir="rtl"
        className="entry-panel"
        style={{
          ...panelStudent, borderRadius: 20, margin: PANEL_MARGIN, padding: '40px 44px', width: 360, textAlign: 'center',
          animation: shake ? 'shake .4s ease' : 'none',
        }}
      >
        <EntryLogo />
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-machine-deep)', marginBottom: 6 }}>שלום {student.name}!</div>
        <div style={{ fontSize: 14, color: 'var(--color-muted)', marginBottom: 28, lineHeight: 1.6 }}>מה הקוד הסודי שלכם?</div>

        {/* 4 משבצות */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 24 }} dir="ltr">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{
              width: 52, height: 58, borderRadius: 12, background: 'var(--color-surface)',
              border: `2px solid ${error ? 'var(--color-wrong)' : pin.length > i ? 'var(--color-ink)' : 'var(--color-line-strong)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 900,
              color: error ? 'var(--color-wrong)' : 'var(--color-ink)', fontFamily: 'var(--font-mono)',
              transition: 'all .15s',
            }}>
              {pin.length > i ? '●' : ''}
            </div>
          ))}
        </div>

        {/* מקלדת */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, maxWidth: 220, margin: '0 auto 20px' }} dir="ltr">
          {keys.map((k, i) => (
            <button
              key={i}
              onClick={() => { if (k === '⌫') erase(); else if (k !== '') press(String(k)) }}
              disabled={k === '' || busy}
              className={k === '' ? undefined : 'holo-button'}
              style={{
                padding: '14px 0', borderRadius: 10, fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700,
                ...(k === '' ? { background: 'transparent', border: 'none', cursor: 'default' } : {}),
              }}
            >
              {k}
            </button>
          ))}
        </div>

        <button
          onClick={onBack}
          className="holo-link"
          style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, padding: '9px 22px' }}
        >
          חזרה
        </button>
      </div>
  )
}
