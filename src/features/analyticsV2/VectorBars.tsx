import { behaviorVectorLabel, contentVectorLabel } from '../../shared/lib/analyticsConfig'
import type { SubjectPanel } from '../../shared/types/analyticsV2'
import { C } from './tokens'

type Visible = Extract<SubjectPanel, { access: 'visible' }>

const signed = (x: number): string => (x > 0 ? `+${x}` : x < 0 ? `−${Math.abs(x)}` : '0')

function Row({ label, children, note }: { label: string; children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '112px 1fr', gap: 10, alignItems: 'center', fontSize: 12.5 }}>
      <span style={{ color: C.textSoft }}>{label}</span>
      <div style={{ minWidth: 0 }}>
        {children}
        {note && <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>{note}</div>}
      </div>
    </div>
  )
}

function Track({ pct, tick, color }: { pct: number; tick?: number | null; color: string }) {
  return (
    <div style={{ position: 'relative', height: 8, borderRadius: 4, background: C.grid }}>
      <div style={{ position: 'absolute', insetBlock: 0, insetInlineStart: 0, width: `${Math.max(2, Math.min(100, pct))}%`, borderRadius: 4, background: color }} />
      {tick != null && <div aria-hidden style={{ position: 'absolute', top: -3, bottom: -3, insetInlineStart: `${Math.max(0, Math.min(100, tick))}%`, width: 2, background: C.text }} />}
    </div>
  )
}

/* וקטורי תוכן: רמה (1–20) מול הרמה הכללית במקצוע (קו אנכי). וקטורי התנהגות: 0–100% מול חציון הכיתה. */
export function ContentVectors({ vectors, subjectLevel }: { vectors: Visible['contentVectors']; subjectLevel: number | null }) {
  if (!vectors.length) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ fontSize: 11, color: C.muted }}>וקטורי תוכן (רמה 1–20; הקו = הרמה הכללית במקצוע)</div>
      {vectors.map((v) => (
        <Row key={v.key} label={contentVectorLabel(v.key)}
          note={v.status === 'insufficient' || v.level === null ? <>אין עדיין מספיק נתונים (N = <bdi dir="ltr">{v.n}</bdi>)</> : (
            <><bdi dir="ltr">{v.level}</bdi>{v.deltaLevels !== null && <> · <bdi dir="ltr">{signed(v.deltaLevels)}</bdi> לעומת התקופה הקודמת</>} · N = <bdi dir="ltr">{v.n}</bdi></>
          )}>
          {v.level !== null && v.status === 'reported' ? <Track pct={(v.level / 20) * 100} tick={subjectLevel !== null ? (subjectLevel / 20) * 100 : null} color={C.accent} /> : <Track pct={0} color={C.faint} />}
        </Row>
      ))}
    </div>
  )
}

export function BehaviorVectors({ vectors }: { vectors: Visible['behaviorVectors'] }) {
  if (!vectors.length) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ fontSize: 11, color: C.muted }}>התנהגות למידה (מדד תיאורי; הקו = חציון הכיתה)</div>
      {vectors.map((v) => (
        <Row key={v.key} label={behaviorVectorLabel(v.key)}
          note={v.status === 'insufficient' || v.value === null ? <>אין עדיין מספיק נתונים (N = <bdi dir="ltr">{v.n}</bdi>)</> : (
            <><bdi dir="ltr">{Math.round(v.value * 100)}%</bdi>{v.classMedian !== null && <> · חציון כיתה <bdi dir="ltr">{Math.round(v.classMedian * 100)}%</bdi></>}</>
          )}>
          {v.value !== null && v.status === 'reported' ? <Track pct={v.value * 100} tick={v.classMedian !== null ? v.classMedian * 100 : null} color={C.violet} /> : <Track pct={0} color={C.faint} />}
        </Row>
      ))}
    </div>
  )
}
