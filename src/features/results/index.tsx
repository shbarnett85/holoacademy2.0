/* תוצאות — מקום זמני: מעטפת + מצב ריק. הסוכן שבונה את מסך התוצאות מחליף את הקובץ הזה (ברירת המחדל מיוצאת,
   והקומפוננטה קוראת את הכתובת בעצמה: /results, /results/:submissionId, /results/:submissionId/student/:studentId). */
import { RESULTS_TEXT } from '../../shared/lib/findingsNarrative'
import { EmptyState, ScreenShell } from '../teacherUi'

export default function Results() {
  return (
    <ScreenShell active="results" title={RESULTS_TEXT.listTitle} breadcrumb={[{ label: 'תוצאות' }]}>
      <EmptyState title={RESULTS_TEXT.emptyList} ctaLabel={RESULTS_TEXT.emptyListCta} ctaTo="/creator/library" />
    </ScreenShell>
  )
}
