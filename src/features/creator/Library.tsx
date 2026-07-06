import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch, apiJson } from '../../shared/lib/api'
import { holoConfirm } from '../../shared/ui/dialog'
import { puzzleTypeLabel } from '../../shared/lib/labels'
import StudioTopBar from './StudioTopBar'
import { glass, micro } from './studioStyles'

interface QuestSummary {
  id: string
  title: string
  created_at: string
  is_published: boolean
  is_public: boolean
  /* הדמיית חזרה — נוצרה מהמושגים החלשים של מטלה (reviewOf ב-game_data) */
  is_review?: boolean
  sceneCount: number
  subject?: string | null
}

/* הדמיה בספרייה הציבורית (GET /api/library) */
interface PublicQuest {
  id: string
  title: string
  subject: string | null
  sceneCount: number
  puzzleTypes: string[]
  authorName: string
  publishedAt: string
  /* מטא שכבות (מספר שכבה 1-12, א׳=1) — מזין את פילטר טווח השכבות; null = ללא מטא */
  gradeMin?: number | null
  gradeMax?: number | null
  /* הדמיה רשמית של צוות HoloAcademy — badge ✓ רשמי */
  isOfficial?: boolean
}

interface StudentRow {
  id: string
  name: string
  classId: string
  class: string      // gradeLabel
  classCode: string
  gender: string | null
  isActive: boolean
}

const GRADES = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ז׳', 'ח׳', 'ט׳', 'י׳', 'י״א', 'י״ב']
const SUBJECTS = ['עברית', 'מתמטיקה', 'אנגלית', 'מדעים', 'תנ״ך', 'היסטוריה', 'גאוגרפיה', 'אזרחות', 'ספרות']
const CYAN = '47,243,255'
const MAGENTA = '255,69,230'
const WORK_MSGS = ['טוען פרופיל…', 'מתאים רמת טקסט…', 'מכוון קושי חידות…', 'מגבש גרסה אישית…']

/* שכבה = gradeLabel ללא ספרת הכיתה */
const layerOf = (g: string) => g.replace(/\s*\d+$/, '').trim() || g

