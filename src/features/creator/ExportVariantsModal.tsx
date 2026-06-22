import { useCallback, useEffect, useRef, useState } from 'react'
import { apiJson } from '../../shared/lib/api'
import { glass, micro } from './studioStyles'

interface ClassOption { id: string; gradeLabel: string; name: string }
interface StudentItem { id: string; name: string; gender?: string | null }
type Status = 'pending' | 'working' | 'done' | 'error'
interface Snapshot { textLevel: number; perPuzzleLevel?: Record<string, number>; gender?: string | null }

interface Props {
  questId: string
  questTitle: string
  onClose: () => void
}

/* הודעות שמתחלפות בזמן עיבוד תלמיד — מתאימות לסדר הפעולות בשרת */
const WORK_MSGS = ['טוען פרופיל…', 'מתאים רמת טקסט…', 'מכוון קושי חידות…', 'מגבש גרסה אישית…']

const statusColor = (s: Status) =>
  s === 'done' ? '#7ef6ff' : s === 'error' ? '#ff7099' : s === 'working' ? '#ffe484' : 'rgba(255,255,255,.28)'

const genderLabel = (g: string | null | undefined) =>
  g === 'male' ? '♂' : g === 'female' ? '♀' : null

export default function ExportVariantsModal({ questId, questTitle, onClose }: Props) {
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [classId, setClassId] = useState('')
  const [students, setStudents] = useState<StudentItem[]>([])
  const [statuses, setStatuses] = useState<Record<string, Status>>({})
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({})
  const [phase, setPhase] = useState<'select' | 'running' | 'done'>('select')
  const [currentIdx, setCurrentIdx] = useState(-1)
  const [loadingStudents, setLoadingStudents] = useState(false)
  const [workMsgIdx, setWorkMsgIdx] = useState(0)
  const runningRef = useRef(false)
  const cancelledRef = useRef(false)

  useEffect(() => {
    apiJson<{ classes: ClassOption[] }>('/api/staff/classes')
      .then(r => setClasses(r.classes ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!classId) { setStudents([]); return }
    setLoadingStudents(true)
    apiJson<{ students: StudentItem[] }>(`/api/staff/classes/${classId}/students`)
      .then(r => { setStudents(r.students ?? []); setLoadingStudents(false) })
      .catch(() => setLoadingStudents(false))
  }, [classId])

  /* הודעות מתחלפות בזמן עיבוד */
  useEffect(() => {
    if (phase !== 'running') return
    const t = setInterval(() => setWorkMsgIdx(p => (p + 1) % WORK_MSGS.length), 900)
    return () => clearInterval(t)
  }, [phase])

  const runForStudents = useCallback(async (list: StudentItem[]) => {
    if (!list.length) return
    runningRef.current = true
    cancelledRef.current = false
    setPhase('running')
    setStatuses(prev => {
      const next = { ...prev }
      for (const s of list) next[s.id] = 'pending'
      return next
    })

    for (let i = 0; i < list.length; i++) {
      if (cancelledRef.current) break
      const student = list[i]
      /* מצא את אינדקס התלמיד ברשימה הכוללת */
      const globalIdx = students.findIndex(s => s.id === student.id)
      setCurrentIdx(globalIdx)
      setWorkMsgIdx(0)
      setStatuses(prev => ({ ...prev, [student.id]: 'working' }))
      try {
        const res = await apiJson<{ ok: boolean; profileSnapshot?: Snapshot }>(
          `/api/quests/${questId}/variant`,
          { method: 'POST', body: JSON.stringify({ studentId: student.id }) },
        )
        setStatuses(prev => ({ ...prev, [student.id]: 'done' }))
        if (res.profileSnapshot) setSnapshots(prev => ({ ...prev, [student.id]: res.profileSnapshot! }))
      } catch {
        setStatuses(prev => ({ ...prev, [student.id]: 'error' }))
      }
    }

    setCurrentIdx(-1)
    runningRef.current = false
    setPhase('done')
  }, [students, questId])

  const startExport = useCallback(() => runForStudents(students), [runForStudents, students])

  const retryFailed = useCallback(() => {
    const failed = students.filter(s => statuses[s.id] === 'error')
    runForStudents(failed)
  }, [runForStudents, students, statuses])

  const doneCount = Object.values(statuses).filter(s => s === 'done').length
  const errorCount = Object.values(statuses).filter(s => s === 'error').length
  const total = students.length
  const processed = doneCount + errorCount
  const pct = total > 0 ? Math.round(processed / total * 100) : 0

  /* בזמן ריצה — אין סגירה ב-overlay */
  const handleOverlayClick = () => { if (phase !== 'running') onClose() }

  const currentStudent = currentIdx >= 0 ? students[currentIdx] : null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(2,6,14,.82)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={handleOverlayClick}>
      <div onClick={e => e.stopPropagation()}
        style={{ ...glass, maxWidth: 500, width: '100%', padding: 28, borderRadius: 18, maxHeight: '88vh', display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* כותרת */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ ...micro, fontSize: 9.5, color: 'rgba(47,243,255,.55)', marginBottom: 5 }}>ייצוא גרסאות אישיות</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--holo-text-bright)', maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{questTitle}</div>
          </div>
          {phase !== 'running' && (
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,.35)', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: '2px 4px', flexShrink: 0 }}>×</button>
          )}
        </div>

        {/* ── שלב בחירה ── */}
        {phase === 'select' && (
          <>
            <div>
              <label style={{ ...micro, fontSize: 10, color: 'rgba(47,243,255,.55)', display: 'block', marginBottom: 8 }}>בחר כיתה</label>
              <select value={classId} onChange={e => setClassId(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, background: 'rgba(4,9,18,.8)', border: '1px solid rgba(47,243,255,.25)', color: 'var(--holo-text-bright)', fontSize: 14, outline: 'none', direction: 'rtl' }}>
                <option value="">— בחר כיתה —</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.gradeLabel}</option>)}
              </select>
            </div>

            {classId && (
              <div style={{ flex: 1, overflowY: 'auto', minHeight: 60, maxHeight: 300 }}>
                {loadingStudents ? (
                  <div style={{ color: 'rgba(47,243,255,.5)', fontSize: 13, textAlign: 'center', padding: 16 }}>טוען תלמידים…</div>
                ) : students.length === 0 ? (
                  <div style={{ color: 'rgba(255,255,255,.35)', fontSize: 13, textAlign: 'center', padding: 16 }}>אין תלמידים פעילים בכיתה זו</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {students.map(s => (
                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderRadius: 8, background: 'rgba(47,243,255,.03)', border: '1px solid rgba(47,243,255,.09)' }}>
                        <span style={{ fontSize: 15, color: 'rgba(255,255,255,.18)' }}>○</span>
                        <span style={{ fontSize: 13.5, color: 'var(--holo-text-bright)' }}>{s.name}</span>
                        {genderLabel(s.gender) && <span style={{ fontSize: 10.5, color: s.gender === 'male' ? '#7ab8ff' : '#ff9bd6', marginRight: 'auto' }}>{genderLabel(s.gender)}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 9, background: 'transparent', border: '1px solid rgba(255,255,255,.15)', color: 'rgba(255,255,255,.45)', cursor: 'pointer', fontSize: 13 }}>ביטול</button>
              <button onClick={startExport} disabled={!classId || !students.length || loadingStudents}
                style={{ padding: '9px 20px', borderRadius: 9, background: (!classId || !students.length || loadingStudents) ? 'rgba(47,243,255,.13)' : 'linear-gradient(120deg,#2ff3ff,#9b8cff)', border: 'none', color: '#04101c', fontWeight: 700, cursor: (!classId || !students.length || loadingStudents) ? 'not-allowed' : 'pointer', fontSize: 13.5 }}>
                ✨ התחל ייצוא ({students.length} תלמידים)
              </button>
            </div>
          </>
        )}

        {/* ── שלב ריצה / סיום ── */}
        {(phase === 'running' || phase === 'done') && (
          <>
            {/* progress bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: phase === 'done' ? (errorCount > 0 ? '#ffb37a' : '#7ef6ff') : 'rgba(47,243,255,.8)' }}>
                  {phase === 'done'
                    ? errorCount > 0
                      ? `${doneCount} מוכנים ✓  •  ${errorCount} נכשל${errorCount > 1 ? 'ו' : ''} ✗`
                      : `✓ כל ${doneCount} הגרסאות מוכנות`
                    : `מכין הדמיות מותאמות… ${processed + 1}/${total}`}
                </span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,.38)' }}>{pct}%</span>
              </div>
              <div style={{ height: 5, borderRadius: 4, background: 'rgba(47,243,255,.09)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 4, transition: 'width .45s ease', width: `${pct}%`, background: errorCount > 0 && phase === 'done' ? 'linear-gradient(90deg,#2ff3ff,#ffb37a)' : 'linear-gradient(90deg,#2ff3ff,#9b8cff)' }} />
              </div>
            </div>

            {/* תלמיד נוכחי */}
            {phase === 'running' && currentStudent && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', borderRadius: 12, background: 'rgba(255,228,132,.06)', border: '1px solid rgba(255,228,132,.3)' }}>
                <span style={{ fontSize: 20, animation: 'holo-dot-pulse 1s infinite' }}>⚙</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: '#ffe484' }}>
                    מכין ל{currentStudent.name}
                    <span style={{ fontWeight: 400, fontSize: 12, color: 'rgba(255,255,255,.4)', marginRight: 6 }}>— תלמיד {(currentIdx + 1)}/{total}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'rgba(255,228,132,.6)', marginTop: 3 }}>{WORK_MSGS[workMsgIdx]}</div>
                </div>
              </div>
            )}

            {/* רשימת תלמידים */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 340 }}>
              {students.map((s, i) => {
                const st = statuses[s.id] ?? 'pending'
                const isCurrent = phase === 'running' && i === currentIdx
                const snap = snapshots[s.id]
                return (
                  <div key={s.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 13px', borderRadius: 9,
                    background: isCurrent ? 'rgba(255,228,132,.05)' : st === 'done' ? 'rgba(47,243,255,.03)' : st === 'error' ? 'rgba(255,112,153,.04)' : 'rgba(4,9,18,.35)',
                    border: `1px solid ${isCurrent ? 'rgba(255,228,132,.28)' : st === 'done' ? 'rgba(47,243,255,.15)' : st === 'error' ? 'rgba(255,112,153,.25)' : 'rgba(255,255,255,.06)'}`,
                    transition: 'all .22s ease',
                  }}>
                    {/* אייקון */}
                    <span style={{ fontSize: st === 'working' ? 13 : 15, minWidth: 18, textAlign: 'center', color: statusColor(st), fontWeight: st === 'done' ? 700 : 400 }}>
                      {st === 'done' ? '✓' : st === 'error' ? '✗' : st === 'working' ? '⚙' : '○'}
                    </span>
                    {/* שם */}
                    <span style={{ fontSize: 13, color: isCurrent ? '#ffe484' : st === 'pending' ? 'rgba(255,255,255,.35)' : 'var(--holo-text-bright)', fontWeight: isCurrent ? 700 : 400, minWidth: 0 }}>
                      {s.name}
                    </span>
                    {/* גנדר */}
                    {genderLabel(s.gender) && <span style={{ fontSize: 10, color: s.gender === 'male' ? '#7ab8ff' : '#ff9bd6' }}>{genderLabel(s.gender)}</span>}
                    {/* פרטי snapshot / שגיאה */}
                    <span style={{ marginRight: 'auto', fontSize: 11, color: st === 'error' ? '#ff7099' : 'rgba(47,243,255,.45)', whiteSpace: 'nowrap' }}>
                      {st === 'done' && snap ? `רמה ${snap.textLevel}${snap.gender === 'male' ? ' · זכר' : snap.gender === 'female' ? ' · נקבה' : ''}` : ''}
                      {st === 'error' ? 'שגיאה' : ''}
                      {st === 'working' ? WORK_MSGS[workMsgIdx] : ''}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* כפתור ביטול בזמן ריצה */}
            {phase === 'running' && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => { cancelledRef.current = true }}
                  style={{ padding: '7px 16px', borderRadius: 9, background: 'transparent', border: '1px solid rgba(255,255,255,.15)', color: 'rgba(255,255,255,.4)', cursor: 'pointer', fontSize: 13 }}>
                  עצור
                </button>
              </div>
            )}

            {/* כפתורי סיום */}
            {phase === 'done' && (
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
                {errorCount > 0 && (
                  <button onClick={retryFailed}
                    style={{ padding: '9px 18px', borderRadius: 9, background: 'transparent', border: '1px solid rgba(255,112,153,.5)', color: '#ff9bb3', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    ↻ נסה שוב ({errorCount} נכשל{errorCount > 1 ? 'ו' : ''})
                  </button>
                )}
                <button onClick={onClose}
                  style={{ padding: '9px 22px', borderRadius: 9, background: 'linear-gradient(120deg,#2ff3ff,#9b8cff)', border: 'none', color: '#04101c', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                  סגור
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
