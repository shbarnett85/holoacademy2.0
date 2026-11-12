import { useEffect, useMemo, useState } from 'react'
import { apiJson } from '../../shared/lib/api'
import { glass, micro } from '../creator/studioStyles'

/* גרף ההתקדמות הפר-תלמיד (הועבר מ-ProgressLens). ברירת מחדל: התלמיד היחיד.
   "הוסף להשוואה" מצייר overlay — ממוצע כיתה / תלמיד אחר (מודל ההשוואה, ממוקם פר-תלמיד). */
type Metric = 'text_level' | 'overall_success'
type Range = 'year' | 'term'
interface Series { id: string; name: string; kind: 'student' | 'class'; points: (number | null)[] }
interface TrendsResp { labels: string[]; series: Series[]; notReady?: boolean }
interface StudentOpt { studentId: string; name: string; className: string }
interface ClassOpt { id: string; gradeLabel: string }

/* צבעי הסדרות. הסדרות נבדלות גם בדפוס הקו (DASHES) ובצורת הסמן, לא בצבע לבד */
const COLORS = ['var(--color-ink)', 'var(--color-machine-deep)', 'var(--color-human-deep)', 'var(--color-muted)', 'var(--color-correct)']
const DASHES = ['', '7 4', '2 4', '9 3 2 3', '4 4', '1 5']
const METRICS: { v: Metric; label: string }[] = [{ v: 'text_level', label: 'רמת קריאה' }, { v: 'overall_success', label: 'אחוז הצלחה' }]
const RANGES: { v: Range; label: string }[] = [{ v: 'year', label: 'שנה' }, { v: 'term', label: 'מחצית' }]

function Marker({ shape, cx, cy, color }: { shape: number; cx: number; cy: number; color: string }) {
  const s = 4
  /* הצבע ב-style ולא באטריביוט: var() לא עובד באטריביוט של SVG */
  const st = { fill: 'var(--color-surface)', stroke: color }
  if (shape % 4 === 1) return <rect x={cx - s} y={cy - s} width={s * 2} height={s * 2} style={st} strokeWidth="1.6" />
  if (shape % 4 === 2) return <polygon points={`${cx},${cy - s - 1} ${cx + s + 1},${cy + s} ${cx - s - 1},${cy + s}`} style={st} strokeWidth="1.6" />
  if (shape % 4 === 3) return <polygon points={`${cx},${cy - s - 1} ${cx + s + 1},${cy} ${cx},${cy + s + 1} ${cx - s - 1},${cy}`} style={st} strokeWidth="1.6" />
  return <circle cx={cx} cy={cy} r={s} style={st} strokeWidth="1.6" />
}

function LineChart({ labels, series, metric }: { labels: string[]; series: Series[]; metric: Metric }) {
  const W = 720, H = 280, padL = 44, padR = 16, padT = 16, padB = 34
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
          <line x1={padL} y1={y(gv)} x2={W - padR} y2={y(gv)} style={{ stroke: 'var(--color-line)' }} />
          <text x={padL - 6} y={y(gv) + 3} textAnchor="end" style={{ fill: 'var(--color-muted)' }} fontSize="9" fontFamily="'Space Mono',monospace">{fmtY(gv)}</text>
        </g>
      ))}
      {labels.map((lb, i) => <text key={i} x={x(i)} y={H - 12} textAnchor="middle" style={{ fill: 'var(--color-muted)' }} fontSize="9.5" fontFamily="Rubik">{lb}</text>)}
      {series.map((s, si) => {
        const color = COLORS[si % COLORS.length], dash = DASHES[si % DASHES.length]
        const segs: string[] = []; let cur: string[] = []
        s.points.forEach((p, i) => {
          if (p == null) { if (cur.length > 1) segs.push(cur.join(' ')); cur = [] }
          else cur.push(`${cur.length === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p).toFixed(1)}`)
        })
        if (cur.length > 1) segs.push(cur.join(' '))
        return (
          <g key={s.id}>
            {segs.map((d, k) => <path key={k} d={d} fill="none" style={{ stroke: color }} strokeWidth={s.kind === 'class' ? 3 : 2.2} strokeDasharray={dash || undefined} strokeLinejoin="round" opacity={s.kind === 'class' ? 0.85 : 1} />)}
            {s.points.map((p, i) => p != null ? <Marker key={i} shape={si} cx={x(i)} cy={y(p)} color={color} /> : null)}
          </g>
        )
      })}
    </svg>
  )
}

