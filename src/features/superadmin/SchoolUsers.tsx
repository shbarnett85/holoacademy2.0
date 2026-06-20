import { useEffect, useState } from 'react'
import { apiJson, apiFetch } from '../../shared/lib/api'
import ConfirmModal from './ConfirmModal'

interface AdminUser {
  id: string
  name: string
  role: 'teacher' | 'admin' | 'super_admin' | 'student'
  school_id: string | null
  is_active: boolean
}

const ROLE_LABEL: Record<string, string> = { teacher: 'מורה', admin: 'מנהל', super_admin: 'מנהל-על', student: 'תלמיד' }

const inputStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,246,255,0.3)',
  borderRadius: '0.5rem', color: 'var(--holo-text)', padding: '0.5rem 0.7rem',
}

/* ניהול משתמשים של בית ספר — טבלה, סטטוס, השבתה/הפעלה, הוספה */
export default function SchoolUsers({ schoolId, schoolName, onBack }: { schoolId: string; schoolName: string; onBack: () => void }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ user: AdminUser } | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'teacher' as 'teacher' | 'admin' })
  const [busy, setBusy] = useState(false)

  function load() {
    apiJson<{ users: AdminUser[] }>(`/api/admin/users?schoolId=${schoolId}`)
      .then((b) => setUsers(b.users))
      .catch((e: Error) => setError(e.message))
  }
  useEffect(load, [schoolId])

  async function setActive(user: AdminUser, active: boolean) {
    setConfirm(null)
    try {
      await apiFetch(`/api/admin/users/${user.id}/${active ? 'reactivate' : 'deactivate'}`, { method: 'POST' })
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    }
  }

  async function addUser() {
    if (busy || !form.name.trim() || !/\S+@\S+/.test(form.email) || form.password.length < 6) return
    setBusy(true)
    setError(null)
    try {
      await apiJson('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ ...form, email: form.email.trim(), name: form.name.trim(), schoolId }),
      })
      setForm({ name: '', email: '', password: '', role: 'teacher' })
      setAdding(false)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'יצירת המשתמש נכשלה')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <button className="text-sm cursor-pointer" style={{ color: 'var(--holo-cyan)' }} onClick={onBack}>← בתי הספר</button>
        <h2 className="holo-text-glow text-xl font-bold">משתמשי {schoolName}</h2>
        <button className="holo-button text-sm" onClick={() => setAdding((v) => !v)}>+ משתמש</button>
      </div>

      {error && <p className="text-sm mb-3" style={{ color: '#ff9bb3' }}>⚠️ {error}</p>}

      {adding && (
        <div className="holo-panel w-full mb-4 flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="שם" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'teacher' | 'admin' })} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="teacher" style={{ background: 'var(--holo-bg)' }}>מורה</option>
              <option value="admin" style={{ background: 'var(--holo-bg)' }}>מנהל</option>
            </select>
            <input dir="ltr" placeholder="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inputStyle} />
            <input dir="ltr" type="password" placeholder="סיסמה (6+)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} style={inputStyle} />
          </div>
          <button className="holo-button" style={{ opacity: busy ? 0.5 : 1 }} disabled={busy} onClick={addUser}>{busy ? 'יוצר…' : 'צור משתמש'}</button>
        </div>
      )}

      {!users ? (
        <p style={{ opacity: 0.6 }}>טוען…</p>
      ) : users.length === 0 ? (
        <p style={{ opacity: 0.6 }}>אין משתמשים בבית ספר זה.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {users.map((u) => (
            <div key={u.id} className="holo-panel flex items-center justify-between" style={{ padding: '0.7rem 1rem', opacity: u.is_active ? 1 : 0.45 }}>
              <div className="flex items-center gap-3">
                <span className="font-bold">{u.name}</span>
                <span className="text-xs rounded-full px-2 py-0.5" style={{ background: 'rgba(0,136,255,0.2)', border: '1px solid rgba(0,136,255,0.4)' }}>{ROLE_LABEL[u.role] ?? u.role}</span>
                <span
                  className="text-xs rounded-full px-2 py-0.5"
                  style={u.is_active
                    ? { background: 'rgba(0,255,150,0.15)', border: '1px solid rgba(0,255,150,0.5)', color: '#5fffb0' }
                    : { background: 'rgba(255,120,150,0.12)', border: '1px solid rgba(255,120,150,0.5)', color: '#ff9bb3' }}
                >
                  {u.is_active ? '● פעיל' : '○ מושבת'}
                </span>
              </div>
              {u.is_active ? (
                <button className="text-sm cursor-pointer rounded-md px-2 py-1" style={{ border: '1px solid rgba(255,120,150,0.4)', color: '#ff9bb3', background: 'transparent' }} onClick={() => setConfirm({ user: u })}>השבתה</button>
              ) : (
                <button className="text-sm cursor-pointer rounded-md px-2 py-1" style={{ border: '1px solid rgba(0,255,150,0.4)', color: '#5fffb0', background: 'transparent' }} onClick={() => setActive(u, true)}>הפעלה</button>
              )}
            </div>
          ))}
        </div>
      )}

      {confirm && (
        <ConfirmModal
          title="השבתת משתמש"
          message={`האם להשבית את ${confirm.user.name}? ניתן להפעיל מחדש בכל עת.`}
          confirmLabel="השבת"
          danger
          onConfirm={() => setActive(confirm.user, false)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
