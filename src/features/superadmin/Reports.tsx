import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiJson } from '../../shared/lib/api'

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

  const btn: React.CSSProperties = { fontSize: 13, cursor: 'pointer', borderRadius: 6, padding: '0.3rem 0.7rem', background: 'transparent' }

  return (
    <div className="w-full">
      <div className="w-full flex justify-between items-center mt-2">
        <h2 className="font-bold">🚩 דיווחים על הדמיות ({reports?.length ?? 0})</h2>
      </div>
      {error && <p className="text-sm" style={{ color: '#ff9bb3' }}>⚠️ {error}</p>}
      {!reports ? <p style={{ opacity: 0.6 }}>טוען…</p> : reports.length === 0 ? (
        <p className="text-sm" style={{ opacity: 0.6 }}>אין דיווחים פתוחים. 👍</p>
      ) : (
        <div className="w-full flex flex-col gap-2">
          {reports.map((r) => (
            <div key={r.id} className="holo-panel flex flex-col gap-2" style={{ padding: '0.8rem 1rem', borderColor: 'rgba(255,120,150,0.35)' }}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">{r.questTitle} {!r.questIsPublic && <span className="text-xs" style={{ color: '#ffce5e' }}>· כבר לא משותפת</span>}</span>
                <span className="text-xs" style={{ opacity: 0.6 }}>{new Date(r.createdAt).toLocaleDateString('he-IL')}</span>
              </div>
              <div className="text-sm" style={{ color: '#ffd0dc' }}>"{r.reason}"</div>
              <div className="text-xs" style={{ opacity: 0.6 }}>דיווח מאת: {r.reporterName}</div>
              <div className="flex gap-2 flex-wrap mt-1">
                <button style={{ ...btn, border: '1px solid rgba(0,246,255,0.4)', color: 'var(--holo-text)' }} onClick={() => navigate(`/play/${r.questId}`)}>צפה בהדמיה ▶</button>
                {r.questIsPublic && <button disabled={busy === r.id} style={{ ...btn, border: '1px solid rgba(255,120,150,0.5)', color: '#ff9bb3' }} onClick={() => act(r, { unshare: true })}>בטל שיתוף 🚫</button>}
                <button disabled={busy === r.id} style={{ ...btn, border: '1px solid rgba(0,255,150,0.4)', color: '#5fffb0' }} onClick={() => act(r, { status: 'reviewed' })}>סמן כטופל ✓</button>
                <button disabled={busy === r.id} style={{ ...btn, border: '1px solid rgba(120,160,200,0.4)', color: '#aebfd2' }} onClick={() => act(r, { status: 'dismissed' })}>דחה דיווח</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
