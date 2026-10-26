/* מסך הרשימה: "מה התלמידים עשו בשיעורים ששלחתי?" — משפט סיכום אחד, ואז שורה לכל שליחה (שיעור × כיתה × תאריך), מקובצות:
   "פעיל עכשיו" (לבד, בראש) · "השבוע" · "שבוע שעבר" · "מוקדם יותר" (שבוע ישראלי: ראשון עד שבת). החדש ראשון בכל קבוצה.
   · חלון הזמן: 30 הימים האחרונים. ישנים יותר מחכים מאחורי "הצגת שיעורים ישנים יותר" (?older=1).
   · מחנך/ת: מתג [השיעורים שלי] [כל השיעורים בכיתה שלי] (?view=class), ובמצב הכיתה — פס שבועי: "השבוע: 4 שיעורים ב-3 מקצועות" ומי שסומן/ה בכמה מקצועות.
   · סינון בכפתורים (כיתה; מקצוע — רק אם יש יותר ממקצוע אחד) + חיפוש בשם; חי בכתובת (?class=&subject-filter=&q=).
   אין כאן נתיב חזרה: זה המסך הראשי של הטאב. מורה אורח: בורר העדשות בשורת הכותרת. */
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { attentionBadgeText, dateHe, howWeCalcResultsLines, narrateSubmissionsSummary, RESULTS_TEXT } from '../../shared/lib/findingsNarrative'
import { subjectStyle } from '../../shared/lib/subjectStyle'
import type { SubmissionList, SubmissionRow } from '../../shared/types/resultsV1'
import { bySubjectOrderOf, EmptyState, FONT, Icon, MIN_TARGET, ModeToggle, ProgressBar, RADIUS, ScreenShell, Sentence, T } from '../teacherUi'
import ErrorPanel from './ErrorPanel'
import FillArea from './FillArea'
import FilterButtons from './FilterButtons'
import { filterSubmissions, groupByWeek, validOption } from './logic'
import type { ListGroupKey } from './logic'
import { listQuery, useLens, useResultsData } from './resultsApi'
import ResultsLensSwitcher from './ResultsLensSwitcher'
import { card, scrollArea, secondaryButton } from './styles'
import SuggestionBanner from './SuggestionBanner'
import { UI } from './text'
import Thumb from './Thumb'
import { LessonStateChip } from './LessonDue'

const GROUP_TITLE: Record<ListGroupKey, string> = { active: UI.groupActive, this: UI.groupThisWeek, last: UI.groupLastWeek, earlier: UI.groupEarlier }

function AttentionTag({ n }: { n: number }) {
  return (
    <span data-attention-tag style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 12px 2px 10px', borderRadius: 20, border: `1.5px solid ${T.warn}`, fontFamily: FONT, fontSize: 16, fontWeight: 700, color: T.text, lineHeight: 1.4, whiteSpace: 'nowrap' }}>
      <span style={{ color: T.warn, display: 'inline-flex' }}><Icon name="alert" size={18} /></span>
      {attentionBadgeText(n)}
    </span>
  )
}

function SubmissionRowLink({ row, to }: { row: SubmissionRow; to: string }) {
  return (
    <Link to={to} data-tu-press data-submission-row={row.id}
      style={{ ...card, display: 'flex', alignItems: 'center', gap: '6px 16px', flexWrap: 'wrap', padding: '8px 14px', textDecoration: 'none', color: T.text, border: `1.5px solid ${row.attentionCount > 0 ? T.warn : T.controlBorder}`, borderRadius: RADIUS.lg }}>
      {/* כל שורה מתחילה בתמונת השיעור במסגרת בצבע המקצוע ועם תגית המקצוע — אותו סגנון כמו בספרייה */}
      <Thumb url={row.thumbUrl} subjectCode={row.subject?.code ?? null} width={104} height={78} />
      <div style={{ flex: '1 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '2px 14px', fontFamily: FONT, fontSize: 16, color: T.textSoft }}>
          <span style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.3, color: T.text, overflowWrap: 'anywhere' }}>{row.title}</span>
          <span>{UI.classWord(row.className)}</span>
          <span>{UI.sentOn(dateHe(row.sentAt))}</span>
          {row.state && <LessonStateChip state={row.state} dueAt={row.dueAt} />}
          {row.source !== 'mine' && row.senderName && <span>{UI.sentBy(row.senderName)}</span>}
        </div>
        <div style={{ fontFamily: FONT, fontSize: 16, color: T.text, lineHeight: 1.45 }}>{row.summary}</div>
      </div>
      <div style={{ flex: '0 1 270px', minWidth: 220, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <ProgressBar done={row.counts.completed} total={row.counts.total} label={UI.finished} />
        {row.attentionCount > 0 && <AttentionTag n={row.attentionCount} />}
      </div>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: MIN_TARGET, fontFamily: FONT, fontSize: 17, fontWeight: 800, color: T.accentStrong }}>
        {UI.openResults}
        <Icon name="chevLeft" size={18} />
      </span>
    </Link>
  )
}

