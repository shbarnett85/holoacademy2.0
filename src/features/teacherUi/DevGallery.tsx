/* גלריית ערכת הממשק למסכי מורה — DEV בלבד (/dev/teacher-ui). להסתכלות על כל הרכיבים בבהיר ובכהה.
   הטקסטים כאן הם דוגמאות לתצוגה בלבד; במסכים אמיתיים משפטים בא מ-findingsNarrative. */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { SUBJECTS } from '../../shared/lib/subjects'
import { RESULTS_TEXT, attentionBadgeText, howWeCalcResultsLines, narrateClassSummary } from '../../shared/lib/findingsNarrative'
import { useTheme } from '../../shared/lib/useTheme'
import {
  AXIS_LABEL_HEIGHT, BigChoiceButton, ChartFrame, ChoiceGrid, EmptyState, GuestLensSwitcher, HowWeCalc, ModeToggle, MonthAxis, ProgressBar,
  ScreenShell, Sentence, StatusChip, SubjectBadge, SubjectDot, SubjectLinkButton, TabBar, T, buildTimeAxis, tabPanelProps,
} from './index'

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: T.muted }}>{title}</h2>
      {children}
    </section>
  )
}

const SAMPLE = [
  { date: '2025-10-12', v: 5.2 }, { date: '2025-11-20', v: 5.6 }, { date: '2025-12-15', v: 6.1 },
  { date: '2026-01-18', v: 5.9 }, { date: '2026-02-22', v: 6.8 }, { date: '2026-03-30', v: 7.3 },
]

