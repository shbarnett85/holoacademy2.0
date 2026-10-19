import { useMemo, useState } from 'react'
import type { Roster } from '../../shared/types/analyticsV2'
import ClassSubjectView from './ClassSubjectView'
import StudentView from './StudentView'
import { Button, Chip, ErrorBox, Loading, Notice, Panel } from './ui'
import { C } from './tokens'
import { useV2, type V2Params } from './v2api'

export interface NavState {
  student: string | null
  setStudent: (id: string | null) => void
  openBriefing: (scope: 'student' | 'class', id: string) => void
  openFeedback: (studentId: string) => void
}

function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string }[] }) {
  return (
    <div role="tablist" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {items.map((it) => (
        <button key={it.id} role="tab" aria-selected={value === it.id} type="button" onClick={() => onChange(it.id)}
          style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, padding: '6px 14px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${value === it.id ? C.accent : C.border}`, background: value === it.id ? 'var(--t20)' : 'transparent', color: value === it.id ? C.accentBright : C.muted }}>
          {it.label}
        </button>
      ))}
    </div>
  )
}

function RosterList({ roster, selected, onSelect }: { roster: Roster; selected: string | null; onSelect: (id: string) => void }) {
  const [q, setQ] = useState('')
  const list = useMemo(() => roster.students.filter((s) => s.displayName.includes(q.trim())), [roster, q])
  return (
    <Panel title={`תלמידים (${roster.students.length})`} style={{ flex: '0 0 280px', maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' }}>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש תלמיד/ה" aria-label="חיפוש תלמיד"
        style={{ width: '100%', boxSizing: 'border-box', marginBottom: 10, padding: '7px 10px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, fontFamily: 'var(--font-display)', fontSize: 13 }} />
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {list.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => onSelect(s.id)} aria-current={selected === s.id}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '7px 10px', borderRadius: 10, cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 13, textAlign: 'start',
                border: `1px solid ${selected === s.id ? C.accent : C.border}`, background: selected === s.id ? 'var(--t20)' : 'transparent', color: C.textSoft }}>
              <span>{s.displayName}</span>
              <span style={{ display: 'inline-flex', gap: 4 }}>
                {s.earlyWarning && <Chip tone="attention" title="התרעה מוקדמת: ירידה מקבילה בכמה מקצועות">🔔</Chip>}
                {s.attention > 0 && <Chip tone="attention" title="אירועים או דפוסים לתשומת לב">● {s.attention}</Chip>}
                {s.positive > 0 && <Chip tone="positive" title="אירועים חיוביים">▲ {s.positive}</Chip>}
              </span>
            </button>
          </li>
        ))}
        {list.length === 0 && <li style={{ color: C.muted, fontSize: 12.5 }}>לא נמצאו תלמידים.</li>}
      </ul>
    </Panel>
  )
}

/* עדשת מחנך/ת: תלמידי הכיתה + תמונת כיתה (כל המקצועות) */
export function HomeroomView({ params, nav }: { params: V2Params; nav: NavState }) {
  const { data: roster, loading, error } = useV2<Roster>('/roster', params)
  const [tab, setTab] = useState<'students' | 'class'>('students')
  const [subject, setSubject] = useState<string | null>(null)
  if (loading && !roster) return <Loading />
  if (error) return <ErrorBox message={error} />
  if (!roster) return null
  const cls = roster.classes[0]
  if (!cls) return <Notice>אין עדיין מספיק נתונים — לא נמצאה כיתה.</Notice>
  const warnings = roster.students.filter((s) => s.earlyWarning)
  const subj = subject ?? cls.subjects[0]?.code ?? 'math'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 20, color: C.text }}>כיתת החינוך {cls.name}</h2>
        <Chip tone="accent">{cls.studentCount} תלמידים</Chip>
        <div style={{ flex: 1 }} />
        <Tabs value={tab} onChange={setTab} items={[{ id: 'students', label: 'תלמידים' }, { id: 'class', label: 'תמונת כיתה לפי מקצוע' }]} />
      </div>
      {tab === 'students' ? (
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <RosterList roster={roster} selected={nav.student} onSelect={nav.setStudent} />
          <div style={{ flex: '1 1 520px', minWidth: 0 }}>
            {nav.student ? (
              <StudentView studentId={nav.student} params={params} onBriefing={() => nav.openBriefing('student', nav.student as string)} onFeedback={() => nav.openFeedback(nav.student as string)} />
            ) : (
              <Panel title="תמונת מצב כיתתית">
                <p style={{ margin: '0 0 10px', fontSize: 13.5, lineHeight: 1.8, color: C.textSoft }}>בחרו תלמיד/ה מהרשימה כדי לראות את כל המקצועות זה לצד זה, או עברו ל"תמונת כיתה" לתפיסות שגויות ושיפורים כיתתיים.</p>
                {warnings.length > 0 && (
                  <>
                    <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>התרעות מוקדמות — ירידה מקבילה בכמה מקצועות:</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {warnings.map((w) => <Button key={w.id} onClick={() => nav.setStudent(w.id)}>🔔 {w.displayName}</Button>)}
                    </div>
                  </>
                )}
              </Panel>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Tabs value={subj} onChange={setSubject} items={cls.subjects.map((s) => ({ id: s.code, label: s.nameHe }))} />
          <ClassSubjectView classId={cls.id} subject={subj} params={params}
            onOpenStudent={(id) => { nav.setStudent(id); setTab('students') }} onBriefing={() => nav.openBriefing('class', cls.id)} />
        </div>
      )}
    </div>
  )
}

/* עדשת מורה מקצועי/ת: כיתה במקצוע שלו/ה; מקצועות אחרים אפורים */
export function SubjectTeacherView({ params, nav, subject, classes }: { params: V2Params; nav: NavState; subject: string; classes: { id: string; name: string }[] }) {
  const [classId, setClassId] = useState<string | null>(null)
  const active = classId && classes.some((c) => c.id === classId) ? classId : classes[0]?.id
  if (!active) return <Notice>אין כיתות עם מקצוע זה.</Notice>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: C.muted }}>כיתה:</span>
        <Tabs value={active} onChange={(v) => { setClassId(v); nav.setStudent(null) }} items={classes.map((c) => ({ id: c.id, label: c.name }))} />
      </div>
      {nav.student ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div><Button onClick={() => nav.setStudent(null)}>← חזרה לכיתה</Button></div>
          <StudentView studentId={nav.student} params={params} onBriefing={() => nav.openBriefing('student', nav.student as string)} onFeedback={() => nav.openFeedback(nav.student as string)} />
        </div>
      ) : (
        <ClassSubjectView classId={active} subject={subject} params={params} onOpenStudent={nav.setStudent} onBriefing={() => nav.openBriefing('class', active)} />
      )}
    </div>
  )
}