export default function ProgressGraph({ studentId, studentName: _studentName, className }: { studentId: string; studentName: string; className?: string }) {
  const [metric, setMetric] = useState<Metric>('text_level')
  const [range, setRange] = useState<Range>('year')
  const [compare, setCompare] = useState<string[]>([]) /* מזהי ישויות נוספות ל-overlay */
  const [data, setData] = useState<TrendsResp | null>(null)
  const [students, setStudents] = useState<StudentOpt[]>([])
  const [classes, setClasses] = useState<ClassOpt[]>([])
  const [addOpen, setAddOpen] = useState(false)

  useEffect(() => {
    apiJson<{ students: StudentOpt[] }>('/api/analytics/students').then((b) => setStudents(b.students)).catch(() => {})
    apiJson<{ classes: ClassOpt[] }>('/api/staff/classes').then((b) => setClasses(b.classes.map((c) => ({ id: c.id, gradeLabel: c.gradeLabel })))).catch(() => {})
  }, [])
  /* איפוס השוואה כשעוברים תלמיד */
  useEffect(() => { setCompare([]) }, [studentId])

  useEffect(() => {
    const entities = [studentId, ...compare].join(',')
    apiJson<TrendsResp>(`/api/analytics/trends?metric=${metric}&range=${range}&entities=${encodeURIComponent(entities)}`)
      .then(setData).catch(() => setData(null))
  }, [studentId, metric, range, compare])

  /* מועמדי השוואה: ממוצע הכיתה של התלמיד + תלמידים אחרים (שעוד לא נוספו) */
  const myClassId = useMemo(() => {
    if (!className) return null
    return classes.find((c) => c.gradeLabel === className)?.id ?? null
  }, [classes, className])
  const compareOptions = useMemo(() => {
    const opts: { id: string; label: string }[] = []
    if (myClassId && !compare.includes(myClassId)) opts.push({ id: myClassId, label: `📊 ממוצע כיתה ${className}` })
    for (const s of students) if (s.studentId !== studentId && !compare.includes(s.studentId)) opts.push({ id: s.studentId, label: s.name })
    return opts
  }, [students, classes, compare, studentId, myClassId, className])

  const hasData = data && data.series.some((s) => s.points.some((p) => p != null))
  /* כפתור בחירה: המחלקה holo-button נותנת את הצבעים; נבחר = is-selected */
  const pill: React.CSSProperties = { fontSize: 12, fontWeight: 700, padding: '6px 14px' }
  const pillClass = (on: boolean) => `holo-button holo-button--staff holo-button--sm${on ? ' is-selected' : ''}`

  return (
    <div style={{ ...glass, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ ...micro, fontSize: 9, marginLeft: 'auto' }}>◇ מגמת התקדמות לאורך זמן</div>
        <div style={{ display: 'flex', gap: 6 }}>{METRICS.map((m) => <button key={m.v} className={pillClass(metric === m.v)} onClick={() => setMetric(m.v)} style={pill}>{m.label}</button>)}</div>
        <div style={{ display: 'flex', gap: 6 }}>{RANGES.map((r) => <button key={r.v} className={pillClass(range === r.v)} onClick={() => setRange(r.v)} style={pill}>{r.label}</button>)}</div>
        {/* הוסף להשוואה */}
        <div style={{ position: 'relative' }}>
          <button className={pillClass(false)} onClick={() => setAddOpen((o) => !o)} style={pill}>+ הוסף להשוואה</button>
          {addOpen && compareOptions.length > 0 && (
            <div style={{ position: 'absolute', top: '110%', right: 0, zIndex: 20, ...glass, padding: 8, minWidth: 190, maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {compareOptions.map((o) => (
                <button key={o.id} className={pillClass(false)} onClick={() => { setCompare((c) => [...c, o.id]); setAddOpen(false) }}
                  style={{ display: 'block', width: '100%', flexShrink: 0, textAlign: 'right', fontSize: 12.5, padding: '7px 10px' }}>{o.label}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {!data && <p style={{ ...micro, color: 'var(--color-muted)', textAlign: 'center', padding: 24 }}>טוען…</p>}
      {data?.notReady && <p style={{ ...micro, color: 'var(--color-muted)', textAlign: 'center', padding: 24, fontSize: 11 }}>נתוני ההתקדמות עדיין לא זמינים.</p>}
      {data && !data.notReady && !hasData && <p style={{ ...micro, color: 'var(--color-muted)', textAlign: 'center', padding: 24, fontSize: 11 }}>אין עדיין נתוני התקדמות לתלמיד זה.</p>}
      {hasData && <LineChart labels={data!.labels} series={data!.series} metric={metric} />}
      {hasData && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10, justifyContent: 'center' }}>
          {data!.series.map((s, si) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="26" height="12"><line x1="1" y1="6" x2="25" y2="6" style={{ stroke: COLORS[si % COLORS.length] }} strokeWidth="2.4" strokeDasharray={DASHES[si % DASHES.length] || undefined} /><g transform="translate(13,6)"><Marker shape={si} cx={0} cy={0} color={COLORS[si % COLORS.length]} /></g></svg>
              <span style={{ fontSize: 11.5, color: 'var(--color-ink)' }}>{s.name}</span>
              {si > 0 && <button className={pillClass(false)} onClick={() => setCompare((c) => c.filter((id) => id !== s.id))} title="הסר" style={{ fontSize: 13, lineHeight: 1, padding: '1px 6px', borderRadius: 7 }}>×</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
