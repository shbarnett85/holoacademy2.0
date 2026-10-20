/* "סקירה" (מחנך): טבלה אחת, שורה לכל מקצוע — רמה ומגמה, תחומים חזקים ומאתגרים, תלמידים לתשומת לב.
   שם המקצוע הוא כפתור (תג מקצוע, 44px) אל "סיכום" של המקצוע; מספר התלמידים לתשומת לב — כפתור אל "תלמידים" שלו. נכנסת במסך אחד. */
import { Link } from 'react-router-dom'
import { attentionBadgeText } from '../../shared/lib/findingsNarrative'
import type { ClassOverview } from '../../shared/types/analyticsV2'
import { EmptyState, FONT, MIN_TARGET, RADIUS, Sentence, SubjectLinkButton, T } from '../teacherUi'
import { useV2Env } from './context'
import { L } from './labels'
import { AreasText, ErrorBlock, HowCalc, LoadingBlock, Note, PositionWord, ToneMark, TrendWord } from './ui'
import { useV2 } from './v2api'

const th = { textAlign: 'start', padding: '6px 12px', fontSize: 16, fontWeight: 700, color: T.textSoft, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' } as const
const td = { padding: '6px 12px', borderBottom: `1px solid ${T.border}`, verticalAlign: 'middle', fontSize: 16, lineHeight: 1.4, color: T.text } as const

export default function ClassOverviewTab({ classId, className }: { classId: string; className: string }) {
  const env = useV2Env()
  const { data, loading, error, reload } = useV2<ClassOverview>(`/class/${classId}/overview`, env.params)
  if (loading && !data) return <LoadingBlock />
  if (error) return <ErrorBlock message={error} onRetry={reload} />
  if (!data) return null
  const anyAlert = data.rows.some((r) => r.alerts > 0)

  return (
    <>
      <Sentence tone={anyAlert ? 'attention' : 'neutral'}>{data.summary}</Sentence>
      {data.rows.length === 0 ? (
        <EmptyState title={`עוד אין נתונים על כיתה ${className}.`} whatNext="הסקירה תופיע כאן כשתלמידי הכיתה ישחקו בהדמיות." />
      ) : (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: RADIUS.md, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FONT }}>
            <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>סקירת הכיתה לפי מקצוע</caption>
            <thead>
              <tr>
                <th scope="col" style={th}>{L.tableSubject}</th>
                <th scope="col" style={th}>{L.level}</th>
                <th scope="col" style={th}>{L.tablePosition}</th>
                <th scope="col" style={th}>{L.trend}</th>
                <th scope="col" style={th}>{L.strongAreas}</th>
                <th scope="col" style={th}>{L.challengingAreas}</th>
                <th scope="col" style={th}>{L.tableAlerts}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.subject.code}>
                  <th scope="row" style={{ ...td, fontWeight: 400, padding: '2px 8px' }}>
                    <SubjectLinkButton code={r.subject.code} label={r.subject.nameHe} to={env.href(`/analytics/class/${classId}`, { tab: r.subject.code, sub: 'summary' })} />
                  </th>
                  <td style={{ ...td, fontSize: 18, fontWeight: 800 }}>{r.level ?? '—'}</td>
                  <td style={td}><PositionWord position={r.positionVsNorm} text={r.positionText} size={16} /></td>
                  <td style={td}><TrendWord trend={r.trend} text={r.trendText} size={16} /></td>
                  <td style={td}><AreasText items={r.strongAreas} /></td>
                  <td style={td}><AreasText items={r.challengingAreas} /></td>
                  <td style={td}>
                    {r.alerts > 0 ? (
                      <Link to={env.href(`/analytics/class/${classId}`, { tab: r.subject.code, sub: 'students' })} data-tu-press
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: MIN_TARGET, color: T.accentStrong, fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3 }}>
                        <ToneMark tone="attention" size={18} />{attentionBadgeText(r.alerts)}
                      </Link>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: T.textSoft }}><ToneMark tone="positive" size={18} />{L.noAttention}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <Note style={{ flex: '1 1 520px' }}>{data.caveats.crossSubject} {data.caveats.ageNorm}</Note>
        <HowCalc />
      </div>
    </>
  )
}
