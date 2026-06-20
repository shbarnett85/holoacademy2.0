import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { apiJson } from '../../shared/lib/api'
import { setSession, type StaffSession } from '../../shared/lib/staffSession'
import HoloBackdrop from '../../shared/ui/HoloBackdrop'
import WelcomeBurst from '../../shared/ui/WelcomeBurst'

interface LoginResponse {
  session: { access_token: string; refresh_token: string; expires_at?: number }
  staff: StaffSession['staff']
}

const fieldStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: 'rgba(4,9,18,.7)',
  border: '1px solid rgba(255,69,230,.22)', borderRadius: 11, padding: '12px 16px',
  fontSize: 14, color: 'var(--holo-text-bright)', fontFamily: 'var(--font-display)', outline: 'none', direction: 'ltr',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontFamily: 'var(--font-display)', fontSize: 12,
  color: 'rgba(47,243,255,.6)', marginBottom: 7, letterSpacing: '.05em', textAlign: 'right',
}

/* כניסת מורה/מנהל (Supabase Auth) — עיצוב Claude Design (מבטא magenta). הלוגיקה נשמרת. */
export default function StaffLogin() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  /* מעבר חגיגי אחרי התחברות מוצלחת — מציג WelcomeBurst ואז מנווט */
  const [welcome, setWelcome] = useState<{ name: string; role: StaffSession['staff']['role']; to: string } | null>(null)

  async function guestLogin() {
    setBusy(true)
    setError(null)
    try {
      const { session, staff } = await apiJson<LoginResponse>('/api/auth/guest-login', { method: 'POST' })
      setSession({ ...session, staff })
      setWelcome({ name: staff.name, role: staff.role, to: '/creator/library' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'כניסת אורח נכשלה')
      setShake(true)
      setTimeout(() => setShake(false), 500)
    } finally {
      setBusy(false)
    }
  }

  async function submit() {
    if (busy || !email.trim() || !password) {
      if (!email.trim() || !password) { setShake(true); setTimeout(() => setShake(false), 500) }
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { session, staff } = await apiJson<LoginResponse>('/api/auth/staff-login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
      })
      setSession({ ...session, staff })
      setWelcome({ name: staff.name, role: staff.role, to: staff.role === 'super_admin' ? '/admin' : '/creator/library' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ההתחברות נכשלה')
      setShake(true)
      setTimeout(() => setShake(false), 500)
    } finally {
      setBusy(false)
    }
  }

  if (welcome) return <WelcomeBurst name={welcome.name} role={welcome.role} onDone={() => navigate(welcome.to)} />

  return (
    <HoloBackdrop>
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(10,22,46,.97), rgba(4,9,20,.99))',
          border: '1px solid rgba(255,69,230,.22)', borderRadius: 22, padding: '40px 44px', width: 400, textAlign: 'center',
          boxShadow: '0 0 80px rgba(255,69,230,.10), 0 20px 60px rgba(0,0,0,.6)',
          animation: shake ? 'shake .4s ease' : 'none',
        }}
      >
        <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(255,69,230,.08)', border: '1px solid rgba(255,69,230,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px', boxShadow: '0 0 24px rgba(255,69,230,.15)' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--holo-magenta)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
          </svg>
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 6 }}>מורים ומנהלים</div>
        <div style={{ fontSize: 13.5, color: 'rgba(160,200,240,.5)', marginBottom: 28 }}>אימייל וסיסמה</div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>אימייל</label>
          <input autoFocus type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="teacher@demo.com" style={fieldStyle} />
        </div>

        <div style={{ marginBottom: error ? 14 : 26 }}>
          <label style={labelStyle}>סיסמה</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="••••••••" style={{ ...fieldStyle, fontSize: 18, letterSpacing: '.12em' }} />
        </div>

        {error && <p style={{ fontSize: 13, color: '#ff9bb3', marginBottom: 18 }}>⚠️ {error}</p>}

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => navigate('/')}
            style={{ flex: 1, padding: '12px', borderRadius: 11, cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, background: 'transparent', border: '1px solid rgba(120,180,220,.2)', color: 'rgba(150,190,220,.55)' }}
          >
            ביטול
          </button>
          <button
            onClick={submit}
            disabled={busy}
            style={{ flex: 2, padding: '12px', borderRadius: 11, cursor: busy ? 'default' : 'pointer', opacity: busy || !email.trim() || !password ? 0.6 : 1, fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg, rgba(255,69,230,.22), rgba(255,69,230,.12))', border: '1px solid rgba(255,69,230,.5)', boxShadow: '0 0 20px rgba(255,69,230,.2)' }}
          >
            {busy ? 'מתחבר…' : 'כניסה ←'}
          </button>
        </div>

        {/* מפריד */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 16px' }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(120,180,220,.12)' }} />
          <span style={{ fontSize: 12, color: 'rgba(140,170,200,.4)', fontFamily: 'var(--font-display)' }}>או</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(120,180,220,.12)' }} />
        </div>

        {/* כניסת אורח */}
        <button
          onClick={guestLogin}
          disabled={busy}
          style={{
            width: '100%', padding: '11px', borderRadius: 11, cursor: busy ? 'default' : 'pointer',
            fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600,
            color: 'rgba(255,200,120,.85)',
            background: 'rgba(255,160,60,.06)',
            border: '1px solid rgba(255,160,60,.28)',
            opacity: busy ? 0.5 : 1,
            transition: 'all .15s',
          }}
          onMouseEnter={(e) => { if (!busy) e.currentTarget.style.background = 'rgba(255,160,60,.12)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,160,60,.06)' }}
        >
          👤 כניסה כמורה אורח
        </button>

        <p style={{ fontSize: 12, marginTop: 10, color: 'rgba(140,170,200,.35)' }}>אורח רואה את מצב ההדגמה בלבד</p>

        <p style={{ fontSize: 13, marginTop: 14, color: 'rgba(160,200,240,.55)' }}>
          אין לך חשבון?{' '}
          <Link to="/staff/signup" style={{ color: 'var(--holo-cyan-bright)' }}>הרשמה</Link>
        </p>
      </div>
    </HoloBackdrop>
  )
}