function SampleChart() {
  const axis = (w: number) => buildTimeAxis({ from: SAMPLE[0].date, to: SAMPLE[SAMPLE.length - 1].date, x0: 44, x1: w - 12 })
  return (
    <ChartFrame height={200 + AXIS_LABEL_HEIGHT - 28} ariaLabel="דוגמה: רמה לאורך החודשים">
      {({ width, height }) => {
        const a = axis(width)
        const top = 12, base = height - AXIS_LABEL_HEIGHT
        const y = (v: number): number => base - ((v - 4) / 4) * (base - top)
        const pts = SAMPLE.map((p) => `${a.xOf(p.date).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
        return (
          <>
            {[4, 6, 8].map((t) => (
              <g key={t}>
                <line x1={a.x0} x2={a.x1} y1={y(t)} y2={y(t)} style={{ stroke: T.grid }} strokeDasharray="2 4" />
                <text x={a.x0 - 8} y={y(t) + 5} textAnchor="end" fontSize="14" style={{ fill: T.axis }}>{t}</text>
              </g>
            ))}
            <MonthAxis axis={a} y={base} gridTop={top} />
            <polyline points={pts} fill="none" style={{ stroke: T.accent }} strokeWidth="3" strokeLinejoin="round" />
            {SAMPLE.map((p) => <circle key={p.date} cx={a.xOf(p.date)} cy={y(p.v)} r="5" style={{ fill: T.pointFill, stroke: T.accent }} strokeWidth="2.5" />)}
          </>
        )
      }}
    </ChartFrame>
  )
}

export default function DevGallery() {
  const light = useTheme()
  const [tab, setTab] = useState('overview')
  const [tab2, setTab2] = useState('a')
  const [mode, setMode] = useState('class')
  const [picked, setPicked] = useState('6b')
  return (
    <ScreenShell
      active="results"
      title="איך נראית ערכת הממשק למסכי מורה?"
      breadcrumb={[{ label: 'תוצאות', to: '/results' }, { label: 'המהפכה הצרפתית', onClick: () => undefined }, { label: 'ו2' }]}
      titleAside={<span style={{ fontSize: 14, fontWeight: 700, color: T.muted }}>({light ? 'מצב בהיר' : 'מצב כהה'} · DEV)</span>}
      lensSwitcher={<ModeToggle compact ariaLabel="צפייה בתור" value={mode} onChange={setMode} options={[{ id: 'class', label: 'כל הכיתה' }, { id: 'student', label: 'לפי תלמיד' }]} />}
      howWeCalc={{ lines: howWeCalcResultsLines() }}
    >
      <Sentence tone="attention" label="במשפט אחד">
        {narrateClassSummary({ total: 24, completed: 18, inProgress: 3, notStarted: 3, avgSolvedShare: 0.62, hardest: { title: 'סדר האירועים', attempted: 18, wrong: 11, topErrorOptionText: 'התשובה השלישית', topErrorCount: 7 } })}
      </Sentence>

      <Block title="TabBar — ראשי (עם טאב חסום) + שורה שנייה">
        <TabBar ariaLabel="חלקי הדוח" idPrefix="gal" withPanels value={tab} onChange={setTab} items={[
          { id: 'overview', label: 'סקירה' },
          { id: 'challenges', label: 'אתגרים', badge: attentionBadgeText(2) },
          { id: 'students', label: 'תלמידים' },
          { id: 'subject', label: 'מקצועות אחרים', locked: true, lockedReason: 'זמין למחנך/ת הכיתה' },
        ]} />
        <TabBar variant="secondary" ariaLabel="תצוגות משנה" value={tab2} onChange={setTab2} items={[
          { id: 'a', label: 'לפי אתגר' }, { id: 'b', label: 'לפי תלמיד/ה' }, { id: 'c', label: 'טעויות נפוצות' },
        ]} />
        <div {...tabPanelProps('gal', tab)} style={{ color: T.textSoft, fontSize: 16 }}>תוכן הטאב הנבחר: {tab}</div>
      </Block>

      <Block title="SubjectBadge / SubjectDot — כל המקצועות (צבע + אייקון + שם)">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {SUBJECTS.map((s) => <SubjectBadge key={s.code} code={s.code} />)}
          <SubjectBadge code={null} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
          {SUBJECTS.slice(0, 5).map((s) => <SubjectDot key={s.code} code={s.code} />)}
        </div>
      </Block>

      <Block title="SubjectLinkButton — קיצור/שם מקצוע כפתור (קישור, 44px)">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {SUBJECTS.slice(0, 4).map((s) => <SubjectLinkButton key={s.code} code={s.code} to="/dev/teacher-ui" chevron={false} />)}
          <SubjectLinkButton code="math" to="/dev/teacher-ui" />
        </div>
      </Block>

      <Block title="GuestLensSwitcher — מורה אורח בלבד (כאן force; הערך נשמר ב-sessionStorage holo_guest_lens)">
        <GuestLensSwitcher force />
      </Block>

      <Block title="StatusChip">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <StatusChip status="completed" /><StatusChip status="in_progress" /><StatusChip status="not_started" />
          <StatusChip status="attention" detail="ויתר/ה על כמה אתגרים" />
        </div>
      </Block>

      <Block title="ChoiceGrid + BigChoiceButton">
        <ChoiceGrid ariaLabel="בחרו כיתה">
          <BigChoiceButton label="ו1" sublabel="24 תלמידים" selected={picked === '6a'} onClick={() => setPicked('6a')} />
          <BigChoiceButton label="ו2" sublabel="26 תלמידים" badge={{ text: attentionBadgeText(3) }} selected={picked === '6b'} onClick={() => setPicked('6b')} />
          <BigChoiceButton label="ד1" sublabel="22 תלמידים" badge={{ text: 'כולם סיימו', tone: 'positive' }} selected={picked === '4a'} onClick={() => setPicked('4a')} />
        </ChoiceGrid>
      </Block>

      <Block title="ProgressBar">
        <ProgressBar done={11} total={24} label="הצליחו" />
        <ProgressBar done={18} total={24} label="סיימו" showPercent tone="positive" />
        <ProgressBar done={0} total={24} label="הצליחו" tone="attention" />
      </Block>

      <Block title="ציר זמן משותף (ChartFrame + MonthAxis)">
        <SampleChart />
      </Block>

      <Block title="HowWeCalc — בכל מסך הוא הכפתור בראש העמוד (prop howWeCalc של ScreenShell); כאן גם הגרסה הפנימית (details) למסמכים">
        <HowWeCalc lines={howWeCalcResultsLines()} />
      </Block>

      <Block title="EmptyState">
        <EmptyState title={RESULTS_TEXT.emptyList} whatNext={RESULTS_TEXT.noChallengeData} ctaLabel={RESULTS_TEXT.emptyListCta} ctaTo="/creator/library" />
      </Block>
    </ScreenShell>
  )
}
