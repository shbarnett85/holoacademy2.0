/* "במבט אחד" — הטאב הראשון במצב "כל הכיתה". שני גרפי עוגה זה לצד זה, שכל אחד עונה על שאלה אחת:
     מי סיים את ההדמיה?  (סיימו · באמצע · עוד לא התחילו — מספירת הסטטוסים שבראש המסך)
     כמה אתגרים הצליחו התלמידים שסיימו?  (ברוב · בחלק · במעט — view.successBands, מהליבה; הספים הם אלה של "לתשומת לב" ו"רוב הכיתה הצליחה")
   כל גרף: מקרא גלוי עם אייקון, מילה, "X מתוך Y" ואחוז בנוסף (teacherUi/DonutChart). אין hover ואין אנימציה.
   מתחת לגרפים נשמר חריץ לכרטיס הסיכום המילולי של ד״ר הולו: <div data-ai-summary-slot />. כשאין בו תוכן הוא לא תופס מקום
   (בלי ריווח, בלי גובה) — הכרטיס שיוכנס אליו מביא איתו marginTop משלו. */
import type { ReactNode } from 'react'
import { DONUT_TEXT, donutAriaLabel } from '../../shared/lib/findingsNarrative'
import type { ClassSubmissionView } from '../../shared/types/resultsV1'
import { DonutChart } from '../teacherUi'
import type { DonutEmpty, DonutSlice } from '../teacherUi'
import { card, panelTitle } from './styles'

/* קוטר הטבעת: קטן מברירת המחדל כדי שהמקרא ישב לצד הגרף (ולא מתחתיו) ברוחב של מסך 1366, וייוותר מקום מתחת לסיכום המילולי */
const DONUT_SIZE = 120
const COMPLETION_ID = 'glance-completion-title'
const SUCCESS_ID = 'glance-success-title'

function DonutCard({ id, name, title, children }: { id: string; name: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} data-donut-card={name}
      style={{ ...card, flex: '1 1 300px', minWidth: 0, padding: '8px 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <h3 id={id} style={panelTitle}>{title}</h3>
      {children}
    </section>
  )
}

export default function Glance({ view }: { view: ClassSubmissionView }) {
  const counts = view.head.counts
  const bands = view.successBands

  /* מי סיים — אותם אייקונים כמו ברשימת התלמידים (סימון וי · חצי · עיגול) */
  const completion: DonutSlice[] = [
    { key: 'completed', label: DONUT_TEXT.completionFinished, count: counts.completed, tone: 'positive', icon: 'check' },
    { key: 'inProgress', label: DONUT_TEXT.completionMiddle, count: counts.inProgress, tone: 'accent', icon: 'half' },
    { key: 'notStarted', label: DONUT_TEXT.completionNotStarted, count: counts.notStarted, tone: 'neutral', icon: 'circle' },
  ]
  const completionEmpty: DonutEmpty | null = counts.total === 0 ? { title: DONUT_TEXT.completionEmpty, whatNext: DONUT_TEXT.completionEmptyNext } : null

  /* כמה אתגרים הצליחו — "במעט" מסומן באייקון התראה ובטון תשומת לב (לא באדום: האדום שמור לטעות) */
  const success: DonutSlice[] = [
    { key: 'high', label: DONUT_TEXT.bandHigh, count: bands.high, tone: 'positive', icon: 'check' },
    { key: 'mid', label: DONUT_TEXT.bandMid, count: bands.mid, tone: 'accent', icon: 'half' },
    { key: 'low', label: DONUT_TEXT.bandLow, count: bands.low, tone: 'attention', icon: 'alert' },
  ]
  const successEmpty: DonutEmpty | null = bands.enough ? null
    : view.challenges.length === 0
      ? { title: DONUT_TEXT.successNoChallenges, whatNext: DONUT_TEXT.successNoChallengesNext }
      : { title: DONUT_TEXT.successEmpty, whatNext: DONUT_TEXT.successEmptyNext }

  return (
    <div data-glance style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <DonutCard id={COMPLETION_ID} name="completion" title={DONUT_TEXT.completionTitle}>
          <DonutChart ariaLabel={donutAriaLabel(DONUT_TEXT.completionTitle, completion, counts.total)} slices={completion} total={counts.total}
            centerNumber={String(counts.total)} centerLabel={DONUT_TEXT.centerStudents} size={DONUT_SIZE} empty={completionEmpty} />
        </DonutCard>
        <DonutCard id={SUCCESS_ID} name="success" title={DONUT_TEXT.successTitle}>
          <DonutChart ariaLabel={donutAriaLabel(DONUT_TEXT.successTitle, success, bands.basis)} slices={success} total={bands.basis}
            centerNumber={String(bands.basis)} centerLabel={DONUT_TEXT.centerFinished} size={DONUT_SIZE} empty={successEmpty} />
        </DonutCard>
      </div>
      <div data-ai-summary-area style={{ minWidth: 0 }}>
        <div data-ai-summary-slot />
      </div>
    </div>
  )
}
