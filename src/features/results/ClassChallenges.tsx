/* האתגרים בהדמיה — מצב "כל הכיתה". לפי סדר ההדמיה: שם האתגר, "X מתוך Y הצליחו" עם בר, הטעות הנפוצה במילים (אם יש תגית),
   ו"פירוט" שפותח את התפלגות התשובות — מי בחר מה (בשמות) ומי ויתר. שאלות מוסר: אין נכון/שגוי ואין שמות (לפי עיצוב המערכת). */
import { useId, useState } from 'react'
import { countOf, detailAvailableLine, RESULTS_TEXT } from '../../shared/lib/findingsNarrative'
import type { ChallengeResult, ClassSubmissionView, ItemResult, OptionCount } from '../../shared/types/resultsV1'
import { EmptyState, FONT, Icon, ProgressBar, RADIUS, T, VisuallyHidden } from '../teacherUi'
import { ExtraIcon } from './marks'
import { caption, secondaryButton, soft } from './styles'
import { UI } from './text'

const MORAL = 'moralDilemma'

function NumberBadge({ n }: { n: number }) {
  return (
    <span aria-hidden="true" style={{ display: 'inline-grid', placeItems: 'center', width: 34, height: 34, borderRadius: '50%', flexShrink: 0, border: `2px solid ${T.controlBorder}`, fontFamily: FONT, fontSize: 16, fontWeight: 800, color: T.text, background: T.surfaceSoft }}>{n}</span>
  )
}

function OptionRow({ o, moral }: { o: OptionCount; moral: boolean }) {
  const names = o.students.map((s) => s.name).join(', ')
  return (
    <li data-option={o.optionId} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '6px 0', borderTop: `1px solid ${T.border}` }}>
      {moral ? (
        <span style={{ width: 92, flexShrink: 0 }} />
      ) : (
        <span style={{ width: 92, flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: FONT, fontSize: 16, fontWeight: 800, color: T.text }}>
          <span style={{ color: o.isCorrect ? T.good : T.bad, display: 'inline-flex' }}>{o.isCorrect ? <Icon name="check" size={18} strokeWidth={2.6} /> : <ExtraIcon name="cross" size={18} />}</span>
          {o.isCorrect ? UI.optCorrect : UI.optWrong}
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0, fontFamily: FONT, fontSize: 16, lineHeight: 1.5, color: T.text }}>
        <div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{o.text}</div>
        <div style={{ color: T.textSoft }}>
          {moral ? UI.pickedTimes(o.count) : UI.chose(o.count)}{names ? `: ${names}` : ''}
        </div>
        {o.errorTag && <div style={{ fontWeight: 700 }}>{UI.commonErrorShort}: {o.errorTag.title}</div>}
      </div>
    </li>
  )
}

function ItemDetail({ item, moral, showPrompt }: { item: ItemResult; moral: boolean; showPrompt: boolean }) {
  return (
    <div data-item={item.itemIndex} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {showPrompt && <div style={{ fontFamily: FONT, fontSize: 16, fontWeight: 800, color: T.text, lineHeight: 1.5 }}>{item.prompt}</div>}
      {!moral && <div style={soft}>{countOf(item.solved, item.attempted)} {UI.succeeded}</div>}
      {item.options && item.options.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '2px 0 0', padding: 0 }}>
          {item.options.map((o) => <OptionRow key={o.optionId} o={o} moral={moral} />)}
        </ul>
      )}
    </div>
  )
}

