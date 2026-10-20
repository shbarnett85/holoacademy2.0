/* ──────────────────────────────────────────────────────────────────────────
   גרפים של האנליטיקה, על ערכת הגרפים של teacherUi: ChartFrame (גודל פיקסלים אמיתי → גופן 14px אמיתי),
   buildTimeAxis + MonthAxis (אותו ציר חודשים בעברית בכל גרף). הכול גלוי: אין מידע במעבר עכבר;
   הערכים מודפסים על הקו, וטווח הגיל מוסבר במילים במקרא. אירועים מסומנים במספרים ומפורטים ברשימה ממוספרת מתחת לגרף.
   ────────────────────────────────────────────────────────────────────────── */
import type { ReactNode } from 'react'
import { labelEvery, layoutMarkers, niceScale, plotIso } from './chartMath'
import { AXIS_LABEL_HEIGHT, ChartFrame, FONT, MonthAxis, T, TONE_META, buildTimeAxis } from '../teacherUi'
import type { Tone } from '../teacherUi'

export interface LevelPoint { date: string; level: number; n: number }
export interface AgeNorm { gradeLabel: string; center: number; low: number; high: number }

/* סדרות מרובות: צבע + סגנון קו (לא צבע בלבד) */
const SERIES_STYLES = [
  { color: T.accent, dash: '' },
  { color: T.violet, dash: '8 5' },
  { color: T.good, dash: '2 5' },
  { color: T.warn, dash: '10 4 2 4' },
] as const

/* טקסט גרף: צירים ותוויות עזר 14px (המינימום); מספרים על הקו ומספרי האירועים 16px */
const FONT_PX = 14
const VALUE_PX = 16

const halo = { stroke: T.surface, strokeWidth: 4, paintOrder: 'stroke' } as const
const fmt = (v: number): string => String(Math.round(v * 10) / 10)

export interface ChartMarker { n: number; date: string; tone: Tone }

interface LevelChartProps {
  series: LevelPoint[]
  ageNorm: AgeNorm
  height?: number
  label: string
  /** אירועים מסומנים על הציר, ממוספרים 1..n (הרשימה המלאה מתחת לגרף) */
  markers?: ChartMarker[]
}

/* מסלול רמה לאורך החודשים + רצועת הטווח המיועד לשכבה (מסומנת גם במילה בתוך הרצועה, ובמקרא מחוץ ל-SVG) */
export function LevelChart({ series, ageNorm, height = 250, label, markers = [] }: LevelChartProps) {
  if (series.length === 0) return null
  const vals = series.map((p) => p.level)
  const { lo, hi, ticks } = niceScale(Math.min(ageNorm.low, ...vals), Math.max(ageNorm.high, ...vals))
  const dates = [...series.map((p) => plotIso(p.date)), ...markers.map((m) => m.date)]
  const from = dates.reduce((a, b) => (a < b ? a : b))
  const to = dates.reduce((a, b) => (a > b ? a : b))
  const sortedMarkers = [...markers].sort((a, b) => a.date.localeCompare(b.date))

  return (
    <ChartFrame height={height} ariaLabel={`${label}. ${series.length} חודשים, מ-${fmt(series[0].level)} ל-${fmt(series[series.length - 1].level)}.`}>
      {({ width, height: h }) => {
        const x0 = 52, x1 = width - 18
        const axis = buildTimeAxis({ from, to, x0, x1 })
        const xs = series.map((p) => axis.xOf(plotIso(p.date)))
        /* אירועים קרובים מדי זה לזה עולים לשורה שנייה כדי שהמספרים לא יחפפו */
        const placed = layoutMarkers(sortedMarkers.map((m) => ({ m, x: axis.xOf(m.date) })))
        const rows = placed.some((p) => p.row === 1) ? 2 : placed.length ? 1 : 0
        const top = 16 + rows * 32
        const base = h - AXIS_LABEL_HEIGHT
        const y = (v: number): number => base - ((v - lo) / (hi - lo)) * (base - top)
        const path = series.map((_, i) => `${i === 0 ? 'M' : 'L'} ${xs[i].toFixed(1)} ${y(series[i].level).toFixed(1)}`).join(' ')
        /* תוויות ערך: כל נקודה כשיש מקום, אחרת כל שנייה (והאחרונה תמיד) */
        const every = labelEvery(xs)
        return (
          <>
            {/* רצועת הטווח המיועד לשכבה */}
            <rect x={x0} y={y(ageNorm.high)} width={x1 - x0} height={Math.max(2, y(ageNorm.low) - y(ageNorm.high))} rx="4" style={{ fill: T.grid }} opacity="0.65" />
            <text x={x0 + 8} y={y(ageNorm.high) + 6 + FONT_PX} textAnchor="start" fontSize={FONT_PX} fontWeight="700" style={{ fill: T.textSoft, fontFamily: FONT, ...halo }}>הטווח המיועד</text>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={x0} x2={x1} y1={y(t)} y2={y(t)} style={{ stroke: T.grid }} strokeDasharray="2 5" />
                <text x={x0 - 8} y={y(t) + 5} textAnchor="end" fontSize={FONT_PX} style={{ fill: T.axis, fontFamily: FONT }}>{t}</text>
              </g>
            ))}
            <MonthAxis axis={axis} y={base} gridTop={top} />
            {/* סימוני אירועים: מספר בעיגול + קו אנכי עדין אל הציר */}
            {placed.map(({ m, x, row }) => {
              const cy = 16 + row * 32
              return (
                <g key={m.n}>
                  <line x1={x} x2={x} y1={cy + 14} y2={base} style={{ stroke: TONE_META[m.tone].color }} strokeWidth="1.5" strokeDasharray="3 4" />
                  <circle cx={x} cy={cy} r="14" style={{ fill: T.surface, stroke: TONE_META[m.tone].color }} strokeWidth="2.5" />
                  <text x={x} y={cy + 6} textAnchor="middle" fontSize={VALUE_PX} fontWeight="800" style={{ fill: T.text, fontFamily: FONT }}>{m.n}</text>
                </g>
              )
            })}
            <path d={path} fill="none" style={{ stroke: T.accent }} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
            {series.map((p, i) => (
              <g key={p.date}>
                <circle cx={xs[i]} cy={y(p.level)} r={i === series.length - 1 ? 6 : 4.5} style={{ fill: T.pointFill, stroke: T.accent }} strokeWidth="2.5" />
                {(i % every === 0 || i === series.length - 1) && (
                  <text x={i === 0 ? xs[i] - 4 : xs[i]} y={y(p.level) - 12} textAnchor={i === 0 ? 'start' : 'middle'} fontSize={VALUE_PX} fontWeight="700" style={{ fill: T.text, fontFamily: FONT, ...halo }}>{fmt(p.level)}</text>
                )}
              </g>
            ))}
          </>
        )
      }}
    </ChartFrame>
  )
}

