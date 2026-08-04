import { useEffect, useState } from 'react'
import { apiJson } from '../../shared/lib/api'
import { glass, micro } from '../creator/studioStyles'
import { puzzleTypeLabel } from '../../shared/lib/labels'
import { pct, duration } from './format'
import PedagogicalSummary from './PedagogicalSummary'
import ProgressGraph from './ProgressGraph'

/* מבנה ישן (v1) — נשמר לתאימות לאחור */
interface ProfileV1 {
  writing_level: number | null
  puzzle_difficulty: number | null
  avg_success_rate: number | null
  avg_time_per_scene: number | null
  sessions_count: number | null
  last_updated: string | null
}
/* מבנה חדש (v2) — רמת טקסט + רמה פר-סוג-אתגר */
interface ProfileV2 {
  text_level: number | null
  per_puzzle_level: Record<string, number> | null
  last_success_rates: Record<string, number> | null
  last_avg_scene_ms: number | null
  sessions_count: number | null
  last_updated: string | null
}
interface HistoryItem { sessionId: string; questId: string; questTitle: string; startedAt: string | null; completedAt: string | null; status: string; successRate: number | null }
interface StudentAnalytics {
  student: { id: string; name: string }
  profile: ProfileV1 | ProfileV2 | null
  profileVersion: 1 | 2
  skipping: boolean
  history: HistoryItem[]
  trend: { date: string | null; successRate: number | null }[]
}

function dateStr(s: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ ...glass, padding: 20 }}>
      <div style={{ ...micro, fontSize: 9, marginBottom: 14 }}>◇ {title}</div>
      {children}
    </div>
  )
}

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 96, flex: '1 1 96px' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t1)', textShadow: '0 0 16px var(--t23)' }}>{value}</div>
      <div style={{ ...micro, fontSize: 8.5, marginTop: 6 }}>{label}</div>
    </div>
  )
}

/* מגמת אחוז ההצלחה — sparkline עם קו יעד 85% */
function Trend({ trend }: { trend: { successRate: number | null }[] }) {
  const pts = trend.map((t) => t.successRate).filter((r): r is number => r !== null)
  if (pts.length < 2) return null
  const w = 280, h = 60
  const step = w / (pts.length - 1)
  const path = pts.map((r, i) => `${i === 0 ? 'M' : 'L'} ${i * step} ${h - r * h}`).join(' ')
  return (
    <Panel title="מגמת הצלחה">
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible', direction: 'ltr' }}>
        <line x1="0" y1={h - 0.85 * h} x2={w} y2={h - 0.85 * h} style={{ stroke: 'var(--t73)' }} strokeDasharray="4 4" />
        <path d={path} fill="none" style={{ stroke: 'var(--t15)' }} strokeWidth="2.2" strokeLinejoin="round" />
        {pts.map((r, i) => <circle key={i} cx={i * step} cy={h - r * h} r="3.2" style={{ fill: 'var(--t61)', stroke: 'var(--t15)' }} strokeWidth="1.6" />)}
      </svg>
    </Panel>
  )
}

