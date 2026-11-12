import { useEffect, useState } from 'react'
import { apiJson, apiFetch } from '../../shared/lib/api'
import { fieldStyle, infoChip, nameChip, panelWrong } from '../../styles/ui'
import ConfirmModal from './ConfirmModal'

interface AdminUser {
  id: string
  name: string
  role: 'teacher' | 'admin' | 'super_admin' | 'student'
  school_id: string | null
  is_active: boolean
  /* 'pending' = בקשת הצטרפות של מורה שנרשם לבית ספר קיים וממתין לאישור */
  approval_status?: 'pending' | null
}

const ROLE_LABEL: Record<string, string> = { teacher: 'מורה', admin: 'מנהל', super_admin: 'מנהל-על', student: 'תלמיד' }

const inputStyle: React.CSSProperties = { ...fieldStyle, padding: '0.5rem 0.7rem' }
const rowBtn = 'holo-button holo-button--staff holo-button--sm text-sm'

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

  /* בקשת הצטרפות ממתינה: אישור/דחייה דרך נתיבי בקשות ההצטרפות (בודקים שהמייל אומת) */
  async function decide(user: AdminUser, action: 'approve' | 'reject') {
    setError(null)
    try {
      await apiJson(`/api/staff/teacher-requests/${user.id}/${action}`, { method: 'POST' })
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
        <button className="holo-link text-sm" onClick={onBack}>← בתי הספר</button>
        <h2 className="holo-text-glow text-xl font-bold">משתמשי {schoolName}</h2>
        <button className="holo-button holo-button--staff text-sm" onClick={() => setAdding((v) => !v)}>+ משתמש</button>
      </div>

      {error && <p className="text-sm mb-3" style={{ ...panelWrong, padding: '6px 12px' }}>⚠️ {error}</p>}

      {adding && (
        <div className="holo-panel holo-panel--staff w-full mb-4 flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="שם" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'teacher' | 'admin' })} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="teacher">מורה</option>
              <option value="admin">מנהל</option>
            </select>
            <input dir="ltr" placeholder="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inputStyle} />
            <input dir="ltr" type="password" placeholder="סיסמה (6+)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} style={inputStyle} />
          </div>
          <button className="holo-button holo-button--staff" disabled={busy} onClick={addUser}>{busy ? 'יוצר…' : 'צור משתמש'}</button>
        </div>
      )}

      {!users ? (
        <p style={{ color: 'var(--color-muted)' }}>טוען…</p>
      ) : users.length === 0 ? (
        <p style={{ color: 'var(--color-muted)' }}>אין משתמשים בבית ספר זה.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {users.map((u) => (
            <div key={u.id} className="holo-panel holo-panel--staff flex items-center justify-between" style={{ padding: '0.7rem 1rem', opacity: u.is_active || u.approval_status === 'pending' ? 1 : 0.45 }}>
              <div className="flex items-center gap-3">
                <span className="font-bold rounded-full px-3 py-0.5" style={nameChip}>{u.name}</span>
                <span className="text-xs rounded-full px-2 py-0.5" style={infoChip}>{ROLE_LABEL[u.role] ?? u.role}</span>
                <span
                  className="text-xs rounded-full px-2 py-0.5"
                  style={u.approval_status === 'pending'
                    ? { ...infoChip, background: 'var(--color-human-tint)', color: 'var(--color-human-deep)' }
                    : u.is_active ? infoChip : { ...infoChip, background: 'var(--color-ink-wash)' }}
                >
                  {u.approval_status === 'pending' ? '⏳ ממתין לאישור' : u.is_active ? '● פעיל' : '○ מושבת'}
                </span>
              </div>
              {u.approval_status === 'pending' ? (
                <div className="flex gap-2">
                  <button className={rowBtn} onClick={() => decide(u, 'approve')}>אישור</button>
                  <button className={rowBtn} onClick={() => decide(u, 'reject')}>דחייה</button>
                </div>
              ) : u.is_active ? (
                <button className={rowBtn} onClick={() => setConfirm({ user: u })}>השבתה</button>
              ) : (
                <button className={rowBtn} onClick={() => setActive(u, true)}>הפעלה</button>
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
