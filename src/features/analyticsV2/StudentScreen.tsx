/* עמוד התלמיד/ה (/analytics/student/:studentId?class=&tab=): אותם טאבי מקצוע כמו במסך הכיתה.
   מחנך: "סקירה" ואז כל מקצוע. מורה מקצועי: מקצועו פעיל, שאר המקצועות באפור עם מנעול והסבר גלוי.
   בתוך מקצוע: מסלול הרמה עם הטווח המיועד והסתייגות, תחומים, טעויות נפוצות, ואירועים/דפוסים (מדווחים בלבד). */
import { useNavigate, useSearchParams } from 'react-router-dom'
import { countNb, EMPTY_TEXT, HOW_WE_CALC, numberRange } from '../../shared/lib/findingsNarrative'
import { subjectName } from '../../shared/lib/subjects'
import type { Finding, StudentOverview, SubjectPanel } from '../../shared/types/analyticsV2'
import { bySubjectOrderOf, EmptyState, FONT, Icon, RADIUS, Sentence, SubjectLinkButton, T, TabBar, tabPanelProps } from '../teacherUi'
import type { BreadcrumbItem, TabItem, Tone } from '../teacherUi'
import { BandSwatch, LevelChart, LineSwatch } from './charts'
import { useRootCrumb, useV2Env } from './context'
import { L, LOCKED_SUBJECT_TEXT, titles } from './labels'
import { overviewTabItem } from './tabs'
import { AnalyticsShell } from './Shell'
import { ActionButton, AreasText, Card, CardTitle, ErrorBlock, LoadingBlock, Note, PositionWord, SubjectOrb, ToneMark, TrendWord } from './ui'
import { useV2 } from './v2api'

type Visible = Extract<SubjectPanel, { access: 'visible' }>
/* אותו סדר מקצועות כמו בכל המערכת (teacherUi/subjectOrder) */
const byOrder = (ps: SubjectPanel[]): SubjectPanel[] => bySubjectOrderOf(ps, (p) => p.subject.code)

const reportedOf = (p: Visible): Finding[] => p.findings.filter((f) => f.status === 'reported')
const attentionOf = (p: Visible): number => reportedOf(p).filter((f) => f.tone === 'attention').length
const eventsText = (n: number): string => (n === 1 ? 'אירוע אחד לתשומת לב' : `${n} אירועים לתשומת לב`)

/* שורות "איך חישבנו?" לאירועים המדווחים: שם הדפוס + המספרים שמאחוריו (הפירוט הסטטיסטי נשאר מאחורי הכפתור) */
function EvidenceBlock({ findings, subject }: { findings: Finding[]; subject?: string }) {
  const rep = findings.filter((f) => f.status === 'reported')
  if (rep.length === 0) return null
  return (
    <>
      {rep.map((f) => f.status === 'reported' && (
        <p key={f.id} style={{ margin: 0 }}>
          <strong>{HOW_WE_CALC.itemLabel(f.kind, subject ?? (f.subjectCode ? subjectName(f.subjectCode) : null))}: </strong>
          {HOW_WE_CALC.evidenceLines(f.n, f.pAdjusted, f.effectSize, f.window.start, f.window.end).join(' · ')}
        </p>
      ))}
    </>
  )
}

