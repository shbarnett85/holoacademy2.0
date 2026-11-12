import { useEffect, useState } from 'react'
import { apiJson } from '../../shared/lib/api'
import ConfirmModal from '../superadmin/ConfirmModal'
import { nameChip, panelWrong } from '../../styles/ui'

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
      <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
        מורים שנרשמו לבית הספר. אשרו רק מי שאתם מכירים — אחרי האישור תהיה להם גישה לכיתות שתשייכו אליהם.
      </p>
      {error && <p className="text-sm" style={{ ...panelWrong, padding: '6px 12px' }}>⚠️ {error}</p>}
      {reqs.map((r) => (
        <div key={r.id} className="holo-panel holo-panel--staff flex items-center justify-between gap-3" style={{ padding: '0.6rem 1rem' }}>
          <div className="min-w-0">
            <div className="font-bold"><span className="rounded-full px-3 py-0.5" style={{ ...nameChip, display: 'inline-block' }}>{r.name}</span>{r.schoolName ? <span className="text-xs" style={{ color: 'var(--color-muted)', fontWeight: 400 }}> · {r.schoolName}</span> : null}</div>
            <div className="text-xs mt-1" dir="ltr" style={{ color: 'var(--color-muted)', textAlign: 'right' }}>{r.email || '—'}</div>
            {!r.emailVerified && <div className="text-xs mt-1" style={{ background: 'var(--color-human-tint)', color: 'var(--color-human-deep)', borderRadius: 8, padding: '3px 8px' }}>⏳ המייל טרם אומת — אפשר לאשר רק אחרי שילחצו על קישור האימות</div>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              className="holo-button holo-button--staff holo-button--sm text-sm"
              disabled={!r.emailVerified || busyId === r.id}
              onClick={() => decide(r, 'approve')}
            >
              אישור
            </button>
            <button
              className="holo-button holo-button--staff holo-button--sm text-sm"
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
