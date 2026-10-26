/* "מה עושים עם זה" — לכל טעות נפוצה (אותה תשובה שגויה אצל כמה תלמידים) שתי פעולות:
     · שיעור ממוקד ל-N התלמידים — פותח את "שיעור חדש" כשהנושא, המקצוע, השכבה ותיאור הטעות כבר ממולאים.
       המערכת שולחת שיעור לכיתה שלמה (לא לחלק ממנה), ולכן ההערה על כך גלויה ליד הכפתור, לא רק אחרי לחיצה.
     · שאלה לדיון בכיתה — מסך מלא להקרנה, בלי שמות.
   כשכבר קיים שיעור ממוקד לטעות (תפיסה מתויגת + קישור) — מוצג גם כפתור "פתיחת השיעור הממוקד". */
import { useNavigate } from 'react-router-dom'
import { FOCUSED_LESSON_WHOLE_CLASS_NOTE, focusedLessonLabel, studentsCountText } from '../../shared/lib/findingsNarrative'
import type { CommonErrorRow, SubmissionHead } from '../../shared/types/resultsV1'
import { FONT, Icon, RADIUS, T } from '../teacherUi'
import { startFocusedLesson } from './focusedLesson'
import { primaryButton, secondaryButton, soft } from './styles'
import { UI } from './text'

function ErrorCard({ e, head, discussTo }: { e: CommonErrorRow; head: SubmissionHead; discussTo: string }) {
  const navigate = useNavigate()
  const n = e.studentIds?.length ?? e.studentsCount
  const canFocus = !!e.wrongText && !!e.sceneId
  return (
    <li data-common-error-card={e.id} style={{ listStyle: 'none', padding: '10px 16px', borderRadius: RADIUS.md, border: `1.5px solid ${T.border}`, background: T.surface, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontFamily: FONT, fontSize: 17, fontWeight: 800, color: T.text, lineHeight: 1.4 }}>
        <span style={{ color: T.warn, display: 'inline-flex' }}><Icon name="alert" size={20} /></span>
        {e.sentence ?? e.title}
      </h3>
      <p style={{ ...soft, margin: 0, lineHeight: 1.5 }}>
        {e.challengeTitle ? `${e.challengeTitle}: ` : ''}{e.question ?? e.description}
        {e.misconceptionId ? ` — ${e.title}` : ''}
      </p>
      <p style={{ margin: 0, fontFamily: FONT, fontSize: 16, fontWeight: 700, color: T.text }}>{UI.errorCount(studentsCountText(e.studentsCount, e.studentsExposed))}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px 12px', flexWrap: 'wrap', marginTop: 4 }}>
        <button type="button" data-tu-press data-focused-lesson disabled={!canFocus} style={{ ...primaryButton, opacity: canFocus ? 1 : 0.55, cursor: canFocus ? 'pointer' : 'not-allowed' }}
          onClick={() => { startFocusedLesson(e, head); void navigate('/creator') }}>
          <Icon name="step" size={18} />
          {focusedLessonLabel(n)}
        </button>
        <button type="button" data-tu-press data-discuss style={secondaryButton} onClick={() => { void navigate(discussTo) }}>
          {UI.discussionButton}
        </button>
        {e.linkedQuest && (
          <button type="button" data-tu-press style={secondaryButton} onClick={() => { if (e.linkedQuest) void navigate(`/creator/quest/${encodeURIComponent(e.linkedQuest.questId)}`) }}>
            {UI.focusedOpen}
          </button>
        )}
      </div>
      {/* ההערה גלויה תמיד — לא נחשפת רק אחרי לחיצה (עיקרון 8) */}
      <p data-focused-note style={{ ...soft, margin: 0, display: 'flex', alignItems: 'flex-start', gap: 8, lineHeight: 1.5 }}>
        <span style={{ color: T.muted, display: 'inline-flex', marginTop: 3 }}><Icon name="info" size={18} /></span>
        {FOCUSED_LESSON_WHOLE_CLASS_NOTE}
        {e.linkedQuest ? ` ${UI.focusedExists(e.linkedQuest.title)}` : ''}
      </p>
    </li>
  )
}

export default function CommonErrors({ errors, head, discussHref }: { errors: CommonErrorRow[]; head: SubmissionHead; discussHref: (errorId: string) => string }) {
  return (
    <div data-common-errors style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 style={{ margin: 0, fontFamily: FONT, fontSize: 17, fontWeight: 800, color: T.text, lineHeight: 1.5 }}>{UI.actionsIntro(errors.length)}</h2>
      <ul style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {errors.map((e) => <ErrorCard key={e.id} e={e} head={head} discussTo={discussHref(e.id)} />)}
      </ul>
    </div>
  )
}