function Thumb({ rgb }: { rgb: string }) {
  return (
    <div style={{ width: 56, height: 56, borderRadius: 13, flex: '0 0 auto', position: 'relative', overflow: 'hidden', display: 'grid', placeItems: 'center', background: `linear-gradient(140deg, rgba(${rgb},.22), rgba(8,14,26,.5))`, border: `1px solid rgba(${rgb},.32)`, boxShadow: `inset 0 0 18px rgba(${rgb},.12)` }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(rgba(${rgb},.12) 1px,transparent 1px),linear-gradient(90deg,rgba(${rgb},.12) 1px,transparent 1px)`, backgroundSize: '12px 12px' }} />
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={`rgb(${rgb})`} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 11, fontWeight: 600, color: '#9fb6cf', padding: '3px 9px', borderRadius: 20, background: 'rgba(120,180,220,.07)', border: '1px solid rgba(120,180,220,.18)', whiteSpace: 'nowrap' }}>{children}</span>
}

const cardBtn: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#bfe9ff', padding: '5px 11px', borderRadius: 9, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(120,200,255,.3)', fontFamily: 'var(--font-display)' }

/* ── כרטיס הדמיה שלי ── */
function QuestCard({ q, busy, onOpen, onPlay, onShare, onUnshare, onDelete }: {
  q: QuestSummary; busy: boolean
  onOpen: () => void; onPlay: () => void; onShare: () => void; onUnshare: () => void; onDelete: () => void
}) {
  return (
    <div onClick={onOpen}
      style={{ display: 'flex', gap: 14, padding: 14, borderRadius: 14, background: 'rgba(4,9,18,.5)', border: '1px solid rgba(120,200,255,.12)', transition: 'all .18s', cursor: 'pointer' }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(47,243,255,.45)'; e.currentTarget.style.background = 'rgba(47,243,255,.06)' }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(120,200,255,.12)'; e.currentTarget.style.background = 'rgba(4,9,18,.5)' }}>
      <Thumb rgb={CYAN} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1, fontSize: 15, fontWeight: 700, color: 'var(--holo-text-bright)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.title}</span>
          {q.is_public && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, color: '#7ef6ff', background: 'rgba(47,243,255,.12)', border: '1px solid rgba(47,243,255,.4)' }}>🌐 משותפת</span>}
          {q.is_review && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, color: '#c9b6ff', background: 'rgba(155,140,255,.12)', border: '1px solid rgba(155,140,255,.45)' }}>🔄 הדמיית חזרה</span>}
          <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, color: q.is_published ? '#7effc9' : '#ffce8a', background: q.is_published ? 'rgba(74,222,128,.12)' : 'rgba(255,184,107,.12)', border: '1px solid ' + (q.is_published ? 'rgba(74,222,128,.4)' : 'rgba(255,184,107,.4)') }}>{q.is_published ? 'פורסם' : 'טיוטה'}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          <Chip>{q.sceneCount} סצנות</Chip>
          {q.subject && <Chip>{q.subject}</Chip>}
          <Chip>{new Date(q.created_at).toLocaleDateString('he-IL')}</Chip>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 11, flexWrap: 'wrap' }}>
          {/* הסר שיתוף — מופיע רק כשהדמיה משותפת, כפתור משני */}
          {q.is_public && (
            <button disabled={busy} onClick={(e) => { e.stopPropagation(); onUnshare() }}
              style={{ ...cardBtn, fontSize: 11, color: '#ff9bb3', borderColor: 'rgba(255,120,150,.35)', opacity: busy ? 0.5 : 1 }}>
              הסר מהספרייה
            </button>
          )}
          <div style={{ flex: 1 }} />
          {/* מחיקה — כפתור משני אדום (עם אישור בהורה) */}
          <button disabled={busy} title="מחק הדמיה" onClick={(e) => { e.stopPropagation(); onDelete() }}
            style={{ ...cardBtn, color: '#ff9bb3', borderColor: 'rgba(255,120,150,.35)', opacity: busy ? 0.5 : 1 }}>
            מחק 🗑️
          </button>
          {/* שתף — תמיד גלוי, פותח מודאל */}
          <button disabled={busy} onClick={(e) => { e.stopPropagation(); onShare() }}
            style={{ ...cardBtn, color: '#c8b8ff', borderColor: 'rgba(155,140,255,.45)', opacity: busy ? 0.5 : 1 }}>
            שתף
          </button>
          <button onClick={(e) => { e.stopPropagation(); onOpen() }} style={cardBtn}>ערוך</button>
          <button onClick={(e) => { e.stopPropagation(); onPlay() }}
            style={{ ...cardBtn, color: '#04101c', background: 'linear-gradient(120deg,#2ff3ff,#9b8cff)', border: 'none', fontWeight: 700 }}>
            הפעל ▶
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── כרטיס ספרייה ציבורית ── */
function PublicCard({ q, busy, onCopy, onReport }: { q: PublicQuest; busy: boolean; onCopy: () => void; onReport: () => void }) {
  return (
    <div style={{ display: 'flex', gap: 14, padding: 14, borderRadius: 14, background: 'rgba(4,9,18,.5)', border: '1px solid rgba(255,120,210,.14)' }}>
      <Thumb rgb={MAGENTA} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 15, fontWeight: 700, color: 'var(--holo-text-bright)' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.title}</span>
          {q.isOfficial && <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 20, color: '#5fffb0', background: 'rgba(95,255,176,.1)', border: '1px solid rgba(95,255,176,.45)' }}>✓ רשמי</span>}
        </span>
        <div style={{ fontSize: 11.5, color: '#c79adf', marginTop: 3 }}>נוצר במקור על ידי {q.authorName}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {q.subject && <Chip>{q.subject}</Chip>}
          {q.gradeMin != null && q.gradeMax != null && <Chip>{q.gradeMin === q.gradeMax ? `כיתה ${GRADES[q.gradeMin - 1] ?? q.gradeMin}` : `כיתות ${GRADES[q.gradeMin - 1] ?? q.gradeMin}–${GRADES[q.gradeMax - 1] ?? q.gradeMax}`}</Chip>}
          <Chip>{q.sceneCount} סצנות</Chip>
          {q.puzzleTypes.slice(0, 3).map((t) => <Chip key={t}>{puzzleTypeLabel(t)}</Chip>)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 11, flexWrap: 'wrap' }}>
          <button disabled={busy} onClick={onReport} style={{ ...cardBtn, color: '#ff9bb3', borderColor: 'rgba(255,120,150,.35)', opacity: busy ? 0.5 : 1 }}>דווח 🚩</button>
          <div style={{ flex: 1 }} />
          <button disabled={busy} onClick={onCopy} style={{ ...cardBtn, color: '#04101c', background: 'linear-gradient(120deg,#ff45e6,#9b8cff)', border: 'none', fontWeight: 700, opacity: busy ? 0.6 : 1 }}>השתמש (העתק אליי) 📥</button>
        </div>
      </div>
    </div>
  )
}

/* ── מודאל השיתוף + ייצוא גרסאות אישיות ── */
type ShareStep = 'pick' | 'students' | 'community' | 'generating' | 'generated'
type GenStatus = 'pending' | 'working' | 'done' | 'error'
interface GenSnapshot { textLevel: number; gender: string | null }

function ShareModal({ quest, onClose, onDone }: {
  quest: QuestSummary
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const [step, setStep] = useState<ShareStep>('pick')
  const [students, setStudents] = useState<StudentRow[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [layerFilter, setLayerFilter] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /* אזהרות פתוחות שהשרת החזיר בניסיון שיתוף (409) — דורשות אישור מורה מפורש */
  const [shareWarnings, setShareWarnings] = useState<string[] | null>(null)

  /* ── ייצוא גרסאות ── */
  const [genStudents, setGenStudents] = useState<StudentRow[]>([])
  const [genStatuses, setGenStatuses] = useState<Record<string, GenStatus>>({})
  const [genSnapshots, setGenSnapshots] = useState<Record<string, GenSnapshot>>({})
  const [genIdx, setGenIdx] = useState(-1)
  const [workMsgIdx, setWorkMsgIdx] = useState(0)
  const runningRef = useRef(false)
  const cancelledRef = useRef(false)

  useEffect(() => {
    if (step !== 'generating') return
    const id = setInterval(() => setWorkMsgIdx(i => (i + 1) % WORK_MSGS.length), 900)
    return () => clearInterval(id)
  }, [step])

  /* טעינת תלמידים בכניסה לשלב תלמידים */
  useEffect(() => {
    if (step !== 'students' || students !== null) return
    apiJson<{ students: StudentRow[] }>('/api/staff/students')
      .then((b) => setStudents(b.students.filter((s) => s.isActive)))
      .catch(() => setStudents([]))
  }, [step, students])

  /* שכבות וכיתות ייחודיות */
  const layers = useMemo(() => [...new Set((students ?? []).map((s) => layerOf(s.class)))].sort(), [students])
  const classes = useMemo(() => {
    const src = students ?? []
    const filtered = layerFilter ? src.filter((s) => layerOf(s.class) === layerFilter) : src
    return [...new Map(filtered.map((s) => [s.classId, s.class])).entries()]
  }, [students, layerFilter])

  /* תלמידים מסוננים */
  const filtered = useMemo(() => {
    return (students ?? []).filter((s) => {
      if (layerFilter && layerOf(s.class) !== layerFilter) return false
      if (classFilter && s.classId !== classFilter) return false
      if (search && !s.name.includes(search)) return false
      return true
    })
  }, [students, layerFilter, classFilter, search])

  function toggleStudent(id: string) {
    setSelected((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  function toggleAll() {
    const allIds = filtered.map((s) => s.id)
    const allSelected = allIds.every((id) => selected.has(id))
    setSelected((prev) => {
      const n = new Set(prev)
      allIds.forEach((id) => allSelected ? n.delete(id) : n.add(id))
      return n
    })
  }

  async function sendToStudents() {
    const selectedList = (students ?? []).filter(s => selected.has(s.id))
    const classIds = [...new Set(selectedList.map(s => s.classId))]
    if (!classIds.length) return

    /* assign — best-effort, לא חוסם את הייצוא */
    apiJson(`/api/quests/${quest.id}/assign`, { method: 'POST', body: JSON.stringify({ classIds }) })
      .catch(() => {})

    setGenStudents(selectedList)
    setGenStatuses(Object.fromEntries(selectedList.map(s => [s.id, 'pending' as GenStatus])))
    setGenSnapshots({})
    setGenIdx(-1)
    setStep('generating')
    runGeneration(selectedList)
  }

  async function runGeneration(list: StudentRow[]) {
    runningRef.current = true
    cancelledRef.current = false
    for (let i = 0; i < list.length; i++) {
      if (cancelledRef.current) break
      const student = list[i]
      setGenIdx(i)
      setWorkMsgIdx(0)
      setGenStatuses(prev => ({ ...prev, [student.id]: 'working' }))
      try {
        const res = await apiJson<{ ok: boolean; profileSnapshot?: GenSnapshot }>(
          `/api/quests/${quest.id}/variant`,
          { method: 'POST', body: JSON.stringify({ studentId: student.id }) },
        )
        setGenStatuses(prev => ({ ...prev, [student.id]: 'done' }))
        if (res.profileSnapshot) setGenSnapshots(prev => ({ ...prev, [student.id]: res.profileSnapshot! }))
      } catch {
        setGenStatuses(prev => ({ ...prev, [student.id]: 'error' }))
      }
    }
    setGenIdx(-1)
    runningRef.current = false
    setStep('generated')
  }

  function retryFailed() {
    const failed = genStudents.filter(s => genStatuses[s.id] === 'error')
    setGenStatuses(prev => ({ ...prev, ...Object.fromEntries(failed.map(s => [s.id, 'pending' as GenStatus])) }))
    runGeneration(failed)
    setStep('generating')
  }

  async function shareCommunity(acknowledge: boolean) {
    setBusy(true); setError(null)
    try {
      const res = await apiFetch(`/api/quests/${quest.id}/share`, {
        method: 'POST',
        body: JSON.stringify({ acknowledgeWarnings: acknowledge }),
      })
      const body = (await res.json().catch(() => null)) as { error?: string; warnings?: string[]; needsAck?: boolean } | null
      /* שער האיכות: אזהרות פתוחות — מציגים אותן והמורה מאשר במפורש לפני שיתוף */
      if (res.status === 409 && body?.needsAck) { setShareWarnings(body.warnings ?? []); return }
      if (!res.ok) throw new Error(body?.error ?? 'שגיאה')
      onDone('🌐 ההדמיה שותפה לספרייה הציבורית')
      onClose()
    } catch (e) { setError(e instanceof Error ? e.message : 'שגיאה') } finally { setBusy(false) }
  }

  const inp: React.CSSProperties = { background: 'rgba(4,9,18,.6)', border: '1px solid rgba(47,243,255,.22)', borderRadius: 9, color: 'var(--holo-text-bright)', padding: '8px 12px', fontFamily: 'var(--font-display)', fontSize: 13, outline: 'none' }
  const selBtn = (active: boolean, rgb: string): React.CSSProperties => ({
    flex: 1, padding: '16px 12px', borderRadius: 14, cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700,
    background: active ? `rgba(${rgb},.18)` : `rgba(${rgb},.06)`,
    border: `1px solid rgba(${rgb},${active ? '.6' : '.28'})`,
    color: active ? '#fff' : `rgb(${rgb})`,
    boxShadow: active ? `0 0 18px rgba(${rgb},.25)` : 'none',
    transition: 'all .15s',
  })

  const genDone = Object.values(genStatuses).filter(s => s === 'done').length
  const genError = Object.values(genStatuses).filter(s => s === 'error').length
  const genTotal = genStudents.length
  const genPct = genTotal > 0 ? Math.round((genDone + genError) / genTotal * 100) : 0
  const isGenerating = step === 'generating' || step === 'generated'

  return (
    <div onClick={() => { if (step !== 'generating') onClose() }} style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(4,6,14,.78)', backdropFilter: 'blur(6px)' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...glass, width: '92%', maxWidth: (step === 'students' || isGenerating) ? 560 : 420, maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* כותרת */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 24px 0', flexShrink: 0 }}>
          {(step === 'pick' || step === 'students' || step === 'community') && step !== 'pick' && (
            <button onClick={() => { setStep('pick'); setError(null) }} style={{ background: 'none', border: 'none', color: 'var(--holo-cyan-bright)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>← חזרה</button>
          )}
          <div style={{ flex: 1, fontSize: 17, fontWeight: 800, color: '#fff' }}>
            {step === 'pick' && 'שתף הדמיה'}
            {step === 'students' && 'שלח לתלמידים'}
            {step === 'community' && 'שתף לספרייה הציבורית'}
            {step === 'generating' && 'מכין גרסאות אישיות…'}
            {step === 'generated' && (genError > 0 ? `הסתיים — ${genError} נכשל${genError > 1 ? 'ו' : ''}` : '✓ כל הגרסאות מוכנות')}
          </div>
          {step !== 'generating' && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#7a9ab8', cursor: 'pointer', fontSize: 18 }}>✕</button>
          )}
        </div>
        <div style={{ fontSize: 12, color: '#7a9ab8', padding: '4px 24px 14px', flexShrink: 0 }}>{quest.title}</div>

        {/* שלב 1 — בחירה */}
        {step === 'pick' && (
          <div style={{ padding: '0 24px 24px', display: 'flex', gap: 14 }}>
            <button onClick={() => setStep('students')} style={selBtn(false, '47,243,255')}>
              <div style={{ fontSize: 26, marginBottom: 8 }}>👩‍🎓</div>
              <div>תלמידים</div>
              <div style={{ fontSize: 11, fontWeight: 400, marginTop: 4, opacity: 0.7 }}>הקצה לכיתות ספציפיות</div>
            </button>
            <button onClick={() => setStep('community')} style={selBtn(false, '255,69,230')}>
              <div style={{ fontSize: 26, marginBottom: 8 }}>🌐</div>
              <div>קהילת המורים</div>
              <div style={{ fontSize: 11, fontWeight: 400, marginTop: 4, opacity: 0.7 }}>פרסם לכל המורים במערכת</div>
            </button>
          </div>
        )}

        {/* שלב 2א — תלמידים */}
        {step === 'students' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: '0 20px 20px', gap: 10 }}>
            {/* סינון */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש שם תלמיד…" style={{ ...inp, flex: '1 1 160px' }} />
              <select value={layerFilter} onChange={(e) => { setLayerFilter(e.target.value); setClassFilter('') }}
                style={{ ...inp, appearance: 'none', WebkitAppearance: 'none', minWidth: 90 }}>
                <option value="">כל השכבות</option>
                {layers.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}
                style={{ ...inp, appearance: 'none', WebkitAppearance: 'none', minWidth: 100 }}>
                <option value="">כל הכיתות</option>
                {classes.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </div>

            {/* רשימת תלמידים */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', borderRadius: 10, border: '1px solid rgba(47,243,255,.13)' }}>
              {students === null && <div style={{ ...micro, textAlign: 'center', padding: 24, color: 'rgba(140,170,200,.5)' }}>טוען תלמידים…</div>}
              {students !== null && filtered.length === 0 && <div style={{ ...micro, textAlign: 'center', padding: 24, color: 'rgba(140,170,200,.5)' }}>אין תלמידים תואמים</div>}
              {students !== null && filtered.length > 0 && (
                <>
                  {/* כותרת + בחר הכל */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid rgba(47,243,255,.08)', background: 'rgba(4,9,20,.8)', position: 'sticky', top: 0 }}>
                    <input type="checkbox"
                      checked={filtered.every((s) => selected.has(s.id))}
                      onChange={toggleAll}
                      style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#2ff3ff' }} />
                    <span style={{ ...micro, fontSize: 9, color: 'rgba(47,243,255,.6)' }}>שם תלמיד</span>
                    <span style={{ ...micro, fontSize: 9, color: 'rgba(47,243,255,.6)', marginRight: 'auto' }}>כיתה</span>
                  </div>
                  {filtered.map((s) => (
                    <div key={s.id} onClick={() => toggleStudent(s.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(47,243,255,.05)', background: selected.has(s.id) ? 'rgba(47,243,255,.06)' : 'transparent', transition: 'background .12s' }}>
                      <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleStudent(s.id)} onClick={(e) => e.stopPropagation()}
                        style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#2ff3ff' }} />
                      <span style={{ flex: 1, fontSize: 13.5, color: 'var(--holo-text-bright)' }}>{s.name}</span>
                      <span style={{ fontSize: 11.5, color: '#7a9ab8' }}>{s.class}</span>
                    </div>
                  ))}
                </>
              )}
            </div>

            {error && <div style={{ color: '#ff7099', fontSize: 12, flexShrink: 0 }}>⚠️ {error}</div>}

            {/* כפתור שלח */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span style={{ fontSize: 12, color: '#7a9ab8' }}>{selected.size > 0 ? `${selected.size} תלמידים נבחרו` : 'לא נבחרו תלמידים'}</span>
              <button disabled={busy || selected.size === 0} onClick={sendToStudents}
                style={{ ...cardBtn, padding: '9px 22px', color: '#04101c', background: selected.size > 0 ? 'linear-gradient(120deg,#2ff3ff,#9b8cff)' : 'rgba(120,180,220,.15)', border: 'none', fontWeight: 700, opacity: busy ? 0.5 : 1 }}>
                {busy ? 'שולח…' : 'שלח לתלמידים ✓'}
              </button>
            </div>
          </div>
        )}

        {/* שלב ייצוא גרסאות */}
        {isGenerating && (
          <div style={{ display: 'flex', flexDirection: 'column', padding: '0 20px 20px', gap: 12 }}>
            {/* progress bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12.5, color: step === 'generated' ? (genError > 0 ? '#ffb37a' : '#7ef6ff') : 'rgba(47,243,255,.8)' }}>
                  {step === 'generating' ? `מכין תלמיד ${genIdx + 1} מתוך ${genTotal}` : `${genDone} מוכנים${genError > 0 ? ` · ${genError} נכשלו` : ''}`}
                </span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,.38)' }}>{genPct}%</span>
              </div>
              <div style={{ height: 4, borderRadius: 4, background: 'rgba(47,243,255,.09)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 4, transition: 'width .4s ease', width: `${genPct}%`, background: genError > 0 && step === 'generated' ? 'linear-gradient(90deg,#2ff3ff,#ffb37a)' : 'linear-gradient(90deg,#2ff3ff,#9b8cff)' }} />
              </div>
            </div>

            {/* תלמיד נוכחי */}
            {step === 'generating' && genIdx >= 0 && (() => { const s = genStudents[genIdx]; return s ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 10, background: 'rgba(255,228,132,.05)', border: '1px solid rgba(255,228,132,.25)' }}>
                <span style={{ fontSize: 18, animation: 'holo-dot-pulse 1s infinite' }}>⚙</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#ffe484' }}>מכין ל{s.name}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,228,132,.55)', marginTop: 2 }}>{WORK_MSGS[workMsgIdx]}</div>
                </div>
              </div>
            ) : null })()}

            {/* רשימה */}
            <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {genStudents.map((s, i) => {
                const st = genStatuses[s.id] ?? 'pending'
                const snap = genSnapshots[s.id]
                const isCur = step === 'generating' && i === genIdx
                return (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 12px', borderRadius: 8,
                    background: isCur ? 'rgba(255,228,132,.04)' : st === 'done' ? 'rgba(47,243,255,.03)' : st === 'error' ? 'rgba(255,112,153,.04)' : 'rgba(4,9,18,.35)',
                    border: `1px solid ${isCur ? 'rgba(255,228,132,.25)' : st === 'done' ? 'rgba(47,243,255,.14)' : st === 'error' ? 'rgba(255,112,153,.22)' : 'rgba(255,255,255,.05)'}` }}>
                    <span style={{ fontSize: 14, minWidth: 16, textAlign: 'center', color: st === 'done' ? '#7ef6ff' : st === 'error' ? '#ff7099' : st === 'working' ? '#ffe484' : 'rgba(255,255,255,.2)' }}>
                      {st === 'done' ? '✓' : st === 'error' ? '✗' : st === 'working' ? '⚙' : '○'}
                    </span>
                    <span style={{ flex: 1, fontSize: 13, color: isCur ? '#ffe484' : st === 'pending' ? 'rgba(255,255,255,.32)' : 'var(--holo-text-bright)' }}>{s.name}</span>
                    <span style={{ fontSize: 10.5, color: 'rgba(47,243,255,.4)' }}>
                      {st === 'done' && snap ? `רמה ${snap.textLevel}` : st === 'error' ? 'שגיאה' : ''}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* כפתורי פעולה */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              {step === 'generating' && (
                <button onClick={() => { cancelledRef.current = true }}
                  style={{ ...cardBtn, padding: '8px 16px' }}>עצור</button>
              )}
              {step === 'generated' && genError > 0 && (
                <button onClick={retryFailed}
                  style={{ ...cardBtn, padding: '8px 16px', color: '#ff9bb3', borderColor: 'rgba(255,120,153,.4)' }}>
                  ↻ נסה שוב ({genError})
                </button>
              )}
              {step === 'generated' && (
                <button onClick={() => { onDone(`✅ ההדמיה הוקצתה ל-${genStudents.length} תלמידים`); onClose() }}
                  style={{ ...cardBtn, padding: '8px 22px', color: '#04101c', background: 'linear-gradient(120deg,#2ff3ff,#9b8cff)', border: 'none', fontWeight: 700 }}>
                  סגור
                </button>
              )}
            </div>
          </div>
        )}

        {/* שלב 2ב — קהילת המורים */}
        {step === 'community' && (
          <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* סיכום ההדמיה */}
            <div style={{ background: 'rgba(255,69,230,.06)', border: '1px solid rgba(255,69,230,.22)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{quest.title}</div>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {quest.subject && <Chip>{quest.subject}</Chip>}
                <Chip>{quest.sceneCount} סצנות</Chip>
              </div>
            </div>
            <p style={{ fontSize: 13, color: '#9fb6cf', lineHeight: 1.7, margin: 0 }}>
              ההדמיה תהיה גלויה לכל המורים במערכת. הם יוכלו להעתיק אותה לעצמם לעריכה. תוכל להסיר אותה בכל עת מהספרייה.
            </p>
            {quest.is_public && (
              <div style={{ fontSize: 12.5, color: '#7ef6ff', background: 'rgba(47,243,255,.08)', border: '1px solid rgba(47,243,255,.25)', borderRadius: 9, padding: '8px 13px' }}>
                ✓ ההדמיה כבר משותפת בספרייה הציבורית
              </div>
            )}
            {shareWarnings && (
              <div style={{ background: 'rgba(255,184,74,.08)', border: '1px solid rgba(255,184,74,.35)', borderRadius: 10, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#ffcf7d' }}>⚠ להדמיה יש אזהרות פתוחות — עברו עליהן לפני השיתוף:</div>
                <ul style={{ margin: 0, paddingInlineStart: 18, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
                  {shareWarnings.map((w, i) => <li key={i} style={{ fontSize: 12, color: '#e8d9b8', lineHeight: 1.6 }}>{w}</li>)}
                </ul>
                <div style={{ fontSize: 11.5, color: '#c9b58c' }}>אפשר לתקן בעמוד העריכה ולנסות שוב, או לאשר ולשתף כמו שזה.</div>
              </div>
            )}
            {error && <div style={{ color: '#ff7099', fontSize: 12, whiteSpace: 'pre-line' }}>⚠️ {error}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ ...cardBtn, padding: '8px 18px' }}>ביטול</button>
              <button disabled={busy || quest.is_public} onClick={() => shareCommunity(shareWarnings !== null)}
                style={{ ...cardBtn, padding: '8px 20px', color: '#04101c', background: quest.is_public ? 'rgba(120,180,220,.2)' : shareWarnings ? 'linear-gradient(120deg,#ffb84a,#ff45e6)' : 'linear-gradient(120deg,#ff45e6,#9b8cff)', border: 'none', fontWeight: 700, opacity: busy ? 0.5 : 1 }}>
                {busy ? 'משתף…' : quest.is_public ? 'כבר משותפת' : shareWarnings ? 'בדקתי — שתף בכל זאת' : 'שתף 🌐'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* טווח כפול (dual-range) לרמת כתיבה */
function DualRange({ min, max, lo, hi, setLo, setHi }: { min: number; max: number; lo: number; hi: number; setLo: (n: number) => void; setHi: (n: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<'lo' | 'hi' | null>(null)
  const pct = (v: number) => (v - min) / (max - min)
  const leftLo = (1 - pct(lo)) * 100
  const leftHi = (1 - pct(hi)) * 100
  const getVal = (clientX: number) => {
    const rect = ref.current!.getBoundingClientRect()
    const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return Math.round(max - f * (max - min))
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const v = getVal(e.clientX)
    if (drag.current === 'lo') setLo(Math.min(Math.max(v, min), hi))
    else setHi(Math.max(Math.min(v, max), lo))
  }
  const mkThumb = (which: 'lo' | 'hi', lp: number) => (
    <div key={which} onPointerDown={(e) => { e.preventDefault(); drag.current = which; ref.current!.setPointerCapture(e.pointerId) }}
      style={{ position: 'absolute', left: `calc(${lp}% - 7px)`, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, borderRadius: '50%', background: '#05101f', border: '2px solid #2ff3ff', boxShadow: '0 0 8px #2ff3ff', cursor: 'grab', zIndex: 3 }} />
  )
  return (
    <div ref={ref} style={{ position: 'relative', height: 28, cursor: 'pointer' }} onPointerMove={onMove} onPointerUp={() => { drag.current = null }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)', height: 3, borderRadius: 3, background: 'rgba(100,140,180,.25)' }} />
      <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', height: 3, borderRadius: 3, left: leftHi + '%', width: Math.max(0, leftLo - leftHi) + '%', background: '#2ff3ff', boxShadow: '0 0 8px rgba(47,243,255,.4)' }} />
      {mkThumb('hi', leftHi)}
      {mkThumb('lo', leftLo)}
    </div>
  )
}

function ColHead({ icon, title, kicker, count, rgb }: { icon: React.ReactNode; title: string; kicker: string; count: string; rgb: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 16 }}>
      <span style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 10, background: `rgba(${rgb},.08)`, border: `1px solid rgba(${rgb},.3)`, color: `rgb(${rgb})`, boxShadow: `0 0 14px rgba(${rgb},.2)` }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 16.5, fontWeight: 700, color: 'var(--holo-text-bright)' }}>{title}</div>
        <div style={{ ...micro, marginTop: 2, color: `rgba(${rgb},.7)` }}>{kicker} · {count}</div>
      </div>
    </div>
  )
}

export default function Library() {
  const [quests, setQuests] = useState<QuestSummary[] | null>(null)
  const [publicQuests, setPublicQuests] = useState<PublicQuest[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [subjOn, setSubjOn] = useState<Record<string, boolean>>({})
  const [lo, setLo] = useState(0)
  const [hi, setHi] = useState(GRADES.length - 1)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [shareFor, setShareFor] = useState<QuestSummary | null>(null)
  const [reportFor, setReportFor] = useState<PublicQuest | null>(null)
  const [reportReason, setReportReason] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const navigate = useNavigate()

  /* עוקב חיים — מונע setState אחרי unmount (ניווט מהיר באמצע טעינה).
     חשוב: מאתחלים ל-true בגוף ה-effect (לא רק בהצהרה) — ב-StrictMode ה-effect רץ
     mount→unmount→remount, ובלי האיפוס ה-cleanup הראשון היה משאיר false לתמיד. */
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  function loadMine() {
    apiJson<{ quests: QuestSummary[] }>('/api/quests')
      .then((b) => { if (mountedRef.current) setQuests(b.quests) })
      .catch((e: Error) => { if (mountedRef.current) setError(e.message) })
  }
  function loadPublic() {
    apiJson<{ quests: PublicQuest[] }>('/api/library')
      .then((b) => { if (mountedRef.current) setPublicQuests(b.quests) })
      .catch(() => { if (mountedRef.current) setPublicQuests([]) })
  }
  useEffect(() => { loadMine(); loadPublic() }, [])

  function flash(msg: string) { setToast(msg); setTimeout(() => setToast(null), 2600) }

  async function doUnshare(q: QuestSummary) {
    setBusyId(q.id); setError(null)
    try { await apiJson(`/api/quests/${q.id}/unshare`, { method: 'POST' }); flash('ההדמיה הוסרה מהספרייה'); loadMine(); loadPublic() }
    catch (e) { setError(e instanceof Error ? e.message : 'שגיאה') } finally { setBusyId(null) }
  }
  async function doDelete(q: QuestSummary) {
    if (!(await holoConfirm(`למחוק לצמיתות את ההדמיה "${q.title}"? לא ניתן לשחזר.`, 'מחק לצמיתות', 'ביטול'))) return
    setBusyId(q.id); setError(null)
    try { await apiJson(`/api/quests/${q.id}`, { method: 'DELETE' }); flash('🗑️ ההדמיה נמחקה'); loadMine(); loadPublic() }
    catch (e) { setError(e instanceof Error ? e.message : 'שגיאה במחיקה') } finally { setBusyId(null) }
  }
  async function doCopy(q: PublicQuest) {
    setBusyId(q.id); setError(null)
    try {
      const { quest } = await apiJson<{ quest: { id: string; title: string } }>(`/api/library/${q.id}/copy`, { method: 'POST' })
      flash('📥 הועתק לספרייה שלך — אפשר לערוך')
      loadMine()
      navigate(`/creator/quest/${quest.id}`)
    } catch (e) { setError(e instanceof Error ? e.message : 'שגיאה') } finally { setBusyId(null) }
  }
  async function doReport() {
    if (!reportFor || reportReason.trim().length < 3) return
    const q = reportFor; setBusyId(q.id)
    try { await apiJson(`/api/library/${q.id}/report`, { method: 'POST', body: JSON.stringify({ reason: reportReason.trim() }) }); setReportFor(null); setReportReason(''); flash('🚩 הדיווח נשלח — תודה') }
    catch (e) { setError(e instanceof Error ? e.message : 'שגיאה') } finally { setBusyId(null) }
  }

  const subjKeys = Object.keys(subjOn)
  const dirty = subjKeys.length > 0 || query.trim() !== '' || lo > 0 || hi < GRADES.length - 1
  const clearAll = () => { setQuery(''); setSubjOn({}); setLo(0); setHi(GRADES.length - 1) }
  const toggleSubj = (sub: string) => setSubjOn((p) => { const n = { ...p }; if (n[sub]) delete n[sub]; else n[sub] = true; return n })

  const mineF = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!quests) return []
    return q ? quests.filter((it) => it.title.toLowerCase().includes(q)) : quests
  }, [quests, query])

  const commF = useMemo(() => {
    return (publicQuests ?? []).filter((it) => {
      if (query.trim() && !`${it.title} ${it.authorName}`.toLowerCase().includes(query.trim().toLowerCase())) return false
      if (subjKeys.length) {
        const sub = it.subject ?? ''
        const ok = subjOn[sub] || (subjOn['אחר'] && !SUBJECTS.includes(sub))
        if (!ok) return false
      }
      /* פילטר טווח שכבות — רק כשהמורה צמצם את הטווח ולהדמיה יש מטא שכבה.
         GRADES[i] = שכבה i+1 (א׳=1); חפיפת טווחים = נכלל. הדמיה בלי מטא תמיד מוצגת. */
      if ((lo > 0 || hi < GRADES.length - 1) && it.gradeMin != null && it.gradeMax != null) {
        if (it.gradeMax < lo + 1 || it.gradeMin > hi + 1) return false
      }
      return true
    })
  }, [publicQuests, subjKeys.length, subjOn, query, lo, hi])

  const panel: React.CSSProperties = { ...glass, padding: 22, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }
  const emptyMsg = (text: string) => <div style={{ ...micro, color: 'rgba(140,170,200,.5)', textAlign: 'center', padding: '34px 0', fontSize: 11 }}>{text}</div>

  return (
    <div dir="rtl" style={{ position: 'relative', minHeight: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-display)', background: 'var(--holo-bg-deep)' }}>
      <div style={{ position: 'absolute', left: -120, top: -80, width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,69,230,.12), transparent 70%)', filter: 'blur(20px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', right: -120, bottom: -120, width: 460, height: 460, borderRadius: '50%', background: 'radial-gradient(circle, rgba(47,243,255,.12), transparent 70%)', filter: 'blur(20px)', pointerEvents: 'none' }} />

      <StudioTopBar active="library" />

      <div data-studio-content className="holo-tab-enter" style={{ position: 'relative', zIndex: 2, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 16, padding: '12px 30px 26px' }}>
        {/* חלון סינון */}
        <div style={{ ...glass, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14, flex: '0 0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(4,9,18,.5)', border: '1px solid rgba(47,243,255,.13)', borderRadius: 10, padding: '8px 14px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7ef6ff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש לפי שם או יוצר…" style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'var(--holo-text-bright)', fontSize: 15, fontFamily: 'var(--font-display)' }} />
            <button onClick={clearAll} style={{ fontSize: 12, fontWeight: 600, color: '#ff8af0', padding: '6px 13px', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,69,230,.4)', whiteSpace: 'nowrap', flex: '0 0 auto', visibility: dirty ? 'visible' : 'hidden', pointerEvents: dirty ? 'auto' : 'none' }}>נקה סינון</button>
          </div>
          <div style={{ height: 1, background: 'rgba(120,200,255,.1)' }} />
          <div>
            <div style={{ ...micro, marginBottom: 10 }}>מקצוע</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, flex: 1, minWidth: 220 }}>
                {[...SUBJECTS, 'אחר'].map((sub) => {
                  const on = !!subjOn[sub]
                  return (
                    <button key={sub} onClick={() => toggleSubj(sub)} style={{ padding: '8px 15px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-display)', transition: 'all .15s', background: on ? 'linear-gradient(120deg, rgba(47,243,255,.22), rgba(255,69,230,.16))' : 'rgba(4,9,18,.5)', border: '1px solid ' + (on ? 'rgba(47,243,255,.55)' : 'rgba(120,200,255,.16)'), color: on ? '#fff' : '#9fb6cf', boxShadow: on ? '0 0 14px rgba(47,243,255,.2)' : 'none' }}>{sub}</button>
                  )
                })}
              </div>
              <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 12, paddingRight: 16, borderRight: '1px solid rgba(120,200,255,.12)' }}>
                <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <div style={{ ...micro, fontSize: 9, color: 'rgba(255,69,230,.75)' }}>רמת כתיבה</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#7ef6ff' }}>כיתה {GRADES[lo]} – {GRADES[hi]}</div>
                </div>
                <div style={{ width: 280, maxWidth: '40vw' }}><DualRange min={0} max={GRADES.length - 1} lo={lo} hi={hi} setLo={setLo} setHi={setHi} /></div>
              </div>
            </div>
          </div>
        </div>

        {/* שתי עמודות */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          {/* הספרייה שלי */}
          <div style={{ flex: '1 1 340px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={panel}>
              <ColHead rgb={CYAN} title="הספרייה שלי" kicker="MY LIBRARY" count={`${mineF.length} הדמיות`}
                icon={<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#2ff3ff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>} />
              {error && <div style={{ color: '#ff7099', padding: 12, borderRadius: 12, border: '1px solid rgba(255,80,120,.4)', background: 'rgba(255,80,120,.08)', marginBottom: 10 }}>{error}</div>}
              <div className="cf-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 11, flex: 1, minHeight: 0, overflowY: 'auto', paddingLeft: 8 }}>
                {!quests && !error && emptyMsg('טוען…')}
                {quests && mineF.length === 0 && emptyMsg(quests.length === 0 ? 'עדיין אין הדמיות — צרו את הראשונה!' : 'אין תוצאות לחיפוש')}
                {mineF.map((q) => (
                  <QuestCard key={q.id} q={q} busy={busyId === q.id}
                    onOpen={() => navigate(`/creator/quest/${q.id}`)}
                    onPlay={() => navigate(`/play/${q.id}`)}
                    onShare={() => setShareFor(q)}
                    onUnshare={() => doUnshare(q)}
                    onDelete={() => doDelete(q)} />
                ))}
              </div>
            </div>
          </div>

          {/* ספרייה ציבורית */}
          <div style={{ flex: '1 1 340px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={panel}>
              <ColHead rgb="255,69,230" title="ספרייה ציבורית" kicker="COMMUNITY" count={`${commF.length} זמינות`}
                icon={<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#ff45e6" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>} />
              <div className="cf-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 11, flex: 1, minHeight: 0, overflowY: 'auto', paddingLeft: 8 }}>
                {!publicQuests && emptyMsg('טוען…')}
                {publicQuests && commF.length === 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '40px 16px', textAlign: 'center' }}>
                    <div style={{ width: 56, height: 56, borderRadius: 16, display: 'grid', placeItems: 'center', background: 'rgba(255,69,230,.06)', border: '1px dashed rgba(255,69,230,.35)' }}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ff8af0" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
                    </div>
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: '#cbd9ea' }}>{(publicQuests?.length ?? 0) === 0 ? 'אין עדיין הדמיות משותפות' : 'אין תוצאות לסינון'}</div>
                    <div style={{ fontSize: 12.5, color: '#7d94ae', maxWidth: 280, lineHeight: 1.6 }}>שתפו הדמיה שיצרתם (כפתור "שתף") כדי שתופיע כאן לכל המורים.</div>
                  </div>
                )}
                {commF.map((q) => <PublicCard key={q.id} q={q} busy={busyId === q.id} onCopy={() => doCopy(q)} onReport={() => { setReportFor(q); setReportReason('') }} />)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* מודאל שיתוף */}
      {shareFor && (
        <ShareModal
          quest={shareFor}
          onClose={() => setShareFor(null)}
          onDone={(msg) => { flash(msg); loadMine(); loadPublic() }}
        />
      )}

      {/* מודאל דיווח */}
      {reportFor && (
        <div onClick={() => setReportFor(null)} style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(4,6,14,.75)', backdropFilter: 'blur(6px)' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...glass, padding: '28px 34px', maxWidth: 420, width: '90%' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 4 }}>דיווח על הדמיה</div>
            <div style={{ fontSize: 13, color: '#9fb6cf', marginBottom: 14 }}>"{reportFor.title}" · {reportFor.authorName}</div>
            <textarea value={reportReason} onChange={(e) => setReportReason(e.target.value)} rows={4} placeholder="סיבת הדיווח (תוכן לא הולם, שגיאה חמורה, וכו׳)…"
              style={{ width: '100%', background: 'rgba(4,9,18,.6)', border: '1px solid rgba(47,243,255,.22)', borderRadius: 10, color: 'var(--holo-text-bright)', padding: '10px 12px', fontFamily: 'var(--font-display)', fontSize: 13.5, resize: 'vertical', outline: 'none' }} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setReportFor(null)} style={{ ...cardBtn, padding: '8px 18px' }}>ביטול</button>
              <button disabled={reportReason.trim().length < 3} onClick={doReport} style={{ ...cardBtn, padding: '8px 18px', color: '#ff9bb3', borderColor: 'rgba(255,120,150,.45)', opacity: reportReason.trim().length < 3 ? 0.5 : 1 }}>שלח דיווח 🚩</button>
            </div>
          </div>
        </div>
      )}

      {/* toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 26, left: '50%', transform: 'translateX(-50%)', zIndex: 90, padding: '11px 22px', borderRadius: 12, background: 'rgba(8,16,30,.95)', border: '1px solid rgba(47,243,255,.4)', color: '#eaf6ff', fontSize: 14, fontWeight: 600, boxShadow: '0 0 24px rgba(47,243,255,.25)' }}>{toast}</div>
      )}
    </div>
  )
}