/* הפס השבועי של המחנך/ת — עובדות בלבד; מי שסומן/ה בכמה מקצועות מופיע/ה בשם */
function WeekStrip({ strip }: { strip: NonNullable<SubmissionList['weekStrip']> }) {
  return (
    <section aria-label={UI.weekStripLabel} data-week-strip style={{ ...card, flex: '0 0 auto', padding: '6px 14px', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontFamily: FONT, fontSize: 17, fontWeight: 800, color: T.text, lineHeight: 1.5 }}>{strip.sentence}</div>
      {strip.flaggedLine && (
        <div data-week-flagged style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: FONT, fontSize: 16, color: T.text, lineHeight: 1.5 }}>
          <span style={{ color: T.warn, display: 'inline-flex' }}><Icon name="alert" size={18} /></span>
          {strip.flaggedLine}
        </div>
      )}
    </section>
  )
}

export default function ResultsList() {
  const { isGuest, scope, apiQs, link } = useLens()
  const [sp, setSp] = useSearchParams()
  const wantClass = sp.get('view') === 'class'
  const older = sp.get('older') === '1'
  const q = useResultsData<SubmissionList>('list', `/api/results/submissions${listQuery(apiQs, wantClass ? 'class' : 'mine', older)}`, scope)
  /* "עכשיו" נקבע פעם אחת לכל כניסה למסך: חלוקה לשבועות לא משתנה באמצע הצפייה */
  const [nowMs] = useState(() => Date.now())

  const data = q.data
  const classOptions = useMemo(() => (data?.filters.classes ?? []).map((c) => ({ id: c.id, label: c.name })), [data])
  const subjectOptions = useMemo(
    () => bySubjectOrderOf(data?.filters.subjects ?? [], (s) => s.code).map((s) => ({ id: s.code, label: subjectStyle(s.code).label, icon: <span>{subjectStyle(s.code).icon}</span> })),
    [data],
  )
  const classId = validOption(sp.get('class'), classOptions.map((o) => o.id))
  const subject = validOption(sp.get('subject-filter'), subjectOptions.map((o) => o.id))
  const query = sp.get('q') ?? ''

  const update = (patch: Record<string, string | null>): void => {
    setSp((prev) => {
      const next = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(patch)) { if (v === null || v === '') next.delete(k); else next.set(k, v) }
      return next
    }, { replace: true })
  }

  const clearAll = (): void => update({ class: null, 'subject-filter': null, q: null })

  const all = useMemo(() => data?.submissions ?? [], [data])
  const shown = useMemo(() => filterSubmissions(all, { classId, subject, query }), [all, classId, subject, query])
  const groups = useMemo(() => groupByWeek(shown, nowMs), [shown, nowMs])
  const filtering = !!(classId || subject || query.trim())
  const showClassFilter = classOptions.length > 1
  const showSubjectFilter = subjectOptions.length > 1
  const view = data?.view ?? 'mine'
  const canToggle = data?.canToggleView === true
  const olderCount = data?.olderCount ?? 0
  /* משפט הסיכום מדבר על מה שמוצג עכשיו (אחרי סינון) */
  const summary = narrateSubmissionsSummary(shown.length, shown.filter((r) => r.attentionCount > 0).length)

  return (
    <ScreenShell active="results" title={RESULTS_TEXT.listTitle} lensSwitcher={isGuest ? <ResultsLensSwitcher /> : undefined}
      howWeCalc={q.error ? undefined : { lines: howWeCalcResultsLines() }}>
      <FillArea>
        {q.error ? (
          <ErrorPanel error={q.error} scope="list" backTo={link('/results')} onRetry={q.reload} altTo={q.error.status === 403 ? link('/analytics') : undefined} />
        ) : !data ? (
          <p role="status" style={{ margin: 0, fontFamily: FONT, fontSize: 17, color: T.textSoft }}>{UI.loading}</p>
        ) : (
          <>
            {canToggle && (
              <div data-view-toggle style={{ flex: '0 0 auto', display: 'flex' }}>
                <ModeToggle compact ariaLabel={UI.viewLabel} value={view} onChange={(id) => update({ view: id === 'class' ? 'class' : null, older: null })}
                  options={[{ id: 'mine', label: UI.viewMine }, { id: 'class', label: UI.viewClass }]} />
              </div>
            )}
            {view === 'class' && data.weekStrip && <WeekStrip strip={data.weekStrip} />}

            {all.length === 0 ? (
              <>
                <EmptyState title={canToggle && view === 'mine' ? UI.emptyMine : RESULTS_TEXT.emptyList} whatNext={canToggle && view === 'mine' ? UI.emptyMineClassHint : UI.emptyWhatNext} ctaLabel={RESULTS_TEXT.emptyListCta} ctaTo="/creator/library" />
                {!older && olderCount > 0 && <OlderButton n={olderCount} onClick={() => update({ older: '1' })} />}
              </>
            ) : (
              <>
                {summary && <Sentence compact tone={shown.some((r) => r.attentionCount > 0) ? 'attention' : 'neutral'}>{summary}</Sentence>}

                {/* "לתרגול חזרה" נפתח ישר בטאב "מה עושים עם זה" של השליחה (אם יש בו מה לתרגל; אחרת — בטאב האתגרים) */}
                <SuggestionBanner openLink={(id) => link(`/results/${encodeURIComponent(id)}`, { tab: 'actions' })} />

                <section aria-label={UI.filterTitle} style={{ ...card, flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: '6px 20px', flexWrap: 'wrap', padding: '6px 14px' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: FONT, fontSize: 16, fontWeight: 700, color: T.textSoft }}>
                    {UI.searchLabel}:
                    <input type="search" value={query} onChange={(e) => update({ q: e.target.value })} placeholder={UI.searchPlaceholder}
                      style={{ minHeight: MIN_TARGET, width: 220, boxSizing: 'border-box', padding: '0 12px', borderRadius: RADIUS.md, fontFamily: FONT, fontSize: 16, color: T.text, background: T.surfaceSoft, border: `2px solid ${T.controlBorder}` }} />
                  </label>
                  {showClassFilter && (
                    <FilterButtons label={UI.filterClass} allLabel={UI.allClasses} options={classOptions} value={classId} onChange={(id) => update({ class: id })} />
                  )}
                  {showSubjectFilter && (
                    <FilterButtons label={UI.filterSubject} allLabel={UI.allSubjects} options={subjectOptions} value={subject} onChange={(id) => update({ 'subject-filter': id })} />
                  )}
                  <span style={{ flex: 1 }} />
                  {filtering && (
                    <span role="status" style={{ fontFamily: FONT, fontSize: 16, fontWeight: 700, color: T.textSoft }}>{UI.countLine(shown.length, all.length)}</span>
                  )}
                  {filtering && <button type="button" data-tu-press onClick={clearAll} style={secondaryButton}>{UI.clearFilter}</button>}
                </section>

                <div data-list-scroll aria-busy={q.loading} style={{ ...scrollArea, display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 4, opacity: q.loading ? 0.6 : 1 }}>
                  {shown.length === 0 ? (
                    <EmptyState title={RESULTS_TEXT.noMatch} ctaLabel={UI.clearFilter} onCta={clearAll} />
                  ) : (
                    groups.map((g) => (
                      <section key={g.key} data-week-group={g.key} aria-labelledby={`grp-${g.key}`} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <h2 id={`grp-${g.key}`} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontFamily: FONT, fontSize: 17, fontWeight: 800, color: T.text, lineHeight: 1.4 }}>
                          {g.key === 'active' && <span style={{ color: T.accent, display: 'inline-flex' }}><Icon name="pulse" size={18} /></span>}
                          {GROUP_TITLE[g.key]}
                          <span style={{ fontWeight: 600, color: T.textSoft }}>· {g.rows.length === 1 ? 'שיעור אחד' : `${g.rows.length} שיעורים`}</span>
                        </h2>
                        {g.rows.map((r) => <SubmissionRowLink key={r.id} row={r} to={link(`/results/${encodeURIComponent(r.id)}`)} />)}
                      </section>
                    ))
                  )}
                  {!older && olderCount > 0 && <OlderButton n={olderCount} onClick={() => update({ older: '1' })} />}
                </div>
              </>
            )}
          </>
        )}
      </FillArea>
    </ScreenShell>
  )
}

function OlderButton({ n, onClick }: { n: number; onClick: () => void }) {
  return (
    <div data-older style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <button type="button" data-tu-press onClick={onClick} style={secondaryButton}>{UI.showOlder}</button>
      <span style={{ fontFamily: FONT, fontSize: 16, color: T.textSoft }}>{UI.olderHint(n)}</span>
    </div>
  )
}
