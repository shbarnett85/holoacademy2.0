import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ClassSubjectView as View, MisconceptionRow } from '../../shared/types/analyticsV2'
import { Button, Chip, ErrorBox, FindingList, Loading, Notice, Panel, SubjectGreyChip } from './ui'
import { C } from './tokens'
import { useV2, type V2Params } from './v2api'

const POS = { above: ['▲', 'מעל הרצועה', 'positive'], within: ['●', 'בתוך הרצועה', 'neutral'], below: ['▼', 'מתחת לרצועה', 'attention'] } as const

function GoalCell({ row }: { row: MisconceptionRow }) {
  if (!row.curriculumGoal) return <span style={{ color: C.faint }}>—</span>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span>{row.curriculumGoal.title}</span>
      {row.curriculumGoal.mappingStatus === 'sample' && <Chip tone="accent" title="יעדי תוכנית הלימודים כאן הם נושאים כלליים להמחשה, ללא קודים רשמיים">מיפוי לדוגמה</Chip>}
    </div>
  )
}

function LinkedQuest({ row }: { row: MisconceptionRow }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  return (
    <div>
      <Button onClick={() => setOpen((o) => !o)} style={{ fontSize: 11.5, padding: '5px 10px' }}>צור הדמיה ממוקדת לתפיסה זו</Button>
      {open && (
        <Notice tone="accent" style={{ marginTop: 6, maxWidth: 300 }}>
          {row.linkedQuest ? (
            <>
              קיימת הדמיה המקושרת לתפיסה זו: <strong>«{row.linkedQuest.title}»</strong>
              <div style={{ marginTop: 6 }}><Button kind="solid" onClick={() => navigate('/creator/library')} style={{ fontSize: 11.5, padding: '4px 10px' }}>פתיחה בספרייה</Button></div>
            </>
          ) : 'עדיין אין הדמיה מקושרת לתפיסה זו. בחשבון אמיתי תיווצר כאן הדמיה חדשה שתקושר אוטומטית.'}
        </Notice>
      )}
    </div>
  )
}