/* mode: 'full' = הכל (גרף+פירוטים+סיכום); 'progress' = גרף+פירוטים בלבד; 'summary' = סיכום פדגוגי בלבד */
export default function StudentDetail({ studentId, onBack, backLabel = 'הכיתה', className, mode = 'full' }: { studentId: string; onBack: () => void; backLabel?: string; className?: string; mode?: 'full' | 'progress' | 'summary' }) {
  const [res, setRes] = useState<{ id: string; data?: StudentAnalytics; error?: string }>({ id: '' })

  useEffect(() => {
    let cancelled = false
    apiJson<StudentAnalytics>(`/api/analytics/student/${studentId}`)
      .then((d) => { if (!cancelled) setRes({ id: studentId, data: d }) })
      .catch((e: Error) => { if (!cancelled) setRes({ id: studentId, error: e.message }) })
    return () => { cancelled = true }
  }, [studentId])

  if (res.id !== studentId) return <p style={{ ...micro, color: 'var(--t22)' }}>טוען…</p>
  if (res.error) return <div style={{ ...glass, padding: 16, color: 'var(--t18)' }}>⚠️ {res.error}</div>
  const data = res.data
  if (!data) return <p style={{ ...micro, color: 'var(--t22)' }}>טוען…</p>

  const p = data.profile
  const isV2 = data.profileVersion === 2
  const v2 = isV2 ? (p as ProfileV2 | null) : null
  const v1 = !isV2 ? (p as ProfileV1 | null) : null
  /* סדר תצוגת סוגי האתגרים בפרופיל ה-per-type */
  const PUZZLE_ORDER = ['multipleChoice', 'trueFalse', 'finalQuiz', 'wordCompletion', 'sequenceOrder', 'hangman', 'tileSwap', 'wordSearch', 'memory']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--t15)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>← {backLabel}</button>
        <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--t13)', textShadow: '0 0 20px var(--t23)' }}>{data.student.name}</div>
        <span style={{ width: 60 }} />
      </div>

      {/* גרף ההתקדמות לאורך זמן + השוואה (הועבר לכאן מעדשת ההתקדמות) */}
      {mode !== 'summary' && <ProgressGraph studentId={studentId} studentName={data.student.name} className={className} />}

      {/* דגל דילוג על טקסט */}
      {mode !== 'summary' && data.skipping && (
        <div style={{ ...glass, padding: '12px 16px', borderColor: 'var(--t74)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>⚡</span>
          <span style={{ fontSize: 13, color: 'var(--t4)' }}>התלמיד כנראה מדלג על הטקסט (קריאה מהירה מאוד) — שווה לוודא שהוא קורא את הנרטיב.</span>
        </div>
      )}

      {/* פרופיל קושי נוכחי */}
      {mode !== 'summary' && <Panel title="פרופיל הקושי הנוכחי">
        {!p ? <p style={{ fontSize: 13, color: 'var(--t6)' }}>עדיין אין מספיק נתונים לפרופיל קושי.</p> : isV2 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Stat value={<>{v2?.text_level ?? '—'}<span style={{ fontSize: 13, opacity: 0.5 }}>/20</span></>} label="רמת טקסט" />
              <Stat value={duration(v2?.last_avg_scene_ms ?? null)} label="זמן אחרון/סצנה" />
              <Stat value={v2?.sessions_count ?? 0} label="הדמיות שכוילו" />
            </div>
            <div>
              <div style={{ ...micro, fontSize: 8.5, marginBottom: 8 }}>◇ רמת קושי לכל סוג אתגר (1-20)</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                {PUZZLE_ORDER.map((t) => {
                  const lvl = v2?.per_puzzle_level?.[t]
                  if (lvl === undefined) return null
                  const rate = v2?.last_success_rates?.[t]
                  return (
                    <div key={t} style={{ padding: '8px 11px', borderRadius: 10, background: 'var(--t25)', border: '1px solid var(--t26)' }}>
                      <div style={{ fontSize: 11, color: 'var(--t12)', marginBottom: 3 }}>{puzzleTypeLabel(t)}</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--t1)' }}>{lvl}<span style={{ fontSize: 11, opacity: 0.45 }}>/20</span></span>
                        {rate !== undefined && <span dir="ltr" style={{ fontSize: 11, color: 'var(--t6)' }}>{pct(rate)}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Stat value={<>{v1?.puzzle_difficulty ?? '—'}<span style={{ fontSize: 13, opacity: 0.5 }}>/10</span></>} label="רמת קושי" />
            <Stat value={v1?.writing_level ?? '—'} label="רמת כתיבה" />
            <Stat value={pct(v1?.avg_success_rate ?? null)} label="הצלחה ממוצעת" />
            <Stat value={duration(v1?.avg_time_per_scene ? v1.avg_time_per_scene * 1000 : null)} label="זמן ממוצע/סצנה" />
          </div>
        )}
      </Panel>}

      {/* סיכום פדגוגי — ד"ר הולו קורא את הנתונים */}
      {mode !== 'progress' && <PedagogicalSummary scope="student" id={studentId} title={data.student.name} />}

      {mode !== 'summary' && <Trend trend={data.trend} />}

      {/* היסטוריית הדמיות */}
      {mode !== 'summary' && <Panel title="היסטוריית הדמיות">
        {data.history.length === 0 ? <p style={{ fontSize: 13, color: 'var(--t6)' }}>טרם שיחק בהדמיות.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {data.history.map((h) => (
              <div key={h.sessionId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 13px', borderRadius: 11, background: 'var(--t25)', border: '1px solid var(--t26)' }}>
                <span style={{ fontWeight: 600, color: 'var(--t68)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.questTitle || '(ללא שם)'}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 13, flexShrink: 0 }}>
                  <span style={{ color: h.status === 'completed' ? 'var(--t3)' : 'var(--t4)' }}>{h.status === 'completed' ? 'סיים' : 'באמצע'}</span>
                  <span dir="ltr" style={{ width: 44, textAlign: 'left', color: 'var(--t12)' }}>{pct(h.successRate)}</span>
                  <span style={{ color: 'var(--t6)' }}>{dateStr(h.completedAt ?? h.startedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>}
    </div>
  )
}
