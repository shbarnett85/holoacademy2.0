/* מסך הדמיה אחת: "איך הכיתה הצליחה בהדמיה?" / "איך התלמיד/ה הצליח/ה בהדמיה?" — מתג גדול [כל הכיתה] [לפי תלמיד].
   אותו מבנה ואותם מקומות בשני המצבים, ובמסך 1366×768 הכול נכנס בלי גלילה:
     פס ראש אחד (שם, כיתה, תאריך, מצב השלמה, המתג) — לכל הרוחב
     משפט הסיכום (שורה אחת) — לכל הרוחב; במצב "לפי תלמיד" עם הקודם/הבא בקצה השורה
     מתחת, שתי עמודות בגובה שנשאר:
       ימין (העיקר):  טאבים — האתגרים · יעדי הלמידה · טעויות נפוצות · תרגול חזרה  (במצב תלמיד: האתגרים · זמן בשקפים)
       שמאל:  חלונית התלמידים — רשת צפופה של שמות (שלוש קבוצות / כל הכיתה לפי א-ב)
   סט הטאבים קבוע בכל שליחה: טאב בלי נתונים נשאר במקומו ומסביר במילים למה ריק ומה יקרה (עיקרון 9) — טאבים לא מופיעים ונעלמים.
   "איך חישבנו?" הוא כפתור אחד בשורת הכותרת (חריץ של ScreenShell). במסך צר (העמוד גולל): ראש, משפט, טאבים, תלמידים — בעמודה אחת.
   הכתובת היא מקור האמת: /results/:id (כיתה) · /results/:id/student/:studentId (תלמיד/ה). ?tab= פותח טאב מסוים. */
import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { howWeCalcResultsLines, RESULTS_TEXT } from '../../shared/lib/findingsNarrative'
import type { ClassSubmissionView, StudentSubmissionView } from '../../shared/types/resultsV1'
import { EmptyState, FONT, ScreenShell, Sentence, T, TabBar, tabPanelProps } from '../teacherUi'
import type { BreadcrumbItem, TabItem } from '../teacherUi'
import ClassChallenges from './ClassChallenges'
import CommonErrors from './CommonErrors'
import ErrorPanel from './ErrorPanel'
import FillArea from './FillArea'
import HeadStrip from './HeadStrip'
import type { Mode } from './HeadStrip'
import { CLASS_TAB_IDS, firstStudentId, resolveTab, STUDENT_TAB_IDS, studentIndex } from './logic'
import Objectives from './Objectives'
import { ClassRoster, PrevNext, StudentList } from './People'
import ReviewPractice from './ReviewPractice'
import { useLens, useResultsData } from './resultsApi'
import ResultsLensSwitcher from './ResultsLensSwitcher'
import SlidesTable from './SlidesTable'
import StudentChallenges from './StudentChallenges'
import { card, scrollArea } from './styles'
import { UI } from './text'
import { useWideScreen } from './useFillHeight'

const enc = encodeURIComponent
const PREFIX = 'res'
/* גובה מינימלי של אזור התוכן. מתחתיו העמוד עצמו מתחיל לגלול; בגובה הזה כל חלונית גוללת בתוך עצמה */
const FILL_MIN = 440

/* סט הטאבים — קבוע לכל שליחה (המזהים ב-logic.ts: CLASS_TAB_IDS / STUDENT_TAB_IDS) */
const CLASS_TABS: TabItem[] = [
  { id: 'challenges', label: UI.tabChallenges },
  { id: 'objectives', label: UI.tabObjectives },
  { id: 'errors', label: UI.tabErrors },
  { id: 'review', label: UI.tabReview },
]
const STUDENT_TABS: TabItem[] = [
  { id: 'challenges', label: UI.tabChallenges },
  { id: 'slides', label: UI.tabSlides },
]