/* תצוגת כיתה במקצוע: טבלת תפיסות שגויות, "מה ללמד מחר", דפוסים פר-תלמיד, ואירועים כיתתיים */
export default function ClassSubjectView({ classId, subject, params, onOpenStudent, onBriefing }: { classId: string; subject: string; params: V2Params; onOpenStudent: (id: string) => void; onBriefing: () => void }) {
  const { data, loading, error } = useV2<View>(`/class/${classId}/subject/${subject}`, params)
  const [openRow, setOpenRow] = useState<string | null>(null)
  if (loading && !data) return <Loading />
  if (error) return <ErrorBox message={error} />
  if (!data) return null
  const whoById = new Map(data.studentFindings.map((x) => [x.finding.id, x.studentName]))
  const norm = data.classLevel.ageNorm
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 22, color: C.text }}>כיתה {data.class.name} · {data.subject.nameHe}</h2>
        {data.classLevel.mean !== null && <Chip tone="accent">רמה ממוצעת <bdi dir="ltr">{data.classLevel.mean}</bdi> · רצועת שכבה {norm.gradeLabel}: <bdi dir="ltr">{norm.low}–{norm.high}</bdi></Chip>}
        <div style={{ flex: 1 }} />
        <Button onClick={onBriefing}>📄 תדריך כיתתי להדפסה</Button>
      </div>
      <Notice>{data.caveats.ageNorm}</Notice>

      <Panel title="מה ללמד מחר">
        {data.recommendations.length === 0 ? (
          <div style={{ color: C.muted, fontSize: 13 }}>אין עדיין מספיק נתונים להמלצה (נדרשים לפחות 5 תלמידים עם חשיפות מספיקות לתפיסה).</div>
        ) : (
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.recommendations.map((r) => {
              const row = data.misconceptions.find((m) => m.id === r.misconceptionId)!
              return (
                <li key={r.misconceptionId} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 10, background: C.surface, flexWrap: 'wrap' }}>
                  <span aria-label={`המלצה ${r.rank}`} style={{ width: 26, height: 26, borderRadius: 8, display: 'grid', placeItems: 'center', fontWeight: 800, color: C.accentBright, border: `1px solid ${C.accent}` }}>{r.rank}</span>
                  <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.75, color: C.text }}>{r.text}</p>
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      <Chip>{row.studentsShowing} מתוך {row.studentsExposed} תלמידים</Chip>
                      <Chip>{row.sharePct}%</Chip>
                      <Chip>{row.students.reduce((s, x) => s + x.hits, 0)} פריטים</Chip>
                    </div>
                  </div>
                  <LinkedQuest row={row} />
                </li>
              )
            })}
          </ol>
        )}
      </Panel>

      <Panel title="תפיסות שגויות בכיתה">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, color: C.textSoft }}>
            <caption style={{ captionSide: 'bottom', textAlign: 'start', color: C.muted, fontSize: 11.5, paddingTop: 8 }}>
              תלמיד/ה נחשב/ת כמציג/ה תפיסה כשבחר/ה שוב ושוב במסיח המתויג שלה. אחוזים הם מתוך התלמידים שנחשפו לפחות 3 פעמים.
            </caption>
            <thead>
              <tr style={{ textAlign: 'start', color: C.muted, fontSize: 11.5 }}>
                {['תפיסה', 'תלמידים', 'פריטים', 'יעד תוכנית לימודים'].map((h) => <th key={h} style={{ textAlign: 'start', padding: '6px 8px', fontWeight: 600, borderBottom: `1px solid ${C.border}` }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.misconceptions.map((m) => (
                <tr key={m.id} style={{ verticalAlign: 'top' }}>
                  <td style={{ padding: '10px 8px', borderBottom: `1px solid ${C.border}`, minWidth: 220 }}>
                    <div style={{ fontWeight: 700, color: C.text }}>{m.titleHe}</div>
                    <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.6 }}>{m.descriptionHe}</div>
                    {m.students.length > 0 && (
                      <>
                        <button type="button" onClick={() => setOpenRow(openRow === m.id ? null : m.id)} aria-expanded={openRow === m.id}
                          style={{ background: 'none', border: 'none', padding: 0, marginTop: 4, cursor: 'pointer', color: C.accent, fontSize: 11.5, fontFamily: 'var(--font-display)' }}>
                          {openRow === m.id ? 'הסתר תלמידים' : `מי? (${m.students.length})`}
                        </button>
                        {openRow === m.id && (
                          <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12 }}>
                            {m.students.map((s) => (
                              <li key={s.id}>
                                <button type="button" onClick={() => onOpenStudent(s.id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: C.textSoft, fontFamily: 'var(--font-display)', textDecoration: 'underline' }}>{s.displayName}</button>
                                {' — '}{s.hits} מתוך {s.exposures} פריטים
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </td>
                  <td style={{ padding: '10px 8px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>
                    {m.status === 'insufficient' || m.sharePct === null ? <span style={{ color: C.muted }}>אין עדיין מספיק נתונים (N = {m.studentsExposed})</span> : (
                      <>
                        <div style={{ fontWeight: 800, color: C.accentBright, fontSize: 16 }}>{m.sharePct}%</div>
                        <div style={{ color: C.muted, fontSize: 11.5 }}>{m.studentsShowing} מתוך {m.studentsExposed}</div>
                      </>
                    )}
                  </td>
                  <td style={{ padding: '10px 8px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{m.students.reduce((s, x) => s + x.hits, 0)}</td>
                  <td style={{ padding: '10px 8px', borderBottom: `1px solid ${C.border}`, minWidth: 200 }}><GoalCell row={m} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {data.classFindings.length > 0 && (
        <Panel title="אירועים כיתתיים"><FindingList findings={data.classFindings} /></Panel>
      )}

      <Panel title="אירועים ודפוסים אצל תלמידים (במקצוע זה בלבד)">
        <FindingList findings={data.studentFindings.map((x) => x.finding)} whoOf={(f) => whoById.get(f.id)} />
      </Panel>

      <Panel title="תלמידי הכיתה">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8 }}>
          {data.students.map((s) => {
            const p = s.positionVsNorm ? POS[s.positionVsNorm] : null
            return (
              <button key={s.id} type="button" onClick={() => onOpenStudent(s.id)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '7px 10px', border: `1px solid ${C.border}`, borderRadius: 10, background: 'transparent', cursor: 'pointer', color: C.textSoft, fontFamily: 'var(--font-display)', fontSize: 13 }}>
                <span>{s.displayName}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <strong style={{ color: C.accentBright }}>{s.level ?? '—'}</strong>
                  {p && <Chip tone={p[2]} title={p[1]}>{p[0]}</Chip>}
                </span>
              </button>
            )
          })}
        </div>
      </Panel>

      {data.otherSubjects.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: C.muted }}>מקצועות נוספים של תלמידי הכיתה (ללא גישה):</span>
          {data.otherSubjects.map((s) => <SubjectGreyChip key={s.code} name={s.nameHe} />)}
        </div>
      )}
    </div>
  )
}
