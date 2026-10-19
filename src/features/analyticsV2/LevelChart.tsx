import { monthName } from '../../shared/lib/findingsNarrative'
import type { SubjectPanel } from '../../shared/types/analyticsV2'
import { C, SERIES } from './tokens'

type Visible = Extract<SubjectPanel, { access: 'visible' }>

/* מסלול רמה לאורך זמן + רצועת נורמת גיל. הרצועה מסומנת גם בטקסט (לא צבע בלבד). */
export function LevelChart({ series, ageNorm, height = 150, label }: { series: Visible['levelSeries']; ageNorm: Visible['ageNorm']; height?: number; label: string }) {
  const W = 360, H = height, padL = 28, padR = 8, padT = 10, padB = 22
  if (series.length === 0) return <div style={{ color: C.muted, fontSize: 12.5, padding: '18px 0' }}>אין עדיין מספיק נתונים להצגת מסלול רמה.</div>
  const vals = series.map((p) => p.level)
  const lo = Math.floor(Math.min(ageNorm.low, ...vals) - 1)
  const hi = Math.ceil(Math.max(ageNorm.high, ...vals) + 1)
  const iw = W - padL - padR, ih = H - padT - padB
  const x = (i: number): number => padL + (series.length === 1 ? iw / 2 : (i / (series.length - 1)) * iw)
  const y = (v: number): number => padT + ih - ((v - lo) / (hi - lo)) * ih
  const path = series.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.level).toFixed(1)}`).join(' ')
  const ticks = [lo, Math.round((lo + hi) / 2), hi]
  const last = series[series.length - 1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ width: '100%', direction: 'ltr', display: 'block' }}>
      <rect x={padL} y={y(ageNorm.high)} width={iw} height={y(ageNorm.low) - y(ageNorm.high)} style={{ fill: C.grid }} opacity="0.7" />
      <text x={W - padR} y={y(ageNorm.high) + 9} textAnchor="end" fontSize="8.5" style={{ fill: C.axis }}>{`רצועת שכבה ${ageNorm.gradeLabel}`}</text>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} style={{ stroke: C.grid }} strokeDasharray="2 4" />
          <text x={padL - 5} y={y(t) + 3} textAnchor="end" fontSize="9" fontFamily="'Space Mono',monospace" style={{ fill: C.axis }}>{t}</text>
        </g>
      ))}
      <path d={path} fill="none" style={{ stroke: SERIES[0].color }} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      {series.map((p, i) => (
        <g key={p.date}>
          <circle cx={x(i)} cy={y(p.level)} r={i === series.length - 1 ? 4.2 : 2.6} style={{ fill: C.pointFill, stroke: SERIES[0].color }} strokeWidth="1.6">
            <title>{`${monthName(p.date)}: רמה ${p.level} (${p.n} הדמיות)`}</title>
          </circle>
          {(i % 2 === 0 || i === series.length - 1) && <text x={x(i)} y={H - 7} textAnchor="middle" fontSize="8.5" style={{ fill: C.axis }}>{monthName(p.date)}</text>}
        </g>
      ))}
      <text x={x(series.length - 1)} y={y(last.level) - 8} textAnchor="middle" fontSize="10" fontWeight="700" style={{ fill: C.accentBright }}>{last.level}</text>
    </svg>
  )
}

/* גרף מרובה קווים (מנהל: ממוצע חודשי לפי שכבה). קווים נבדלים גם בסגנון הקו, לא רק בצבע. */
export function MultiLineChart({ lines, normLines, label, height = 150 }: { lines: { name: string; points: { date: string; v: number }[] }[]; normLines?: { name: string; v: number }[]; label: string; height?: number }) {
  const W = 360, H = height, padL = 28, padR = 8, padT = 10, padB = 22
  const dates = [...new Set(lines.flatMap((l) => l.points.map((p) => p.date)))].sort()
  if (dates.length === 0) return <div style={{ color: C.muted, fontSize: 12.5 }}>אין עדיין מספיק נתונים.</div>
  const vals = [...lines.flatMap((l) => l.points.map((p) => p.v)), ...(normLines ?? []).map((n) => n.v)]
  const lo = Math.floor(Math.min(...vals) - 0.5), hi = Math.ceil(Math.max(...vals) + 0.5)
  const iw = W - padL - padR, ih = H - padT - padB
  const x = (d: string): number => padL + (dates.length === 1 ? iw / 2 : (dates.indexOf(d) / (dates.length - 1)) * iw)
  const y = (v: number): number => padT + ih - ((v - lo) / (hi - lo || 1)) * ih
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ width: '100%', direction: 'ltr', display: 'block' }}>
      {[lo, (lo + hi) / 2, hi].map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} style={{ stroke: C.grid }} strokeDasharray="2 4" />
          <text x={padL - 5} y={y(t) + 3} textAnchor="end" fontSize="9" fontFamily="'Space Mono',monospace" style={{ fill: C.axis }}>{Math.round(t * 10) / 10}</text>
        </g>
      ))}
      {(normLines ?? []).map((n, i) => (
        <line key={n.name} x1={padL} x2={W - padR} y1={y(n.v)} y2={y(n.v)} style={{ stroke: SERIES[i % SERIES.length].color }} strokeDasharray="1 3" opacity="0.7"><title>{n.name}</title></line>
      ))}
      {lines.map((l, li) => {
        const s = SERIES[li % SERIES.length]
        const d = l.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.date).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ')
        return (
          <g key={l.name}>
            <path d={d} fill="none" style={{ stroke: s.color }} strokeWidth="2.2" strokeDasharray={s.dash} strokeLinejoin="round" />
            {l.points.map((p) => <circle key={p.date} cx={x(p.date)} cy={y(p.v)} r="2.4" style={{ fill: C.pointFill, stroke: s.color }} strokeWidth="1.5"><title>{`${l.name} · ${monthName(p.date)}: ${p.v}`}</title></circle>)}
          </g>
        )
      })}
      {dates.map((d, i) => ((i % 2 === 0 || i === dates.length - 1) ? <text key={d} x={x(d)} y={H - 7} textAnchor="middle" fontSize="8.5" style={{ fill: C.axis }}>{monthName(d)}</text> : null))}
    </svg>
  )
}
