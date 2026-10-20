/* מסך הדמיה אחת: "איך הכיתה הצליחה בהדמיה?" / "איך התלמיד/ה הצליח/ה בהדמיה?" — מתג גדול [כל הכיתה] [לפי תלמיד].
   אותו מבנה ואותם מקומות בשני המצבים:
     שורת ראש (שם, כיתה, תאריך, מצב השלמה, המתג) — לכל הרוחב
     במסך רחב, שתי עמודות בגובה שנשאר (כל רשימה גוללת בתוך החלונית שלה, ורק כשהיא ארוכה):
       ימין (העיקר):  משפט הסיכום · טאבים — האתגרים · (יעדי הלמידה · טעויות נפוצות · תרגול חזרה | זמן בשקפים)
       שמאל:  חלונית התלמידים (שלוש קבוצות / רשימה לפי א-ב עם הקודם והבא) — לאורך כל הגובה, מתחת למתג
     "איך חישבנו?"
   במסך צר (העמוד גולל): ראש, משפט הסיכום, הטאבים, חלונית התלמידים — בעמודה אחת.
   הכתובת היא מקור האמת: /results/:id (כיתה) · /results/:id/student/:studentId (תלמיד/ה). ?tab= פותח טאב מסוים. */
import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { RESULTS_TEXT } from '../../shared/lib/findingsNarrative'
import type { ClassSubmissionView, StudentSubmissionView } from '../../shared/types/resultsV1'
import { FONT, HowWeCalc, ScreenShell, Sentence, T, TabBar, tabPanelProps } from '../teacherUi'
import type { BreadcrumbItem, TabItem } from '../teacherUi'
import ClassChallenges from './ClassChallenges'
import CommonErrors from './CommonErrors'
import ErrorPanel from './ErrorPanel'
import FillArea from './FillArea'
import HeadStrip from './HeadStrip'
import type { Mode } from './HeadStrip'
import { firstStudentId } from './logic'
import Objectives from './Objectives'
import { ClassRoster, StudentList } from './People'
import ReviewPractice from './ReviewPractice'
import { useLens, useResultsData } from './resultsApi'
import ResultsLensSwitcher from './ResultsLensSwitcher'
import SlidesTable from './SlidesTable'
import StudentChallenges from './StudentChallenges'
import { card, panelTitle, scrollArea } from './styles'
import { UI } from './text'
import { useWideScreen } from './useFillHeight'

const enc = encodeURIComponent
const PREFIX = 'res'
/* גובה מינימלי של אזור התוכן. מתחתיו העמוד עצמו מתחיל לגלול; בגובה הזה כל חלונית גוללת בתוך עצמה */
const FILL_MIN = 460

