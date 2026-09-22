import { useEffect, useState } from 'react'
import { apiJson } from '../../shared/lib/api'

/* ── דשבורד עלויות יצירה (מנהל-על) ──────────────────────────────────────────
   יצירות ליום, עלות משוערת, פילוח אנונימי/רשום/אורח, ואחוז האנונימיים
   שנרשמו בסוף (המרה). הנתונים מ-gen_log — 14 הימים האחרונים. */
interface DayRow { date: string; count: number; costAgorot: number; anon: number; registered: number; guest: number }
interface Stats { days: DayRow[]; anonConversion: number | null; anonActors: number }

export default function GenStats() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    apiJson<Stats>('/api/admin/gen-stats').then(setStats).catch((e: Error) => setError(e.message))
  }, [])

  const totalCost = (stats?.days ?? []).reduce((a, d) => a + d.costAgorot, 0)
  const totalCount = (stats?.days ?? []).reduce((a, d) => a + d.count, 0)

  return (
    <div className="holo-panel w-full" style={{ padding: '16px 20px' }}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold">🧬 יצירות ועלויות — 14 ימים</h2>
        {stats && (
          <span className="text-sm" style={{ opacity: 0.75 }}>
            {totalCount} יצירות · ‏₪{(totalCost / 100).toFixed(0)} משוער
            {stats.anonConversion !== null && <> · המרת אנונימיים: {Math.round(stats.anonConversion * 100)}% מתוך {stats.anonActors}</>}
          </span>
        )}
      </div>
      {error && <p className="text-sm" style={{ color: '#ff9bb3' }}>⚠️ {error}</p>}
      {!stats && !error && <p className="text-sm" style={{ opacity: 0.5 }}>טוען…</p>}
      {stats && stats.days.length === 0 && <p className="text-sm" style={{ opacity: 0.5 }}>אין יצירות בתקופה.</p>}
      {stats && stats.days.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ opacity: 0.55, textAlign: 'right' }}>
                <th style={{ padding: '4px 8px' }}>יום</th>
                <th style={{ padding: '4px 8px' }}>יצירות</th>
                <th style={{ padding: '4px 8px' }}>עלות משוערת</th>
                <th style={{ padding: '4px 8px' }}>אנונימי</th>
                <th style={{ padding: '4px 8px' }}>רשום</th>
                <th style={{ padding: '4px 8px' }}>אורח-דמו</th>
              </tr>
            </thead>
            <tbody>
              {stats.days.map((d) => (
                <tr key={d.date} style={{ borderTop: '1px solid rgba(0,246,255,.12)' }}>
                  <td style={{ padding: '5px 8px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{d.date}</td>
                  <td style={{ padding: '5px 8px' }}>{d.count}</td>
                  <td style={{ padding: '5px 8px' }}>₪{(d.costAgorot / 100).toFixed(2)}</td>
                  <td style={{ padding: '5px 8px' }}>{d.anon}</td>
                  <td style={{ padding: '5px 8px' }}>{d.registered}</td>
                  <td style={{ padding: '5px 8px' }}>{d.guest}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
