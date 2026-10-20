/* ראש מסך ההדמיה (זהה בשני המצבים): תמונה, שם ההדמיה, מקצוע, כיתה, תאריך, מצב ההשלמה, והמתג הגדול [כל הכיתה] [לפי תלמיד]. */
import { dateHe } from '../../shared/lib/findingsNarrative'
import type { SubmissionHead } from '../../shared/types/resultsV1'
import { FONT, ModeToggle, ProgressBar, SubjectBadge, T } from '../teacherUi'
import { card, soft } from './styles'
import { UI } from './text'
import Thumb from './Thumb'

export type Mode = 'class' | 'student'

interface HeadStripProps {
  head: SubmissionHead
  mode: Mode
  onMode: (m: Mode) => void
}

export default function HeadStrip({ head, mode, onMode }: HeadStripProps) {
  const c = head.counts
  return (
    <section aria-label={UI.headLabel} data-head-strip style={{ ...card, flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: '8px 20px', flexWrap: 'wrap', padding: '8px 16px' }}>
      <Thumb url={head.thumbUrl} subjectCode={head.subject?.code ?? null} width={64} height={48} />
      <div style={{ flex: '1 1 340px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h2 style={{ margin: 0, fontFamily: FONT, fontSize: 20, fontWeight: 800, color: T.text, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{head.title}</h2>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 14px', fontFamily: FONT, fontSize: 15, color: T.textSoft }}>
          <SubjectBadge code={head.subject?.code ?? null} />
          <span>{UI.classWord(head.className)}</span>
          <span>{UI.sentOn(dateHe(head.sentAt))}</span>
        </div>
      </div>
      <div style={{ flex: '0 1 300px', minWidth: 230, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <ProgressBar done={c.completed} total={c.total} label={UI.finished} showPercent />
        <span style={{ ...soft, fontSize: 14 }}>{UI.stateLine(c.inProgress, c.notStarted)}</span>
      </div>
      <ModeToggle ariaLabel={UI.modeLabel} value={mode} onChange={(id) => onMode(id as Mode)}
        options={[{ id: 'class', label: UI.modeClass }, { id: 'student', label: UI.modeStudent }]} />
    </section>
  )
}