interface MultiLine { key: string; name: string; points: { date: string; v: number }[] }

/* מנהל: ממוצע חודשי לכל שכבה באותו מקצוע. קווים נבדלים בצבע + סגנון קו + שם במקרא (HTML) עם הערך האחרון */
export function MultiLineChart({ lines, height = 220, label }: { lines: MultiLine[]; height?: number; label: string }) {
  const all = lines.flatMap((l) => l.points)
  if (all.length === 0) return null
  const { lo, hi, ticks } = niceScale(Math.min(...all.map((p) => p.v)), Math.max(...all.map((p) => p.v)), 4)
  const dates = all.map((p) => plotIso(p.date))
  const from = dates.reduce((a, b) => (a < b ? a : b))
  const to = dates.reduce((a, b) => (a > b ? a : b))
  return (
    <ChartFrame height={height} ariaLabel={label}>
      {({ width, height: h }) => {
        const x0 = 52, x1 = width - 24
        const axis = buildTimeAxis({ from, to, x0, x1 })
        const top = 22, base = h - AXIS_LABEL_HEIGHT
        const y = (v: number): number => base - ((v - lo) / (hi - lo)) * (base - top)
        return (
          <>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={x0} x2={x1} y1={y(t)} y2={y(t)} style={{ stroke: T.grid }} strokeDasharray="2 5" />
                <text x={x0 - 8} y={y(t) + 5} textAnchor="end" fontSize={FONT_PX} style={{ fill: T.axis, fontFamily: FONT }}>{t}</text>
              </g>
            ))}
            <MonthAxis axis={axis} y={base} gridTop={top} />
            {lines.map((l, li) => {
              const s = SERIES_STYLES[li % SERIES_STYLES.length]
              const pts = l.points.map((p) => ({ x: axis.xOf(plotIso(p.date)), y: y(p.v), v: p.v }))
              const last = pts[pts.length - 1]
              return (
                <g key={l.key}>
                  <path d={pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')} fill="none" style={{ stroke: s.color }} strokeWidth="3" strokeDasharray={s.dash} strokeLinejoin="round" strokeLinecap="round" />
                  {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3.5" style={{ fill: T.pointFill, stroke: s.color }} strokeWidth="2" />)}
                  {last && <text x={last.x + 2} y={last.y - 11} textAnchor="end" fontSize={VALUE_PX} fontWeight="800" style={{ fill: T.text, fontFamily: FONT, ...halo }}>{fmt(last.v)}</text>}
                </g>
              )
            })}
          </>
        )
      }}
    </ChartFrame>
  )
}

/* מקרא של קו: דוגמית הקו (צבע + סגנון) ואחריה השם במילים */
export function LineSwatch({ index, children }: { index: number; children: ReactNode }) {
  const s = SERIES_STYLES[index % SERIES_STYLES.length]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 600, color: T.text }}>
      <svg width="30" height="8" aria-hidden="true" focusable="false"><line x1="1" x2="29" y1="4" y2="4" strokeWidth="3" strokeLinecap="round" strokeDasharray={s.dash} style={{ stroke: s.color }} /></svg>
      {children}
    </span>
  )
}

export function BandSwatch({ children }: { children: ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 600, color: T.text }}>
      <span aria-hidden="true" style={{ width: 30, height: 14, borderRadius: 4, background: T.grid, border: `1px solid ${T.axis}`, display: 'inline-block', opacity: 0.85 }} />
      {children}
    </span>
  )
}
