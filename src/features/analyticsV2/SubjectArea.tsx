/* מקצוע בכיתה: שורת הטאבים השנייה (סיכום | טעויות נפוצות | התקדמות | תלמידים) + תוכן הטאב.
   נתוני כל ארבעת הטאבים מגיעים בקריאה אחת (GET /class/:id/subject/:code), לכן מעבר בין טאבים אינו טוען מחדש. */
import { TabBar, tabPanelProps } from '../teacherUi'
import type { ClassSubjectView, SubjectRef } from '../../shared/types/analyticsV2'
import { useV2Env } from './context'
import { L, SUB_IDS, SUB_LABEL, type SubId } from './labels'
import { ErrorsPanel, ProgressPanel, StudentsPanel, SummaryPanel } from './subjectPanels'
import { ActionButton, ErrorBlock, LoadingBlock } from './ui'
import { useV2 } from './v2api'

export default function SubjectArea({ classId, subject, sub, onSub }: { classId: string; subject: SubjectRef; sub: SubId; onSub: (id: SubId) => void }) {
  const env = useV2Env()
  const { data, loading, error, reload } = useV2<ClassSubjectView>(`/class/${classId}/subject/${subject.code}`, env.params)
  /* נתונים של מקצוע קודם נשארים בזיכרון בזמן טעינה — לא מציגים אותם תחת טאב של מקצוע אחר */
  const fresh = data && !loading ? data : null

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <TabBar variant="secondary" ariaLabel={`תצוגות של ${subject.nameHe}`} idPrefix="sub" withPanels value={sub}
          items={SUB_IDS.map((id) => ({ id, label: SUB_LABEL[id] }))} onChange={(id) => onSub(id as SubId)} />
        <div style={{ flex: 1 }} />
        <ActionButton onClick={() => env.openBriefing('class', classId)}>{L.briefingClass}</ActionButton>
      </div>
      <div {...tabPanelProps('sub', sub)} style={{ display: 'flex', flexDirection: 'column', gap: 10, outline: 'none' }}>
        {error ? <ErrorBlock message={error} onRetry={reload} /> : !fresh ? <LoadingBlock /> : (
          <>
            {sub === 'summary' && <SummaryPanel d={fresh} />}
            {sub === 'errors' && <ErrorsPanel d={fresh} classId={classId} />}
            {sub === 'progress' && <ProgressPanel d={fresh} />}
            {sub === 'students' && <StudentsPanel d={fresh} classId={classId} />}
          </>
        )}
      </div>
    </>
  )
}
