/* תצוגה חיה של שיעור: "מה קורה עכשיו בשיעור?" — אריח לכל תלמיד/ה: שם, מצב (אייקון + מילה + צבע), הסצנה שהוא/היא בה, והסיבה במילים (נתקע/ה, ויתר/ה, לא פעיל/ה).
   רענון אוטומטי כל LiveView.refreshMs (polling, בלי websockets) כשהלשונית גלויה. השמות מוצגים — אין כאן מצב הקרנה.
   הכללים (3 טעויות ברצף, 3 דקות בלי התקדמות, 2 דקות בלי פעולה) הם של השרת (LIVE_RULES) ומוסברים ב"איך חישבנו?". */
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { howWeCalcLiveLines, LIVE_STATUS_TEXT } from '../../shared/lib/findingsNarrative'
import type { LiveStatus, LiveTile, LiveView } from '../../shared/types/resultsV1'
import { EmptyState, FONT, Icon, RADIUS, ScreenShell, Sentence, T } from '../teacherUi'
import type { BreadcrumbItem, IconName } from '../teacherUi'
import ErrorPanel from './ErrorPanel'
import FillArea from './FillArea'
import { ExtraIcon } from './marks'
import { useLens, useResultsData } from './resultsApi'
import ResultsLensSwitcher from './ResultsLensSwitcher'
import { card, scrollArea, secondaryButton, soft } from './styles'
import { UI } from './text'

const enc = encodeURIComponent

/* אייקון + צבע לכל מצב. הצבע משני: תמיד יש גם אייקון ומילה */
const STATUS_META: Record<LiveStatus, { color: string; icon: IconName | 'flag' }> = {
  working: { color: T.accent, icon: 'pulse' },
  stuck: { color: T.bad, icon: 'alert' },
  gave_up: { color: T.warn, icon: 'flag' },
  inactive: { color: T.muted, icon: 'clock' },
  not_started: { color: T.muted, icon: 'circle' },
  finished: { color: T.good, icon: 'check' },
}
const ORDER: LiveStatus[] = ['stuck', 'gave_up', 'working', 'inactive', 'not_started', 'finished']

function StatusMark({ status, size = 18 }: { status: LiveStatus; size?: number }) {
  const m = STATUS_META[status]
  return <span style={{ color: m.color, display: 'inline-flex' }}>{m.icon === 'flag' ? <ExtraIcon name="flag" size={size} /> : <Icon name={m.icon} size={size} strokeWidth={status === 'finished' ? 2.6 : 2} />}</span>
}

function Tile({ t }: { t: LiveTile }) {
  const m = STATUS_META[t.status]
  const attention = t.status === 'stuck' || t.status === 'gave_up'
  return (
    <li data-live-tile={t.studentId} data-live-status={t.status}
      style={{ listStyle: 'none', padding: '6px 12px 8px', borderRadius: RADIUS.md, background: T.surface, boxSizing: 'border-box', border: `${attention ? 2.5 : 1.5}px solid ${attention ? m.color : T.controlBorder}`, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: FONT, fontSize: 17, fontWeight: 800, color: T.text, lineHeight: 1.35 }}>
        <StatusMark status={t.status} />
        <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{t.name}</span>
      </div>
      <div style={{ fontFamily: FONT, fontSize: 16, fontWeight: 700, color: T.text, lineHeight: 1.4 }}>{LIVE_STATUS_TEXT[t.status]}</div>
      {t.sceneOrder !== null && t.sceneTitle && <div style={{ ...soft, lineHeight: 1.4 }}>{UI.liveScene(t.sceneOrder, t.sceneTitle)}</div>}
      {t.reasonText && <div style={{ ...soft, lineHeight: 1.4, color: T.text }}>{t.reasonText}</div>}
    </li>
  )
}

