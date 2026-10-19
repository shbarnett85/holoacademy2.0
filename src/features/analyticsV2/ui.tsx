import { useState } from 'react'
import { glass, micro } from '../creator/studioStyles'
import { evidenceLines } from '../../shared/lib/findingsNarrative'
import type { Finding } from '../../shared/types/analyticsV2'
import { C, TONE, type Tone } from './tokens'

export function Panel({ title, aside, children, style, id }: { title?: string; aside?: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties; id?: string }) {
  return (
    <section id={id} style={{ ...glass, padding: 18, minWidth: 0, ...style }}>
      {(title || aside) && (
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          {title && <h3 style={{ ...micro, fontSize: 10, margin: 0, fontWeight: 500 }}>◇ {title}</h3>}
          {aside}
        </header>
      )}
      {children}
    </section>
  )
}

export function Chip({ children, tone = 'neutral', title }: { children: React.ReactNode; tone?: Tone | 'accent'; title?: string }) {
  const color = tone === 'accent' ? C.accent : TONE[tone].color
  return (
    <span title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 8, border: `1px solid ${color}`, color, whiteSpace: 'nowrap', lineHeight: 1.6 }}>
      {children}
    </span>
  )
}

export function Notice({ children, tone = 'neutral', style }: { children: React.ReactNode; tone?: Tone | 'accent'; style?: React.CSSProperties }) {
  const color = tone === 'accent' ? C.accent : TONE[tone].color
  return (
    <div role="note" style={{ fontSize: 12.5, lineHeight: 1.7, color: C.textSoft, padding: '8px 12px', borderRadius: 10, border: `1px dashed ${color}`, background: C.surface, ...style }}>
      {children}
    </div>
  )
}

export function Loading({ label = 'טוען…' }: { label?: string }) {
  return <div role="status" style={{ color: C.muted, fontSize: 13, padding: 24, textAlign: 'center' }}>{label}</div>
}

export function ErrorBox({ message }: { message: string }) {
  return <div role="alert" style={{ color: C.bad, border: `1px solid ${C.bad}`, borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>{message}</div>
}

export function EmptyInsufficient({ children = 'אין עדיין מספיק נתונים' }: { children?: React.ReactNode }) {
  return <div style={{ color: C.muted, fontSize: 13, padding: '14px 4px' }}>{children}</div>
}

export function Button({ children, onClick, kind = 'ghost', disabled, title, style }: { children: React.ReactNode; onClick?: () => void; kind?: 'ghost' | 'solid'; disabled?: boolean; title?: string; style?: React.CSSProperties }) {
  const solid = kind === 'solid'
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      style={{
        fontFamily: 'var(--font-display)', fontSize: 12.5, fontWeight: 700, padding: '7px 14px', borderRadius: 10, cursor: disabled ? 'not-allowed' : 'pointer',
        border: `1px solid ${solid ? C.accent : C.border}`, background: solid ? 'var(--t20)' : 'transparent', color: disabled ? C.faint : solid ? C.accentBright : C.textSoft, opacity: disabled ? 0.6 : 1, ...style,
      }}>
      {children}
    </button>
  )
}

/* כרטיס ממצא: ממצא מדווח = טקסט + פירוט ראיות; ממצא "אין מספיק נתונים" = שורה שקטה ללא טענה */
export function FindingCard({ finding, who }: { finding: Finding; who?: string }) {
  const [open, setOpen] = useState(false)
  if (finding.status === 'insufficient') {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, color: C.muted, lineHeight: 1.7 }}>
        <span aria-hidden style={{ color: C.faint }}>○</span>
        <span>{who ? <strong style={{ color: C.textSoft }}>{who}: </strong> : null}{finding.text}</span>
      </div>
    )
  }
  const tone = TONE[finding.tone]
  return (
    <article style={{ border: `1px solid ${C.border}`, borderInlineStart: `3px solid ${tone.color}`, borderRadius: 10, padding: '10px 12px', background: C.surface }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span aria-label={tone.label} title={tone.label} style={{ color: tone.color, fontSize: 11, marginTop: 5 }}>{tone.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {who && <div style={{ fontSize: 12, fontWeight: 700, color: C.textSoft, marginBottom: 2 }}>{who}</div>}
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.75, color: C.text }}>{finding.text}</p>
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
            style={{ marginTop: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: C.accent, fontSize: 11.5, fontFamily: 'var(--font-display)' }}>
            {open ? 'הסתר ראיות' : 'ראיות והסתברות'}
          </button>
          {open && (
            <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {evidenceLines(finding.n, finding.pAdjusted, finding.effectSize, finding.window.start, finding.window.end).map((l) => <li key={l}><Chip>{l}</Chip></li>)}
            </ul>
          )}
        </div>
      </div>
    </article>
  )
}

/* רשימת ממצאים: מדווחים תחילה; "אין מספיק נתונים" בתוך details שקט */
export function FindingList({ findings, whoOf }: { findings: Finding[]; whoOf?: (f: Finding) => string | undefined }) {
  const reported = findings.filter((f) => f.status === 'reported')
  const quiet = findings.filter((f) => f.status === 'insufficient')
  if (!reported.length && !quiet.length) return <div style={{ color: C.muted, fontSize: 12.5 }}>לא נצפו אירועים או דפוסים חריגים בנתונים.</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {reported.map((f) => <FindingCard key={f.id} finding={f} who={whoOf?.(f)} />)}
      {quiet.length > 0 && (
        <details>
          <summary style={{ cursor: 'pointer', color: C.muted, fontSize: 12 }}>עוד נבדק — אין עדיין מספיק נתונים ({quiet.length})</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {quiet.map((f) => <FindingCard key={f.id} finding={f} who={whoOf?.(f)} />)}
          </div>
        </details>
      )}
    </div>
  )
}

export function SubjectGreyChip({ name }: { name: string }) {
  return (
    <span aria-disabled="true" title="אין לך גישה לנתוני מקצוע זה" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '3px 11px', borderRadius: 9, border: `1px dashed ${C.faint}`, color: C.faint, cursor: 'not-allowed', userSelect: 'none' }}>
      <span aria-hidden>🔒</span>{name}
    </span>
  )
}
