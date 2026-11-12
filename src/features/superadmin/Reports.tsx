import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiJson } from '../../shared/lib/api'
import { nameChip, panelWrong } from '../../styles/ui'

interface Report {
  id: string
  questId: string
  questTitle: string
  questIsPublic: boolean
  reporterName: string
  reason: string
  status: string
  createdAt: string
}

/* מודרציה — דיווחים פתוחים על הדמיות ציבוריות. ביטול שיתוף / סימון טופל / דחייה. */
export default function Reports() {
  const navigate = useNavigate()
  const [reports, setReports] = useState<Report[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  function load() {
    apiJson<{ reports: Report[] }>('/api/admin/reports?status=open').then((b) => setReports(b.reports)).catch((e: Error) => setError(e.message))
  }
  useEffect(load, [])

  async function act(r: Report, body: { status?: 'reviewed' | 'dismissed'; unshare?: boolean }) {
    setBusy(r.id); setError(null)
    try { await apiJson(`/api/admin/reports/${r.id}`, { method: 'PATCH', body: JSON.stringify(body) }); load() }
    catch (e) { setError(e instanceof Error ? e.message : 'שגיאה') } finally { setBusy(null) }
  }

  const btn: React.CSSProperties = { fontSize: 13, padding: '0.3rem 0.7rem' }
  const btnClass = 'holo-button holo-button--staff holo-button--sm'

  return (
    <div className="w-full">
      <div className="w-full flex justify-between items-center mt-2">
        <h2 className="font-bold">🚩 דיווחים על שיעורים ({reports?.length ?? 0})</h2>
      </div>
      {error && <p className="text-sm" style={{ ...panelWrong, padding: '6px 12px', margin: '6px 0' }}>⚠️ {error}</p>}
      {!reports ? <p style={{ color: 'var(--color-muted)' }}>טוען…</p> : reports.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>אין דיווחים פתוחים. 👍</p>
      ) : (
        <div className="w-full flex flex-col gap-2">
          {reports.map((r) => (
            <div key={r.id} className="holo-panel holo-panel--staff flex flex-col gap-2" style={{ padding: '0.8rem 1rem' }}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">{r.questTitle} {!r.questIsPublic && <span className="text-xs" style={{ color: 'var(--color-human-deep)' }}>· כבר לא משותפת</span>}</span>
                <span className="text-xs" style={{ color: 'var(--color-muted)' }}>{new Date(r.createdAt).toLocaleDateString('he-IL')}</span>
              </div>
              <div className="text-sm" style={{ color: 'var(--color-ink)', background: 'var(--color-ink-wash)', borderRadius: 8, padding: '6px 10px' }}>"{r.reason}"</div>
              <div className="text-xs" style={{ color: 'var(--color-muted)' }}>דיווח מאת: <span style={{ ...nameChip, borderWidth: 1.5, borderRadius: 999, padding: '0 8px', display: 'inline-block' }}>{r.reporterName}</span></div>
              <div className="flex gap-2 flex-wrap mt-1">
                <button className={btnClass} style={btn} onClick={() => navigate(`/play/${r.questId}`)}>צפה בשיעור ▶</button>
                {r.questIsPublic && <button className={btnClass} disabled={busy === r.id} style={btn} onClick={() => act(r, { unshare: true })}>בטל שיתוף 🚫</button>}
                <button className={btnClass} disabled={busy === r.id} style={btn} onClick={() => act(r, { status: 'reviewed' })}>סמן כטופל ✓</button>
                <button className={btnClass} disabled={busy === r.id} style={btn} onClick={() => act(r, { status: 'dismissed' })}>דחה דיווח</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
