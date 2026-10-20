/* החלונית של התלמידים — אותו מקום בשני המצבים:
   · "כל הכיתה": שלוש קבוצות (סיימו / באמצע / עוד לא התחילו) של שמות-כפתורים; לחיצה על שם פותחת אותו/ה בתוצאות לפי תלמיד.
   · "לפי תלמיד": רשימת השמות לפי א-ב עם סימן מצב + "הקודם / הבא".
   כל שם הוא כפתור ≥44px עם אייקון מצב; "לתשומת לב" מסומן באייקון התראה ובמילים (בכותרת החלונית ובקריאת מסך), לא בצבע בלבד. */
import { useEffect, useRef } from 'react'
import { attentionBadgeText, countOf } from '../../shared/lib/findingsNarrative'
import type { ClassSubmissionView, StudentChip } from '../../shared/types/resultsV1'
import { FONT, Icon, MIN_TARGET, RADIUS, STATUS_META, T, VisuallyHidden } from '../teacherUi'
import type { StudentStatus } from '../teacherUi'
import { attentionTotal, byName } from './logic'
import { card, panelTitle, scrollArea, soft } from './styles'
import { UI } from './text'

function StatusIcon({ status, size = 18 }: { status: StudentStatus; size?: number }) {
  const m = STATUS_META[status]
  return <span style={{ color: m.color, display: 'inline-flex' }}><Icon name={m.icon} size={size} strokeWidth={status === 'completed' ? 2.6 : 2} /></span>
}

function AttentionLegend({ n }: { n: number }) {
  return (
    <span data-attention-legend style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 12px 3px 10px', borderRadius: 20, border: `1.5px solid ${T.warn}`, fontFamily: FONT, fontSize: 15, fontWeight: 700, color: T.text, lineHeight: 1.4 }}>
      <span style={{ color: T.warn, display: 'inline-flex' }}><Icon name="alert" size={18} /></span>
      {attentionBadgeText(n)}
    </span>
  )
}

/* ── מצב "כל הכיתה" ── */
function NameChip({ s, onOpen }: { s: StudentChip; onOpen: (id: string) => void }) {
  const m = STATUS_META[s.status]
  return (
    <button type="button" data-tu-press data-student-chip={s.id} onClick={() => onOpen(s.id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: MIN_TARGET, padding: '4px 10px', borderRadius: RADIUS.md, boxSizing: 'border-box',
        fontFamily: FONT, fontSize: 16, fontWeight: 600, lineHeight: 1.25, textAlign: 'start', cursor: 'pointer', color: T.text, background: T.surface,
        border: `${s.attention ? 2.5 : 1.5}px solid ${s.attention ? T.warn : T.controlBorder}`,
      }}>
      <StatusIcon status={s.status} />
      <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{s.name}</span>
      {s.attention && <span style={{ color: T.warn, display: 'inline-flex' }}><Icon name="alert" size={18} /></span>}
      <VisuallyHidden>{`, ${m.word}${s.attention ? `, ${UI.attentionWord}` : ''}`}</VisuallyHidden>
    </button>
  )
}

const GROUPS: { key: 'completed' | 'inProgress' | 'notStarted'; status: StudentStatus; word: string }[] = [
  { key: 'completed', status: 'completed', word: UI.groupFinished },
  { key: 'inProgress', status: 'in_progress', word: UI.groupMiddle },
  { key: 'notStarted', status: 'not_started', word: UI.groupNotStarted },
]

