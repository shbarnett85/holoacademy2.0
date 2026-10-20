/* האתגרים בהדמיה — מצב "לפי תלמיד". אותה רשימה ואותו מקום כמו במצב הכיתה: שורה אחת לאתגר עם תג התוצאה (מילה + אייקון),
   ו"פירוט" שפותח עובדות על התלמיד/ה: מה נבחר, מה התשובה הנכונה, כמה ניסיונות, ואם ויתר/ה — וכמה זמן. תשובה שגויה עם תגית מציגה את שם
   הטעות הנפוצה. עובדות בלבד — בלי פרשנות על התלמיד/ה. כל השורות סגורות כברירת מחדל כדי שכל האתגרים ייכנסו במסך אחד. */
import type { ReactNode } from 'react'
import { detailAvailableLine } from '../../shared/lib/findingsNarrative'
import type { StudentChallenge, StudentItem, StudentSubmissionView } from '../../shared/types/resultsV1'
import { EmptyState, FONT, Icon, RADIUS, T, VisuallyHidden } from '../teacherUi'
import ChallengeRowShell from './ChallengeRow'
import { ExtraIcon, OutcomeTag } from './marks'
import { attemptsWord, formatSeconds } from './logic'
import { caption, soft } from './styles'
import { UI } from './text'

const MORAL = 'moralDilemma'

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...caption, fontWeight: 700 }}>{label}</div>
      <div style={{ fontFamily: FONT, fontSize: 16, fontWeight: 600, color: T.text, lineHeight: 1.45, overflowWrap: 'anywhere', display: 'flex', gap: 6, alignItems: 'flex-start' }}>{children}</div>
    </div>
  )
}

function Mark({ ok }: { ok: boolean }) {
  return (
    <span style={{ color: ok ? T.good : T.bad, display: 'inline-flex', marginTop: 3 }}>
      {ok ? <Icon name="check" size={18} strokeWidth={2.6} /> : <ExtraIcon name="cross" size={18} />}
      <VisuallyHidden>{ok ? UI.optCorrect : UI.optWrong}</VisuallyHidden>
    </span>
  )
}

function ItemFacts({ item, showPrompt }: { item: StudentItem; showPrompt: boolean }) {
  const wrong = item.isCorrect === false
  const hasAnswer = item.answerText !== null
  const showCorrect = item.correctText !== null && item.isCorrect !== true
  const facts = [item.attempts > 0 ? attemptsWord(item.attempts) : null, item.seconds !== null ? `${UI.time}: ${formatSeconds(item.seconds)}` : null].filter((x): x is string => !!x)
  return (
    <div data-item={item.itemIndex} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {showPrompt && <div style={{ fontFamily: FONT, fontSize: 16, fontWeight: 700, color: T.text, lineHeight: 1.5 }}>{item.prompt}</div>}
      {(hasAnswer || showCorrect) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '6px 16px' }}>
          {hasAnswer && <Fact label={UI.chosenAnswer}>{item.isCorrect !== null && <Mark ok={!wrong} />}<span>{item.answerText}</span></Fact>}
          {showCorrect && <Fact label={UI.correctAnswer}><span>{item.correctText}</span></Fact>}
        </div>
      )}
      {wrong && item.errorTag && (
        <div data-common-error style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: FONT, fontSize: 16, color: T.text, lineHeight: 1.5 }}>
          <span style={{ color: T.warn, display: 'inline-flex' }}><Icon name="alert" size={18} /></span>
          <span><strong>{UI.commonErrorShort}:</strong> {item.errorTag.title}</span>
        </div>
      )}
      {facts.length > 0 && <div style={soft}>{facts.join(' · ')}</div>}
    </div>
  )
}

function ChallengeRow({ c }: { c: StudentChallenge }) {
  const reached = c.outcome !== 'not_reached'
  const moral = c.type === MORAL
  const multi = c.items.length > 1
  const canExpand = reached && (moral || c.items.length > 0)
  return (
    <ChallengeRowShell sceneId={c.sceneId} order={c.order} title={c.title} typeLabel={`${c.typeLabel}${multi && c.seconds !== null ? ` · ${UI.totalTime}: ${formatSeconds(c.seconds)}` : ''}`}
      dataOutcome={c.outcome} canExpand={canExpand} summaryGrows={false} summary={<OutcomeTag outcome={c.outcome} />}>
      <div style={{ padding: '10px 14px', borderRadius: RADIUS.md, background: T.surfaceSoft, border: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {moral ? <p style={{ ...soft, margin: 0 }}>{UI.moralStudentNote}</p> : c.items.map((item) => <ItemFacts key={item.itemIndex} item={item} showPrompt />)}
      </div>
    </ChallengeRowShell>
  )
}

export default function StudentChallenges({ view }: { view: StudentSubmissionView }) {
  const none = view.challenges.length > 0 && view.challenges.every((c) => c.outcome === 'not_reached')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {!view.hasAnswerDetail && view.detailAvailableFrom && (
        <p data-detail-note style={{ ...soft, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: T.muted, display: 'inline-flex' }}><Icon name="info" size={18} /></span>
          {detailAvailableLine(view.detailAvailableFrom)}
        </p>
      )}
      {view.challenges.length === 0 ? (
        <p style={soft}>{UI.noChallenges}</p>
      ) : none ? (
        <EmptyState title={UI.studentNoResults} whatNext={view.student.status === 'in_progress' ? UI.studentNoResultsMiddle : UI.studentNoResultsNext} />
      ) : (
        <ol style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }} aria-label={UI.challengesTitle}>
          {view.challenges.map((c) => <ChallengeRow key={c.sceneId} c={c} />)}
        </ol>
      )}
    </div>
  )
}
