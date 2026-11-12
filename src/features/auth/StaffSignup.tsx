import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { apiJson } from '../../shared/lib/api'
import EntryShell from '../../shared/ui/EntryShell'
import { fieldStyle } from '../../styles/ui'

interface School { id: string; name: string }
interface SignupResponse { ok: boolean; needsEmailVerification?: boolean; pendingApproval?: boolean }

const inputStyle: React.CSSProperties = {
  width: '100%',
  ...fieldStyle,
  borderRadius: '0.6rem',
  padding: '0.7rem 0.9rem',
}

/* מסך הרשמת מורה/מנהל — שם, אימייל, סיסמה, בית ספר.
   - בית ספר חדש: בוחרים מורה או מנהל (היוצר הבעלים של בית הספר החדש).
   - בית ספר קיים: תמיד מורה, והבקשה ממתינה לאישור מנהל בית הספר.
   בשני המסלולים צריך לאשר את כתובת המייל לפני התחברות ראשונה (אין יותר התחברות אוטומטית). */
export default function StaffSignup() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [newSchoolName, setNewSchoolName] = useState('')
  const [role, setRole] = useState<'teacher' | 'admin'>('teacher')
  const [schools, setSchools] = useState<School[]>([])
  const [schoolId, setSchoolId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /* אחרי הרשמה מוצלחת: מסך "בדקו את המייל" */
  const [done, setDone] = useState<{ email: string; pendingApproval: boolean } | null>(null)
  const [resent, setResent] = useState(false)

  useEffect(() => {
    apiJson<{ schools: School[] }>('/api/schools')
      .then((b) => {
        setSchools(b.schools)
        if (b.schools[0]) setSchoolId(b.schools[0].id)
      })
      .catch(() => setError('שגיאה בטעינת רשימת בתי הספר'))
  }, [])

  const isNewSchool = schoolId === '__new__'
  const passwordsMatch = password === password2
  const canSubmit = name.trim() && /\S+@\S+/.test(email) && password.length >= 6 && passwordsMatch &&
    (isNewSchool ? newSchoolName.trim().length >= 2 : !!schoolId)

  async function submit() {
    if (busy || !canSubmit) return
    setBusy(true)
    setError(null)
    try {
      const res = await apiJson<SignupResponse>('/api/auth/staff-signup', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(), email: email.trim(), password,
          /* מנהל — רק ביצירת בית ספר חדש; הצטרפות לבית ספר קיים היא תמיד כמורה (השרת אוכף) */
          role: isNewSchool ? role : 'teacher',
          ...(isNewSchool ? { newSchoolName: newSchoolName.trim() } : { schoolId }),
        }),
      })
      setDone({ email: email.trim(), pendingApproval: res.pendingApproval === true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ההרשמה נכשלה')
    } finally {
      setBusy(false)
    }
  }

  async function resend() {
    if (!done) return
    setError(null)
    try {
      await apiJson('/api/auth/resend-confirmation', { method: 'POST', body: JSON.stringify({ email: done.email }) })
      setResent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'השליחה נכשלה')
    }
  }

  if (done) {
    return (
      <EntryShell onClose={() => navigate('/staff/login')}>
        <div className="flex flex-col items-center justify-center p-2 gap-6">
          <div className="holo-panel holo-panel--staff w-full max-w-sm text-center">
            <div style={{ fontSize: '2.4rem' }}>📧</div>
            <h1 className="holo-text-glow font-black mt-2" style={{ fontSize: '1.6rem' }}>בדקו את תיבת המייל</h1>
            <p className="mt-3 text-sm" style={{ lineHeight: 1.8 }}>
              שלחנו קישור אימות אל <b dir="ltr">{done.email}</b>.
              <br />לחצו עליו כדי לאשר את הכתובת — ורק אז אפשר להתחבר.
            </p>
            {done.pendingApproval && (
              <p className="mt-3 text-sm" style={{ lineHeight: 1.8, color: 'var(--color-human-deep)' }}>
                הצטרפות לבית ספר קיים מאושרת על ידי מנהל בית הספר. תקבלו גישה ברגע שהבקשה תאושר.
              </p>
            )}
            {error && <p className="text-sm mt-3" style={{ color: 'var(--color-wrong)' }}>⚠️ {error}</p>}
            <button className="holo-button holo-button--staff w-full mt-5" onClick={resend} disabled={resent}>
              {resent ? 'נשלח שוב ✓' : 'לא הגיע? שלחו שוב'}
            </button>
            <p className="text-sm mt-4" style={{ color: 'var(--color-muted)' }}>
              <Link to="/staff/login" className="holo-link">למסך ההתחברות</Link>
            </p>
          </div>
        </div>
      </EntryShell>
    )
  }

  return (
    <EntryShell onClose={() => navigate('/staff/login')}>
    <div className="flex flex-col items-center justify-center p-2 gap-6">
      {/* הכותרת בתוך המשטח הלבן (ולא מעליו, על המסך שמאחורי החלון), כדי שתישאר קריאה */}
      <div className="holo-panel holo-panel--staff w-full max-w-sm">
      <div className="text-center mb-4">
        <h1 className="holo-text-glow font-black" style={{ fontSize: '2.2rem' }}>הרשמת צוות</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-muted)' }}>מורה או מנהל חדש</p>
      </div>
        <label className="block mb-1 text-sm" style={{ color: 'var(--color-muted)' }}>שם מלא</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="mb-4" style={inputStyle} />

        <label className="block mb-1 text-sm" style={{ color: 'var(--color-muted)' }}>אימייל</label>
        <input dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@school.com" className="mb-4" style={inputStyle} />

        <label className="block mb-1 text-sm" style={{ color: 'var(--color-muted)' }}>סיסמה (לפחות 6 תווים)</label>
        <input dir="ltr" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mb-4" style={inputStyle} />

        <label className="block mb-1 text-sm" style={{ color: 'var(--color-muted)' }}>אימות סיסמה</label>
        <input dir="ltr" type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} className="mb-1"
          style={{ ...inputStyle, ...(password2 && !passwordsMatch ? { border: '2px solid var(--color-wrong)' } : {}) }} />
        <p className="text-xs mb-3" style={{ color: password2 && !passwordsMatch ? 'var(--color-wrong)' : 'transparent', minHeight: 16 }}>הסיסמאות אינן תואמות</p>

        <label className="block mb-1 text-sm" style={{ color: 'var(--color-muted)' }}>בית ספר</label>
        <select value={schoolId} onChange={(e) => setSchoolId(e.target.value)} className="mb-2" style={{ ...inputStyle, cursor: 'pointer' }}>
          {schools.length === 0 && <option value="">טוען…</option>}
          {schools.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
          <option value="__new__">➕ בית הספר שלי לא ברשימה…</option>
        </select>
        {isNewSchool && (
          <>
            <input value={newSchoolName} onChange={(e) => setNewSchoolName(e.target.value)} placeholder="שם בית הספר החדש"
              className="mb-4" style={inputStyle} autoFocus />
            <label className="block mb-1 text-sm" style={{ color: 'var(--color-muted)' }}>תפקיד בבית הספר החדש</label>
            <div className="grid grid-cols-2 gap-3 mb-2">
              {([{ k: 'teacher', l: '🧑‍🏫 מורה' }, { k: 'admin', l: '🛡️ מנהל' }] as const).map((r) => (
                <button
                  key={r.k}
                  type="button"
                  onClick={() => setRole(r.k)}
                  className={`holo-button holo-button--staff text-center${role === r.k ? ' is-selected' : ''}`}
                  style={{ padding: '0.7rem', fontFamily: 'inherit', fontWeight: 'inherit' }}
                >
                  {r.l}
                </button>
              ))}
            </div>
            <p className="text-xs mb-4" style={{ color: 'var(--color-muted)', lineHeight: 1.6 }}>
              {role === 'admin' ? 'מנהל מוסיף מורים, פותח כיתות ומאשר מורים שמבקשים להצטרף לבית הספר.' : 'מורה בודד — יוצר כיתות ומקבל דוחות תלמידים.'}
            </p>
          </>
        )}
        {!isNewSchool && (
          <p className="text-xs mb-4" style={{ color: 'var(--color-muted)', lineHeight: 1.6 }}>
            🛡️ הצטרפות לבית ספר קיים נרשמת כמורה, ומנהל בית הספר צריך לאשר אותה לפני שתקבלו גישה.
          </p>
        )}

        {error && <p className="text-sm mb-3" style={{ color: 'var(--color-wrong)' }}>⚠️ {error}</p>}

        <button
          className="holo-button holo-button--staff w-full text-lg font-bold"
          disabled={busy || !canSubmit}
          onClick={submit}
        >
          {busy ? 'נרשם…' : 'הרשמה ←'}
        </button>

        <p className="text-sm text-center mt-4" style={{ color: 'var(--color-muted)' }}>
          כבר רשום?{' '}
          <Link to="/staff/login" className="holo-link">התחברות</Link>
        </p>
      </div>
    </div>
    </EntryShell>
  )
}