export function ClassRoster({ roster, onOpen }: { roster: ClassSubmissionView['roster']; onOpen: (studentId: string) => void }) {
  const total = roster.completed.length + roster.inProgress.length + roster.notStarted.length
  const attention = attentionTotal(roster)
  return (
    <section aria-label={UI.rosterTitle} data-people-panel="class" style={{ ...card, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 16px 6px', display: 'flex', flexDirection: 'column', gap: 4, flex: '0 0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={panelTitle}>{UI.rosterTitle}</h2>
          {attention > 0 && <AttentionLegend n={attention} />}
        </div>
        <p style={{ ...soft, margin: 0 }}>{UI.rosterHint}</p>
      </div>
      <div style={{ ...scrollArea, padding: '4px 16px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {total === 0 && <p style={{ ...soft, fontSize: 16 }}>{UI.rosterEmpty}</p>}
        {GROUPS.map((g) => {
          const list = [...roster[g.key]].sort(byName)
          if (list.length === 0) return null
          return (
            <div key={g.key} role="group" aria-label={g.word}>
              <h3 style={{ margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 8, fontFamily: FONT, fontSize: 16, fontWeight: 800, color: T.text }}>
                <StatusIcon status={g.status} size={20} />
                {g.word}
                <span style={{ fontWeight: 600, color: T.textSoft }}>· {countOf(list.length, total)}</span>
              </h3>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                {list.map((s) => <li key={s.id} style={{ minWidth: 0 }}><NameChip s={s} onOpen={onOpen} /></li>)}
              </ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/* ── מצב "לפי תלמיד" ── */
function StepButton({ dir, disabled, onClick }: { dir: 'prev' | 'next'; disabled: boolean; onClick: () => void }) {
  /* ב-RTL: "הקודם" בימין עם חץ ימינה, "הבא" בשמאל עם חץ שמאלה */
  const arrow = <span style={{ display: 'inline-flex', transform: dir === 'prev' ? 'scaleX(-1)' : undefined }}><Icon name="chevLeft" size={18} strokeWidth={2.4} /></span>
  return (
    <button type="button" data-tu-press disabled={disabled} onClick={onClick} data-step={dir}
      style={{
        flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: MIN_TARGET, padding: '0 14px', borderRadius: RADIUS.md,
        fontFamily: FONT, fontSize: 16, fontWeight: 800, cursor: disabled ? 'not-allowed' : 'pointer',
        color: disabled ? T.muted : T.text, background: T.surface, border: `2px ${disabled ? 'dashed' : 'solid'} ${T.controlBorder}`,
      }}>
      {dir === 'prev' && arrow}
      {dir === 'prev' ? UI.prev : UI.next}
      {dir === 'next' && arrow}
    </button>
  )
}

interface StudentListProps {
  roster: StudentChip[]
  currentId: string
  prevId: string | null
  nextId: string | null
  onOpen: (studentId: string) => void
}

export function StudentList({ roster, currentId, prevId, nextId, onOpen }: StudentListProps) {
  const list = [...roster].sort(byName)
  const idx = list.findIndex((s) => s.id === currentId)
  const scroller = useRef<HTMLUListElement>(null)

  /* התלמיד/ה הנוכחי/ת תמיד נראה/ית ברשימה, גם אחרי "הבא" ב-25 תלמידים */
  useEffect(() => {
    scroller.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [currentId])

  return (
    <section aria-label={UI.studentsTitle} data-people-panel="student" style={{ ...card, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 16px 8px', display: 'flex', flexDirection: 'column', gap: 8, flex: '0 0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={panelTitle}>{UI.studentsTitle}</h2>
          {idx >= 0 && <span style={{ ...soft, fontWeight: 600 }}>{UI.studentPosition(idx + 1, list.length)}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <StepButton dir="prev" disabled={!prevId} onClick={() => prevId && onOpen(prevId)} />
          <StepButton dir="next" disabled={!nextId} onClick={() => nextId && onOpen(nextId)} />
        </div>
      </div>
      <ul ref={scroller} style={{ ...scrollArea, listStyle: 'none', margin: 0, padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {list.map((s) => {
          const current = s.id === currentId
          const m = STATUS_META[s.status]
          return (
            <li key={s.id}>
              <button type="button" data-tu-press data-student-row={s.id} aria-current={current ? 'true' : undefined} onClick={() => !current && onOpen(s.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: MIN_TARGET, padding: '4px 12px', borderRadius: RADIUS.md, boxSizing: 'border-box',
                  fontFamily: FONT, fontSize: 16, fontWeight: current ? 800 : 600, textAlign: 'start', cursor: current ? 'default' : 'pointer', color: T.text,
                  background: current ? T.accentFill : T.surface, border: `2px solid ${current ? T.accent : T.controlBorder}`, boxShadow: current ? `inset 0 -4px 0 ${T.accent}` : 'none',
                }}>
                <StatusIcon status={s.status} />
                <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{s.name}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: T.textSoft, whiteSpace: 'nowrap' }}>{m.word}</span>
                {s.attention && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 14, fontWeight: 700, color: T.text, whiteSpace: 'nowrap' }}>
                    <span style={{ color: T.warn, display: 'inline-flex' }}><Icon name="alert" size={16} /></span>
                    {UI.attentionWord}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

