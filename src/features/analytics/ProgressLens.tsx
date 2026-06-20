import { useEffect, useMemo, useState } from 'react'
import { apiJson } from '../../shared/lib/api'
import { glass, micro } from '../creator/studioStyles'
import StudentDetail from './StudentDetail'

/* עדשת "התקדמות" — סדרת-זמן מ-progress_snapshots. גרף קווי רב-סדרתי
   (צבע + דאש + סמן — לא צבע-בלבד), בורר מטריקה, טוגל טווח, צ'יפים של ישויות,
   ו-drill-down תלמיד מתחת לגרף. הסקופ מגיע מהשרת (הרשאה A). */
type Metric = 'text_level' | 'overall_success'
type Range = 'year' | 'term'
interface Series { id: string; name: string; kind: 'student' | 'class'; points: (number | null)[] }
interface TrendsResp { labels: string[]; series: Series[]; notReady?: boolean }
interface StudentOpt { studentId: string; name: string; className: string }
interface ClassOpt { id: string; gradeLabel: string }

const COLORS = ['#2ff3ff', '#ff8af0', '#5fffb0', '#ffce5e', '#b18bff', '#ff7099']
const DASHES = ['', '7 4', '2 4', '9 3 2 3', '4 4', '1 5']

const METRICS: { v: Metric; label: string }[] = [
  { v: 'text_level', label: 'רמת קריאה' },
  { v: 'overall_success', label: 'אחוז הצלחה' },
]
const RANGES: { v: Range; label: string }[] = [
  { v: 'year', label: 'שנה' },
  { v: 'term', label: 'מחצית' },
]

/* סמן לכל סדרה — צורה שונה (לא צבע-בלבד) */
function Marker({ shape, cx, cy, color }: { shape: number; cx: number; cy: number; color: string }) {
  const s = 4
  if (shape % 4 === 1) return <rect x={cx - s} y={cy - s} width={s * 2} height={s * 2} fill="#05101f" stroke={color} strokeWidth="1.6" />
  if (shape % 4 === 2) return <polygon points={`${cx},${cy - s - 1} ${cx + s + 1},${cy + s} ${cx - s - 1},${cy + s}`} fill="#05101f" stroke={color} strokeWidth="1.6" />
  if (shape % 4 === 3) return <polygon points={`${cx},${cy - s - 1} ${cx + s + 1},${cy} ${cx},${cy + s + 1} ${cx - s - 1},${cy}`} fill="#05101f" stroke={color} strokeWidth="1.6" />
  return <circle cx={cx} cy={cy} r={s} fill="#05101f" stroke={color} strokeWidth="1.6" />
}

function LineChart({ labels, series, metric }: { labels: string[]; series: Series[]; metric: Metric }) {
  const W = 720, H = 300, padL = 44, padR = 16, padT = 16, padB = 34
  const innerW = W - padL - padR, innerH = H - padT - padB
  const allVals = series.flatMap((s) => s.points).filter((v): v is number => v != null)
  if (allVals.length === 0) return null
  let lo = Math.min(...allVals), hi = Math.max(...allVals)
  if (metric === 'overall_success') { lo = 0; hi = 1 } else { lo = Math.max(0, Math.floor(lo - 1)); hi = Math.ceil(hi + 1) }
  if (hi === lo) hi = lo + 1
  const n = labels.length
  const x = (i: number) => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const y = (v: number) => padT + innerH - ((v - lo) / (hi - lo)) * innerH
  const fmtY = (v: number) => (metric === 'overall_success' ? Math.round(v * 100) + '%' : String(Math.round(v)))
  const gridY = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', direction: 'ltr' }}>
      {gridY.map((gv, i) => (
        <g key={i}>
          <line x1={padL} y1={y(gv)} x2={W - padR} y2={y(gv)} stroke="rgba(120,200,255,.1)" />
          <text x={padL - 6} y={y(gv) + 3} textAnchor="end" fill="rgba(180,220,255,.55)" fontSize="9" fontFamily="'Space Mono',monospace">{fmtY(gv)}</text>
        </g>
      ))}
      {labels.map((lb, i) => (
        <text key={i} x={x(i)} y={H - 12} textAnchor="middle" fill="rgba(180,220,255,.6)" fontSize="9.5" fontFamily="Rubik">{lb}</text>
      ))}
      {series.map((s, si) => {
        const color = COLORS[si % COLORS.length]
        const dash = DASHES[si % DASHES.length]
        /* קטעים בין נקודות לא-null עוקבות */
        const segs: string[] = []
        let cur: string[] = []
        s.points.forEach((p, i) => {
          if (p == null) { if (cur.length > 1) segs.push(cur.join(' ')); cur = [] }
          else cur.push(`${cur.length === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p).toFixed(1)}`)
        })
        if (cur.length > 1) segs.push(cur.join(' '))
        return (
          <g key={s.id}>
            {segs.map((d, k) => <path key={k} d={d} fill="none" stroke={color} strokeWidth={s.kind === 'class' ? 3 : 2.2} strokeDasharray={dash || undefined} strokeLinejoin="round" opacity={s.kind === 'class' ? 0.85 : 1} />)}
            {s.points.map((p, i) => p != null ? <Marker key={i} shape={si} cx={x(i)} cy={y(p)} color={color} /> : null)}
          </g>
        )
      })}
    </svg>
  )
}

