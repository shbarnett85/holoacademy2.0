import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { apiJson, ApiError } from '../../shared/lib/api'
import { setSession, type StaffSession } from '../../shared/lib/staffSession'
import EntryShell, { EntryLogo } from '../../shared/ui/EntryShell'
import WelcomeBurst from '../../shared/ui/WelcomeBurst'
import { fieldStyle as fieldBase, panelStaff } from '../../styles/ui'

interface LoginResponse {
  session: { access_token: string; refresh_token: string; expires_at?: number }
  staff: StaffSession['staff']
}

const fieldStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', ...fieldBase, borderRadius: 11, padding: '12px 16px',
  fontSize: 14, fontFamily: 'var(--font-display)', direction: 'ltr',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontFamily: 'var(--font-display)', fontSize: 12,
  color: 'var(--color-muted)', marginBottom: 7, letterSpacing: '.05em', textAlign: 'right',
}

/* כניסת מורה/מנהל (Supabase Auth). משטח צוות לבן; המבטא של המורה במשפחת האנושיות. הלוגיקה נשמרת. */
export default function StaffLogin() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  /* חזרה מקישור אימות המייל (?verified=1). קישור שפג תוקף חוזר עם error_code=otp_expired ב-hash. */
  const [verified] = useState(() => new URLSearchParams(window.location.search).get('verified') === '1' && !window.location.hash.includes('error'))
  const [linkExpired] = useState(() => window.location.hash.includes('otp_expired'))
  const [error, setError] = useState<string | null>(linkExpired ? 'קישור האימות פג תוקף — אפשר לשלוח אחר' : null)
  const [shake, setShake] = useState(false)
  const [needsConfirm, setNeedsConfirm] = useState(linkExpired)
  const [resent, setResent] = useState(false)
  /* ה-hash מהקישור נושא access_token של Supabase — מנקים אותו מהכתובת וההיסטוריה */
  useEffect(() => {
    if (window.location.hash || window.location.search) window.history.replaceState(null, '', window.location.pathname)
  }, [])
  /* מעבר חגיגי אחרי התחברות מוצלחת — מציג WelcomeBurst ואז מנווט */
  const [welcome, setWelcome] = useState<{ name: string; role: StaffSession['staff']['role']; to: string } | null>(null)

  async function guestLogin() {
    setBusy(true)
    setError(null)
    try {
      const { session, staff } = await apiJson<LoginResponse>('/api/auth/guest-login', { method: 'POST' })
      setSession({ ...session, staff })
      setWelcome({ name: staff.name, role: staff.role, to: '/creator' })
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
      /* העברת הדמיות שנוצרו כאנונימי לחשבון (עוגיית anon — צד שרת) */
      void apiJson('/api/quests/claim-anon', { method: 'POST' }).catch(() => {})
      setWelcome({ name: staff.name, role: staff.role, to: staff.role === 'super_admin' ? '/admin' : '/creator' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ההתחברות נכשלה')
      setNeedsConfirm(err instanceof ApiError && err.code === 'EMAIL_NOT_CONFIRMED')
      setShake(true)
      setTimeout(() => setShake(false), 500)
    } finally {
      setBusy(false)
    }
  }

  async function resendConfirmation() {
    if (!/S+@S+/.test(email)) { setError('הזינו את כתובת האימייל כדי לשלוח שוב את מייל האימות'); return }
    try {
      await apiJson('/api/auth/resend-confirmation', { method: 'POST', body: JSON.stringify({ email: email.trim() }) })
      setResent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'השליחה נכשלה')
    }
  }

  /* אנימציית המעבר מוצגת בתוך אותה קליפה — הרקע המטושטש נשאר יציב */
  if (welcome) {
    return (
      <EntryShell>
        <WelcomeBurst name={welcome.name} role={welcome.role} onDone={() => navigate(welcome.to)} />
      </EntryShell>
    )
  }

  return (
    <EntryShell onClose={() => navigate('/')}>
      <div
        className="entry-panel"
        style={{
          /* השוליים: מקום לצל הקשיח (3px ימינה ולמטה) ולפינות, בתוך המסגרת הגוללת של EntryShell */
          ...panelStaff, margin: '4px 7px 7px 4px', padding: '40px 44px', width: 400, textAlign: 'center',
          animation: shake ? 'shake .4s ease' : 'none',
        }}
      >
        <EntryLogo />
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-machine-deep)', marginBottom: 6 }}>מורים ומנהלים</div>
        <div style={{ fontSize: 13.5, color: 'var(--color-muted)', marginBottom: 28 }}>אימייל וסיסמה</div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>אימייל</label>
          <input autoFocus type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="teacher@demo.com" style={fieldStyle} />
        </div>

        <div style={{ marginBottom: error ? 14 : 26 }}>
          <label style={labelStyle}>סיסמה</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="••••••••" style={{ ...fieldStyle, fontSize: 18, letterSpacing: '.12em' }} />
        </div>

        {verified && !error && <p style={{ fontSize: 13, color: 'var(--color-correct)', marginBottom: 18 }}>✓ כתובת האימייל אושרה — אפשר להתחבר</p>}
        {error && <p style={{ fontSize: 13, color: 'var(--color-wrong)', marginBottom: needsConfirm ? 8 : 18 }}>⚠️ {error}</p>}
        {(needsConfirm || linkExpired) && (
          <button onClick={resendConfirmation} disabled={resent} className="holo-button holo-button--staff holo-button--sm" style={{ fontSize: 13, marginBottom: 18, fontFamily: 'var(--font-display)' }}>
            {resent ? 'מייל האימות נשלח ✓' : 'שלחו שוב את מייל האימות'}
          </button>
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => navigate('/')}
            className="holo-link"
            style={{ flex: 1, padding: '12px', fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600 }}
          >
            ביטול
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="holo-button holo-button--staff"
            style={{ flex: 2, padding: '12px', borderRadius: 11, opacity: !busy && (!email.trim() || !password) ? 0.7 : 1, fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700 }}
          >
            {busy ? 'מתחבר…' : 'כניסה ←'}
          </button>
        </div>

        {/* מפריד */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 16px' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--color-line)' }} />
          <span style={{ fontSize: 12, color: 'var(--color-muted)', fontFamily: 'var(--font-display)' }}>או</span>
          <div style={{ flex: 1, height: 1, background: 'var(--color-line)' }} />
        </div>

        {/* כניסת אורח */}
        <button
          onClick={guestLogin}
          disabled={busy}
          className="holo-button holo-button--staff"
          style={{ width: '100%', padding: '11px', borderRadius: 11, fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600 }}
        >
          👤 כניסה כמורה אורח
        </button>

        <p style={{ fontSize: 12, marginTop: 10, color: 'var(--color-muted)' }}>אורח רואה את מצב ההדגמה בלבד</p>

        <p style={{ fontSize: 13, marginTop: 14, color: 'var(--color-muted)' }}>
          אין לך חשבון?{' '}
          <Link to="/staff/signup" className="holo-link">הרשמה</Link>
          {' · '}
          <Link to="/staff/forgot" className="holo-link">שכחתי סיסמה</Link>
        </p>
      </div>
    </EntryShell>
  )
}
