import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { apiJson } from '../../shared/lib/api'
import { setSession, type StaffSession } from '../../shared/lib/staffSession'

interface School { id: string; name: string }
interface LoginResponse {
  session: { access_token: string; refresh_token: string; expires_at?: number }
  staff: StaffSession['staff']
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(0,0,0,0.3)',
  border: '1px solid rgba(0,246,255,0.3)',
  borderRadius: '0.6rem',
  color: 'var(--holo-text)',
  padding: '0.7rem 0.9rem',
}

/* מסך הרשמת מורה/מנהל — שם, אימייל, סיסמה, תפקיד, בית ספר */
export default function StaffSignup() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'teacher' | 'admin'>('teacher')
  const [schools, setSchools] = useState<School[]>([])
  const [schoolId, setSchoolId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiJson<{ schools: School[] }>('/api/schools')
      .then((b) => {
        setSchools(b.schools)
        if (b.schools[0]) setSchoolId(b.schools[0].id)
      })
      .catch(() => setError('שגיאה בטעינת רשימת בתי הספר'))
  }, [])

  const canSubmit = name.trim() && /\S+@\S+/.test(email) && password.length >= 6 && schoolId

  async function submit() {
    if (busy || !canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await apiJson('/api/auth/staff-signup', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password, role, schoolId }),
      })
      /* התחברות אוטומטית אחרי הרשמה מוצלחת */
      const { session, staff } = await apiJson<LoginResponse>('/api/auth/staff-login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
      })
      setSession({ ...session, staff })
      navigate(staff.role === 'super_admin' ? '/admin' : '/creator')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ההרשמה נכשלה')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 gap-6" style={{ background: 'var(--holo-bg)' }}>
      <div className="text-center">
        <h1 className="holo-text-glow font-black" style={{ fontSize: '2.2rem' }}>הרשמת צוות</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--holo-text)', opacity: 0.55 }}>מורה או מנהל חדש</p>
      </div>

      <div className="holo-panel w-full max-w-sm" style={{ boxShadow: 'var(--holo-glow)' }}>
        <label className="block mb-1 text-sm" style={{ opacity: 0.7 }}>שם מלא</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="mb-4" style={inputStyle} />

        <label className="block mb-1 text-sm" style={{ opacity: 0.7 }}>אימייל</label>
        <input dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@school.com" className="mb-4" style={inputStyle} />

        <label className="block mb-1 text-sm" style={{ opacity: 0.7 }}>סיסמה (לפחות 6 תווים)</label>
        <input dir="ltr" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mb-4" style={inputStyle} />

        <label className="block mb-1 text-sm" style={{ opacity: 0.7 }}>תפקיד</label>
        <div className="grid grid-cols-2 gap-3 mb-4">
          {([{ k: 'teacher', l: '🧑‍🏫 מורה' }, { k: 'admin', l: '🛡️ מנהל' }] as const).map((r) => (
            <button
              key={r.k}
              type="button"
              onClick={() => setRole(r.k)}
              className="holo-panel cursor-pointer text-center"
              style={{ padding: '0.7rem', borderColor: role === r.k ? 'var(--holo-cyan)' : 'rgba(0,246,255,0.15)', boxShadow: role === r.k ? 'var(--holo-glow)' : 'none' }}
            >
              {r.l}
            </button>
          ))}
        </div>

        <label className="block mb-1 text-sm" style={{ opacity: 0.7 }}>בית ספר</label>
        <select value={schoolId} onChange={(e) => setSchoolId(e.target.value)} className="mb-4" style={{ ...inputStyle, cursor: 'pointer' }}>
          {schools.length === 0 && <option value="">טוען…</option>}
          {schools.map((s) => (
            <option key={s.id} value={s.id} style={{ background: 'var(--holo-bg)' }}>{s.name}</option>
          ))}
        </select>

        {error && <p className="text-sm mb-3" style={{ color: '#ff9bb3' }}>⚠️ {error}</p>}

        <button
          className="holo-button w-full text-lg font-bold"
          style={{ opacity: busy || !canSubmit ? 0.5 : 1 }}
          disabled={busy || !canSubmit}
          onClick={submit}
        >
          {busy ? 'נרשם…' : 'הרשמה ←'}
        </button>

        <p className="text-sm text-center mt-4" style={{ opacity: 0.6 }}>
          כבר רשום?{' '}
          <Link to="/staff/login" style={{ color: 'var(--holo-cyan)' }}>התחברות</Link>
        </p>
      </div>
    </div>
  )
}