/* החלונית הגדולה (העיקר): שורת טאבים + אזור גלילה פנימי (שגולל רק כשהתוכן ארוך מהגובה שנשאר) */
function MainPanel({ tabs, active, onTab, children }: { tabs: TabItem[]; active: string; onTab: (id: string) => void; children: ReactNode }) {
  return (
    <section style={{ ...card, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '6px 12px 4px', flex: '0 0 auto' }}>
        <TabBar items={tabs} value={active} onChange={onTab} ariaLabel={UI.partsLabel} idPrefix={PREFIX} withPanels />
      </div>
      <div {...tabPanelProps(PREFIX, active)} style={{ ...scrollArea, padding: '2px 12px 10px' }}>
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

/* הפריסה, כרשת עם אזורים בעלי שם. הראש והמשפט לכל הרוחב; מתחתיהם, במסך רחב, עמודה ראשית (טאבים) ועמודה של התלמידים, שתיהן בגובה שנשאר.
   סדר ה-DOM הוא סדר הקריאה (ראש, משפט, טאבים, תלמידים) — גם במסך רחב (ימין לשמאל) וגם בצר (למעלה למטה), כך שגם סדר המקלדת תואם. */
function Layout({ wide, busy, head, sentence, people, panel }: LayoutProps) {
  const cell = (area: string, extra?: CSSProperties): CSSProperties => ({ gridArea: area, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', ...extra })
  return (
    <div data-columns aria-busy={busy}
      style={{
        flex: wide ? 1 : '0 0 auto', minHeight: 0, display: 'grid', gap: wide ? '8px 14px' : 8, opacity: busy ? 0.6 : 1,
        gridTemplateColumns: wide ? 'minmax(0, 1fr) minmax(470px, 46%)' : 'minmax(0, 1fr)',
        gridTemplateRows: wide ? 'auto auto minmax(0, 1fr)' : undefined,
        gridTemplateAreas: wide ? '"head head" "sentence sentence" "panel people"' : '"head" "sentence" "panel" "people"',
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
  /* ?tab= פותח ישר טאב מסוים (למשל "תרגול חזרה" מההצעה של ד״ר הולו). טאב שלא קיים → "האתגרים" */
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
  let howLines: readonly string[] | undefined
  if (active.error) {
    body = <ErrorPanel error={active.error} scope="submission" backTo={toList} onRetry={active.reload} />
  } else if (mode === 'class' && classQ.data) {
    const d = classQ.data
    howLines = d.howWeCalculated
    const shownTab = resolveTab(tab, CLASS_TAB_IDS)
    body = (
      <Layout wide={wide} busy={classQ.loading}
        head={<HeadStrip head={d.head} mode={mode} onMode={switchMode} />}
        sentence={<Sentence compact>{d.summary}</Sentence>}
        people={<ClassRoster roster={d.roster} onOpen={toStudent} />}
        panel={(
          <MainPanel tabs={CLASS_TABS} active={shownTab} onTab={setTab}>
            {shownTab === 'challenges' && <ClassChallenges view={d} />}
            {shownTab === 'objectives' && (d.objectives.length > 0
              ? <Objectives objectives={d.objectives} onOpenStudent={toStudent} />
              : <EmptyState title={UI.objectivesEmpty} whatNext={UI.objectivesEmptyNext} />)}
            {shownTab === 'errors' && (d.commonErrors.length > 0
              ? <CommonErrors errors={d.commonErrors} />
              : <EmptyState title={RESULTS_TEXT.noCommonErrors} whatNext={UI.errorsEmptyNext} />)}
            {shownTab === 'review' && (d.review.weakCount > 0
              ? <ReviewPractice questId={d.head.questId} submissionId={d.head.id} weakCount={d.review.weakCount} />
              : <EmptyState title={UI.reviewEmpty} whatNext={UI.reviewEmptyNext} />)}
          </MainPanel>
        )} />
    )
  } else if (mode === 'student' && studentQ.data && studentId) {
    const d = studentQ.data
    howLines = d.howWeCalculated
    const shownTab = resolveTab(tab, STUDENT_TAB_IDS)
    const at = studentIndex(d.roster, d.student.id)
const position = at >= 0 ? UI.studentPosition(at + 1, d.roster.length) : ''
    body = (
      <Layout wide={wide} busy={studentQ.loading}
        head={<HeadStrip head={d.head} mode={mode} onMode={switchMode} />}
        sentence={<Sentence compact aside={<PrevNext prevId={d.prevId} nextId={d.nextId} position={position} onOpen={toStudent} />}>{d.summary}</Sentence>}
        people={<StudentList roster={d.roster} currentId={d.student.id} onOpen={toStudent} />}
        panel={(
          <MainPanel tabs={STUDENT_TABS} active={shownTab} onTab={setTab}>
            {shownTab === 'challenges' && <StudentChallenges view={d} />}
            {shownTab === 'slides' && <SlidesTable slides={d.slides} />}
          </MainPanel>
        )} />
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
    <ScreenShell active="results" title={title} breadcrumb={shownCrumbs} lensSwitcher={isGuest ? <ResultsLensSwitcher /> : undefined}
      howWeCalc={active.error ? undefined : { lines: howLines ?? howWeCalcResultsLines() }}>
      <FillArea minHeight={FILL_MIN}>{body}</FillArea>
    </ScreenShell>
  )
}
