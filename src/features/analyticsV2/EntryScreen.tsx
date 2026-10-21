/* מסך הכניסה "איזו כיתה תרצו לראות?" (GET /entry): רצועת "דורש תשומת לב" (עד 3 התרעות, משפט אחד כל אחת, לחיצה → עמוד התלמיד/ה;
   הכותרת "3 מתוך 5 … הדחופים ביותר" וה"ועוד N בכיתה" מגיעות מהחוזה: entry.alertsTitle / alertsMore) ומתחתיה כרטיס לכל כיתה:
   כפתור גדול (→ סקירת הכיתה למחנך / המקצוע הראשון של המורה המקצועי/ת), עם מספר התלמידים לתשומת לב במילים, ומתחתיו כפתור 44px לכל מקצוע
   שהצופה רשאי לפתוח (מ-GET /roster, שנטען פעם אחת במעטפת) — קיצור ישר ל"סיכום" של המקצוע. כך כל טאב משנה (טעויות נפוצות / התקדמות / תלמידים)
   במרחק שתי לחיצות מהטאב הראשי: מקצוע ← תת-טאב.
   הכרטיסים מוצגים רק כששתי הקריאות (כניסה + כיתות) חזרו, כדי שהשורה של קיצורי המקצועות לא תגרום לכרטיס לקפוץ אחרי הצביעה.
   אם קריאת הכיתות נכשלה — הכרטיסים מוצגים בלי קיצורים (הכפתור הגדול עובד כרגיל).
   כיתה בלי תוצאות עדיין מסומנת "עוד אין תוצאות" (תג ניטרלי) — לא "אין תלמידים לתשומת לב", שאומר שבדקנו והכול בסדר.
   מורה בלי כיתות: מצב ריק מלא עם מה לעשות ומה יקרה. הדמיות בלי מקצוע (coverageNote): משפט מהחוזה + כפתור אל הספרייה לשיוך מקצוע.
   מורה אמיתי רואה בתחתית "התצוגה הקודמת" (גרף ההתקדמות הכללי). */
import { Link } from 'react-router-dom'
import { V2_CLIENT_TEXT, attentionBadgeText } from '../../shared/lib/findingsNarrative'
import type { Entry } from '../../shared/types/analyticsV2'
import { BigChoiceButton, ChoiceGrid, EmptyState, FONT, Icon, MIN_TARGET, RADIUS, Sentence, SubjectLinkButton, T } from '../teacherUi'
import type { ChoiceBadge } from '../teacherUi'
import { useV2Env } from './context'
import { L, titles } from './labels'
import { PREVIOUS_VIEW_HREF, entryClassState } from './logic'
import { AnalyticsShell } from './Shell'
import { classSubjectAccess } from './tabs'
import { Card, CardTitle, ErrorBlock, LinkButton, LoadingBlock, Note, ToneMark } from './ui'
import { useV2 } from './v2api'

const T_ENTRY = V2_CLIENT_TEXT.entry

function badgeOf(c: Entry['classes'][number]): ChoiceBadge {
  const state = entryClassState(c)
  if (state === 'attention') return { text: attentionBadgeText(c.attentionCount), tone: 'attention' }
  if (state === 'noResults') return { text: T_ENTRY.noResultsBadge, tone: 'neutral' }
  return { text: L.noAttention, tone: 'positive' }
}

export default function EntryScreen() {
  const env = useV2Env()
  const { data, dataState, loading, error, reload } = useV2<Entry>('/entry', env.params)
  const roster = env.roster
  /* קיצורי המקצועות של כל כיתה: מההרשאה של אותה כיתה (RosterClass.subjects), לא מ-config.subjects */
  const subjectsOf = (classId: string) => {
    const c = roster.data?.classes.find((x) => x.id === classId)
    return c ? classSubjectAccess(c).open : []
  }
  /* מחכים לשתי הקריאות; כשל בכיתות לא חוסם */
  const waiting = (loading && !data) || (roster.loading && !roster.data && !roster.error)

  return (
    <AnalyticsShell title={titles.entry}>
      {waiting ? <LoadingBlock /> : error ? <ErrorBlock error={error} onRetry={reload} /> : data && (
        <div data-entry-ready data-v2-ready style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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

          {/* עדיין אין תוצאות באף כיתה: משפט אחד שאומר מה קורה ומה יקרה (במקום לתת לכרטיסים "לשתוק") */}
          {data.classes.length > 0 && dataState === 'insufficient' && <Sentence compact>{T_ENTRY.noResultsAtAll}</Sentence>}

          {/* הדמיות שעוד לא שויך להן מקצוע אינן נכנסות לתוצאות — אומרים למה חסר משהו ומה עושים */}
          {data.coverageNote && (
            <Card label={T_ENTRY.assignSubjects} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '8px 16px' }}>
              <span style={{ color: T.accent, display: 'inline-flex' }}><Icon name="info" size={22} /></span>
              <Note style={{ flex: '1 1 320px', color: T.text }}>{data.coverageNote}</Note>
              <LinkButton to="/creator/library">{T_ENTRY.assignSubjects}</LinkButton>
            </Card>
          )}

          {data.classes.length === 0 ? (
            <EmptyState title={T_ENTRY.noClasses.title} whatNext={T_ENTRY.noClasses.whatNext} />
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
                        sublabel={`${c.studentCount} תלמידים`} badge={badgeOf(c)} />
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

          {env.canSeePreviousView && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 2 }}>
              <Note style={{ flex: '1 1 320px' }}>{T_ENTRY.previousViewSentence}</Note>
              <LinkButton to={PREVIOUS_VIEW_HREF}>{T_ENTRY.previousView}</LinkButton>
            </div>
          )}
        </div>
      )}
    </AnalyticsShell>
  )
}
