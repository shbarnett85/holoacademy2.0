/* גרף עוגה טבעתי (דונאט) — "X מתוך Y" לפי קבוצות. נבנה לפי עקרונות הממשק למורה:
   · SVG בפיקסלים אמיתיים (בלי viewBox שמכווץ טקסט), בלי אנימציה ובלי מידע שמופיע רק בריחוף;
   · כל נתח נבדל גם בדוגמת מילוי (מלא · פסים אופקיים · פסים אלכסוניים · נקודות · רשת) — לא בצבע בלבד;
   · מקרא HTML גלוי תמיד: סימן הנתח, אייקון, מילה, "X מתוך Y" ואחוז רק בנוסף. נתח ריק: "אף אחד";
   · role="img" + aria-label עם הספירות במילים; המרכז (מספר + מילה) הוא HTML בגופן הרגיל;
   · מצב ריק (אין נתונים / אין מספיק) = EmptyState שאומר מה קורה ומה יקרה.
   צבעים: טוקני הערכה בלבד, דרך style (אסור var() באטריביוט SVG). החישוב הטהור ב-donutMath.ts. */
import { useId } from 'react'
import { DONUT_TEXT, donutLegendCount } from '../../shared/lib/findingsNarrative'
import { arcPath, computeArcs, polar, roundPercents } from './donutMath'
import EmptyState from './EmptyState'
import { Icon } from './icons'
import type { IconName } from './icons'
import { FONT, T, TONE_META } from './tokens'
import type { Tone } from './tokens'

export type DonutTone = Tone | 'accent'

export interface DonutSlice {
  /** מזהה יציב (לבדיקות ולמפתחות) */
  key: string
  /** המילה שליד הנתח: "סיימו" */
  label: string
  count: number
  tone: DonutTone
  /** האייקון שליד המילה במקרא */
  icon: IconName
}

export interface DonutEmpty { title: string; whatNext: string }

export interface DonutChartProps {
  /** תיאור לקוראי מסך: "מי סיים? 14 מתוך 25 סיימו, …" */
  ariaLabel: string
  slices: DonutSlice[]
  /** מתוך כמה (ה-Y בכל "X מתוך Y") */
  total: number
  /** המספר הגדול במרכז */
  centerNumber: string
  /** המילה שמתחתיו */
  centerLabel: string
  /** קוטר הטבעת ב-px (ברירת מחדל 140) */
  size?: number
  /** מצב ריק מפורש (למשל "עוד אין מספיק תלמידים שסיימו"); בלעדיו, total 0 מציג מצב ריק כללי */
  empty?: DonutEmpty | null
}

/* דוגמת המילוי לפי הטון — חמישה טונים, חמש דוגמאות שונות */
export type PatternKind = 'solid' | 'horizontal' | 'diagonal' | 'dots' | 'cross'
export const DONUT_PATTERN: Record<DonutTone, PatternKind> = {
  positive: 'solid',
  accent: 'horizontal',
  attention: 'diagonal',
  neutral: 'dots',
  error: 'cross',
}

const toneColor = (tone: DonutTone): string => (tone === 'accent' ? T.accent : TONE_META[tone].color)
const PERIOD = 8

function PatternDef({ id, kind, color }: { id: string; kind: PatternKind; color: string }) {
  if (kind === 'solid') return null
  return (
    <pattern id={id} width={PERIOD} height={PERIOD} patternUnits="userSpaceOnUse" patternTransform={kind === 'diagonal' ? 'rotate(45)' : undefined}>
      <rect width={PERIOD} height={PERIOD} style={{ fill: T.surface }} />
      {kind === 'horizontal' && <rect width={PERIOD} height={3.5} style={{ fill: color }} />}
      {kind === 'diagonal' && <rect width={3.5} height={PERIOD} style={{ fill: color }} />}
      {kind === 'dots' && <circle cx={PERIOD / 2} cy={PERIOD / 2} r={2.3} style={{ fill: color }} />}
      {kind === 'cross' && (<><rect width={PERIOD} height={2.5} style={{ fill: color }} /><rect width={2.5} height={PERIOD} style={{ fill: color }} /></>)}
    </pattern>
  )
}

