/* "יעדי הלמידה" — מוצג רק כשההדמיה נוצרה עם יעדים שאפשר למדוד (objectives.length > 0).
   משפט סיכום אחד, ואז שורה לכל יעד: שם היעד, מילה + אייקון ("למדו" / "למדו חלקית" / "עדיין קשה"), "X מתוך Y הצליחו" עם בר,
   והתלמידים שמתקשים בו ככפתורי שם (≥44px) שפותחים את התלמיד/ה במצב "לפי תלמיד". הצבע תמיד נלווה למילה ולאייקון. */
import { useId, useState } from 'react'
import { narrateObjectivesSummary } from '../../shared/lib/findingsNarrative'
import type { ObjectiveLevel, ObjectiveResult } from '../../shared/types/resultsV1'
import { FONT, Icon, MIN_TARGET, ProgressBar, RADIUS, T, VisuallyHidden } from '../teacherUi'
import type { IconName, Tone } from '../teacherUi'
import { objectiveLevelCounts, visibleStudents } from './logic'
import { secondaryButton, soft } from './styles'
import { UI } from './text'

/* כמה שמות מוצגים לפני "עוד N תלמידים" — כדי שיעד קשה במיוחד לא ידחוק את שאר היעדים אל מחוץ למסך */
export const CHIPS_COLLAPSED = 3

const LEVEL_META: Record<ObjectiveLevel | 'none', { icon: IconName; color: string; tone: Tone }> = {
  strong: { icon: 'check', color: T.good, tone: 'positive' },
  partial: { icon: 'half', color: T.warn, tone: 'attention' },
  weak: { icon: 'alert', color: T.bad, tone: 'error' },
  none: { icon: 'circle', color: T.muted, tone: 'neutral' },
}

function LevelTag({ level, word }: { level: ObjectiveLevel | null; word: string }) {
  const m = LEVEL_META[level ?? 'none']
  return (
    <span data-objective-level={level ?? 'none'}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 12px 3px 10px', borderRadius: 20, border: `1.5px solid ${m.color}`, fontFamily: FONT, fontSize: 16, fontWeight: 700, color: T.text, whiteSpace: 'nowrap', lineHeight: 1.4 }}>
      <span style={{ color: m.color, display: 'inline-flex' }}><Icon name={m.icon} size={18} strokeWidth={level === 'strong' ? 2.6 : 2} /></span>
      {word}
    </span>
  )
}

function StudentChip({ s, onOpen }: { s: { id: string; name: string }; onOpen: (studentId: string) => void }) {
  return (
    <button type="button" data-tu-press data-objective-student={s.id} onClick={() => onOpen(s.id)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: MIN_TARGET, padding: '4px 14px', borderRadius: RADIUS.md, boxSizing: 'border-box',
        fontFamily: FONT, fontSize: 16, fontWeight: 600, lineHeight: 1.25, cursor: 'pointer', color: T.text, background: T.surface, border: `1.5px solid ${T.controlBorder}`,
      }}>
      {s.name}
      <VisuallyHidden>{`, ${UI.openStudentHidden}`}</VisuallyHidden>
    </button>
  )
}

function WeakStudents({ o, onOpen }: { o: ObjectiveResult; onOpen: (studentId: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const listId = useId()
  const { shown, hidden } = visibleStudents(o.weakStudents, expanded, CHIPS_COLLAPSED)
  const canToggle = expanded || hidden > 0
  return (
    <div data-objective-weak style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', alignItems: 'flex-start' }}>
      {/* התווית בראש השורה (בצד ההתחלה) והכפתורים לצידה — חוסך שורה שלמה בכל יעד */}
      <div style={{ flex: '0 0 auto', minHeight: MIN_TARGET, display: 'flex', alignItems: 'center', fontFamily: FONT, fontSize: 16, fontWeight: 700, color: T.text }}>{UI.objectiveWeakHead(o.weakStudents.length, o.attempted)}</div>
      <ul id={listId} aria-label={UI.objectiveWeakNames} style={{ flex: '1 1 320px', minWidth: 0, listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {shown.map((s) => <li key={s.id}><StudentChip s={s} onOpen={onOpen} /></li>)}
        {canToggle && (
          <li>
            <button type="button" data-tu-press aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded((e) => !e)} style={secondaryButton}>
              {expanded ? UI.fewerStudents : UI.moreStudents(hidden)}
              <span style={{ display: 'inline-flex', transform: expanded ? 'rotate(180deg)' : undefined }}><Icon name="chevDown" size={18} /></span>
            </button>
          </li>
        )}
      </ul>
    </div>
  )
}

function ObjectiveRow({ o, onOpen }: { o: ObjectiveResult; onOpen: (studentId: string) => void }) {
  const m = LEVEL_META[o.level ?? 'none']
  return (
    <li data-objective={o.id} style={{ listStyle: 'none', padding: '8px 14px', borderRadius: RADIUS.md, border: `1.5px solid ${T.border}`, background: T.surface, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, flex: '1 1 260px', minWidth: 0, fontFamily: FONT, fontSize: 17, fontWeight: 800, color: T.text, lineHeight: 1.4, overflowWrap: 'anywhere' }}>{o.text}</h3>
        <LevelTag level={o.level} word={o.levelText} />
      </div>
      {o.attempted > 0 ? (
        <>
          <div style={{ maxWidth: 520 }}>
            <ProgressBar done={o.solved} total={o.attempted} label={UI.succeeded} showPercent tone={m.tone} />
          </div>
          {o.weakStudents.length > 0
            ? <WeakStudents o={o} onOpen={onOpen} />
            : <p style={{ ...soft, margin: 0 }}>{UI.objectiveNobodyWeak}</p>}
        </>
      ) : (
        <p style={{ ...soft, margin: 0 }}>{UI.objectiveNoData}</p>
      )}
    </li>
  )
}

export default function Objectives({ objectives, onOpenStudent }: { objectives: ObjectiveResult[]; onOpenStudent: (studentId: string) => void }) {
  return (
    <div data-objectives style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 style={{ margin: 0, fontFamily: FONT, fontSize: 17, fontWeight: 800, color: T.text, lineHeight: 1.5 }}>
        {narrateObjectivesSummary(objectiveLevelCounts(objectives))}
      </h2>
      <ul aria-label={UI.objectivesLabel} style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {objectives.map((o) => <ObjectiveRow key={o.id} o={o} onOpen={onOpenStudent} />)}
      </ul>
    </div>
  )
}