function SubjectTab({ p, caveat, trendCaveat, firstName }: { p: Visible; caveat: string; trendCaveat: string; firstName: string }) {
  const reported = reportedOf(p)
  const noAreas = p.areas.strong.length === 0 && p.areas.challenging.length === 0
  return (
    <div className="v2-cols3" style={{ display: 'grid', gridTemplateColumns: '3fr 2fr 2fr', gap: 12, alignItems: 'start' }}>
      <Card label="מסלול הרמה">
        <CardTitle aside={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <PositionWord position={p.positionVsNorm} text={p.positionText} size={16} />
          <TrendWord trend={p.trend} text={p.trendText} size={16} />
        </span>}>
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8 }}>{L.level} <strong style={{ fontSize: 24 }}>{p.currentLevel ?? '—'}</strong></span>
        </CardTitle>
        {p.levelSeries.length === 0 ? (
          <Note style={{ fontSize: 16 }}>{EMPTY_TEXT.noProgress}</Note>
        ) : (
          <>
            <LevelChart series={p.levelSeries} ageNorm={p.ageNorm} height={230} label={`${L.level} של ${firstName} ב${p.subject.nameHe} לפי חודש`} />
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center', margin: '4px 0' }}>
              <LineSwatch index={0}>{L.level} בכל חודש</LineSwatch>
              <BandSwatch>הטווח המיועד לשכבה {p.ageNorm.gradeLabel}: {numberRange(p.ageNorm.low, p.ageNorm.high)}</BandSwatch>
            </div>
          </>
        )}
        <Note>{caveat}</Note>
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
        <Card label="תחומים">
          <CardTitle>תחומים</CardTitle>
          {noAreas ? <Note style={{ fontSize: 16 }}>{EMPTY_TEXT.noAreas}</Note> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 16, lineHeight: 1.5, color: T.text }}>
              <div style={{ display: 'flex', gap: 8 }}><span style={{ color: T.good, marginTop: 3, display: 'inline-flex' }}><Icon name="check" size={18} strokeWidth={2.6} /></span><span><strong>{L.strongAreas}: </strong><AreasText items={p.areas.strong} empty={L.noArea} /></span></div>
              <div style={{ display: 'flex', gap: 8 }}><span style={{ color: T.warn, marginTop: 3, display: 'inline-flex' }}><Icon name="alert" size={18} /></span><span><strong>{L.challengingAreas}: </strong><AreasText items={p.areas.challenging} empty={L.noArea} /></span></div>
            </div>
          )}
        </Card>
        <Card label={L.commonErrors}>
          <CardTitle>{L.commonErrors}</CardTitle>
          {p.commonErrors.length === 0 ? <Note style={{ fontSize: 16 }}>{EMPTY_TEXT.noCommonErrors}</Note> : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {p.commonErrors.map((e) => (
                <li key={e.id} style={{ fontSize: 16, lineHeight: 1.45, color: T.text }}>
                  <strong>{e.title}</strong>
                  <div style={{ fontSize: 16, color: T.textSoft }}>{countNb(e.hits, e.exposures)} שאלות</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card label="אירועים ודפוסים">
        <CardTitle>אירועים ודפוסים</CardTitle>
        {reported.length === 0 ? <Note style={{ fontSize: 16 }}>{EMPTY_TEXT.noFindings}</Note> : (
          <>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {reported.map((f) => (
                <li key={f.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 16, lineHeight: 1.55, color: T.text }}>
                  <span style={{ marginTop: 3, display: 'inline-flex' }}><ToneMark tone={f.tone as Tone} size={18} /></span>
                  <span>{f.text}</span>
                </li>
              ))}
            </ul>
            <Note style={{ marginTop: 8 }}>{trendCaveat}</Note>
          </>
        )}
      </Card>
    </div>
  )
}

const th = { textAlign: 'start', padding: '6px 12px', fontSize: 16, fontWeight: 700, color: T.textSoft, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' } as const
const td = { padding: '6px 12px', borderBottom: `1px solid ${T.border}`, verticalAlign: 'middle', fontSize: 16, lineHeight: 1.4, color: T.text } as const

function OverviewTab({ data, subjectHref, crossText }: { data: StudentOverview; subjectHref: (code: string) => string; crossText: string }) {
  const visible = byOrder(data.panels).filter((p): p is Visible => p.access === 'visible')
  const cross = data.crossSubject.filter((f) => f.status === 'reported')
  return (
    <>
      {cross.length > 0 && (
        <Card label="התרעה מוקדמת" style={{ borderInlineStart: `6px solid ${T.warn}`, padding: '8px 16px' }}>
          {cross.map((f) => (
            <p key={f.id} style={{ margin: 0, display: 'flex', gap: 10, fontSize: 16, lineHeight: 1.5, color: T.text }}>
              <span style={{ marginTop: 3, display: 'inline-flex' }}><ToneMark tone="attention" size={18} /></span>
              <span><strong>התרעה מוקדמת: </strong>{f.text}</span>
            </p>
          ))}
        </Card>
      )}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: RADIUS.md, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FONT }}>
          <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>סקירת התלמיד/ה לפי מקצוע</caption>
          <thead>
            <tr>
              <th scope="col" style={th}>{L.tableSubject}</th>
              <th scope="col" style={th}>{L.level}</th>
              <th scope="col" style={th}>{L.tablePosition}</th>
              <th scope="col" style={th}>{L.trend}</th>
              <th scope="col" style={th}>{L.strongAreas}</th>
              <th scope="col" style={th}>{L.challengingAreas}</th>
              <th scope="col" style={th}>{L.attentionShort}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => {
              const att = attentionOf(p)
              return (
                <tr key={p.subject.code}>
                  <th scope="row" style={{ ...td, fontWeight: 400, padding: '2px 8px' }}>
                    <SubjectLinkButton code={p.subject.code} label={p.subject.nameHe} to={subjectHref(p.subject.code)} />
                  </th>
                  <td style={{ ...td, fontSize: 18, fontWeight: 800 }}>{p.currentLevel ?? '—'}</td>
                  <td style={td}><PositionWord position={p.positionVsNorm} text={p.positionText} size={16} /></td>
                  <td style={td}><TrendWord trend={p.trend} text={p.trendText} size={16} /></td>
                  <td style={td}><AreasText items={p.areas.strong} /></td>
                  <td style={td}><AreasText items={p.areas.challenging} /></td>
                  <td style={td}>
                    {att > 0
                      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}><ToneMark tone="attention" size={18} />{eventsText(att)}</span>
                      : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: T.textSoft }}><ToneMark tone="positive" size={18} />{L.none}</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Note>{crossText}</Note>
    </>
  )
}

