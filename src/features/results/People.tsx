/* החלונית של התלמידים — אותו מקום בשני המצבים, כרשת צפופה של כפתורי שמות (≈25 שמות בלי גלילה במסך 1366×768):
   · "כל הכיתה": שלוש קבוצות (עוד לא התחילו / באמצע / סיימו — מי שדורש מעקב קודם). כותרת הקבוצה היא התא הראשון ברשת, כך שאין שורה נפרדת לכותרת.
     בתוך קבוצה "לתשומת לב" קודם. לחיצה על שם פותחת אותו/ה בתוצאות לפי תלמיד.
   · "לפי תלמיד": כל השמות לפי א-ב, עם סימן מצב; הנוכחי/ת מסומן/ת. הקודם/הבא יושבים ליד משפט הסיכום (PrevNext).
   כל שם הוא כפתור ≥44px עם אייקון מצב; "לתשומת לב" מסומן באייקון התראה ובמילים (בכותרת החלונית ובקריאת מסך), לא בצבע בלבד. */
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { LESSON_DUE_TEXT, attentionBadgeText, countNb } from '../../shared/lib/findingsNarrative'
import type { ClassSubmissionView, StudentChip } from '../../shared/types/resultsV1'
import { FONT, Icon, MIN_TARGET, RADIUS, STATUS_META, T, VisuallyHidden } from '../teacherUi'
import type { StudentStatus } from '../teacherUi'
import { attentionTotal, byAttentionThenName, byName, ROSTER_GROUP_ORDER } from './logic'
import { card, panelTitle, scrollArea, secondaryButton, soft } from './styles'
import { UI } from './text'

/* עמודות הרשת: 5 במסך 1366 (≈108px לעמודה), פחות במסך צר. שם ארוך יורד לשורה שנייה בתוך אותו כפתור (44px) */
const GRID = 'repeat(auto-fill, minmax(104px, 1fr))'

function StatusIcon({ status, size = 18 }: { status: StudentStatus; size?: number }) {
  const m = STATUS_META[status]
  return <span style={{ color: m.color, display: 'inline-flex' }}><Icon name={m.icon} size={size} strokeWidth={status === 'completed' ? 2.6 : 2} /></span>
}

function AttentionLegend({ n }: { n: number }) {
  return (
    <span data-attention-legend style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 12px 2px 10px', borderRadius: 20, border: `1.5px solid ${T.warn}`, fontFamily: FONT, fontSize: 16, fontWeight: 700, color: T.text, lineHeight: 1.4, whiteSpace: 'nowrap' }}>
      <span style={{ color: T.warn, display: 'inline-flex' }}><Icon name="alert" size={18} /></span>
      {attentionBadgeText(n)}
    </span>
  )
}

/* "באיחור": אייקון שעון + מילה (הצבע משני). מוצג בכותרת הרשימה ובכל שם של מי שסיים אחרי המועד */
function LateLegend({ n, total }: { n: number; total: number }) {
  return (
    <span data-late-legend style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 12px 2px 10px', borderRadius: 20, border: `1.5px solid ${T.muted}`, fontFamily: FONT, fontSize: 16, fontWeight: 700, color: T.text, lineHeight: 1.4, whiteSpace: 'nowrap' }}>
      <span style={{ color: T.muted, display: 'inline-flex' }}><Icon name="clock" size={18} /></span>
      {LESSON_DUE_TEXT.lateCount(n, total)}
    </span>
  )
}

/* ── שם-כפתור: אייקון מצב, שם (עד 2-3 שורות בתוך 44px), סימן "לתשומת לב" ── */
function NameChip({ s, onOpen, current = false, showStatus = true }: { s: StudentChip; onOpen: (id: string) => void; current?: boolean; showStatus?: boolean }) {
  const m = STATUS_META[s.status]
  return (
    <button type="button" data-tu-press data-student-chip={s.id} data-student-row={s.id} aria-current={current ? 'true' : undefined} onClick={() => !current && onOpen(s.id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, width: '100%', minHeight: MIN_TARGET, padding: '2px 8px', borderRadius: RADIUS.md, boxSizing: 'border-box',
        fontFamily: FONT, fontSize: 16, fontWeight: current ? 800 : 600, lineHeight: 1.2, textAlign: 'start', cursor: current ? 'default' : 'pointer', color: T.text,
        background: current ? T.accentFill : T.surface,
        border: `${s.attention || current ? 2.5 : 1.5}px solid ${current ? T.accent : s.attention ? T.warn : T.controlBorder}`,
        boxShadow: current ? `inset 0 -4px 0 ${T.accent}` : 'none',
      }}>
      {/* בקבוצות (מצב כיתה) המצב כבר כתוב בכותרת הקבוצה, לכן הסימן בכל שם מיותר ומוריד מרוחב השם */}
      {showStatus && <StatusIcon status={s.status} />}
      <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{s.name}</span>
      {s.attention && <span style={{ color: T.warn, display: 'inline-flex' }}><Icon name="alert" size={18} /></span>}
      {s.late && <span data-late-mark title={LESSON_DUE_TEXT.late} style={{ color: T.muted, display: 'inline-flex' }}><Icon name="clock" size={18} /></span>}
      <VisuallyHidden>{`, ${m.word}${s.attention ? `, ${UI.attentionWord}` : ''}${s.late ? `, ${LESSON_DUE_TEXT.late}` : ''}`}</VisuallyHidden>
    </button>
  )
}

