/* מסך המנהל/ת (/analytics?tab=overview|grades|subjects|errors): אותה שפה חזותית, אגרגטים בלבד.
   אין שם או מזהה תלמיד, אין השוואה בין מורים; תא קטן מדי נשאר מוסתר עם מנעול והסבר, בלי שום מספר. */
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { AdminCell, AdminOverview } from '../../shared/types/analyticsV2'
import { EmptyState, FONT, Icon, ModeToggle, RADIUS, Sentence, T, TabBar, tabPanelProps } from '../teacherUi'
import type { BreadcrumbItem } from '../teacherUi'
import { LineSwatch, MultiLineChart } from './charts'
import { useRootCrumb, useV2Env } from './context'
import { L, titles } from './labels'
import { AnalyticsShell } from './Shell'
import { Card, CardTitle, CountBar, ErrorBlock, HowCalc, LoadingBlock, Note, PositionWord, SubjectLabel, SubjectOrb, Tag, TrendWord } from './ui'
import { useV2 } from './v2api'

const TAB_IDS = ['overview', 'grades', 'subjects', 'errors'] as const
type TabId = (typeof TAB_IDS)[number]
const TAB_LABEL: Record<TabId, string> = { overview: L.adminTabs.overview, grades: L.adminTabs.grades, subjects: L.adminTabs.subjects, errors: L.adminTabs.misconceptions }

const th = { textAlign: 'start', padding: '8px 12px', fontSize: 14, fontWeight: 700, color: T.textSoft, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' } as const
const td = { padding: '6px 12px', borderBottom: `1px solid ${T.border}`, verticalAlign: 'middle', fontSize: 16, lineHeight: 1.4, color: T.text } as const

const PRIVACY = 'תצוגת הנהלה: תמונות רחבות ומגמות בלבד, בלי שמות או נתונים של תלמידים בודדים ובלי השוואה בין מורים.'

type Shown = Extract<AdminCell, { status: 'shown' }>

/* שורת תא: מקצוע (או שכבה) · רמה · מיקום · מגמה. תא מוסתר: מנעול + ההסבר מהחוזה, בלי מספרים */
function CellLine({ cell, lead }: { cell: AdminCell; lead: 'subject' | 'grade' }) {
  const label = lead === 'subject' ? <SubjectLabel subject={cell.subject} size={16} /> : <strong style={{ fontSize: 16 }}>שכבה {cell.gradeLabel}</strong>
  if (cell.status === 'hidden') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', minHeight: 48 }}>
        <span style={{ flex: '0 0 150px' }}>{label}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 16, color: T.textSoft }}><Icon name="lock" size={18} />{cell.text}</span>
      </div>
    )
  }
  const c: Shown = cell
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', minHeight: 48 }}>
      <span style={{ flex: '0 0 150px' }}>{label}</span>
      <strong style={{ fontSize: 20, minWidth: 44 }}>{c.avgLevel}</strong>
      <PositionWord position={c.position} text={c.positionText} size={16} />
      <TrendWord trend={c.trend} text={c.trendText} size={16} />
    </div>
  )
}