export default function StudentScreen({ studentId }: { studentId: string }) {
  const env = useV2Env()
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const root = useRootCrumb()
  const { data, loading, error, reload } = useV2<StudentOverview>(`/student/${studentId}`, env.params)

  if (!data || loading) {
    return (
      <AnalyticsShell title={titles.studentGeneric} breadcrumb={[root]}>
        {error ? <ErrorBlock message={error} onRetry={reload} backTo={env.href('/analytics')} /> : <LoadingBlock />}
      </AnalyticsShell>
    )
  }

  /* אין עדיין נתונים על התלמיד/ה (למשל ספק שעוד לא מחזיק נתונים): אומרים מה קורה ומה יקרה, בלי טאבים ריקים */
  if (data.panels.length === 0) {
    return (
      <AnalyticsShell title={titles.studentGeneric} breadcrumb={[root]}>
        <EmptyState title={L.noStudentData} whatNext={L.noStudentDataNext} ctaLabel={L.backToEntry} ctaTo={env.href('/analytics')} />
      </AnalyticsShell>
    )
  }

  const st = data.student
  const firstName = st.displayName.split(' ')[0]
  const classId = sp.get('class') || st.classId
  const full = data.access === 'full'
  const panels = byOrder(data.panels)
  const openCodes = panels.filter((p) => p.access === 'visible').map((p) => p.subject.code as string)
  const tabParam = sp.get('tab')
  const tab = tabParam === 'overview' && full ? 'overview' : openCodes.includes(tabParam ?? '') ? (tabParam as string) : full ? 'overview' : openCodes[0] ?? 'overview'
  const active = panels.find((p): p is Visible => p.access === 'visible' && p.subject.code === tab)

  const classHref = (q: Record<string, string | null> = {}): string => env.href(`/analytics/class/${classId}`, q)
  const studentHref = (q: Record<string, string | null>): string => env.href(`/analytics/student/${studentId}`, { class: classId, ...q })
  const studentsSubject = active?.subject.code ?? openCodes[0]

  const crumbs: BreadcrumbItem[] = [root, { label: `כיתה ${st.className}`, to: classHref() }]
  if (active) crumbs.push({ label: active.subject.nameHe, to: classHref({ tab: active.subject.code, sub: 'summary' }) })
  if (studentsSubject) crumbs.push({ label: L.subTabs.students, to: classHref({ tab: studentsSubject, sub: 'students' }) })
  crumbs.push({ label: st.displayName })

  const items: TabItem[] = [
    /* "סקירה" קיימת אצל כולם: למחנך/ת פעילה, ואצל מורה מקצועי באפור עם מנעול והסיבה */
    overviewTabItem(full),
    ...panels.map((p) => ({ id: p.subject.code, label: p.subject.nameHe, icon: <SubjectOrb code={p.subject.code} size={24} />, locked: p.access === 'greyed', lockedReason: LOCKED_SUBJECT_TEXT })),
  ]

  const allReported = data.panels.flatMap((p) => (p.access === 'visible' ? p.findings : [])).concat(data.crossSubject)
  const hasAttention = allReported.some((f) => f.status === 'reported' && f.tone === 'attention')
  const evidenceFor = active ? active.findings : data.crossSubject.concat(data.panels.flatMap((p) => (p.access === 'visible' ? p.findings : [])))

  return (
    <AnalyticsShell title={titles.student(firstName)} breadcrumb={crumbs} howExtra={<EvidenceBlock findings={evidenceFor} subject={active?.subject.nameHe} />}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 480px', minWidth: 0 }}><Sentence tone={hasAttention ? 'attention' : 'neutral'}>{data.summary}</Sentence></div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <ActionButton kind="primary" onClick={() => env.openBriefing('student', studentId)} >{L.briefing}</ActionButton>
          <ActionButton onClick={() => env.openFeedback(studentId)}>{L.studentPreview}</ActionButton>
        </div>
      </div>
      <TabBar ariaLabel="מקצועות התלמיד/ה" idPrefix="stu" withPanels value={tab} items={items}
        onChange={(id) => navigate(studentHref({ tab: id }))} />
      <div {...tabPanelProps('stu', tab)} style={{ display: 'flex', flexDirection: 'column', gap: 10, outline: 'none' }}>
        {active
          ? <SubjectTab p={active} caveat={data.caveats.ageNorm} trendCaveat={data.caveats.trend} firstName={firstName} />
          : full ? <OverviewTab data={data} crossText={data.caveats.crossSubject} subjectHref={(code) => studentHref({ tab: code })} /> : <EmptyState title={L.noAccess} />}
      </div>
    </AnalyticsShell>
  )
}
