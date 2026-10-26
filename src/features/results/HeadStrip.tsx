/* ראש מסך ההדמיה (זהה בשני המצבים) — פס אחד: תמונה, שם ההדמיה, מקצוע, כיתה, תאריך, מצב ההשלמה של הכיתה, והמתג הגדול [כל הכיתה] [לפי תלמיד].
   המתג בקצה השמאלי — מעל חלונית התלמידים שהוא קובע איך מסתכלים עליה. */
import { Link } from 'react-router-dom'
import { LESSON_DUE_TEXT, dateHe } from '../../shared/lib/findingsNarrative'
import { useStaffAuth } from '../../shared/hooks/useStaffAuth'
import type { SubmissionHead } from '../../shared/types/resultsV1'
import { FONT, Icon, ModeToggle, ProgressBar, SubjectBadge, T } from '../teacherUi'
import { card, primaryButton, soft } from './styles'
import { UI } from './text'
import Thumb from './Thumb'
import { DueEditor, DueLine, LessonStateChip } from './LessonDue'

export type Mode = 'class' | 'student'

interface HeadStripProps {
  head: SubmissionHead
  mode: Mode
  onMode: (m: Mode) => void
  /* אחרי שינוי מועד הגשה — טעינה מחדש של הנתונים (המצב והסימון "באיחור" נגזרים בשרת) */
  onDueChanged?: () => void
  /* קישור ל"תצוגה חיה" — מוצג רק כשהשיעור פעיל עכשיו */
  liveTo?: string
}

export default function HeadStrip({ head, mode, onMode, onDueChanged, liveTo }: HeadStripProps) {
  const c = head.counts
  /* מורה אורח (הדגמה) לא משנה מועדים — השרת חוסם, והכפתור לא מוצג */
  const { isGuest } = useStaffAuth()
  return (
    <section aria-label={UI.headLabel} data-head-strip style={{ ...card, flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: '6px 20px', flexWrap: 'wrap', padding: '6px 14px' }}>
      <Thumb url={head.thumbUrl} subjectCode={head.subject?.code ?? null} width={48} height={36} />
      {/* שם ההדמיה והפרטים בשורה אחת (גולשים לשנייה רק כשהשם ארוך) */}
      <div style={{ flex: '1 1 440px', minWidth: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '2px 14px', fontFamily: FONT, fontSize: 16, color: T.textSoft }}>
        <h2 style={{ margin: 0, fontFamily: FONT, fontSize: 20, fontWeight: 800, color: T.text, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{head.title}</h2>
        <SubjectBadge code={head.subject?.code ?? null} />
        <span>{UI.classWord(head.className)}</span>
        <span>{UI.sentOn(dateHe(head.sentAt))}</span>
        {head.state && <LessonStateChip state={head.state} dueAt={head.dueAt} />}
        {head.dueAt !== undefined && <DueLine dueAt={head.dueAt} state={head.state} />}
        {!isGuest && head.dueAt !== undefined && onDueChanged && <DueEditor submissionId={head.id} dueAt={head.dueAt} onChanged={onDueChanged} />}
        {head.state === 'active_now' && liveTo && (
          <Link to={liveTo} data-tu-press data-live-link style={{ ...primaryButton, textDecoration: 'none' }}>
            <Icon name="pulse" size={18} />
            {UI.openLive}
          </Link>
        )}
        {/* "השיעור פתוח עד 1.11. 8 תלמידים עוד לא סיימו, ולכן התמונה עדיין חלקית." — כל עוד השיעור פתוח ויש מי שלא סיים */}
        {head.openNote && (
          <span data-open-note style={{ flexBasis: '100%', display: 'flex', alignItems: 'center', gap: 8, fontFamily: FONT, fontSize: 16, color: T.text, lineHeight: 1.5 }}>
            <span style={{ color: T.muted, display: 'inline-flex' }}><Icon name="info" size={18} /></span>
            {head.openNote}
          </span>
        )}
      </div>
      <div style={{ flex: '0 1 340px', minWidth: 230, display: 'flex', flexDirection: 'column', gap: 0 }}>
        {/* בסרגל הזה תמיד נספרת הכיתה כולה; במצב "לפי תלמיד" המילה אומרת את זה */}
        <ProgressBar done={c.completed} total={c.total} label={mode === 'student' ? UI.finishedInClass : UI.finished} showPercent />
        <span style={{ ...soft, lineHeight: 1.4 }}>{UI.stateLine(c.inProgress, c.notStarted)}</span>
        {(head.lateCount ?? 0) > 0 && <span data-late-count style={{ ...soft, lineHeight: 1.4 }}>{LESSON_DUE_TEXT.lateCount(head.lateCount ?? 0, c.completed)}</span>}
      </div>
      <ModeToggle compact ariaLabel={UI.modeLabel} value={mode} onChange={(id) => onMode(id as Mode)}
        options={[{ id: 'class', label: UI.modeClass }, { id: 'student', label: UI.modeStudent }]} />
    </section>
  )
}
