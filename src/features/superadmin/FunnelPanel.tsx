import { useEffect, useState } from 'react'
import { apiJson } from '../../shared/lib/api'

/* משפך ההתנסות — הצגת מוני ה-funnel_events (30 יום) למנהל-העל: מדף → משחק →
   סיום → המרה/שיתוף. best-effort: כשל/טבלה חסרה → הפאנל פשוט לא מוצג. */
interface FunnelSummary {
  sinceDays?: number
  counts: Record<string, number>
  topQuests: { questId: string; events: number }[]
  notReady?: boolean
}

const STEPS: { key: string; label: string; icon: string }[] = [
  { key: 'showcase_click', label: 'קליקים במדף', icon: '🎮' },
  { key: 'visitor_play_start', label: 'מבקרים התחילו לשחק', icon: '▶' },
  { key: 'visitor_finish', label: 'הגיעו למסך הסיום', icon: '🏁' },
  { key: 'cta_whatsapp', label: 'שיתפו בוואטסאפ', icon: '💬' },
  { key: 'cta_create', label: 'לחצו "צרו בעצמכם"', icon: '✨' },
  { key: 'teacher_whatsapp', label: 'מורים שיתפו קישור', icon: '🔗' },
]

export default function FunnelPanel() {
  const [data, setData] = useState<FunnelSummary | null>(null)

  useEffect(() => {
    apiJson<FunnelSummary>('/api/funnel/summary')
      .then((b) => { if (!b.notReady) setData(b) })
      .catch(() => { /* אין נתונים — לא מציגים */ })
  }, [])

  if (!data) return null
  const total = Object.values(data.counts).reduce((a, b) => a + b, 0)
  const max = Math.max(1, ...STEPS.map((s) => data.counts[s.key] ?? 0))

  return (
    <div className="holo-panel w-full">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">📈 משפך ההתנסות · {data.sinceDays ?? 30} ימים</h2>
        <span className="text-xs" style={{ opacity: 0.55 }}>{total} אירועים</span>
      </div>
      {total === 0 ? (
        <p className="text-sm mt-2" style={{ opacity: 0.6 }}>עדיין אין תנועה — שתפו קישור הדמיה ותראו את המשפך מתמלא.</p>
      ) : (
        <div className="flex flex-col gap-2 mt-3">
          {STEPS.map((s) => {
            const n = data.counts[s.key] ?? 0
            return (
              <div key={s.key} className="flex items-center gap-2">
                <span style={{ width: 22, textAlign: 'center', fontSize: 13 }}>{s.icon}</span>
                <span className="text-xs" style={{ width: 150, opacity: 0.8 }}>{s.label}</span>
                <div style={{ flex: 1, height: 14, borderRadius: 7, background: 'rgba(47,243,255,.07)', overflow: 'hidden' }}>
                  <div style={{ width: `${(n / max) * 100}%`, height: '100%', borderRadius: 7, background: 'linear-gradient(90deg, rgba(47,243,255,.65), rgba(155,140,255,.65))', transition: 'width .4s' }} />
                </div>
                <span className="text-xs font-bold" style={{ width: 36, textAlign: 'left', color: 'var(--holo-cyan-bright, #2ff3ff)' }}>{n}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