function OverviewTab({ d }: { d: AdminOverview }) {
  const [first, ...rest] = d.highlights
  return (
    <>
      {first && <Sentence tone="neutral">{first}</Sentence>}
      <Card label="מה בולט">
        <CardTitle>מה בולט</CardTitle>
        {rest.length === 0 ? <Note style={{ fontSize: 16 }}>עוד אין מספיק נתונים כדי להדגיש משהו. הם יופיעו כאן כשתלמידים ישחקו בהדמיות.</Note> : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rest.map((t, i) => (
              <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 17, lineHeight: 1.55, color: T.text }}>
                <span style={{ color: T.accent, marginTop: 3, display: 'inline-flex' }}><Icon name="info" size={20} /></span>{t}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {d.gradeRows.length > 0 && (
        <Card label="בכל שכבה">
          <CardTitle aside={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{d.grades.map((g) => <Tag key={g.grade}>שכבה {g.gradeLabel}: {g.classCount} כיתות · {g.studentCount} תלמידים</Tag>)}</div>}>בכל שכבה</CardTitle>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {d.gradeRows.map((g) => (
              <li key={g.grade} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 16, lineHeight: 1.55, color: T.text }}>
                <span style={{ color: T.accent, marginTop: 3, display: 'inline-flex' }}><Icon name="info" size={18} /></span>{g.summary}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Note>{PRIVACY}{d.hiddenCells > 0 ? ` ${d.hiddenCells === 1 ? 'תא אחד מוסתר' : `${d.hiddenCells} תאים מוסתרים`} כי יש בו מעט תלמידים מדי.` : ''}</Note>
      <Note>{d.caveats.ageNorm}</Note>
    </>
  )
}

function GradesTab({ d }: { d: AdminOverview }) {
  if (d.gradeRows.length === 0) return <EmptyState title="עוד אין נתונים על השכבות." whatNext="הם יופיעו כאן כשתלמידים ישחקו בהדמיות." />
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 560px), 1fr))', gap: 12, alignItems: 'start' }}>
        {d.gradeRows.map((g) => (
          <Card key={g.grade} label={`שכבה ${g.gradeLabel}`}>
            <CardTitle aside={<Tag>{g.classCount} כיתות · {g.studentCount} תלמידים</Tag>}>שכבה {g.gradeLabel}</CardTitle>
            <p style={{ margin: '0 0 6px', fontSize: 16, lineHeight: 1.5, color: T.text }}>{g.summary}</p>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {g.cells.map((c, i) => <div key={c.subject.code} style={{ borderTop: i === 0 ? `1px solid ${T.border}` : 'none', borderBottom: `1px solid ${T.border}` }}><CellLine cell={c} lead="subject" /></div>)}
            </div>
          </Card>
        ))}
      </div>
      <Note>{d.caveats.crossSubject}</Note>
    </>
  )
}

function SubjectsTab({ d }: { d: AdminOverview }) {
  const [picked, setPicked] = useState<string | null>(null)
  if (d.subjectRows.length === 0) return <EmptyState title="עוד אין נתונים על המקצועות." whatNext="הם יופיעו כאן כשתלמידים ישחקו בהדמיות." />
  const row = d.subjectRows.find((r) => r.subject.code === picked) ?? d.subjectRows[0]
  const lines = d.progress.filter((p) => p.subject.code === row.subject.code && p.series.length > 0)
    .map((p) => ({ key: String(p.grade), name: `שכבה ${d.grades.find((g) => g.grade === p.grade)?.gradeLabel ?? p.grade}`, points: p.series.map((x) => ({ date: x.date, v: x.avgLevel })) }))
  return (
    <>
      <div style={{ alignSelf: 'flex-start', maxWidth: '100%' }}>
        <ModeToggle ariaLabel="בחירת מקצוע" value={row.subject.code} onChange={setPicked}
          options={d.subjectRows.map((r) => ({ id: r.subject.code, label: r.subject.nameHe, icon: <SubjectOrb code={r.subject.code} size={24} /> }))} />
      </div>
      <Sentence tone="neutral">{row.summary}</Sentence>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 480px), 1fr))', gap: 12, alignItems: 'start' }}>
        <Card label="לפי שכבה">
          <CardTitle>לפי שכבה</CardTitle>
          {row.cells.map((c, i) => <div key={i} style={{ borderTop: i === 0 ? `1px solid ${T.border}` : 'none', borderBottom: `1px solid ${T.border}` }}><CellLine cell={c} lead="grade" /></div>)}
          <Note style={{ marginTop: 8 }}>{d.caveats.crossSubject}</Note>
        </Card>
        <Card label="התקדמות לאורך השנה">
          <CardTitle>התקדמות לאורך השנה</CardTitle>
          {lines.length === 0 ? <Note style={{ fontSize: 16 }}>עוד אין מספיק נתונים להצגת התקדמות. הגרף יופיע כאן כשיצטברו מספיק הדמיות.</Note> : (
            <>
              <MultiLineChart lines={lines} height={230} label={`התקדמות ממוצעת ב${row.subject.nameHe} לפי שכבה`} />
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 4 }}>
                {lines.map((l, i) => <LineSwatch key={l.key} index={i}>{l.name}: {l.points[l.points.length - 1].v}</LineSwatch>)}
              </div>
            </>
          )}
        </Card>
      </div>
    </>
  )
}

