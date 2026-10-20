/* מסך הדמיה אחת: "איך הכיתה הצליחה בהדמיה?" / "איך התלמיד/ה הצליח/ה בהדמיה?" — מתג גדול [כל הכיתה] [לפי תלמיד].
   אותו מבנה ואותם מקומות בשני המצבים:
     שורת ראש (שם, כיתה, תאריך, מצב השלמה, המתג)
     משפט הסיכום
     ימין: חלונית התלמידים (שלוש קבוצות / רשימה לפי א-ב עם הקודם והבא)   שמאל: טאבים — האתגרים · (טעויות נפוצות · תרגול חזרה | זמן בשקפים)
     "איך חישבנו?"
   הכתובת היא מקור האמת: /results/:id (כיתה) · /results/:id/student/:studentId (תלמיד/ה). */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { ClassRoster, StudentList } from './People'
import ReviewPractice from './ReviewPractice'
import { useLens, useResultsData } from './resultsApi'
import SlidesTable from './SlidesTable'
import StudentChallenges from './StudentChallenges'
import { card, panelTitle, scrollArea } from './styles'
import { UI } from './text'
import { useWideScreen } from './useFillHeight'

const enc = encodeURIComponent
const PREFIX = 'res'

/* החלונית הגדולה (שמאל): שורת טאבים (אם יש יותר מאחד) + אזור גלילה פנימי */
function MainPanel({ tabs, active, onTab, singleTitle, children }: { tabs: TabItem[]; active: string; onTab: (id: string) => void; singleTitle: string; children: React.ReactNode }) {
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

/* שתי עמודות בגובה קבוע: grid עם שורה אחת בגובה המכולה, כך שכל עמודה גוללת בתוך עצמה.
   במסך צר (העמוד גולל) — עמודה אחת. */
function Columns({ wide, busy, side, main }: { wide: boolean; busy: boolean; side: React.ReactNode; main: React.ReactNode }) {
  const col = { minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' as const }
  return (
    <div data-columns aria-busy={busy}
      style={{
        flex: wide ? 1 : '0 0 auto', minHeight: 0, display: 'grid', gap: 16, opacity: busy ? 0.6 : 1,
        gridTemplateColumns: wide ? 'minmax(320px, 500px) minmax(0, 1fr)' : 'minmax(0, 1fr)',
        gridTemplateRows: wide ? 'minmax(0, 1fr)' : undefined,
      }}>
      <div style={col}>{side}</div>
      <div style={col}>{main}</div>
    </div>
  )
}

export default function SubmissionScreen({ submissionId, studentId }: { submissionId: string; studentId: string | null }) {
  const navigate = useNavigate()
  const wide = useWideScreen()
  const { apiQs, link } = useLens()
  const mode: Mode = studentId ? 'student' : 'class'
  const [tab, setTab] = useState('challenges')

  const classQ = useResultsData<ClassSubmissionView>('classView', mode === 'class' ? `/api/results/submission/${enc(submissionId)}${apiQs}` : null)
  const studentQ = useResultsData<StudentSubmissionView>('studentView', studentId ? `/api/results/submission/${enc(submissionId)}/student/${enc(studentId)}${apiQs}` : null)

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
  /* בשגיאה אין שם הדמיה/כיתה להציג — רק "תוצאות" (והכפתור "חזרה לתוצאות" בגוף המסך) */
  const shownCrumbs: BreadcrumbItem[] = active.error ? [{ label: UI.crumbResults }] : crumbs

  const title = mode === 'class' ? RESULTS_TEXT.classQuestion : RESULTS_TEXT.studentQuestion

  /* ── תוכן לפי מצב ── */
  let body: React.ReactNode
  if (active.error) {
    body = <ErrorPanel error={active.error} scope="submission" backTo={toList} onRetry={active.reload} />
  } else if (mode === 'class' && classQ.data) {
    const d = classQ.data
    const tabs: TabItem[] = [{ id: 'challenges', label: UI.tabChallenges }]
    if (d.commonErrors.length > 0) tabs.push({ id: 'errors', label: UI.tabErrors })
    if (d.review.weakCount > 0) tabs.push({ id: 'review', label: UI.tabReview })
    const shownTab = tabs.some((t) => t.id === tab) ? tab : 'challenges'
    body = (
      <>
        <HeadStrip head={d.head} mode={mode} onMode={switchMode} />
        <Sentence>{d.summary}</Sentence>
        <Columns wide={wide} busy={classQ.loading}
          side={<ClassRoster roster={d.roster} onOpen={toStudent} />}
          main={(
            <MainPanel tabs={tabs} active={shownTab} onTab={setTab} singleTitle={UI.challengesTitle}>
              {shownTab === 'challenges' && <ClassChallenges view={d} />}
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
        <HeadStrip head={d.head} mode={mode} onMode={switchMode} />
        <Sentence>{d.summary}</Sentence>
        <Columns wide={wide} busy={studentQ.loading}
          side={<StudentList roster={d.roster} currentId={d.student.id} prevId={d.prevId} nextId={d.nextId} onOpen={toStudent} />}
          main={(
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
    <ScreenShell active="results" title={title} breadcrumb={shownCrumbs}>
      <FillArea minHeight={540}>{body}</FillArea>
    </ScreenShell>
  )
}
