/* הטאב "מה עושים עם זה" (מצב "כל הכיתה"): הפעולות שנגזרות מהתוצאות — שיעור ממוקד ושאלה לדיון לכל טעות נפוצה, ומתחתיהן תרגול חזרה לכל הכיתה.
   אין כאן ניתוח חדש: הכול נשען על הטעויות הנפוצות ועל התחומים החלשים שכבר חושבו בשרת. כשאין מה לעשות — אומרים במילים למה ומתי זה ישתנה. */
import type { ClassSubmissionView } from '../../shared/types/resultsV1'
import { EmptyState, FONT, T } from '../teacherUi'
import CommonErrors from './CommonErrors'
import ReviewPractice from './ReviewPractice'
import { soft } from './styles'
import { UI } from './text'

export default function Actions({ view, discussHref }: { view: ClassSubmissionView; discussHref: (errorId: string) => string }) {
  const hasErrors = view.commonErrors.length > 0
  const hasReview = view.review.weakCount > 0
  if (!hasErrors && !hasReview) return <EmptyState title={UI.actionsEmpty} whatNext={UI.actionsEmptyNext} />
  return (
    <div data-actions style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {hasErrors
        ? <CommonErrors errors={view.commonErrors} head={view.head} discussHref={discussHref} />
        : <p style={{ ...soft, margin: 0 }}>{UI.actionsEmpty} {UI.actionsEmptyNext}</p>}
      <section aria-labelledby="actions-review" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h2 id="actions-review" style={{ margin: 0, fontFamily: FONT, fontSize: 17, fontWeight: 800, color: T.text, lineHeight: 1.5 }}>{UI.reviewSection}</h2>
        {hasReview
          ? <ReviewPractice questId={view.head.questId} submissionId={view.head.id} weakCount={view.review.weakCount} />
          : <p style={{ ...soft, margin: 0 }}>{UI.reviewEmpty} {UI.reviewEmptyNext}</p>}
      </section>
    </div>
  )
}
