import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiJson } from '../../shared/lib/api'
import EntryShell from '../../shared/ui/EntryShell'
import { fieldStyle, panelStaff } from '../../styles/ui'

/* ── שחזור סיסמה ─────────────────────────────────────────────────────────────
   ForgotPassword ‏(/staff/forgot): הזנת אימייל → מייל איפוס דרך Supabase.
   ResetPassword ‏(/staff/reset): היעד של הקישור מהמייל — Supabase מפנה לכאן
   עם access_token (recovery) ב-hash; סיסמה חדשה + אימות כפול → עדכון בשרת. */

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', ...fieldStyle, borderRadius: 11, padding: '12px 16px',
  fontSize: 14, fontFamily: 'var(--font-display)', direction: 'ltr',
}
/* השוליים: מקום לצל הקשיח (3px ימינה ולמטה) ולפינות, בתוך המסגרת הגוללת של EntryShell */
const panelStyle: React.CSSProperties = {
  ...panelStaff, margin: '4px 7px 7px 4px', padding: '36px 40px', width: 380, textAlign: 'center',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontFamily: 'var(--font-display)', fontSize: 12,
  color: 'var(--color-muted)', marginBottom: 7, letterSpacing: '.05em', textAlign: 'right',
}

export function ForgotPassword() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (busy || !/\S+@\S+/.test(email)) return
    setBusy(true)
    setError(null)
    try {
      await apiJson('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: email.trim() }) })
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'השליחה נכשלה')
    } finally {
      setBusy(false)
    }
  }

  return (
    <EntryShell onClose={() => navigate('/staff/login')}>
      <div style={panelStyle}>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-machine-deep)', marginBottom: 6 }}>שחזור סיסמה</div>
        {sent ? (
          <>
            <p style={{ fontSize: 14, color: 'var(--color-ink)', lineHeight: 1.7, margin: '18px 0' }}>
              אם קיים חשבון עם הכתובת הזו — שלחנו אליה קישור לאיפוס הסיסמה.
              <br />בדקו גם את תיקיית הספאם.
            </p>
            <Link to="/staff/login" className="holo-link" style={{ fontSize: 14 }}>חזרה להתחברות</Link>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13.5, color: 'var(--color-muted)', marginBottom: 24 }}>נשלח לך קישור איפוס למייל</div>
            <label style={labelStyle}>אימייל</label>
            <input autoFocus type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="name@school.com" style={inputStyle} />
            {error && <p style={{ fontSize: 13, color: 'var(--color-wrong)', marginTop: 12 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
              <button onClick={() => navigate('/staff/login')}
                className="holo-link" style={{ flex: 1, padding: 12, fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600 }}>
                ביטול
              </button>
              <button onClick={submit} disabled={busy || !/\S+@\S+/.test(email)}
                className="holo-button holo-button--staff" style={{ flex: 2, padding: 12, borderRadius: 11, fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700 }}>
                {busy ? 'שולח…' : 'שלחו קישור ←'}
              </button>
            </div>
          </>
        )}
      </div>
    </EntryShell>
  )
}

export function ResetPassword() {
  const navigate = useNavigate()
  /* ‏Supabase מפנה עם ‎#access_token=…&type=recovery */
  const accessToken = useMemo(() => new URLSearchParams(window.location.hash.slice(1)).get('access_token'), [])
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const match = password === password2
  const valid = password.length >= 6 && match

  async function submit() {
    if (busy || !valid || !accessToken) return
    setBusy(true)
    setError(null)
    try {
      await apiJson('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ accessToken, password }) })
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'עדכון הסיסמה נכשל')
    } finally {
      setBusy(false)
    }
  }

  return (
    <EntryShell onClose={() => navigate('/staff/login')}>
      <div style={panelStyle}>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-machine-deep)', marginBottom: 6 }}>סיסמה חדשה</div>
        {!accessToken ? (
          <>
            <p style={{ fontSize: 14, color: 'var(--color-wrong)', margin: '18px 0' }}>הקישור אינו תקין או שפג תוקפו.</p>
            <Link to="/staff/forgot" className="holo-link" style={{ fontSize: 14 }}>בקשו קישור חדש</Link>
          </>
        ) : done ? (
          <>
            <p style={{ fontSize: 14, color: 'var(--color-correct)', margin: '18px 0' }}>✓ הסיסמה עודכנה בהצלחה</p>
            <button onClick={() => navigate('/staff/login')}
              className="holo-button holo-button--staff" style={{ padding: '12px 28px', borderRadius: 11, fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700 }}>
              להתחברות ←
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13.5, color: 'var(--color-muted)', marginBottom: 24 }}>בחרו סיסמה חדשה (לפחות 6 תווים)</div>
            <label style={labelStyle}>סיסמה חדשה</label>
            <input autoFocus type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ ...inputStyle, marginBottom: 14 }} />
            <label style={labelStyle}>אימות סיסמה</label>
            <input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              style={{ ...inputStyle, ...(password2 && !match ? { border: '2px solid var(--color-wrong)' } : {}) }} />
            <p style={{ fontSize: 12, color: password2 && !match ? 'var(--color-wrong)' : 'transparent', minHeight: 16, margin: '6px 0 0' }}>הסיסמאות אינן תואמות</p>
            {error && <p style={{ fontSize: 13, color: 'var(--color-wrong)', marginTop: 8 }}>{error}</p>}
            <button onClick={submit} disabled={busy || !valid}
              className="holo-button holo-button--staff" style={{ width: '100%', marginTop: 16, padding: 12, borderRadius: 11, fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700 }}>
              {busy ? 'מעדכן…' : 'עדכון סיסמה ←'}
            </button>
          </>
        )}
      </div>
    </EntryShell>
  )
}