export default function ProgressLens() {
  const [students, setStudents] = useState<StudentOpt[]>([])
  const [classes, setClasses] = useState<ClassOpt[]>([])
  const [metric, setMetric] = useState<Metric>('text_level')
  const [range, setRange] = useState<Range>('year')
  const [selected, setSelected] = useState<string[]>([])
  const [data, setData] = useState<TrendsResp | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [drillId, setDrillId] = useState<string | null>(null)

  /* רשימות הבחירה — תלמידים (לצ'יפים) + כיתות (לקו ממוצע כיתתי) */
  useEffect(() => {
    apiJson<{ students: StudentOpt[] }>('/api/analytics/students').then((b) => {
      setStudents(b.students)
      if (b.students.length) setSelected(b.students.slice(0, 2).map((s) => s.studentId)) /* happy-path: 2 ראשונים */
    }).catch((e: Error) => setError(e.message))
    apiJson<{ classes: ClassOpt[] }>('/api/staff/classes').then((b) => setClasses(b.classes.map((c) => ({ id: c.id, gradeLabel: c.gradeLabel })))).catch(() => {})
  }, [])

  /* שליפת הסדרות בכל שינוי מטריקה/טווח/בחירה */
  useEffect(() => {
    const ent = selected.join(',')
    apiJson<TrendsResp>(`/api/analytics/trends?metric=${metric}&range=${range}&entities=${encodeURIComponent(ent)}`)
      .then(setData).catch((e: Error) => setError(e.message))
  }, [metric, range, selected])

  const toggle = (id: string) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id])
  const selectedStudents = useMemo(() => students.filter((s) => selected.includes(s.studentId)), [students, selected])

  const pill = (on: boolean): React.CSSProperties => ({ fontSize: 12.5, fontWeight: 700, padding: '7px 16px', borderRadius: 9, cursor: 'pointer', color: on ? '#031018' : '#9fb6cf', background: on ? 'linear-gradient(135deg,#5fdcff,#2ff3ff)' : 'rgba(4,9,18,.5)', border: on ? '1px solid rgba(47,243,255,.6)' : '1px solid rgba(120,200,255,.14)', transition: 'all .15s' })

  const hasData = data && data.series.some((s) => s.points.some((p) => p != null))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, minHeight: 0 }}>
      {error && <p style={{ color: '#ff9bb3', fontSize: 14 }}>⚠️ {error}</p>}

      {/* בקרות: מטריקה + טווח */}
      <div style={{ ...glass, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', flex: '0 0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ ...micro, fontSize: 9 }}>מדד</span>
          {METRICS.map((m) => <button key={m.v} onClick={() => setMetric(m.v)} style={pill(metric === m.v)}>{m.label}</button>)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ ...micro, fontSize: 9 }}>טווח</span>
          {RANGES.map((r) => <button key={r.v} onClick={() => setRange(r.v)} style={pill(range === r.v)}>{r.label}</button>)}
        </div>
      </div>

      {/* צ'יפים: תלמידים + כיתות (קו ממוצע כיתתי) */}
      <div style={{ ...glass, padding: '12px 16px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', flex: '0 0 auto' }}>
        {students.map((s, i) => {
          const on = selected.includes(s.studentId)
          const ci = selected.indexOf(s.studentId)
          return (
            <button key={s.studentId} onClick={() => toggle(s.studentId)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 20, cursor: 'pointer', color: on ? '#eaf6ff' : '#8aa0b8', background: on ? 'rgba(47,243,255,.1)' : 'rgba(4,9,18,.4)', border: `1px solid ${on ? COLORS[ci % COLORS.length] : 'rgba(120,200,255,.14)'}` }}>
              {on && <span style={{ width: 9, height: 9, borderRadius: 2, background: COLORS[ci % COLORS.length], boxShadow: `0 0 5px ${COLORS[ci % COLORS.length]}` }} />}
              {s.name}<span style={{ opacity: .5, fontSize: 10 }}>· {s.className}</span>
            </button>
          )
        })}
        {classes.map((c) => {
          const on = selected.includes(c.id)
          const ci = selected.indexOf(c.id)
          return (
            <button key={c.id} onClick={() => toggle(c.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 20, cursor: 'pointer', color: on ? '#eaf6ff' : '#8aa0b8', background: on ? 'rgba(177,139,255,.12)' : 'rgba(4,9,18,.4)', border: `1px solid ${on ? COLORS[ci % COLORS.length] : 'rgba(177,139,255,.25)'}` }}>
              📊 ממוצע {c.gradeLabel}
            </button>
          )
        })}
      </div>

      {/* הגרף */}
      <div style={{ ...glass, padding: 20, flex: '0 0 auto' }}>
        {!data && <p style={{ ...micro, color: 'rgba(140,170,200,.6)', textAlign: 'center', padding: 30 }}>טוען…</p>}
        {data?.notReady && <p style={{ ...micro, color: 'rgba(255,206,94,.7)', textAlign: 'center', padding: 30, fontSize: 11 }}>טבלת ההתקדמות (progress_snapshots) עדיין לא הוקמה — הרץ את המיגרציה ואת ה-seed.</p>}
        {data && !data.notReady && !hasData && <p style={{ ...micro, color: 'rgba(140,170,200,.6)', textAlign: 'center', padding: 30, fontSize: 11 }}>אין עדיין נתוני התקדמות לישויות שנבחרו.</p>}
        {hasData && <LineChart labels={data!.labels} series={data!.series} metric={metric} />}
        {/* מקרא */}
        {hasData && (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10, justifyContent: 'center' }}>
            {data!.series.map((s, si) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="26" height="12"><line x1="1" y1="6" x2="25" y2="6" stroke={COLORS[si % COLORS.length]} strokeWidth="2.4" strokeDasharray={DASHES[si % DASHES.length] || undefined} /><g transform="translate(13,6)"><Marker shape={si} cx={0} cy={0} color={COLORS[si % COLORS.length]} /></g></svg>
                <span style={{ fontSize: 11.5, color: '#cfe1f2' }}>{s.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* drill-down — פירוט תלמיד מתחת לגרף */}
      {selectedStudents.length > 0 && !drillId && (
        <div style={{ ...glass, padding: '12px 16px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', flex: '0 0 auto' }}>
          <span style={{ ...micro, fontSize: 9 }}>פירוט תלמיד</span>
          {selectedStudents.map((s) => (
            <button key={s.studentId} onClick={() => setDrillId(s.studentId)} style={{ fontSize: 12, fontWeight: 600, padding: '6px 13px', borderRadius: 9, cursor: 'pointer', color: '#7ef6ff', background: 'rgba(47,243,255,.06)', border: '1px solid rgba(47,243,255,.3)' }}>{s.name} ←</button>
          ))}
        </div>
      )}
      {drillId && <StudentDetail studentId={drillId} onBack={() => setDrillId(null)} />}
    </div>
  )
}