/* החלונית הגדולה (העיקר): שורת טאבים (אם יש יותר מאחד) + אזור גלילה פנימי */
function MainPanel({ tabs, active, onTab, singleTitle, children }: { tabs: TabItem[]; active: string; onTab: (id: string) => void; singleTitle: string; children: ReactNode }) {
  const several = tabs.length > 1
  return (
    <section style={{ ...card, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 14px 8px', flex: '0 0 auto' }}>
        {several
          ? <TabBar items={tabs} value={active} onChange={onTab} ariaLabel={UI.partsLabel} idPrefix={PREFIX} withPanels />
          : <h2 style={panelTitle}>{singleTitle}</h2>}
      </div>
      <div {...(several ? tabPanelProps(PREFIX, active) : { role: 'region' as const, 'aria-label': singleTitle, tabIndex: 0 })}
        style={{ ...scrollArea, padding: '0 14px 14px' }}>
        {children}
      </div>
    </section>
  )
}

interface LayoutProps {
  wide: boolean
  busy: boolean
  head: ReactNode
  sentence: ReactNode
  people: ReactNode
  panel: ReactNode
}

/* הפריסה, כרשת עם אזורים בעלי שם. הראש לכל הרוחב; מתחתיו, במסך רחב, עמודה ראשית (משפט + טאבים) ועמודה צרה של התלמידים שנמתחת עד התחתית
   (כך 25 שמות נראים בלי לגלול הרבה, והמשפט נשאר מיד אחרי הראש). שורת הטאבים לוקחת את הגובה שנשאר, כך שכל רשימה גוללת בתוך החלונית שלה
   ולא העמוד. סדר ה-DOM הוא סדר הקריאה (ראש, משפט, טאבים, תלמידים) — גם במסך רחב (ימין לשמאל) וגם בצר (למעלה למטה), כך שגם סדר המקלדת תואם. */
function Layout({ wide, busy, head, sentence, people, panel }: LayoutProps) {
  const cell = (area: string, extra?: CSSProperties): CSSProperties => ({ gridArea: area, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', ...extra })
  return (
    <div data-columns aria-busy={busy}
      style={{
        flex: wide ? 1 : '0 0 auto', minHeight: 0, display: 'grid', gap: wide ? '12px 16px' : 12, opacity: busy ? 0.6 : 1,
        gridTemplateColumns: wide ? 'minmax(0, 1fr) minmax(320px, 500px)' : 'minmax(0, 1fr)',
        gridTemplateRows: wide ? 'auto auto minmax(0, 1fr)' : undefined,
        gridTemplateAreas: wide ? '"head head" "sentence people" "panel people"' : '"head" "sentence" "panel" "people"',
      }}>
      <div style={cell('head')}>{head}</div>
      <div style={cell('sentence')}>{sentence}</div>
      <div style={cell('panel')}>{panel}</div>
      <div style={cell('people')}>{people}</div>
    </div>
  )
}

export default function SubmissionScreen({ submissionId, studentId }: { submissionId: string; studentId: string | null }) {
  const navigate = useNavigate()
  const wide = useWideScreen()
  const { isGuest, scope, apiQs, link } = useLens()
  const [sp] = useSearchParams()
  const mode: Mode = studentId ? 'student' : 'class'
  /* ?tab= פותח ישר טאב מסוים (למשל "תרגול חזרה" מההצעה של ד״ר הולו). טאב שלא קיים בשליחה הזאת → "האתגרים" */
  const [tab, setTab] = useState(() => sp.get('tab') ?? 'challenges')

  const classQ = useResultsData<ClassSubmissionView>('classView', mode === 'class' ? `/api/results/submission/${enc(submissionId)}${apiQs}` : null, scope)
  const studentQ = useResultsData<StudentSubmissionView>('studentView', studentId ? `/api/results/submission/${enc(submissionId)}/student/${enc(studentId)}${apiQs}` : null, scope)

  const toList = link('/results')
  const toClass = link(`/results/${enc(submissionId)}`)
  const toStudent = (id: string): void => { void navigate(link(`/results/${enc(submissionId)}/student/${enc(id)}`)) }
  const switchMode = (m: Mode): void => {
    if (m === 'class') { void navigate(toClass); return }
    const first = studentId ?? (classQ.data ? firstStudentId(classQ.data.roster) : null)
    if (first) toStudent(first)
  }

  const active = mode === 'class' ? classQ : studentQ
  const head = (mode === 'class' ? classQ.data : studentQ.data)?.head ?? classQ.data?.head ?? studentQ.data?.head ?? null
  const studentName = studentQ.data?.student.id === studentId ? studentQ.data.student.name : classQ.data ? [...classQ.data.roster.completed, ...classQ.data.roster.inProgress, ...classQ.data.roster.notStarted].find((s) => s.id === studentId)?.name : undefined

  const crumbs: BreadcrumbItem[] = [
    { label: UI.crumbResults, to: toList },
    { label: head?.title ?? UI.crumbQuest, to: toClass },
    mode === 'class' ? { label: head ? UI.classWord(head.className) : UI.crumbClass } : { label: head ? UI.classWord(head.className) : UI.crumbClass, to: toClass },
  ]
  if (mode === 'student') crumbs.push({ label: studentName ?? UI.crumbStudent })
  /* בשגיאה אין שם הדמיה/כיתה להציג: "תוצאות" (קישור חזרה) › מה קרה. הכפתור "חזרה לתוצאות" בגוף המסך עושה אותו דבר */
  const shownCrumbs: BreadcrumbItem[] = active.error ? [{ label: UI.crumbResults, to: toList }, { label: UI.crumbError(active.error.status) }] : crumbs

  const title = mode === 'class' ? RESULTS_TEXT.classQuestion : RESULTS_TEXT.studentQuestion

  /* ── תוכן לפי מצב ── */
  let body: ReactNode
  if (active.error) {
    body = <ErrorPanel error={active.error} scope="submission" backTo={toList} onRetry={active.reload} />
  } else if (mode === 'class' && classQ.data) {
    const d = classQ.data
    const tabs: TabItem[] = [{ id: 'challenges', label: UI.tabChallenges }]
    if (d.objectives.length > 0) tabs.push({ id: 'objectives', label: UI.tabObjectives })
    if (d.commonErrors.length > 0) tabs.push({ id: 'errors', label: UI.tabErrors })
    if (d.review.weakCount > 0) tabs.push({ id: 'review', label: UI.tabReview })
    const shownTab = tabs.some((t) => t.id === tab) ? tab : 'challenges'
    body = (
      <>
        <Layout wide={wide} busy={classQ.loading}
          head={<HeadStrip head={d.head} mode={mode} onMode={switchMode} />}
          sentence={<Sentence>{d.summary}</Sentence>}
          people={<ClassRoster roster={d.roster} onOpen={toStudent} />}
          panel={(
            <MainPanel tabs={tabs} active={shownTab} onTab={setTab} singleTitle={UI.challengesTitle}>
              {shownTab === 'challenges' && <ClassChallenges view={d} />}
              {shownTab === 'objectives' && <Objectives objectives={d.objectives} onOpenStudent={toStudent} />}
              {shownTab === 'errors' && <CommonErrors errors={d.commonErrors} />}
              {shownTab === 'review' && <ReviewPractice questId={d.head.questId} submissionId={d.head.id} weakCount={d.review.weakCount} />}
            </MainPanel>
          )} />
        <HowWeCalc lines={d.howWeCalculated} />
      </>
    )
  } else if (mode === 'student' && studentQ.data && studentId) {
    const d = studentQ.data
    const tabs: TabItem[] = [{ id: 'challenges', label: UI.tabChallenges }]
    if (d.slides.length > 0) tabs.push({ id: 'slides', label: UI.tabSlides })
    const shownTab = tabs.some((t) => t.id === tab) ? tab : 'challenges'
    body = (
      <>
        <Layout wide={wide} busy={studentQ.loading}
          head={<HeadStrip head={d.head} mode={mode} onMode={switchMode} />}
          sentence={<Sentence>{d.summary}</Sentence>}
          people={<StudentList roster={d.roster} currentId={d.student.id} prevId={d.prevId} nextId={d.nextId} onOpen={toStudent} />}
          panel={(
            <MainPanel tabs={tabs} active={shownTab} onTab={setTab} singleTitle={UI.challengesTitle}>
              {shownTab === 'challenges' && <StudentChallenges view={d} />}
              {shownTab === 'slides' && <SlidesTable slides={d.slides} />}
            </MainPanel>
          )} />
        <HowWeCalc lines={d.howWeCalculated} />
      </>
    )
  } else {
    body = (
      <>
        {head && <HeadStrip head={head} mode={mode} onMode={switchMode} />}
        <p role="status" style={{ margin: 0, fontFamily: FONT, fontSize: 17, color: T.textSoft }}>{UI.loading}</p>
      </>
    )
  }

  return (
    <ScreenShell active="results" title={title} breadcrumb={shownCrumbs} lensSwitcher={isGuest ? <ResultsLensSwitcher /> : undefined}>
      <FillArea minHeight={FILL_MIN}>{body}</FillArea>
    </ScreenShell>
  )
}
