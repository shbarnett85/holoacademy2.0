/* מנהל/ת (ומנהל עירוני): "כמה שיעורים התקיימו, ואיזה חלק מהתלמידים השתתף?" — טבלה אחת, שכבה × מקצוע, החודש.
   בכל תא: כמה שיעורים שונים נשלחו, וכמה מהתלמידים בכיתות שקיבלו אותם התחילו לפחות אחד מהם.
   פרטיות: אין שמות תלמידים, אין פירוט לפי כיתה או מורה, ואין עמודי שיעור. תא עם מעט תלמידים (או כיתה אחת בלבד) מוצג כ"מוסתר" — בלי מספרים. */
import { OVERVIEW_TEXT } from '../../shared/lib/findingsNarrative'
import { subjectStyle } from '../../shared/lib/subjectStyle'
import type { Overview, OverviewCell } from '../../shared/types/resultsV1'
import { EmptyState, FONT, Icon, RADIUS, ScreenShell, Sentence, SubjectBadge, T } from '../teacherUi'
import ErrorPanel from './ErrorPanel'
import FillArea from './FillArea'
import { useLens, useResultsData } from './resultsApi'
import ResultsLensSwitcher from './ResultsLensSwitcher'
import { card, scrollArea, soft } from './styles'
import { UI } from './text'

const cellBox = { padding: '8px 12px', verticalAlign: 'top', fontFamily: FONT, fontSize: 16, lineHeight: 1.5, color: T.text, borderTop: `1px solid ${T.border}` } as const

function Cell({ c }: { c: OverviewCell | undefined }) {
  if (!c || c.status === 'empty') return <td data-cell="empty" style={{ ...cellBox, color: T.textSoft }}>{OVERVIEW_TEXT.noLessons}</td>
  if (c.status === 'hidden') {
    return (
      <td data-cell="hidden" style={{ ...cellBox, color: T.textSoft }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="lock" size={18} />{OVERVIEW_TEXT.hiddenCell}</span>
      </td>
    )
  }
  return (
    <td data-cell="shown" style={cellBox}>
      <div style={{ fontWeight: 800 }}>{OVERVIEW_TEXT.lessonsCell(c.lessons ?? 0)}</div>
      <div style={{ color: T.textSoft }}>{OVERVIEW_TEXT.participationCell(c.participated ?? 0, c.total ?? 0)}</div>
    </td>
  )
}

export function OverviewTable({ o }: { o: Overview }) {
  const cellOf = (gradeId: string, subject: string): OverviewCell | undefined => o.cells.find((c) => c.gradeId === gradeId && c.subject === subject)
  return (
    <div style={{ ...card, ...scrollArea, padding: 0 }}>
      <table data-overview-table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <caption style={{ textAlign: 'start', padding: '8px 12px', fontFamily: FONT, fontSize: 17, fontWeight: 800, color: T.text }}>{UI.overviewTable} · {o.periodLabel}</caption>
        <thead>
          <tr>
            <th scope="col" style={{ ...cellBox, borderTop: 'none', textAlign: 'start', width: 130, fontWeight: 800 }}>{UI.overviewGrade}</th>
            {o.subjects.map((s) => (
              <th key={s.code} scope="col" style={{ ...cellBox, borderTop: 'none', textAlign: 'start' }}><SubjectBadge code={s.code} /> <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{subjectStyle(s.code).label}</span></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {o.grades.map((g) => (
            <tr key={g.id}>
              <th scope="row" style={{ ...cellBox, textAlign: 'start', fontWeight: 800 }}>{g.label}</th>
              {o.subjects.map((s) => <Cell key={s.code} c={cellOf(g.id, s.code)} />)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function OverviewScreen() {
  const { isGuest, scope, apiQs, link } = useLens()
  const q = useResultsData<Overview>('overview', `/api/results/overview${apiQs}`, scope)
  const o = q.data
  return (
    <ScreenShell active="results" title={UI.overviewTitle} lensSwitcher={isGuest ? <ResultsLensSwitcher /> : undefined}
      howWeCalc={o ? { lines: o.howWeCalculated } : undefined}>
      <FillArea>
        {q.error ? (
          <ErrorPanel error={q.error} scope="list" backTo={link('/results')} onRetry={q.reload} />
        ) : !o ? (
          <p role="status" style={{ margin: 0, fontFamily: FONT, fontSize: 17, color: T.textSoft }}>{UI.loading}</p>
        ) : (
          <>
            <Sentence compact>{o.sentence}</Sentence>
            {o.grades.length === 0 || o.subjects.length === 0
              ? <EmptyState title={UI.overviewNoData} whatNext={UI.overviewEmptyNext} />
              : <OverviewTable o={o} />}
            {o.hasHidden && (
              <p data-overview-hidden-note style={{ ...soft, margin: 0, display: 'flex', alignItems: 'flex-start', gap: 8, borderRadius: RADIUS.md }}>
                <span style={{ color: T.muted, display: 'inline-flex', marginTop: 4 }}><Icon name="info" size={18} /></span>
                {OVERVIEW_TEXT.hiddenNote}
              </p>
            )}
          </>
        )}
      </FillArea>
    </ScreenShell>
  )
}