/* סימן הנתח במקרא — אותה דוגמה ואותו צבע כמו הנתח עצמו */
function Swatch({ fill, color }: { fill: string; color: string }) {
  return (
    <svg aria-hidden="true" focusable="false" width={20} height={20} style={{ flexShrink: 0, display: 'block', marginTop: 1 }}>
      <rect x={1.5} y={1.5} width={17} height={17} rx={4} style={{ fill, stroke: color, strokeWidth: 1.5 }} />
    </svg>
  )
}

export default function DonutChart({ ariaLabel, slices, total, centerNumber, centerLabel, size = 140, empty = null }: DonutChartProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')

  if (empty || total <= 0) {
    const e = empty ?? { title: DONUT_TEXT.emptyDefault, whatNext: DONUT_TEXT.emptyDefaultNext }
    return <EmptyState title={e.title} whatNext={e.whatNext} />
  }

  const counts = slices.map((s) => s.count)
  const arcs = computeArcs(counts, total)
  const pcts = roundPercents(counts, total)
  const c = size / 2
  const rOuter = c - 2
  const thickness = Math.max(18, Math.round(size * 0.17))
  const rInner = rOuter - thickness
  const patternId = (tone: DonutTone): string => `donut-${uid}-${DONUT_PATTERN[tone]}-${tone}`
  const fillOf = (tone: DonutTone): string => (DONUT_PATTERN[tone] === 'solid' ? toneColor(tone) : `url(#${patternId(tone)})`)
  const drawn = arcs.filter((a) => a.sweepDeg > 0)
  /* הדוגמאות מוגדרות לכל טון שיש במקרא (גם נתח ריק), כי סימן המקרא מפנה אליהן */
  const usedTones = [...new Set(slices.map((s) => s.tone))]

  return (
    <div data-donut style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '8px 12px', minWidth: 0 }}>
      <div style={{ position: 'relative', width: size, height: size, flex: '0 0 auto' }}>
        <svg width={size} height={size} role="img" aria-label={ariaLabel} style={{ display: 'block', overflow: 'visible' }}>
          <defs>
            {usedTones.map((t) => <PatternDef key={t} id={patternId(t)} kind={DONUT_PATTERN[t]} color={toneColor(t)} />)}
          </defs>
          {drawn.map((a) => {
            const s = slices[a.index]
            return (
              <path key={s.key} data-donut-slice={s.key} d={arcPath(c, c, rOuter, rInner, a.startDeg, a.endDeg)}
                style={{ fill: fillOf(s.tone), stroke: toneColor(s.tone), strokeWidth: 1.5, strokeLinejoin: 'round', fillRule: 'evenodd' }} />
            )
          })}
          {/* מפרידים בצבע הכרטיס בין נתחים סמוכים */}
          {drawn.length > 1 && drawn.map((a) => {
            const p1 = polar(c, c, rInner - 1, a.startDeg)
            const p2 = polar(c, c, rOuter + 1, a.startDeg)
            return <line key={`sep-${a.index}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} style={{ stroke: T.surface, strokeWidth: 3 }} />
          })}
        </svg>
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', fontFamily: FONT }}>
          <span style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.05, color: T.text }}>{centerNumber}</span>
          <span style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.2, color: T.textSoft }}>{centerLabel}</span>
        </div>
      </div>

      <ul data-donut-legend style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 140px', minWidth: 0 }}>
        {slices.map((s, i) => (
          <li key={s.key} data-donut-row={s.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontFamily: FONT }}>
            <Swatch fill={fillOf(s.tone)} color={toneColor(s.tone)} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 16, fontWeight: 800, lineHeight: 1.3, color: T.text }}>
                <span style={{ color: toneColor(s.tone), display: 'inline-flex', marginTop: 2 }}><Icon name={s.icon} size={18} strokeWidth={s.icon === 'check' ? 2.6 : 2} /></span>
                <span>{s.label}</span>
              </div>
              <div style={{ fontSize: 16, fontWeight: 500, lineHeight: 1.4, color: T.textSoft }}>{donutLegendCount(s.count, total, pcts[i])}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
