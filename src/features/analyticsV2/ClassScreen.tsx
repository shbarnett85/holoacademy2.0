/* מסך הכיתה (/analytics/class/:classId): שורת הטאבים העליונה = מקצועות.
   מחנך: "סקירה" ואז כל מקצוע. מורה מקצועי: מקצועו פעיל, שאר המקצועות באפור עם מנעול והסבר גלוי.
   בתוך מקצוע: שורה שנייה — סיכום | טעויות נפוצות | התקדמות | תלמידים. */
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Roster } from '../../shared/types/analyticsV2'
import { EmptyState, TabBar, tabPanelProps } from '../teacherUi'
import type { BreadcrumbItem, TabItem } from '../teacherUi'
import ClassOverviewTab from './ClassOverviewTab'
import { useRootCrumb, useV2Env } from './context'
import { L, LOCKED_SUBJECT_TEXT, SUB_IDS, SUB_LABEL, titles, type SubId } from './labels'
import { AnalyticsShell } from './Shell'
import SubjectArea from './SubjectArea'
import { bySubjectOrder } from './subjectOrder'
import { ErrorBlock, LoadingBlock, SubjectOrb } from './ui'
import { useV2 } from './v2api'

export default function ClassScreen({ classId }: { classId: string }) {
  const env = useV2Env()
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const root = useRootCrumb()
  const { data, loading, error, reload } = useV2<Roster>('/roster', env.params)
  const cls = data?.classes.find((c) => c.id === classId)

  if (!cls) {
    return (
      <AnalyticsShell title={titles.classGeneric} breadcrumb={[root]}>
        {loading && !data ? <LoadingBlock /> : error ? <ErrorBlock message={error} onRetry={reload} backTo={env.href('/analytics')} /> : (
          <EmptyState title={L.classNotFound} ctaLabel={L.backToEntry} ctaTo={env.href('/analytics')} />
        )}
      </AnalyticsShell>
    )
  }

  const homeroom = env.lens === 'homeroom'
  const open = bySubjectOrder(cls.subjects)
  const lockedList = bySubjectOrder(cls.lockedSubjects)
  const all = bySubjectOrder([...open, ...lockedList])
  const tabParam = sp.get('tab')
  const tab = tabParam === 'overview' && homeroom ? 'overview' : open.some((s) => s.code === tabParam) ? (tabParam as string) : homeroom ? 'overview' : open[0]?.code ?? 'overview'
  const subParam = sp.get('sub')
  const sub: SubId = (SUB_IDS as readonly string[]).includes(subParam ?? '') ? (subParam as SubId) : 'summary'

  const classHref = (q: Record<string, string | null>): string => env.href(`/analytics/class/${classId}`, q)
  const subject = all.find((s) => s.code === tab)

  const crumbs: BreadcrumbItem[] = [root]
  if (tab === 'overview' || !subject) crumbs.push({ label: `כיתה ${cls.name}` })
  else {
    crumbs.push(
      { label: `כיתה ${cls.name}`, to: classHref({}) },
      { label: subject.nameHe, to: classHref({ tab: subject.code, sub: 'summary' }) },
      { label: SUB_LABEL[sub] },
    )
  }

  const items: TabItem[] = [
    ...(homeroom ? [{ id: 'overview', label: L.overviewTab }] : []),
    ...all.map((s) => ({
      id: s.code, label: s.nameHe, icon: <SubjectOrb code={s.code} size={24} />,
      locked: !open.some((o) => o.code === s.code), lockedReason: LOCKED_SUBJECT_TEXT,
    })),
  ]

  return (
    <AnalyticsShell title={titles.class(cls.name)} breadcrumb={crumbs}>
      <TabBar ariaLabel="מקצועות הכיתה" idPrefix="cls" withPanels value={tab} items={items}
        onChange={(id) => navigate(classHref({ tab: id, sub: id === 'overview' ? null : sub }))} />
      <div {...tabPanelProps('cls', tab)} style={{ display: 'flex', flexDirection: 'column', gap: 10, outline: 'none' }}>
        {tab === 'overview' || !subject
          ? (homeroom ? <ClassOverviewTab classId={classId} className={cls.name} /> : <EmptyState title={L.noAccess} />)
          : <SubjectArea classId={classId} subject={subject} sub={sub} onSub={(id) => navigate(classHref({ tab: subject.code, sub: id }))} />}
      </div>
    </AnalyticsShell>
  )
}
