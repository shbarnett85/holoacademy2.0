/* מסך הכניסה "איזו כיתה תרצו לראות?" (GET /entry): רצועת "דורש תשומת לב" (עד 3 התרעות, משפט אחד כל אחת, לחיצה → עמוד התלמיד/ה;
   הכותרת "3 מתוך 5 … הדחופים ביותר" וה"ועוד N בכיתה" מגיעות מהחוזה: entry.alertsTitle / alertsMore) ומתחתיה כרטיס לכל כיתה:
   כפתור גדול (→ סקירת הכיתה למחנך / המקצוע הראשון של המורה המקצועי/ת), עם מספר התלמידים לתשומת לב במילים, ומתחתיו כפתור 44px לכל מקצוע
   שהצופה רשאי לפתוח (מ-GET /roster) — קיצור ישר ל"סיכום" של המקצוע. כך כל טאב משנה (טעויות נפוצות / התקדמות / תלמידים) במרחק שתי לחיצות
   מהטאב הראשי: מקצוע ← תת-טאב.
   הכרטיסים מוצגים רק כששתי הקריאות (כניסה + כיתות) חזרו, כדי שהשורה של קיצורי המקצועות לא תגרום לכרטיס לקפוץ אחרי הצביעה.
   אם קריאת הכיתות נכשלה — הכרטיסים מוצגים בלי קיצורים (הכפתור הגדול עובד כרגיל). */
import { Link } from 'react-router-dom'
import { EMPTY_TEXT, attentionBadgeText } from '../../shared/lib/findingsNarrative'
import type { Entry, Roster } from '../../shared/types/analyticsV2'
import { BigChoiceButton, ChoiceGrid, EmptyState, FONT, Icon, MIN_TARGET, RADIUS, SubjectLinkButton, T } from '../teacherUi'
import { useV2Env } from './context'
import { L, titles } from './labels'
import { AnalyticsShell } from './Shell'
import { bySubjectOrder } from './subjectOrder'
import { Card, CardTitle, ErrorBlock, LoadingBlock, Note, ToneMark } from './ui'
import { useV2 } from './v2api'

export default function EntryScreen() {
  const env = useV2Env()
  const { data, loading, error, reload } = useV2<Entry>('/entry', env.params)
  const roster = useV2<Roster>('/roster', env.params)
  const subjectsOf = (classId: string) => bySubjectOrder(roster.data?.classes.find((c) => c.id === classId)?.subjects ?? [])
  /* מחכים לשתי הקריאות; כשל בכיתות לא חוסם */
  const waiting = (loading && !data) || (roster.loading && !roster.data && !roster.error)

  return (
    <AnalyticsShell title={titles.entry}>
      {waiting ? <LoadingBlock /> : error ? <ErrorBlock message={error} onRetry={reload} /> : data && (
        <div data-entry-ready style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data.alerts.length > 0 && (
            <Card label={data.alertsTitle} style={{ borderInlineStart: `6px solid ${T.warn}`, padding: '10px 16px' }}>
              <CardTitle style={{ marginBottom: 2 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: T.warn, display: 'inline-flex' }}><Icon name="alert" size={22} /></span>
                  {data.alertsTitle}
                </span>
              </CardTitle>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
                {data.alerts.map((a, i) => (
                  <li key={`${a.studentId}-${i}`} style={{ borderTop: i === 0 ? 'none' : `1px solid ${T.border}` }}>
                    <Link to={env.href(`/analytics/student/${a.studentId}`, { class: a.classId })} data-tu-press
                      style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: MIN_TARGET + 4, padding: '2px 6px', borderRadius: RADIUS.sm, fontFamily: FONT, fontSize: 17, lineHeight: 1.45, color: T.text, textDecoration: 'none' }}>
                      <ToneMark tone="attention" size={20} />
                      <span style={{ flex: 1, minWidth: 0 }}>{a.text}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 800, color: T.accentStrong, textDecoration: 'underline', textUnderlineOffset: 3, whiteSpace: 'nowrap' }}>
                        {L.openStudent(a.studentName.split(' ')[0])}<Icon name="chevLeft" size={16} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {data.alertsMore && <Note style={{ marginTop: 4, fontWeight: 700, color: T.text }}>{data.alertsMore}</Note>}
            </Card>
          )}

          {data.classes.length === 0 ? (
            <EmptyState title={EMPTY_TEXT.noClasses} whatNext="כשיהיו כיתות עם תלמידים שמשחקים בהדמיות, תוכלו לבחור אותן כאן." />
          ) : (
            <ChoiceGrid ariaLabel={L.entryTitle} minColumn={440}>
              {data.classes.map((c) => {
                const subjects = subjectsOf(c.id)
                /* מקצוע אחד או שניים (מורה מקצועי): הקיצור לצד הכפתור הגדול, כדי שגם עשר כיתות ייכנסו במסך אחד.
                   מחנך עם כמה מקצועות: הקיצורים בשורה משלהם מתחת. */
                const side = subjects.length > 0 && subjects.length <= 2
                return (
                  <div key={c.id} data-class-id={c.id}
                    style={{ display: 'flex', flexDirection: side ? 'row' : 'column', alignItems: 'stretch', minWidth: 0, borderRadius: RADIUS.lg, background: T.surface, border: `2px solid ${T.controlBorder}` }}>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
                      <BigChoiceButton flat to={env.href(`/analytics/class/${c.id}`)} label={`כיתה ${c.name}`}
                        sublabel={`${c.studentCount} תלמידים`}
                        badge={c.attentionCount > 0 ? { text: attentionBadgeText(c.attentionCount), tone: 'attention' } : { text: L.noAttention, tone: 'positive' }} />
                    </div>
                    {subjects.length > 0 && (
                      <div role="group" aria-label={L.subjectShortcutsLabel(c.name)}
                        style={side
                          ? { flex: '0 0 auto', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', gap: 6, padding: '10px 10px', borderInlineStart: `1px solid ${T.border}` }
                          : { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '10px 14px 12px', borderTop: `1px solid ${T.border}` }}>
                        <span style={{ fontSize: 16, fontWeight: 700, color: T.textSoft }}>{L.subjectShortcuts}</span>
                        {subjects.map((sub) => (
                          <SubjectLinkButton key={sub.code} code={sub.code} label={sub.nameHe} chevron={false}
                            to={env.href(`/analytics/class/${c.id}`, { tab: sub.code, sub: 'summary' })} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </ChoiceGrid>
          )}

          {env.cfg.dataNotice && <Note style={{ marginTop: 2 }}>{env.cfg.dataNotice}</Note>}
        </div>
      )}
    </AnalyticsShell>
  )
}
