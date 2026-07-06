import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch, apiJson } from '../../shared/lib/api'
import { glass, micro } from '../creator/studioStyles'
import DonutChart from './charts'
import { pct, duration, FLAG_META, STATUS_META } from './format'
import PedagogicalSummary from './PedagogicalSummary'

interface PerStudent {
  studentId: string; name: string
  status: 'completed' | 'in_progress' | 'not_started'
  successRate: number | null; crystals: number | null; durationMs: number | null; avgSceneMs: number | null
  flags: string[]
}
interface PerChallenge { sceneId: string; title: string; type: string; attempts: number; solved: number; failed: number; successRate: number | null }
interface PerObjective {
  id: string; text: string; attempts: number; successRate: number | null
  masteryLevel: 'strong' | 'partial' | 'weak' | null
  weakStudents: { studentId: string; name: string }[]
}
interface AssignmentAnalytics {
  quest: { id: string; title: string }
  class: { id: string; name: string }
  totals: { students: number; completed: number; inProgress: number; notStarted: number; completionRate: number; avgSuccessRate: number | null; avgCompletionMs: number | null; flaggedCount: number }
  distribution: { low: number; mid: number; high: number }
  perChallenge: PerChallenge[]
  perObjective?: PerObjective[]
  students: PerStudent[]
  insights: string[]
}

function MetricCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ ...glass, padding: '14px 18px', textAlign: 'center', flex: '1 1 110px', minWidth: 100 }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent ?? '#7ef6ff', textShadow: `0 0 18px ${accent ?? 'rgba(47,243,255,.4)'}` }}>{value}</div>
      <div style={{ ...micro, fontSize: 9, marginTop: 6 }}>{label}</div>
    </div>
  )
}

function Panel({ title, children, accent }: { title: string; children: React.ReactNode; accent?: string }) {
  return (
    <div style={{ ...glass, padding: 20, ...(accent ? { borderColor: accent } : {}) }}>
      <div style={{ ...micro, fontSize: 9, marginBottom: 14 }}>◇ {title}</div>
      {children}
    </div>
  )
}

/* שליטה ביעדי הלמידה — ברים לפי ספי 60/80 + מי מתקשה בכל יעד.
   מוצג רק בהדמיות שנוצרו עם יעדים (game_data.objectives). */
const MASTERY_META = {
  strong: { label: 'שולטים', color: '#5fffb0' },
  partial: { label: 'שליטה חלקית', color: '#ffce5e' },
  weak: { label: 'טעון חיזוק', color: '#ff7099' },
} as const

