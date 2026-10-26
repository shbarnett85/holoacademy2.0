/* "במבט אחד" — הטאב הראשון במצב "כל הכיתה". שני גרפי עוגה זה לצד זה, שכל אחד עונה על שאלה אחת:
     מי סיים את ההדמיה?  (סיימו · באמצע · עוד לא התחילו — מספירת הסטטוסים שבראש המסך)
     כמה אתגרים הצליחו התלמידים שסיימו?  (ברוב · בחלק · במעט — view.successBands, מהליבה; הספים הם אלה של "לתשומת לב" ו"רוב הכיתה הצליחה")
   כל גרף: מקרא גלוי עם אייקון, מילה, "X מתוך Y" ואחוז בנוסף (teacherUi/DonutChart). אין hover ואין אנימציה.
   מתחת לגרפים נשמר חריץ לכרטיס הסיכום המילולי של ד״ר הולו: <div data-ai-summary-slot />. כשאין בו תוכן הוא לא תופס מקום
   (בלי ריווח, בלי גובה) — הכרטיס שיוכנס אליו מביא איתו marginTop משלו. SubmissionScreen מכניס אליו (prop summary) את AiSummaryPanel במצב compact. */
import type { ReactNode } from 'react'
import { DONUT_TEXT, donutAriaLabel, donutBandsHelp } from '../../shared/lib/findingsNarrative'
import type { ClassSubmissionView, CommonErrorRow, StudentChip } from '../../shared/types/resultsV1'
import { DonutChart, FONT, Icon, MIN_TARGET, RADIUS, T } from '../teacherUi'
import type { DonutEmpty, DonutSlice } from '../teacherUi'
import { byName } from './logic'
import { card, panelTitle, secondaryButton } from './styles'
import { UI } from './text'

/* שורת העזר מתחת לגרף השני: 16px, צבע משני */
const bandsHelp = { margin: '6px 0 0', fontFamily: FONT, fontSize: 16, lineHeight: 1.35, color: T.textSoft, textAlign: 'center' } as const

/* קוטר הטבעת: קטן מברירת המחדל כדי שהמקרא ישב לצד הגרף (ולא מתחתיו) ברוחב של מסך 1366, וייוותר מקום מתחת לסיכום המילולי */
const DONUT_SIZE = 104
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

/* מי צריך תשומת לב, ולמה — שם + הסיבה במילים, ולחיצה פותחת את התוצאות של התלמיד/ה. עובדות בלבד (הכלל ב"איך חישבנו?"). */
/* עד ATTENTION_SHOWN שמות ברשימה; השאר מסומנים בחלונית התלמידים (אותו סימון) — כדי שהכרטיס לא ידחוף את הגרפים מחוץ למסך */
const ATTENTION_SHOWN = 3
function AttentionList({ chips, onOpen }: { chips: StudentChip[]; onOpen: (id: string) => void }) {
  const shown = chips.slice(0, ATTENTION_SHOWN)
  const more = chips.length - shown.length
  return (
    <section aria-labelledby="glance-attention" data-attention-list style={{ ...card, flex: '5 1 340px', minWidth: 0, padding: '6px 12px 8px', border: `1.5px solid ${T.warn}`, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <h3 id="glance-attention" style={{ ...panelTitle, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: T.warn, display: 'inline-flex' }}><Icon name="alert" size={20} /></span>
        {UI.attentionTitle}
      </h3>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {shown.map((s) => (
          <li key={s.id}>
            <button type="button" data-tu-press data-attention-student={s.id} onClick={() => onOpen(s.id)} aria-label={`${s.name}: ${s.reasonText ?? ''}. ${UI.attentionOpen}`}
              style={{ width: '100%', minHeight: MIN_TARGET, display: 'flex', alignItems: 'center', gap: 10, padding: '4px 10px', borderRadius: RADIUS.md, textAlign: 'start', cursor: 'pointer', fontFamily: FONT, fontSize: 16, color: T.text, background: T.surface, border: `1.5px solid ${T.controlBorder}` }}>
              <strong style={{ flex: '0 0 auto' }}>{s.name}</strong>
              <span style={{ flex: 1, minWidth: 0, color: T.textSoft, lineHeight: 1.4 }}>{s.reasonText}</span>
              <Icon name="chevLeft" size={18} />
            </button>
          </li>
        ))}
      </ul>
      {more > 0 && <p data-attention-more style={{ margin: 0, fontFamily: FONT, fontSize: 16, color: T.textSoft, lineHeight: 1.4 }}>{UI.attentionMore(more)}</p>}
    </section>
  )
}

/* הטעות הנפוצה ביותר + הפעולה המרכזית: שאלה לדיון בכיתה (שיעור ממוקד ועוד — בטאב "מה עושים עם זה" שלידו). עומדת ליד "מי צריך תשומת לב" באותה שורה */
function TopMistake({ e, onDiscuss }: { e: CommonErrorRow; onDiscuss: (errorId: string) => void }) {
  return (
    <section aria-labelledby="glance-mistake" data-glance-mistake style={{ ...card, flex: '3 1 230px', minWidth: 0, padding: '6px 12px 8px', border: `1.5px solid ${T.warn}`, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <h3 id="glance-mistake" style={{ ...panelTitle, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: T.warn, display: 'inline-flex' }}><Icon name="alert" size={20} /></span>
        {UI.glanceMistakeLabel}
      </h3>
      <p style={{ margin: 0, fontFamily: FONT, fontSize: 16, color: T.text, lineHeight: 1.4 }}>{e.sentence ?? e.title}</p>
      <div>
        <button type="button" data-tu-press data-discuss style={secondaryButton} onClick={() => onDiscuss(e.id)}>{UI.discussionButton}</button>
      </div>
    </section>
  )
}

export default function Glance({ view, summary, onOpenStudent, onDiscuss, onActions }: { view: ClassSubmissionView; /* כרטיס הסיכום המילולי (aiSummary), נכנס לחריץ מתחת לגרפים */ summary?: ReactNode; /* פתיחת תוצאות תלמיד/ה מרשימת "לתשומת לב" */ onOpenStudent?: (studentId: string) => void; /* שאלה לדיון על הטעות הנפוצה ביותר, ומעבר לטאב "מה עושים עם זה" */ onDiscuss?: (errorId: string) => void; onActions?: () => void }) {
  const topMistake = view.commonErrors[0] ?? null
  const attentionChips = [...view.roster.completed, ...view.roster.inProgress, ...view.roster.notStarted].filter((s) => s.attention).sort(byName)
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
      {((attentionChips.length > 0 && onOpenStudent) || (topMistake && onDiscuss && onActions)) && (
        <div data-glance-top style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
          {attentionChips.length > 0 && onOpenStudent && <AttentionList chips={attentionChips} onOpen={onOpenStudent} />}
          {topMistake && onDiscuss && onActions && <TopMistake e={topMistake} onDiscuss={onDiscuss} />}
        </div>
      )}
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
      {/* מה זה "ברוב" ו"במעט" — הספים גלויים על המסך, לא רק מאחורי "איך חישבנו?". שורה אחת לרוחב המסך (מתחת לשני הגרפים), כדי שהמסך ייכנס בגובה */}
      {!successEmpty && <p data-donut-bands-help style={bandsHelp}>{donutBandsHelp()}</p>}
      <div data-ai-summary-area style={{ minWidth: 0 }}>
        <div data-ai-summary-slot>{summary}</div>
      </div>
    </div>
  )
}
