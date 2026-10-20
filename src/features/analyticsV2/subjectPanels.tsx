/* ארבעת התכנים של מקצוע בכיתה. כולם צורכים את אותה תגובה (ClassSubjectView) ונכנסים במסך אחד ב-1366×768. */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EMPTY_TEXT, countNb, dateHe, numberRange } from '../../shared/lib/findingsNarrative'
import type { ClassSubjectView, MisconceptionRow } from '../../shared/types/analyticsV2'
import { FONT, Icon, MIN_TARGET, RADIUS, Sentence, T, TONE_META, VisuallyHidden } from '../teacherUi'
import type { Tone } from '../teacherUi'
import { BandSwatch, LevelChart, LineSwatch } from './charts'
import type { ChartMarker } from './charts'
import { useV2Env } from './context'
import { L } from './labels'
import { ActionButton, Card, CardTitle, CountBar, Note, Tag, ToneMark, TrendWord } from './ui'

const GRID_2 = 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))'

/* ── סיכום ── */
export function SummaryPanel({ d }: { d: ClassSubjectView }) {
  const tone: Tone = d.trend === 'declining' ? 'attention' : d.trend === 'improving' ? 'positive' : 'neutral'
  const rowOf = (id: string): MisconceptionRow | undefined => d.misconceptions.find((m) => m.id === id)
  return (
    <>
      <Sentence tone={tone}>{d.summary.headline}</Sentence>
      <div style={{ display: 'grid', gridTemplateColumns: GRID_2, gap: 12, alignItems: 'start' }}>
        <Card label={L.whatToTeach}>
          <CardTitle>{L.whatToTeach}</CardTitle>
          {d.summary.whatToTeach.length === 0 ? (
            <Note style={{ fontSize: 16 }}>{EMPTY_TEXT.noCommonErrors}</Note>
          ) : (
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {d.summary.whatToTeach.map((r) => {
                const row = rowOf(r.misconceptionId)
                return (
                  <li key={r.misconceptionId} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span aria-hidden="true" style={{ flex: '0 0 30px', height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 16, fontWeight: 800, color: T.text, border: `2px solid ${T.accent}`, background: T.accentFill }}>{r.rank}</span>
                    <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: T.text }}><VisuallyHidden>המלצה {r.rank}: </VisuallyHidden>{r.text}</p>
                      {row && row.status === 'reported' && <CountBar done={row.studentsShowing} total={row.studentsExposed} text={row.countText} />}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </Card>
        <Card label={L.whatHappened}>
          <CardTitle>{L.whatHappened}</CardTitle>
          {d.summary.recent.length === 0 ? (
            <Note style={{ fontSize: 16 }}>{EMPTY_TEXT.noRecent}</Note>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {d.summary.recent.map((t, i) => (
                <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 16, lineHeight: 1.55, color: T.text }}>
                  <span style={{ color: T.accent, marginTop: 3, display: 'inline-flex' }}><Icon name="info" size={18} /></span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}

/* ── טעויות נפוצות ── */
function ErrorCard({ m, classId }: { m: MisconceptionRow; classId: string }) {
  const env = useV2Env()
  const navigate = useNavigate()
  const [who, setWho] = useState(false)
  const [quest, setQuest] = useState(false)
  const reported = m.status === 'reported' && m.sharePct !== null
  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, lineHeight: 1.4, color: T.text }}>{m.titleHe}</h2>
      <Note>{m.descriptionHe}</Note>
      {reported
        ? <CountBar done={m.studentsShowing} total={m.studentsExposed} text={m.countText} />
        : <Note style={{ fontSize: 16, color: T.text }}>{m.countText}</Note>}
      {m.curriculumGoal && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 16, color: T.text, lineHeight: 1.5 }}>
          <span><strong>{L.curriculumGoal}:</strong> {m.curriculumGoal.title}</span>
          {m.curriculumGoal.mappingStatus === 'sample' && <Tag>{L.sampleMapping}</Tag>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <ActionButton kind="primary" expanded={quest} onClick={() => setQuest((o) => !o)}>{L.makeQuest}</ActionButton>
        {m.students.length > 0 && <ActionButton expanded={who} onClick={() => setWho((o) => !o)}>{who ? L.hideWho : `${L.whoShows} (${m.students.length})`}</ActionButton>}
      </div>
      {quest && (
        <div role="note" style={{ padding: '10px 14px', borderRadius: RADIUS.md, border: `1.5px dashed ${T.accent}`, fontSize: 16, lineHeight: 1.6, color: T.text }}>
          {m.linkedQuest ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span>{L.questExists} <strong>«{m.linkedQuest.title}»</strong></span>
              <ActionButton onClick={() => navigate('/creator/library')}>{L.openQuestInLibrary}</ActionButton>
            </div>
          ) : L.noQuestYet}
        </div>
      )}
      {who && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 6 }}>
          {m.students.map((s) => (
            <li key={s.id}>
              <Link to={env.href(`/analytics/student/${s.id}`, { class: classId, tab: m.subjectCode })} data-tu-press
                style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: MIN_TARGET, padding: '2px 10px', borderRadius: RADIUS.sm, border: `1.5px solid ${T.controlBorder}`, textDecoration: 'none', color: T.text, fontFamily: FONT }}>
                <span style={{ fontSize: 16, fontWeight: 800, textDecoration: 'underline', textUnderlineOffset: 3, color: T.accentStrong }}>{s.displayName}</span>
                <span style={{ fontSize: 16, color: T.textSoft }}>{countNb(s.hits, s.exposures)} שאלות</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function ErrorsPanel({ d, classId }: { d: ClassSubjectView; classId: string }) {
  const env = useV2Env()
  const reported = d.misconceptions.some((m) => m.status === 'reported')
  if (d.misconceptions.length === 0) {
    return (
      <>
        <Sentence compact>{d.tabSummaries.misconceptions}</Sentence>
        <Card><Note style={{ fontSize: 16 }}>{EMPTY_TEXT.noCommonErrors}</Note></Card>
      </>
    )
  }
  const hasSample = d.misconceptions.some((m) => m.curriculumGoal?.mappingStatus === 'sample')
  return (
    <>
      <Sentence compact tone={reported ? 'attention' : 'neutral'}>{d.tabSummaries.misconceptions}</Sentence>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 400px), 1fr))', gap: 12, alignItems: 'start' }}>
        {d.misconceptions.map((m) => <ErrorCard key={m.id} m={m} classId={classId} />)}
      </div>
      {hasSample && env.cfg.curriculumNotice && <Note>{env.cfg.curriculumNotice}</Note>}
    </>
  )
}

/* ── התקדמות ── */
export function ProgressPanel({ d }: { d: ClassSubjectView }) {
  const { series, events, ageNorm } = d.progress
  const progressTone: Tone = d.trend === 'declining' ? 'attention' : d.trend === 'improving' ? 'positive' : 'neutral'
  if (series.length === 0) {
    return (
      <>
        <Sentence compact>{d.tabSummaries.progress}</Sentence>
        <Card><Note style={{ fontSize: 16 }}>{EMPTY_TEXT.noProgress}</Note></Card>
      </>
    )
  }
  const markers: ChartMarker[] = events.map((e, i) => ({ n: i + 1, date: e.date, tone: e.tone }))
  return (
    <>
    <Sentence compact tone={progressTone}>{d.tabSummaries.progress}</Sentence>
    <Card>
      <CardTitle aside={<TrendWord trend={d.trend} text={`מגמת הכיתה: ${d.trendText}`} size={16} />}>התקדמות הכיתה לאורך הזמן</CardTitle>
      <LevelChart series={series} ageNorm={ageNorm} markers={markers} height={events.length ? 236 : 220} label={`${L.level} ממוצע של הכיתה ב${d.subject.nameHe} לפי חודש`} />
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center', margin: '4px 0 8px' }}>
        <LineSwatch index={0}>{L.chartLegendClass}</LineSwatch>
        <BandSwatch>הטווח המיועד לשכבה {ageNorm.gradeLabel}: {numberRange(ageNorm.low, ageNorm.high)}</BandSwatch>
      </div>
      {events.length === 0 ? (
        <Note style={{ fontSize: 16 }}>{EMPTY_TEXT.noRecent}</Note>
      ) : (
        <ol aria-label={L.eventsHeading} tabIndex={events.length > 8 ? 0 : undefined} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 520px), 1fr))', gap: '6px 20px', maxHeight: 132, overflowY: 'auto' }}>
          {events.map((e, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 16, lineHeight: 1.5, color: T.text }}>
              <span style={{ flex: '0 0 28px', height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 16, fontWeight: 800, border: `2.5px solid ${TONE_META[e.tone].color}`, background: T.surface }}>{i + 1}</span>
              <ToneMark tone={e.tone} size={18} />
              <span><strong>{dateHe(e.date)}</strong> — {e.text}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
    </>
  )
}

/* ── תלמידים ── */
export function StudentsPanel({ d, classId }: { d: ClassSubjectView; classId: string }) {
  const env = useV2Env()
  if (d.students.length === 0) {
    return (
      <>
        <Sentence compact>{d.tabSummaries.students}</Sentence>
        <Card><Note style={{ fontSize: 16 }}>{EMPTY_TEXT.noStudents}</Note></Card>
      </>
    )
  }
  const flagged = new Set(d.studentFindings.filter((x) => x.finding.status === 'reported' && x.finding.tone === 'attention').map((x) => x.studentId))
  const declining = d.students.filter((s) => s.trend === 'declining').length
  const improving = d.students.filter((s) => s.trend === 'improving').length
  const studentsTone: Tone = improving > declining ? 'positive' : declining > 0 ? 'attention' : 'neutral'
  return (
    <>
    <Sentence compact tone={studentsTone}>{d.tabSummaries.students}</Sentence>
    <ul aria-label={L.studentsInSubject} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(204px, 1fr))', gap: 8 }}>
      {d.students.map((s) => (
        <li key={s.id}>
          <Link to={env.href(`/analytics/student/${s.id}`, { class: classId, tab: d.subject.code })} data-tu-press
            style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, minHeight: 60, padding: '6px 12px', borderRadius: RADIUS.md, background: T.surface, border: `1.5px solid ${flagged.has(s.id) ? T.warn : T.controlBorder}`, textDecoration: 'none', color: T.text, fontFamily: FONT }}>
            <span style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: T.accentStrong, textDecoration: 'underline', textUnderlineOffset: 3 }}>{s.displayName}</span>
              {flagged.has(s.id) && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 16, fontWeight: 700 }}><ToneMark tone="attention" size={16} />{L.attentionShort}</span>}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <TrendWord trend={s.trend} text={s.trendText} size={16} />
              <span style={{ fontSize: 16, color: T.textSoft }}>{L.levelLabel(s.level)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
    </>
  )
}