function ObjectiveMastery({ objectives, onStudent }: { objectives: PerObjective[]; onStudent: (id: string) => void }) {
  const withData = objectives.filter((o) => o.attempts > 0)
  if (withData.length === 0) return null
  return (
    <Panel title="🎯 שליטה ביעדי הלמידה">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {objectives.map((o) => {
          const meta = o.masteryLevel ? MASTERY_META[o.masteryLevel] : null
          const rate = o.successRate ?? 0
          return (
            <div key={o.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, fontSize: 13, marginBottom: 5 }}>
                <span style={{ fontWeight: 600, color: 'var(--holo-text-bright)', flex: 1 }}>{o.text}</span>
                {meta ? (
                  <span style={{ color: meta.color, whiteSpace: 'nowrap' }}>
                    {meta.label} · {pct(o.successRate)}
                  </span>
                ) : (
                  <span style={{ color: '#8aa0b8', whiteSpace: 'nowrap' }}>אין נתונים עדיין</span>
                )}
              </div>
              <div style={{ width: '100%', borderRadius: 999, overflow: 'hidden', height: 8, background: 'rgba(255,255,255,0.08)' }} dir="ltr">
                <div style={{ width: `${rate * 100}%`, height: '100%', background: meta?.color ?? 'transparent', transition: 'width .4s ease' }} />
              </div>
              {o.weakStudents.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: '#8aa0b8' }}>מתקשים:</span>
                  {o.weakStudents.map((s) => (
                    <button key={s.studentId} onClick={() => onStudent(s.studentId)}
                      style={{ fontSize: 11.5, padding: '2px 9px', borderRadius: 999, cursor: 'pointer', color: '#ffb3c6', background: 'rgba(255,112,153,.1)', border: '1px solid rgba(255,112,153,.35)' }}>
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

/* ── הדמיית חזרה — לולאת ה-spaced-retrieval ──
   מוצג רק כשיש מושגים/יעדים חלשים. לחיצה → השרת מחשב את החולשות ומייצר הרפתקת-המשך
   קצרה ברקע; פה עוקבים ב-polling קל עד שהיא מוכנה ואז מציעים לפתוח לעריכה/הקצאה. */
function ReviewQuestPanel({ questId, assignmentId, data }: { questId: string; assignmentId: string; data: AssignmentAnalytics }) {
  const navigate = useNavigate()
  const [state, setState] = useState<{ phase: 'idle' | 'working' | 'ready' | 'error'; reviewId?: string; title?: string; msg?: string }>({ phase: 'idle' })
  const timerRef = useRef<number | null>(null)
  useEffect(() => () => { if (timerRef.current) window.clearInterval(timerRef.current) }, [])

  /* ספירת החולשות מהנתונים שכבר בדשבורד: יעדים חלשים אם יש תיוג, אחרת אתגרים חלשים */
  const weakObjectives = (data.perObjective ?? []).filter((o) => o.masteryLevel === 'weak').length
  const weakChallenges = data.perChallenge.filter((c) => c.successRate !== null && c.successRate < 0.6 && c.attempts >= 2).length
  const weakCount = weakObjectives > 0 ? weakObjectives : weakChallenges
  if (weakCount === 0 && state.phase === 'idle') return null

  async function create() {
    setState({ phase: 'working' })
    try {
      const res = await apiFetch(`/api/quests/${questId}/review-quest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? 'יצירת הדמיית החזרה נכשלה')
      const reviewId: string = body.questId
      /* polling קל עד שהיצירה ברקע מסתיימת */
      timerRef.current = window.setInterval(async () => {
        try {
          const r = await fetch(`/api/quests/${reviewId}`)
          const b = await r.json()
          const gd = b?.quest?.game_data
          if (gd?.genError) {
            if (timerRef.current) window.clearInterval(timerRef.current)
            setState({ phase: 'error', msg: gd.genError })
          } else if (Array.isArray(gd?.scenes) && gd.scenes.length > 0) {
            if (timerRef.current) window.clearInterval(timerRef.current)
            setState({ phase: 'ready', reviewId, title: body.title })
          }
        } catch { /* ניסיון הבא */ }
      }, 4000)
    } catch (e) {
      setState({ phase: 'error', msg: e instanceof Error ? e.message : 'שגיאה' })
    }
  }

  return (
    <div style={{ ...glass, padding: 18, borderColor: 'rgba(155,140,255,0.45)' }}>
      <div style={{ ...micro, fontSize: 9, marginBottom: 10 }}>🔄 הדמיית חזרה</div>
      {state.phase === 'idle' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, color: '#cfe1f2' }}>
            זוהו <b style={{ color: '#ffce5e' }}>{weakCount}</b> {weakObjectives > 0 ? 'יעדים' : 'מושגים'} שהכיתה התקשתה בהם — אפשר לייצר הרפתקת-המשך קצרה שמחזקת אותם מזווית חדשה.
          </span>
          <button onClick={create}
            style={{ padding: '9px 18px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13.5, color: '#fff', background: 'linear-gradient(135deg,#9b8cff,#2ff3ff)', border: 'none', whiteSpace: 'nowrap' }}>
            ✨ צור הדמיית חזרה
          </button>
        </div>
      )}
      {state.phase === 'working' && (
        <span style={{ fontSize: 13.5, color: '#c9b6ff' }}>
          <span style={{ display: 'inline-block', animation: 'holo-spin .9s linear infinite' }}>⟳</span> ד"ר הולו בונה הדמיית חזרה מהמושגים החלשים… (כדקה-שתיים; אפשר להישאר בעמוד)
        </span>
      )}
      {state.phase === 'ready' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, color: '#5fffb0' }}>✓ "{state.title}" מוכנה — עברו עליה ואז הקצו לכיתה.</span>
          <button onClick={() => navigate(`/creator/quest/${state.reviewId}`)}
            style={{ padding: '9px 18px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13.5, color: '#04101c', background: '#5fffb0', border: 'none', whiteSpace: 'nowrap' }}>
            פתח את הדמיית החזרה ←
          </button>
        </div>
      )}
      {state.phase === 'error' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, color: '#ff9bb3' }}>⚠️ {state.msg}</span>
          <button onClick={create} style={{ padding: '7px 14px', borderRadius: 10, cursor: 'pointer', fontSize: 13, color: '#bfe9ff', background: 'rgba(47,243,255,.08)', border: '1px solid rgba(47,243,255,.3)' }}>נסה שוב</button>
        </div>
      )}
    </div>
  )
}

/* "איפה נתקעו" — אתגרים מדורגים, הקשה ביותר למעלה */
function ChallengeBreakdown({ challenges }: { challenges: PerChallenge[] }) {
  const attempted = challenges.filter((c) => c.attempts > 0)
  if (attempted.length === 0) return null
  return (
    <Panel title="איפה הכיתה נתקעה">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {attempted.map((c) => {
          const rate = c.successRate ?? 0
          const color = rate < 0.6 ? '#ff7099' : rate < 0.85 ? '#ffce5e' : '#5fffb0'
          return (
            <div key={c.sceneId}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                <span style={{ fontWeight: 600, color: 'var(--holo-text-bright)' }}>{c.title}</span>
                <span style={{ color }}>{pct(c.successRate)} <span style={{ opacity: 0.5 }}>({c.solved}/{c.attempts})</span></span>
              </div>
              <div style={{ width: '100%', borderRadius: 999, overflow: 'hidden', height: 8, background: 'rgba(255,255,255,0.08)' }} dir="ltr">
                <div style={{ width: `${rate * 100}%`, height: '100%', background: color, transition: 'width .4s ease' }} />
              </div>
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

export default function AssignmentDashboard({ assignmentId, onBack, onStudent }: { assignmentId: string; onBack: () => void; onStudent: (id: string) => void }) {
  const [res, setRes] = useState<{ id: string; data?: AssignmentAnalytics; error?: string }>({ id: '' })

  useEffect(() => {
    let cancelled = false
    apiJson<AssignmentAnalytics>(`/api/analytics/assignment/${assignmentId}`)
      .then((d) => { if (!cancelled) setRes({ id: assignmentId, data: d }) })
      .catch((e: Error) => { if (!cancelled) setRes({ id: assignmentId, error: e.message }) })
    return () => { cancelled = true }
  }, [assignmentId])

  if (res.id !== assignmentId) return <p style={{ ...micro, color: 'rgba(140,170,200,.6)' }}>טוען נתונים…</p>
  if (res.error) return <div style={{ ...glass, padding: 16, color: '#ff9bb3' }}>⚠️ {res.error}</div>
  const data = res.data
  if (!data) return <p style={{ ...micro, color: 'rgba(140,170,200,.6)' }}>טוען נתונים…</p>

  const t = data.totals
  const completionSlices = [
    { label: 'הושלמו', value: t.completed, color: '#5fffb0' },
    { label: 'בתהליך', value: t.inProgress, color: '#ffce5e' },
    { label: 'לא התחילו', value: t.notStarted, color: '#8aa0b8' },
  ]
  const distSlices = [
    { label: 'מתחת ל-60%', value: data.distribution.low, color: '#ff7099' },
    { label: '60–85%', value: data.distribution.mid, color: '#ffce5e' },
    { label: '85%+ (יעד)', value: data.distribution.high, color: '#5fffb0' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--holo-cyan-bright)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>← המטלות</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: '#fff', textShadow: '0 0 20px rgba(47,243,255,.35)' }}>{data.quest.title}</div>
          <div style={{ fontSize: 12.5, color: '#8aa0b8', marginTop: 2 }}>כיתה {data.class.name}</div>
        </div>
        <span style={{ width: 60 }} />
      </div>

      {/* מדדים עליונים */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <MetricCard label="השלימו" value={`${t.completed}/${t.students}`} accent="#5fffb0" />
        <MetricCard label="אחוז השלמה" value={pct(t.completionRate)} />
        <MetricCard label="הצלחה ממוצעת" value={pct(t.avgSuccessRate)} accent={t.avgSuccessRate !== null && t.avgSuccessRate >= 0.85 ? '#5fffb0' : undefined} />
        <MetricCard label="זמן ממוצע" value={duration(t.avgCompletionMs)} />
        <MetricCard label="דגלים" value={String(t.flaggedCount)} accent={t.flaggedCount ? '#ffce5e' : undefined} />
      </div>

      {/* תובנות */}
      {data.insights.length > 0 && (
        <div style={{ ...glass, padding: 18, borderColor: 'rgba(0,136,255,0.4)' }}>
          <div style={{ ...micro, fontSize: 9, marginBottom: 10 }}>💡 תובנות</div>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 7, margin: 0, padding: 0, listStyle: 'none' }}>
            {data.insights.map((s, i) => <li key={i} style={{ fontSize: 13.5, color: '#cfe1f2' }}>• {s}</li>)}
          </ul>
        </div>
      )}

      {/* שני דונאטים — סטטוס השלמה + התפלגות הצלחה */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <Panel title="סטטוס השלמת המשימה"><DonutChart title="סטטוס" data={completionSlices} /></Panel>
        <Panel title="התפלגות אחוז ההצלחה (יעד 85%)"><DonutChart title="התפלגות" data={distSlices} centerUnit="סיימו" /></Panel>
      </div>

      {/* שליטה ביעדי הלמידה — רק בהדמיות עם יעדים מוגדרים */}
      {data.perObjective && data.perObjective.length > 0 && (
        <ObjectiveMastery objectives={data.perObjective} onStudent={onStudent} />
      )}

      {/* הדמיית חזרה — מוצג רק כשיש מושגים/יעדים חלשים */}
      <ReviewQuestPanel questId={data.quest.id} assignmentId={assignmentId} data={data} />

      {/* סיכום פדגוגי — ד"ר הולו על ביצועי הכיתה בהדמיה */}
      <PedagogicalSummary scope="assignment" id={assignmentId} title={`${data.quest.title} · כיתה ${data.class.name}`} />

      <ChallengeBreakdown challenges={data.perChallenge} />

      {/* טבלת תלמידים */}
      <Panel title="תלמידים">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {data.students.map((s) => {
            const st = STATUS_META[s.status]
            return (
              <button key={s.studentId} onClick={() => onStudent(s.studentId)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 13px', borderRadius: 11, cursor: 'pointer', textAlign: 'right', background: 'rgba(4,9,18,.5)', border: '1px solid rgba(120,200,255,.12)', transition: 'all .15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(47,243,255,.4)' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(120,200,255,.12)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 700, color: 'var(--holo-text-bright)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                  {s.flags.map((f) => FLAG_META[f] && <span key={f} title={FLAG_META[f].label} style={{ fontSize: 14 }}>{FLAG_META[f].icon}</span>)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 13, flexShrink: 0 }}>
                  <span style={{ color: st.color }}>{st.label}</span>
                  <span style={{ color: '#cfe1f2', width: 44, textAlign: 'left' }} dir="ltr">{pct(s.successRate)}</span>
                  <span style={{ color: '#9fb6cf' }}>{s.crystals !== null ? `💎${s.crystals}` : '—'}</span>
                  <span style={{ color: '#8aa0b8', width: 60, textAlign: 'left' }} dir="ltr">{duration(s.durationMs)}</span>
                </div>
              </button>
            )
          })}
        </div>
      </Panel>
    </div>
  )
}