function ErrorsTab({ d, notice }: { d: AdminOverview; notice: string | null }) {
  const [picked, setPicked] = useState<number | null>(null)
  if (d.misconceptions.length === 0) return <EmptyState title="עוד אין טעויות נפוצות לדווח עליהן." whatNext="הן יופיעו כאן כשיצטברו מספיק תשובות של תלמידים." />
  const withData = d.grades.filter((g) => d.misconceptions.some((m) => m.grade === g.grade))
  const grade = withData.find((g) => g.grade === picked) ?? withData[0]
  const rows = d.misconceptions.filter((m) => m.grade === grade.grade)
  const hasSample = rows.some((m) => m.curriculumGoal?.mappingStatus === 'sample')
  return (
    <>
      <div style={{ alignSelf: 'flex-start' }}>
        <ModeToggle ariaLabel="בחירת שכבה" value={String(grade.grade)} onChange={(id) => setPicked(Number(id))}
          options={withData.map((g) => ({ id: String(g.grade), label: `שכבה ${g.gradeLabel}` }))} />
      </div>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: RADIUS.md, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FONT }}>
          <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>טעויות נפוצות בשכבה {grade.gradeLabel}</caption>
          <thead>
            <tr>
              <th scope="col" style={th}>{L.commonErrors}</th>
              <th scope="col" style={th}>{L.tableSubject}</th>
              <th scope="col" style={th}>כמה תלמידים</th>
              <th scope="col" style={th}>{L.curriculumGoal}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={`${m.id}-${m.grade}`}>
                <th scope="row" style={{ ...td, fontWeight: 800, fontSize: 16 }}>{m.titleHe}</th>
                <td style={td}><SubjectLabel subject={m.subject} size={16} /></td>
                <td style={{ ...td, minWidth: 280 }}><CountBar done={m.studentsShowing} total={m.studentsExposed} text={m.countText} /></td>
                <td style={td}>
                  {m.curriculumGoal ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {m.curriculumGoal.title}
                      {m.curriculumGoal.mappingStatus === 'sample' && <Tag>{L.sampleMapping}</Tag>}
                    </span>
                  ) : <span style={{ color: T.muted }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasSample && notice && <Note>{notice}</Note>}
    </>
  )
}

export default function AdminScreen() {
  const env = useV2Env()
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const root = useRootCrumb()
  const { data, loading, error, reload } = useV2<AdminOverview>('/admin/overview', env.params)
  const tabParam = sp.get('tab')
  const tab: TabId = (TAB_IDS as readonly string[]).includes(tabParam ?? '') ? (tabParam as TabId) : 'overview'

  const crumbs: BreadcrumbItem[] = [root]
  if (data) {
    /* ספק שעוד לא מחזיק נתונים מחזיר מקף כשם: מציגים שם כללי */
    const school = data.school.name.replace('—', '').trim() || L.schoolFallback
    if (tab === 'overview') crumbs.push({ label: school })
    else crumbs.push({ label: school, to: env.href('/analytics', { tab: 'overview' }) }, { label: TAB_LABEL[tab] })
  }

  return (
    <AnalyticsShell title={titles.admin} breadcrumb={data ? crumbs : [{ label: L.analytics }]}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <TabBar ariaLabel="חלקי תמונת בית הספר" idPrefix="adm" withPanels value={tab}
          items={TAB_IDS.map((id) => ({ id, label: TAB_LABEL[id] }))} onChange={(id) => navigate(env.href('/analytics', { tab: id }))} />
        <div style={{ flex: 1 }} />
        <HowCalc />
      </div>
      <div {...tabPanelProps('adm', tab)} style={{ display: 'flex', flexDirection: 'column', gap: 10, outline: 'none' }}>
        {loading && !data ? <LoadingBlock /> : error ? <ErrorBlock message={error} onRetry={reload} /> : data && (
          <>
            {tab === 'overview' && <OverviewTab d={data} />}
            {tab === 'grades' && <GradesTab d={data} />}
            {tab === 'subjects' && <SubjectsTab d={data} />}
            {tab === 'errors' && <ErrorsTab d={data} notice={env.cfg.curriculumNotice} />}
          </>
        )}
      </div>
    </AnalyticsShell>
  )
}
