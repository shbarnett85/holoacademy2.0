/* האתגרים בהדמיה — מצב "כל הכיתה". שורה אחת לכל אתגר לפי סדר ההדמיה: שם האתגר וסוגו, "X מתוך Y הצליחו" עם בר, והטעות הנפוצה במילים (אם יש תגית).
   "פירוט" פותח את התפלגות התשובות — מי בחר מה (בשמות) ומי ויתר. שאלות מוסר: אין נכון/שגוי ואין שמות (לפי עיצוב המערכת). */
import { countNb, detailAvailableLine, levelBandText, RESULTS_TEXT } from '../../shared/lib/findingsNarrative'
import type { ChallengeResult, ClassSubmissionView, ItemResult, OptionCount } from '../../shared/types/resultsV1'
import { EmptyState, FONT, Icon, ProgressBar, RADIUS, T } from '../teacherUi'
import ChallengeRowShell from './ChallengeRow'
import { ExtraIcon } from './marks'
import { soft } from './styles'
import { UI } from './text'

const MORAL = 'moralDilemma'

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
      {!moral && <div style={soft}>{countNb(item.solved, item.attempted)} {UI.succeeded}</div>}
      {item.options && item.options.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '2px 0 0', padding: 0 }}>
          {item.options.map((o) => <OptionRow key={o.optionId} o={o} moral={moral} />)}
        </ul>
      )}
    </div>
  )
}

function Detail({ c }: { c: ChallengeResult }) {
  const moral = c.type === MORAL
  const showPrompts = c.items.length > 1 || c.items.some((i) => !!i.options)
  return (
    <div style={{ padding: '10px 14px', borderRadius: RADIUS.md, background: T.surfaceSoft, border: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {moral && <p style={{ ...soft, margin: 0 }}>{UI.moralNote}</p>}
      {c.items.map((item) => <ItemDetail key={item.itemIndex} item={item} moral={moral} showPrompt={showPrompts} />)}
      {c.items.length === 0 && c.attempted > 0 && <div style={soft}>{countNb(c.solved, c.attempted)} {UI.succeeded}</div>}
      {/* פירוק לפי דרגות: כל תלמיד/ה משחק/ת ברמה משלו/ה, ולכן ההצלחה מוצגת לפי טווח דרגות ולא כממוצע אחד */}
      {(c.levelBands ?? []).length > 1 && (
        <div data-level-bands style={{ fontFamily: FONT, fontSize: 16, lineHeight: 1.5, color: T.text }}>
          <span style={{ fontWeight: 800 }}>{UI.levelNoteTitle}: </span>
          <span style={{ color: T.textSoft }}>{(c.levelBands ?? []).map((b) => levelBandText(b.from, b.to, b.solved, b.attempted)).join(' · ')}</span>
        </div>
      )}
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
  const moral = c.type === MORAL
  return (
    <ChallengeRowShell sceneId={c.sceneId} order={c.order} title={c.title} typeLabel={c.typeLabel} canExpand={c.attempted > 0}
      summary={c.attempted > 0
        ? <div style={{ flex: 1, minWidth: 0 }}><ProgressBar done={c.solved} total={c.attempted} label={moral ? UI.answered : UI.succeeded} showPercent={!moral} /></div>
        : <p style={{ ...soft, margin: 0, lineHeight: 1.35 }}>{RESULTS_TEXT.noChallengeData}</p>}
      footer={c.commonError && !moral ? (
        <div data-common-error style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 0 4px 0', paddingInlineStart: 46, fontFamily: FONT, fontSize: 16, color: T.text, lineHeight: 1.4 }}>
          <span style={{ color: T.warn, display: 'inline-flex' }}><Icon name="alert" size={18} /></span>
          <span><strong>{UI.commonErrorShort}:</strong> {c.commonError.sentence ?? `${c.commonError.title} — ${countNb(c.commonError.count, c.attempted)} ${UI.studentsPlural}`}{c.commonError.title && c.commonError.sentence ? ` — ${c.commonError.title}` : ''}</span>
        </div>
      ) : undefined}>
      <Detail c={c} />
    </ChallengeRowShell>
  )
}

export default function ClassChallenges({ view }: { view: ClassSubmissionView }) {
  const anyAttempt = view.challenges.some((c) => c.attempted > 0)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {!view.hasAnswerDetail && view.detailAvailableFrom && (
        <p data-detail-note style={{ ...soft, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: T.muted, display: 'inline-flex' }}><Icon name="info" size={18} /></span>
          {detailAvailableLine(view.detailAvailableFrom)}
        </p>
      )}
      {view.head.levelNotice && (
        <p data-level-note style={{ ...soft, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: T.muted, display: 'inline-flex' }}><Icon name="info" size={18} /></span>
          {view.head.levelNotice}
        </p>
      )}
      {view.challenges.length === 0 ? (
        <p style={soft}>{UI.noChallenges}</p>
      ) : !anyAttempt ? (
        <EmptyState title={UI.noAttemptsYet} whatNext={UI.noAttemptsYetNext} />
      ) : (
        <ol style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }} aria-label={UI.challengesTitle}>
          {view.challenges.map((c) => <ChallengeRow key={c.sceneId} c={c} />)}
        </ol>
      )}
    </div>
  )
}