const GROUP_META: Record<(typeof ROSTER_GROUP_ORDER)[number], { status: StudentStatus; word: string }> = {
  notStarted: { status: 'not_started', word: UI.groupNotStarted },
  inProgress: { status: 'in_progress', word: UI.groupMiddle },
  completed: { status: 'completed', word: UI.groupFinished },
}
const GROUPS = ROSTER_GROUP_ORDER.map((key) => ({ key, ...GROUP_META[key] }))

/* כותרת קבוצה = תא ברשת (תופס שתי עמודות): "[אייקון] סיימו · 14 מתוך 25" */
function GroupHeading({ status, word, count, total, id }: { status: StudentStatus; word: string; count: number; total: number; id: string }) {
  return (
    <h3 id={id} style={{ gridColumn: 'span 2', margin: 0, minHeight: MIN_TARGET, display: 'flex', alignItems: 'center', gap: 8, fontFamily: FONT, fontSize: 16, fontWeight: 800, color: T.text, lineHeight: 1.25 }}>
      <StatusIcon status={status} size={20} />
      <span>{word}<span style={{ fontWeight: 600, color: T.textSoft }}> · {countNb(count, total)}</span></span>
    </h3>
  )
}

export function ClassRoster({ roster, onOpen }: { roster: ClassSubmissionView['roster']; onOpen: (studentId: string) => void }) {
  const total = roster.completed.length + roster.inProgress.length + roster.notStarted.length
  const attention = attentionTotal(roster)
  const late = roster.completed.filter((s) => s.late).length
  return (
    <section aria-label={UI.rosterTitle} data-people-panel="class" style={{ ...card, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '6px 14px 0', display: 'flex', alignItems: 'center', gap: '2px 10px', flexWrap: 'wrap', flex: '0 0 auto' }}>
        <h2 style={panelTitle}>{UI.rosterTitle}</h2>
        {attention > 0 && <AttentionLegend n={attention} />}
        {late > 0 && <LateLegend n={late} total={roster.completed.length} />}
      </div>
      <div style={{ ...scrollArea, padding: '2px 14px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {total === 0 && <p style={soft}>{UI.rosterEmpty}</p>}
        {GROUPS.map((g) => {
          const list = [...roster[g.key]].sort(byAttentionThenName)
          if (list.length === 0) return null
          const hid = `roster-${g.key}`
          return (
            <div key={g.key} role="group" aria-labelledby={hid} style={{ display: 'grid', gridTemplateColumns: GRID, gap: 6, alignItems: 'stretch' }}>
              <GroupHeading id={hid} status={g.status} word={g.word} count={list.length} total={total} />
              {list.map((s) => <NameChip key={s.id} s={s} onOpen={onOpen} showStatus={false} />)}
            </div>
          )
        })}
      </div>
    </section>
  )
}

/* ── מצב "לפי תלמיד" ── */
export function PrevNext({ prevId, nextId, position, onOpen }: { prevId: string | null; nextId: string | null; position: string; onOpen: (studentId: string) => void }) {
  /* ב-RTL: "הקודם" בימין עם חץ ימינה, "הבא" בשמאל עם חץ שמאלה */
  const step = (dir: 'prev' | 'next', id: string | null): ReactNode => {
    const disabled = !id
    const arrow = <span style={{ display: 'inline-flex', transform: dir === 'prev' ? 'scaleX(-1)' : undefined }}><Icon name="chevLeft" size={18} strokeWidth={2.4} /></span>
    return (
      <button type="button" data-tu-press data-step={dir} disabled={disabled} onClick={() => id && onOpen(id)}
        style={{ ...secondaryButton, padding: '0 14px', fontWeight: 800, cursor: disabled ? 'not-allowed' : 'pointer', color: disabled ? T.muted : T.text, border: `2px ${disabled ? 'dashed' : 'solid'} ${T.controlBorder}` }}>
        {dir === 'prev' && arrow}
        {dir === 'prev' ? UI.prev : UI.next}
        {dir === 'next' && arrow}
      </button>
    )
  }
  return (
    <div data-pager style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {step('prev', prevId)}
      <span style={{ ...soft, fontWeight: 700, whiteSpace: 'nowrap' }}>{position}</span>
      {step('next', nextId)}
    </div>
  )
}

interface StudentListProps {
  roster: StudentChip[]
  currentId: string
  onOpen: (studentId: string) => void
}

export function StudentList({ roster, currentId, onOpen }: StudentListProps) {
  const list = [...roster].sort(byName)
  const scroller = useRef<HTMLDivElement>(null)

  /* התלמיד/ה הנוכחי/ת תמיד נראה/ית ברשימה, גם אחרי "הבא" בכיתה גדולה */
  useEffect(() => {
    scroller.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [currentId])

  return (
    <section aria-label={UI.studentsTitle} data-people-panel="student" style={{ ...card, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px 14px 2px', display: 'flex', alignItems: 'center', gap: '2px 14px', flexWrap: 'wrap', flex: '0 0 auto' }}>
        <h2 style={panelTitle}>{UI.studentsTitle}</h2>
        {/* מקרא: שם המצב ליד כל סימן, כדי שהאייקון לא יישאר בלי מילה */}
        <span data-status-legend style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontFamily: FONT, fontSize: 16, color: T.textSoft }}>
          {[...GROUPS].reverse().map((g) => <span key={g.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}><StatusIcon status={g.status} />{g.word}</span>)}
        </span>
      </div>
      <div ref={scroller} role="group" aria-label={UI.studentsTitle} style={{ ...scrollArea, padding: '2px 14px 10px', display: 'grid', gridTemplateColumns: GRID, gap: 6, alignContent: 'start' }}>
        {list.map((s) => <NameChip key={s.id} s={s} onOpen={onOpen} current={s.id === currentId} />)}
      </div>
    </section>
  )
}