export function LiveBody({ v }: { v: LiveView }) {
  const time = new Date(v.polledAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jerusalem' })
  return (
    <>
      <Sentence compact tone={v.counts.stuck + v.counts.gave_up > 0 ? 'attention' : 'neutral'}>{v.summary}</Sentence>
      {v.head.state !== 'active_now' && <p data-live-inactive style={{ ...soft, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ color: T.muted, display: 'inline-flex' }}><Icon name="info" size={18} /></span>{UI.liveNotActive}</p>}
      {!v.available && <p data-live-unavailable style={{ ...soft, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ color: T.muted, display: 'inline-flex' }}><Icon name="info" size={18} /></span>{UI.liveUnavailable}</p>}
      <section aria-label={UI.liveLegend} data-live-legend style={{ ...card, flex: '0 0 auto', padding: '6px 14px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 18px' }}>
        {ORDER.map((s) => (
          <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FONT, fontSize: 16, color: T.text, whiteSpace: 'nowrap' }}>
            <StatusMark status={s} />{LIVE_STATUS_TEXT[s]}<strong>{v.counts[s]}</strong>
          </span>
        ))}
        <span style={{ flex: 1 }} />
        <span role="status" style={{ ...soft, whiteSpace: 'nowrap' }}>{UI.liveRefreshing(Math.round(v.refreshMs / 1000))} · {UI.liveUpdatedAt(time)}</span>
      </section>
      {v.tiles.length === 0 ? (
        <EmptyState title={UI.rosterEmpty} />
      ) : (
        <ul data-live-tiles style={{ ...scrollArea, margin: 0, padding: '0 0 4px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(215px, 1fr))', gap: 8, alignContent: 'start' }}>
          {v.tiles.map((t) => <Tile key={t.studentId} t={t} />)}
        </ul>
      )}
    </>
  )
}

export default function LivePage({ submissionId }: { submissionId: string }) {
  const navigate = useNavigate()
  const { isGuest, scope, apiQs, link } = useLens()
  const q = useResultsData<LiveView>('live', `/api/results/submission/${enc(submissionId)}/live${apiQs}`, scope)
  const reload = q.reload
  const refreshMs = q.data?.refreshMs ?? 15_000

  /* polling: רק כשהלשונית גלויה (בלשונית רקע אין טעם לטעון); גם חזרה ללשונית מרעננת מיד */
  useEffect(() => {
    const tick = (): void => { if (document.visibilityState === 'visible') reload() }
    const iv = window.setInterval(tick, refreshMs)
    document.addEventListener('visibilitychange', tick)
    return () => { window.clearInterval(iv); document.removeEventListener('visibilitychange', tick) }
  }, [reload, refreshMs])

  const toList = link('/results')
  const toLesson = link(`/results/${enc(submissionId)}`)
  const head = q.data?.head ?? null
  const crumbs: BreadcrumbItem[] = q.error
    ? [{ label: UI.crumbResults, to: toList }, { label: UI.crumbError(q.error.status) }]
    : [{ label: UI.crumbResults, to: toList }, { label: head?.title ?? UI.crumbQuest, to: toLesson }, { label: head ? UI.classWord(head.className) : UI.crumbClass, to: toLesson }, { label: UI.liveCrumb }]

  return (
    <ScreenShell active="results" title={UI.liveTitle} breadcrumb={crumbs} lensSwitcher={isGuest ? <ResultsLensSwitcher /> : undefined}
      howWeCalc={q.error ? undefined : { lines: howWeCalcLiveLines() }}>
      <FillArea>
        {q.error ? (
          <ErrorPanel error={q.error} scope="submission" backTo={toList} onRetry={q.reload} />
        ) : !q.data ? (
          <p role="status" style={{ margin: 0, fontFamily: FONT, fontSize: 17, color: T.textSoft }}>{UI.loading}</p>
        ) : (
          <>
            <div style={{ flex: '0 0 auto' }}>
              <button type="button" data-tu-press style={secondaryButton} onClick={() => { void navigate(toLesson) }}>{UI.liveBack}</button>
            </div>
            <LiveBody v={q.data} />
          </>
        )}
      </FillArea>
    </ScreenShell>
  )
}
