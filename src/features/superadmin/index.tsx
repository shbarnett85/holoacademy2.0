import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiJson, apiFetch } from '../../shared/lib/api'
import { useStaffAuth } from '../../shared/hooks/useStaffAuth'
import ConfirmModal from './ConfirmModal'
import SchoolUsers from './SchoolUsers'
import Reports from './Reports'
import FunnelPanel from './FunnelPanel'

interface AdminSchool {
  id: string
  name: string
  slug: string
  is_active: boolean
  userCount: number
  activeUserCount: number
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,246,255,0.3)',
  borderRadius: '0.5rem', color: 'var(--holo-text)', padding: '0.5rem 0.7rem',
}

/* פאנל מנהל-על — דשבורד בתי ספר + ניהול משתמשים */
export default function SuperAdminPanel() {
  const navigate = useNavigate()
  const { user, logout } = useStaffAuth()
  const [schools, setSchools] = useState<AdminSchool[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<{ id: string; name: string } | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirm, setConfirm] = useState<{ school: AdminSchool } | null>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ name: '', slug: '', adminName: '', adminEmail: '', adminPassword: '' })

  function load() {
    apiJson<{ schools: AdminSchool[] }>('/api/admin/schools')
      .then((b) => setSchools(b.schools))
      .catch((e: Error) => setError(e.message))
  }
  useEffect(load, [])

  async function setSchoolActive(school: AdminSchool, active: boolean) {
    setConfirm(null)
    try {
      await apiFetch(`/api/admin/schools/${school.id}${active ? '/reactivate' : ''}`, { method: active ? 'POST' : 'DELETE' })
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    }
  }

  const canCreate = form.name.trim() && /^[a-z0-9-]+$/.test(form.slug) && form.adminName.trim() && /\S+@\S+/.test(form.adminEmail) && form.adminPassword.length >= 6

  async function createSchool() {
    if (busy || !canCreate) return
    setBusy(true)
    setError(null)
    try {
      await apiJson('/api/admin/schools', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          slug: form.slug.trim(),
          admin: { name: form.adminName.trim(), email: form.adminEmail.trim(), password: form.adminPassword },
        }),
      })
      setForm({ name: '', slug: '', adminName: '', adminEmail: '', adminPassword: '' })
      setCreating(false)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'יצירת בית הספר נכשלה')
    } finally {
      setBusy(false)
    }
  }

  if (view) {
    return (
      <div className="holo-page-enter flex flex-col items-center min-h-screen p-6 gap-4 max-w-2xl mx-auto">
        <SchoolUsers schoolId={view.id} schoolName={view.name} onBack={() => { setView(null); load() }} />
      </div>
    )
  }

  return (
    <div className="holo-page-enter flex flex-col items-center min-h-screen p-6 gap-5 max-w-2xl mx-auto">
      <header className="w-full">
        <div className="flex items-center justify-between">
          <span className="text-sm" style={{ opacity: 0.6 }}>🛡️ {user?.name} · מנהל-על</span>
          <button className="text-sm cursor-pointer rounded-md px-2 py-1" style={{ border: '1px solid rgba(0,246,255,0.3)', background: 'transparent', color: 'var(--holo-text)' }} onClick={() => { logout(); navigate('/staff/login') }}>יציאה</button>
        </div>
        <h1 className="holo-text-glow text-3xl font-black mt-2 text-center">ניהול המערכת</h1>
      </header>

      {error && <p className="text-sm" style={{ color: '#ff9bb3' }}>⚠️ {error}</p>}

      <div className="w-full flex justify-between items-center">
        <h2 className="font-bold">בתי ספר</h2>
        <button className="holo-button text-sm" onClick={() => setCreating((v) => !v)}>+ בית ספר חדש</button>
      </div>

      {creating && (
        <div className="holo-panel w-full flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="שם בית הספר" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
            <input dir="ltr" placeholder="slug (אנגלית-מקפים)" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} style={inputStyle} />
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--holo-cyan)', opacity: 0.8 }}>פרטי המנהל הראשון של בית הספר:</div>
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="שם המנהל" value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} style={inputStyle} />
            <input dir="ltr" placeholder="email" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} style={inputStyle} />
            <input dir="ltr" type="password" placeholder="סיסמה (6+)" value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} style={inputStyle} />
          </div>
          <button className="holo-button" style={{ opacity: busy || !canCreate ? 0.5 : 1 }} disabled={busy || !canCreate} onClick={createSchool}>{busy ? 'יוצר…' : 'צור בית ספר + מנהל'}</button>
        </div>
      )}

      {!schools ? (
        <p style={{ opacity: 0.6 }}>טוען…</p>
      ) : schools.length === 0 ? (
        <p style={{ opacity: 0.6 }}>אין בתי ספר עדיין.</p>
      ) : (
        <div className="w-full flex flex-col gap-2">
          {schools.map((s) => (
            <div key={s.id} className="holo-panel flex items-center justify-between" style={{ padding: '0.8rem 1rem', opacity: s.is_active ? 1 : 0.45 }}>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold">{s.name}</span>
                  <span
                    className="text-xs rounded-full px-2 py-0.5"
                    style={s.is_active
                      ? { background: 'rgba(0,255,150,0.15)', border: '1px solid rgba(0,255,150,0.5)', color: '#5fffb0' }
                      : { background: 'rgba(255,120,150,0.12)', border: '1px solid rgba(255,120,150,0.5)', color: '#ff9bb3' }}
                  >
                    {s.is_active ? '● פעיל' : '○ מושבת'}
                  </span>
                </div>
                <div className="text-xs mt-1" style={{ opacity: 0.6 }}>{s.slug} · {s.activeUserCount}/{s.userCount} משתמשים פעילים</div>
              </div>
              <div className="flex gap-2">
                <button className="text-sm cursor-pointer rounded-md px-2 py-1" style={{ border: '1px solid rgba(0,246,255,0.4)', background: 'transparent', color: 'var(--holo-text)' }} onClick={() => setView({ id: s.id, name: s.name })}>משתמשים</button>
                {s.is_active ? (
                  <button className="text-sm cursor-pointer rounded-md px-2 py-1" style={{ border: '1px solid rgba(255,120,150,0.4)', color: '#ff9bb3', background: 'transparent' }} onClick={() => setConfirm({ school: s })}>השבתה</button>
                ) : (
                  <button className="text-sm cursor-pointer rounded-md px-2 py-1" style={{ border: '1px solid rgba(0,255,150,0.4)', color: '#5fffb0', background: 'transparent' }} onClick={() => setSchoolActive(s, true)}>הפעלה</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="w-full mt-4"><FunnelPanel /></div>

      <div className="w-full mt-4 mb-8"><Reports /></div>

      {confirm && (
        <ConfirmModal
          title="השבתת בית ספר"
          message={`האם להשבית את "${confirm.school.name}"? כל המשתמשים בו יושבתו ולא יוכלו להתחבר. ניתן להפעיל מחדש בכל עת.`}
          confirmLabel="השבת"
          danger
          onConfirm={() => setSchoolActive(confirm.school, false)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
