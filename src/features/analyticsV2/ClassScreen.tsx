/* מסך הכיתה (/analytics/class/:classId): שורת הטאבים העליונה = מקצועות.
   מחנך: "סקירה" ואז כל מקצוע. מורה מקצועי: מקצועו פעיל, שאר המקצועות באפור עם מנעול והסבר גלוי.
   "מחנך" נקבע לפי הכיתה (RosterClass.isHomeroom), לא לפי העדשה: מורה יכול להיות מחנך בכיתה אחת ומורה מקצועי באחרת.
   בתוך מקצוע: שורה שנייה — סיכום | טעויות נפוצות | התקדמות | תלמידים. */
import { useNavigate, useSearchParams } from 'react-router-dom'
import { V2_CLIENT_TEXT } from '../../shared/lib/findingsNarrative'
import { EmptyState, TabBar, tabPanelProps } from '../teacherUi'
import type { BreadcrumbItem, TabItem } from '../teacherUi'
import ClassOverviewTab from './ClassOverviewTab'
import { useRootCrumb, useV2Env } from './context'
import { L, LOCKED_SUBJECT_TEXT, SUB_IDS, SUB_LABEL, titles, type SubId } from './labels'
import { AnalyticsShell } from './Shell'
import SubjectArea from './SubjectArea'
import { classSubjectAccess, overviewTabItem, resolveClassTab } from './tabs'
import { ErrorBlock, LoadingBlock, SubjectOrb } from './ui'

export default function ClassScreen({ classId }: { classId: string }) {
  const env = useV2Env()
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const root = useRootCrumb()
  const { data, loading, error, reload } = env.roster
  const cls = data?.classes.find((c) => c.id === classId)

  if (!cls) {
    return (
      <AnalyticsShell title={titles.classGeneric} breadcrumb={[root]}>
        {loading && !data ? <LoadingBlock /> : error ? <ErrorBlock error={error} onRetry={reload} backTo={env.href('/analytics')} /> : (
          <EmptyState title={V2_CLIENT_TEXT.classNotFound.title} whatNext={V2_CLIENT_TEXT.classNotFound.whatNext} ctaLabel={L.backToEntry} ctaTo={env.href('/analytics')} />
        )}
      </AnalyticsShell>
    )
  }

  /* המקצועות הפתוחים והנעולים נגזרים מההרשאה של הכיתה הזאת (לא מ-config.subjects, שהוא איחוד ההרשאות של כל הכיתות) */
  const { homeroom, open, all } = classSubjectAccess(cls)
  const sub: SubId = (SUB_IDS as readonly string[]).includes(sp.get('sub') ?? '') ? (sp.get('sub') as SubId) : 'summary'
  const { tab, kind } = resolveClassTab({ tabParam: sp.get('tab'), homeroom, openCodes: open.map((s) => s.code) })

  const classHref = (q: Record<string, string | null>): string => env.href(`/analytics/class/${classId}`, q)
  const subject = kind === 'subject' ? all.find((s) => s.code === tab) : undefined

  const crumbs: BreadcrumbItem[] = [root]
  if (!subject) crumbs.push({ label: `כיתה ${cls.name}` })
  else {
    crumbs.push(
      { label: `כיתה ${cls.name}`, to: classHref({}) },
      { label: subject.nameHe, to: classHref({ tab: subject.code, sub: 'summary' }) },
      { label: SUB_LABEL[sub] },
    )
  }

  const items: TabItem[] = [
    /* "סקירה" קיימת אצל כולם: למחנך/ת פעילה, ואצל מורה מקצועי באפור עם מנעול והסיבה (אותו מבנה לכל התפקידים) */
    overviewTabItem(homeroom),
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
        {kind === 'overview' && <ClassOverviewTab classId={classId} className={cls.name} />}
        {kind === 'none' && <EmptyState title={V2_CLIENT_TEXT.noOpenSubject.title} whatNext={V2_CLIENT_TEXT.noOpenSubject.whatNext} />}
        {subject && <SubjectArea classId={classId} subject={subject} sub={sub} onSub={(id) => navigate(classHref({ tab: subject.code, sub: id }))} />}
      </div>
    </AnalyticsShell>
  )
}
