/* ציר החודשים: שמות חודשים בעברית, אותו מבנה בכל גרף (עיקרון 11). רכיב <g> בתוך ChartFrame.
   החישוב עצמו (buildTimeAxis) pure ונבדק ב-timeAxis.test.ts. */
import type { TimeAxis } from './timeAxis'
import { T } from './tokens'

interface MonthAxisProps {
  axis: TimeAxis
  /** שורת הבסיס (y) של הציר */
  y: number
  /** אם נתון — קווי גבול חודשים אנכיים עד y זה (בדרך כלל החלק העליון של אזור השרטוט) */
  gridTop?: number
  /** גודל התווית; לא קטן מ-14 */
  fontSize?: number
}

/* צבעים דרך style (var() אסור באטריביוט SVG) */
export function MonthAxis({ axis, y, gridTop, fontSize = 14 }: MonthAxisProps) {
  const size = Math.max(14, fontSize)
  return (
    <g data-month-axis>
      <line x1={axis.x0} x2={axis.x1} y1={y} y2={y} style={{ stroke: T.axis }} strokeWidth="1" />
      {axis.ticks.map((t) => (
        <g key={t.iso}>
          {gridTop !== undefined && <line x1={t.xStart} x2={t.xStart} y1={gridTop} y2={y} style={{ stroke: T.grid }} strokeWidth="1" />}
          <line x1={t.xStart} x2={t.xStart} y1={y} y2={y + 5} style={{ stroke: T.axis }} strokeWidth="1" />
          {t.showLabel && (
            <text x={t.xMid} y={y + 8 + size} textAnchor="middle" fontSize={size} style={{ fill: T.axis, fontFamily: 'var(--font-display)' }}>{t.label}</text>
          )}
          {t.showLabel && t.year !== undefined && (
            <text x={t.xMid} y={y + 10 + size * 2} textAnchor="middle" fontSize={size} fontWeight="700" style={{ fill: T.axis, fontFamily: 'var(--font-display)' }}>{t.year}</text>
          )}
        </g>
      ))}
      {gridTop !== undefined && <line x1={axis.x1} x2={axis.x1} y1={gridTop} y2={y} style={{ stroke: T.grid }} strokeWidth="1" />}
    </g>
  )
}

/** גובה שמור מתחת לציר לשם חודש + שנה (לחישוב padding תחתון בגרף) */
export const AXIS_LABEL_HEIGHT = 14 * 2 + 14