function Detail({ c, id }: { c: ChallengeResult; id: string }) {
  const moral = c.type === MORAL
  const showPrompts = c.items.length > 1 || c.items.some((i) => !!i.options)
  return (
    <div id={id} data-challenge-detail style={{ margin: '0 0 2px', padding: '10px 14px', borderRadius: RADIUS.md, background: T.surfaceSoft, border: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {moral && <p style={{ ...soft, margin: 0 }}>{UI.moralNote}</p>}
      {c.items.map((item) => <ItemDetail key={item.itemIndex} item={item} moral={moral} showPrompt={showPrompts} />)}
      {c.items.length === 0 && c.attempted > 0 && <div style={soft}>{countOf(c.solved, c.attempted)} {UI.succeeded}</div>}
      {c.gaveUp > 0 && (
        <div style={{ fontFamily: FONT, fontSize: 16, lineHeight: 1.5, color: T.text }}>
          <span style={{ fontWeight: 800 }}>{UI.gaveUpLine(c.gaveUp)}</span>
          {c.gaveUpStudents.length > 0 && <span style={{ color: T.textSoft }}>: {c.gaveUpStudents.map((s) => s.name).join(', ')}</span>}
        </div>
      )}
    </div>
  )
}

function ChallengeRow({ c }: { c: ChallengeResult }) {
  const [open, setOpen] = useState(false)
  const detailId = useId()
  const moral = c.type === MORAL
  const canExpand = c.attempted > 0
  return (
    <li data-challenge={c.sceneId} style={{ listStyle: 'none', padding: '10px 14px', borderRadius: RADIUS.md, border: `1.5px solid ${T.border}`, background: T.surface, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <NumberBadge n={c.order} />
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <div style={{ fontFamily: FONT, fontSize: 17, fontWeight: 800, color: T.text, lineHeight: 1.3, overflowWrap: 'anywhere' }}>
            <VisuallyHidden>{UI.challengeWord} {c.order}: </VisuallyHidden>{c.title}
          </div>
          <div style={caption}>{c.typeLabel}</div>
        </div>
        {c.attempted > 0 ? (
          <div style={{ flex: '1 1 250px', maxWidth: 360, minWidth: 220 }}>
            <ProgressBar done={c.solved} total={c.attempted} label={moral ? UI.answered : UI.succeeded} showPercent={!moral} />
          </div>
        ) : (
          <p style={{ ...soft, margin: 0, flex: '1 1 250px' }}>{RESULTS_TEXT.noChallengeData}</p>
        )}
        {canExpand && (
          <button type="button" data-tu-press aria-expanded={open} aria-controls={detailId} onClick={() => setOpen((o) => !o)}
            style={{ ...secondaryButton, background: open ? T.accentFill : T.surface, borderColor: open ? T.accent : T.controlBorder }}>
            {UI.detail}
            <span style={{ display: 'inline-flex', transform: open ? 'rotate(180deg)' : undefined }}><Icon name="chevDown" size={18} /></span>
          </button>
        )}
      </div>
      {c.commonError && !moral && (
        <div data-common-error style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: FONT, fontSize: 16, color: T.text, lineHeight: 1.5 }}>
          <span style={{ color: T.warn, display: 'inline-flex' }}><Icon name="alert" size={18} /></span>
          <span><strong>{UI.commonErrorShort}:</strong> {c.commonError.title} — {countOf(c.commonError.count, c.attempted)} {UI.studentsPlural}</span>
        </div>
      )}
      {open && <Detail c={c} id={detailId} />}
    </li>
  )
}

export default function ClassChallenges({ view }: { view: ClassSubmissionView }) {
  const anyAttempt = view.challenges.some((c) => c.attempted > 0)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {!view.hasAnswerDetail && view.detailAvailableFrom && (
        <p data-detail-note style={{ ...soft, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: T.muted, display: 'inline-flex' }}><Icon name="info" size={18} /></span>
          {detailAvailableLine(view.detailAvailableFrom)}
        </p>
      )}
      {view.challenges.length === 0 ? (
        <p style={soft}>{UI.noChallenges}</p>
      ) : !anyAttempt ? (
        <EmptyState title={UI.noAttemptsYet} whatNext={UI.noAttemptsYetNext} />
      ) : (
        <ol style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }} aria-label={UI.challengesTitle}>
          {view.challenges.map((c) => <ChallengeRow key={c.sceneId} c={c} />)}
        </ol>
      )}
    </div>
  )
}

