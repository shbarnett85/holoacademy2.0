/* מסך הרשימה: "מה התלמידים עשו בהדמיות ששלחתי?" — שורה לכל שליחה (הדמיה × כיתה × תאריך), החדשה ראשונה.
   סינון בכפתורים (כיתה; מקצוע — רק אם יש יותר ממקצוע אחד) + חיפוש בשם. הסינון חי בכתובת (?class=&subject=&q=), כך שחזרה מהדפדפן שומרת אותו. */
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { attentionBadgeText, dateHe, RESULTS_TEXT } from '../../shared/lib/findingsNarrative'
import { subjectStyle } from '../../shared/lib/subjectStyle'
import type { SubmissionList, SubmissionRow } from '../../shared/types/resultsV1'
import { EmptyState, FONT, Icon, MIN_TARGET, ProgressBar, RADIUS, ScreenShell, SubjectBadge, T } from '../teacherUi'
import ErrorPanel from './ErrorPanel'
import FillArea from './FillArea'
import FilterButtons from './FilterButtons'
import { filterSubmissions, validOption } from './logic'
import { useLens, useResultsData } from './resultsApi'
import { card, scrollArea, secondaryButton } from './styles'
import SuggestionBanner from './SuggestionBanner'
import { UI } from './text'
import Thumb from './Thumb'

function AttentionTag({ n }: { n: number }) {
  return (
    <span data-attention-tag style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 12px 3px 10px', borderRadius: 20, border: `1.5px solid ${T.warn}`, fontFamily: FONT, fontSize: 15, fontWeight: 700, color: T.text, lineHeight: 1.4 }}>
      <span style={{ color: T.warn, display: 'inline-flex' }}><Icon name="alert" size={18} /></span>
      {attentionBadgeText(n)}
    </span>
  )
}

function SubmissionRowLink({ row, to }: { row: SubmissionRow; to: string }) {
  return (
    <Link to={to} data-tu-press data-submission-row={row.id}
      style={{ ...card, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '10px 16px', textDecoration: 'none', color: T.text, border: `1.5px solid ${T.controlBorder}`, borderRadius: RADIUS.lg }}>
      <Thumb url={row.thumbUrl} subjectCode={row.subject?.code ?? null} width={84} height={64} />
      <div style={{ flex: '1 1 340px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontFamily: FONT, fontSize: 19, fontWeight: 800, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{row.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 14px', fontFamily: FONT, fontSize: 15, color: T.textSoft }}>
          <SubjectBadge code={row.subject?.code ?? null} />
          <span>{UI.classWord(row.className)}</span>
          <span>{UI.sentOn(dateHe(row.sentAt))}</span>
          {row.source !== 'mine' && row.senderName && <span>{UI.sentBy(row.senderName)}</span>}
        </div>
        <div style={{ fontFamily: FONT, fontSize: 16, color: T.text, lineHeight: 1.5 }}>{row.summary}</div>
      </div>
      <div style={{ flex: '0 1 280px', minWidth: 220, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <ProgressBar done={row.counts.completed} total={row.counts.total} label={UI.finished} />
        {row.attentionCount > 0 && <AttentionTag n={row.attentionCount} />}
      </div>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: MIN_TARGET, fontFamily: FONT, fontSize: 17, fontWeight: 800, color: T.accentStrong }}>
        {UI.open}
        <Icon name="chevLeft" size={18} />
      </span>
    </Link>
  )
}

export default function ResultsList() {
  const { apiQs, link } = useLens()
  const q = useResultsData<SubmissionList>('list', `/api/results/submissions${apiQs}`)
  const [sp, setSp] = useSearchParams()

  const data = q.data
  const classOptions = useMemo(() => (data?.filters.classes ?? []).map((c) => ({ id: c.id, label: c.name })), [data])
  const subjectOptions = useMemo(
    () => (data?.filters.subjects ?? []).map((s) => ({ id: s.code, label: subjectStyle(s.code).label, icon: <span>{subjectStyle(s.code).icon}</span> })),
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
  const filtering = !!(classId || subject || query.trim())
  const showClassFilter = classOptions.length > 1
  const showSubjectFilter = subjectOptions.length > 1

  return (
    <ScreenShell active="results" title={RESULTS_TEXT.listTitle} breadcrumb={[{ label: UI.crumbResults }]}>
      <FillArea>
        {q.error ? (
          <ErrorPanel error={q.error} scope="list" backTo={link('/results')} onRetry={q.reload} altTo={q.error.status === 403 ? link('/analytics') : undefined} />
        ) : !data ? (
          <p role="status" style={{ margin: 0, fontFamily: FONT, fontSize: 17, color: T.textSoft }}>{UI.loading}</p>
        ) : all.length === 0 ? (
          <EmptyState title={RESULTS_TEXT.emptyList} whatNext={UI.emptyWhatNext} ctaLabel={RESULTS_TEXT.emptyListCta} ctaTo="/creator/library" />
        ) : (
          <>
            <SuggestionBanner openLink={(id) => link(`/results/${encodeURIComponent(id)}`)} />

            <section aria-label={UI.filterTitle} style={{ ...card, flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: '8px 20px', flexWrap: 'wrap', padding: '8px 14px' }}>
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
              <span role="status" style={{ display: 'inline-flex', alignItems: 'center', gap: 12, fontFamily: FONT, fontSize: 16, fontWeight: 700, color: T.textSoft }}>
                {UI.countLine(shown.length, all.length)}
              </span>
              {filtering && <button type="button" data-tu-press onClick={clearAll} style={secondaryButton}>{UI.clearFilter}</button>}
            </section>

            <div data-list-scroll style={{ ...scrollArea, display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 4 }}>
              {shown.length === 0 ? (
                <EmptyState title={RESULTS_TEXT.noMatch} ctaLabel={UI.clearFilter} onCta={clearAll} />
              ) : (
                shown.map((r) => <SubmissionRowLink key={r.id} row={r} to={link(`/results/${encodeURIComponent(r.id)}`)} />)
              )}
            </div>
          </>
        )}
      </FillArea>
    </ScreenShell>
  )
}

