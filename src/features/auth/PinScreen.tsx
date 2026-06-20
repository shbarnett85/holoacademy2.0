import { useState } from 'react'
import HoloBackdrop from '../../shared/ui/HoloBackdrop'

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
    <HoloBackdrop>
      <div
        dir="rtl"
        style={{
          background: 'linear-gradient(135deg,rgba(10,22,46,.97),rgba(4,9,20,.99))',
          border: '1px solid rgba(47,243,255,.22)', borderRadius: 22, padding: '40px 44px', width: 360, textAlign: 'center',
          boxShadow: '0 0 80px rgba(47,243,255,.10), 0 20px 60px rgba(0,0,0,.6)',
          animation: shake ? 'shake .4s ease' : 'none',
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 6 }}>שלום {student.name}!</div>
        <div style={{ fontSize: 14, color: 'rgba(160,200,240,.55)', marginBottom: 28, lineHeight: 1.6 }}>מה הקוד הסודי שלך?</div>

        {/* 4 משבצות */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 24 }} dir="ltr">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{
              width: 52, height: 58, borderRadius: 12, background: 'rgba(4,9,18,.8)',
              border: `2px solid ${error ? 'rgba(255,80,80,.7)' : pin.length > i ? 'rgba(47,243,255,.8)' : 'rgba(47,243,255,.2)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 900,
              color: error ? '#ff6060' : 'var(--holo-cyan-bright)', fontFamily: 'var(--font-mono)',
              boxShadow: pin.length > i && !error ? '0 0 16px rgba(47,243,255,.4)' : 'none', transition: 'all .15s',
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
              style={{
                padding: '14px 0', borderRadius: 10, fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700,
                color: k === '' ? 'transparent' : '#ddeeff', background: k === '' ? 'transparent' : 'rgba(4,9,18,.6)',
                border: k === '' ? 'none' : '1px solid rgba(47,243,255,.15)', cursor: k === '' ? 'default' : 'pointer', transition: 'all .12s',
              }}
              onMouseEnter={(e) => { if (k !== '') { e.currentTarget.style.background = 'rgba(47,243,255,.14)'; e.currentTarget.style.color = '#fff' } }}
              onMouseLeave={(e) => { if (k !== '') { e.currentTarget.style.background = 'rgba(4,9,18,.6)'; e.currentTarget.style.color = '#ddeeff' } }}
            >
              {k}
            </button>
          ))}
        </div>

        <button
          onClick={onBack}
          style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, color: 'rgba(150,190,220,.5)', padding: '9px 22px', borderRadius: 10, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(120,180,220,.15)' }}
        >
          חזרה
        </button>
      </div>
    </HoloBackdrop>
  )
}
