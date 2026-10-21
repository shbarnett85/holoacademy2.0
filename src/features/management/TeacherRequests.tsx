import { useEffect, useState } from 'react'
import { apiJson } from '../../shared/lib/api'
import ConfirmModal from '../superadmin/ConfirmModal'

export interface JoinRequest { id: string; name: string; email: string; emailVerified: boolean; schoolName: string; requestedAt: string | null }

/* בקשות הצטרפות של מורים שנרשמו לבית הספר (הרשמה עצמית) — מנהל בית הספר מאשר או דוחה.
   לא מוצג כלל כשאין בקשות. אישור מתאפשר רק אחרי שהמבקש/ת אימתו את המייל (השרת אוכף). */
export default function TeacherRequests({ onChanged }: { onChanged?: () => void }) {
  const [reqs, setReqs] = useState<JoinRequest[]>([])
  const [error, setError] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<JoinRequest | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  function load() {
    apiJson<{ requests: JoinRequest[] }>('/api/staff/teacher-requests').then((b) => setReqs(b.requests)).catch(() => {})
  }
  useEffect(load, [])

  async function decide(r: JoinRequest, action: 'approve' | 'reject') {
    setRejecting(null)
    setBusyId(r.id)
    setError(null)
    try {
      await apiJson(`/api/staff/teacher-requests/${r.id}/${action}`, { method: 'POST' })
      load()
      onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusyId(null)
    }
  }

  if (reqs.length === 0 && !error) return null

  return (
    <div className="w-full flex flex-col gap-2">
      <h2 className="font-bold">בקשות הצטרפות ({reqs.length})</h2>
      <p className="text-xs" style={{ opacity: 0.6 }}>
        מורים שנרשמו לבית הספר. אשרו רק מי שאתם מכירים — אחרי האישור תהיה להם גישה לכיתות שתשייכו אליהם.
      </p>
      {error && <p className="text-sm" style={{ color: 'var(--t18)' }}>⚠️ {error}</p>}
      {reqs.map((r) => (
        <div key={r.id} className="holo-panel flex items-center justify-between gap-3" style={{ padding: '0.6rem 1rem' }}>
          <div className="min-w-0">
            <div className="font-bold">{r.name}{r.schoolName ? <span className="text-xs" style={{ opacity: 0.6 }}> · {r.schoolName}</span> : null}</div>
            <div className="text-xs" dir="ltr" style={{ opacity: 0.7, textAlign: 'right' }}>{r.email || '—'}</div>
            {!r.emailVerified && <div className="text-xs mt-1" style={{ color: 'var(--t18)' }}>⏳ המייל טרם אומת — אפשר לאשר רק אחרי שילחצו על קישור האימות</div>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              className="text-sm cursor-pointer rounded-md px-2 py-1"
              style={{ border: '1px solid var(--t297)', color: 'var(--t3)', background: 'transparent', opacity: !r.emailVerified || busyId === r.id ? 0.4 : 1 }}
              disabled={!r.emailVerified || busyId === r.id}
              onClick={() => decide(r, 'approve')}
            >
              אישור
            </button>
            <button
              className="text-sm cursor-pointer rounded-md px-2 py-1"
              style={{ border: '1px solid var(--t298)', color: 'var(--t18)', background: 'transparent', opacity: busyId === r.id ? 0.4 : 1 }}
              disabled={busyId === r.id}
              onClick={() => setRejecting(r)}
            >
              דחייה
            </button>
          </div>
        </div>
      ))}
      {rejecting && (
        <ConfirmModal
          title="דחיית בקשת הצטרפות"
          message={`לדחות את הבקשה של ${rejecting.name}? החשבון יימחק, והכתובת תוכל להירשם מחדש.`}
          confirmLabel="דחה"
          danger
          onConfirm={() => decide(rejecting, 'reject')}
          onCancel={() => setRejecting(null)}
        />
      )}
    </div>
  )
}
