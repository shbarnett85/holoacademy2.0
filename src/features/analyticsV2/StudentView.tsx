import type { StudentOverview, SubjectPanel } from '../../shared/types/analyticsV2'
import { LevelChart } from './LevelChart'
import { BehaviorVectors, ContentVectors } from './VectorBars'
import { Button, Chip, ErrorBox, FindingCard, FindingList, Loading, Notice, Panel, SubjectGreyChip } from './ui'
import { C } from './tokens'
import { useV2, type V2Params } from './v2api'

type Visible = Extract<SubjectPanel, { access: 'visible' }>

const POSITION: Record<'above' | 'within' | 'below', { text: string; icon: string; tone: 'positive' | 'neutral' | 'attention' }> = {
  above: { text: 'מעל הרצועה המיועדת לשכבה', icon: '▲', tone: 'positive' },
  within: { text: 'בתוך הרצועה המיועדת לשכבה', icon: '●', tone: 'neutral' },
  below: { text: 'מתחת לרצועה המיועדת לשכבה', icon: '▼', tone: 'attention' },
}

function SubjectCard({ p, ageNormCaveat }: { p: Visible; ageNormCaveat: string }) {
  const pos = p.positionVsNorm ? POSITION[p.positionVsNorm] : null
  return (
    <Panel title={p.subject.nameHe} id={`subj-${p.subject.code}`}
      aside={pos ? <Chip tone={pos.tone} title={ageNormCaveat}><span aria-hidden>{pos.icon}</span>{pos.text}</Chip> : undefined}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 30, fontWeight: 800, color: C.accentBright }}>{p.currentLevel ?? '—'}</span>
        <span style={{ fontSize: 11.5, color: C.muted }}>רמה נוכחית · <bdi>{p.sessionsCount}</bdi> הדמיות · רצועת שכבה {p.ageNorm.gradeLabel}: <bdi dir="ltr">{p.ageNorm.low}–{p.ageNorm.high}</bdi></span>
      </div>
      <LevelChart series={p.levelSeries} ageNorm={p.ageNorm} label={`מסלול הרמה ב${p.subject.nameHe}`} />
      <p style={{ fontSize: 11, color: C.muted, margin: '4px 0 12px', lineHeight: 1.6 }}>{ageNormCaveat}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <ContentVectors vectors={p.contentVectors} subjectLevel={p.currentLevel} />
        <BehaviorVectors vectors={p.behaviorVectors} />
        <div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>אירועים ודפוסים</div>
          <FindingList findings={p.findings} />
        </div>
      </div>
    </Panel>
  )
}

/* מבט תלמיד: כל המקצועות זה לצד זה (מחנך) / המקצוע שלי + אפורים (מורה מקצועי). בלי ציון מאוחד. */
export default function StudentView({ studentId, params, onBriefing, onFeedback }: { studentId: string; params: V2Params; onBriefing: () => void; onFeedback: () => void }) {
  const { data, loading, error } = useV2<StudentOverview>(`/student/${studentId}`, params)
  if (loading && !data) return <Loading />
  if (error) return <ErrorBox message={error} />
  if (!data) return null
  const visible = data.panels.filter((p): p is Visible => p.access === 'visible')
  const greyed = data.panels.filter((p) => p.access === 'greyed')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 22, color: C.text }}>{data.student.displayName}</h2>
        <Chip tone="accent">כיתה {data.student.className}</Chip>
        <div style={{ flex: 1 }} />
        <Button onClick={onBriefing}>📄 תדריך לישיבה פדגוגית</Button>
        <Button onClick={onFeedback}>👤 תצוגת תלמיד/ה</Button>
      </div>

      {data.crossSubject.length > 0 && (
        <Panel title="התרעה מוקדמת — כמה מקצועות במקביל" style={{ borderColor: C.warn }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.crossSubject.map((f) => <FindingCard key={f.id} finding={f} />)}
          </div>
        </Panel>
      )}

      {visible.length >= 2 && <Notice tone="accent">{data.caveats.crossSubject}</Notice>}
      <Notice>{data.caveats.trend}</Notice>

      {greyed.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: C.muted }}>מקצועות נוספים של התלמיד/ה (ללא גישה):</span>
          {greyed.map((p) => <SubjectGreyChip key={p.subject.code} name={p.subject.nameHe} />)}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 540px))', gap: 14, alignItems: 'start', justifyContent: 'start' }}>
        {visible.map((p) => <SubjectCard key={p.subject.code} p={p} ageNormCaveat={data.caveats.ageNorm} />)}
      </div>
    </div>
  )
}
