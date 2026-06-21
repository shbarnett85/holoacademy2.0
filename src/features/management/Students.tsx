import { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import { apiJson } from '../../shared/lib/api'
import StudioTopBar from '../creator/StudioTopBar'
import { glass, micro } from '../creator/studioStyles'
import StudentDetail from '../analytics/StudentDetail'
import ManagementSidebar from './ManagementSidebar'
import { PROFILE_PUZZLE_TYPES, CALIBRATION, gradeNumberFromLabel, type ProfilePuzzleType, type RollingTallies } from '../../shared/lib/difficultyCalibration'
import { puzzleTypeLabel } from '../../shared/lib/labels'
import { moralDilemmaDepth } from '../../shared/lib/difficultyScaling'

interface StudentRow {
  id: string
  name: string
  class: string
  classCode: string
  secret: string | null
  gender: 'male' | 'female' | null
  isActive: boolean
  lastActive: string | null
}

/* ── Pending edits: one student at a time ── */
interface ProfilePending {
  studentId: string
  origName: string
  origGender: 'male' | 'female' | null
  name: string
  gender: 'male' | 'female' | null
}

interface DiffPending {
  studentId: string
  origTextLevel: number
  origPerPuzzleLevel: Record<string, number>
  textLevel: number
  perPuzzleLevel: Record<string, number>
}

/* ── Utilities ── */
const layerOf = (cls: string) => cls.replace(/\s*\d+$/, '').trim() || cls

function lastActiveLabel(s: string | null): string {
  if (!s) return 'טרם שיחק'
  const d = new Date(s)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const yest = new Date(today.getTime() - 864e5).toDateString() === d.toDateString()
  const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  if (sameDay) return `היום, ${time}`
  if (yest) return `אתמול, ${time}`
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })
}

const COL_GAP = 14
const BTN_GAP = 8
const COLS = '1.6fr 1fr 1fr 1fr 1fr 2.4fr'

function HoloSelect({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: string[]; placeholder: string }) {
  return (
    <div style={{ position: 'relative', flex: '0 0 auto' }}>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ appearance: 'none', WebkitAppearance: 'none', background: 'rgba(4,9,18,.6)', border: '1px solid rgba(47,243,255,.22)', borderRadius: 9, color: value ? 'var(--holo-text-bright)' : '#5a7a99', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, padding: '8px 30px 8px 14px', cursor: 'pointer', outline: 'none', minWidth: 110 }}>
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <div style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#2ff3ff', fontSize: 10 }}>▾</div>
    </div>
  )
}

function ActionBtn({ label, color, rgb, onClick }: { label: string; color: string; rgb: string; onClick: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ flex: '0 0 auto', fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 7, cursor: 'pointer', whiteSpace: 'nowrap', background: hov ? `rgba(${rgb},.2)` : `rgba(${rgb},.07)`, border: `1px solid ${hov ? color : `rgba(${rgb},.32)`}`, color: hov ? '#fff' : color, transition: 'all .15s', boxShadow: hov ? `0 0 12px rgba(${rgb},.4)` : 'none' }}>
      {label}
    </button>
  )
}

/* ── Gender badge (clickable, cycles) ── */
const GENDER_META = {
  male:   { icon: '♂', color: '#7ab8ff', next: 'female' as const, title: 'זכר — לחץ לשינוי' },
  female: { icon: '♀', color: '#ff9bd6', next: null,              title: 'נקבה — לחץ לשינוי' },
  null:   { icon: '⊘', color: '#5a8aaa', next: 'male' as const,   title: 'לא מוגדר (לשון רבים) — לחץ לשינוי' },
} as const

function GenderBadge({ gender, onChange }: { gender: 'male' | 'female' | null; onChange: (g: 'male' | 'female' | null) => void }) {
  const key = gender ?? 'null'
  const m = GENDER_META[key]
  const [hov, setHov] = useState(false)
  return (
    <button
      title={m.title}
      onClick={(e) => { e.stopPropagation(); onChange(m.next as 'male' | 'female' | null) }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ fontSize: 12, color: hov ? '#fff' : m.color, background: hov ? `${m.color}22` : 'transparent', border: 'none', borderRadius: 5, padding: '0 3px', cursor: 'pointer', flexShrink: 0, lineHeight: 1.6, transition: 'all .12s' }}>
      {m.icon}
    </button>
  )
}

/* ── Row with inline name editing ── */
function Row({
  st, i, effectiveName, effectiveGender, isPending,
  onNameCommit, onGenderChange,
  onOpenDifficulty, onOpenProgress, onOpenSummary,
}: {
  st: StudentRow; i: number
  effectiveName: string; effectiveGender: 'male' | 'female' | null; isPending: boolean
  onNameCommit: (name: string) => void
  onGenderChange: (g: 'male' | 'female' | null) => void
  onOpenDifficulty: () => void; onOpenProgress: () => void; onOpenSummary: () => void
}) {
  const [hov, setHov] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const nameError = editing && draft.trim() === ''

  function startEdit() {
    setDraft(effectiveName)
    setEditing(true)
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 10)
  }

  function commit() {
    const t = draft.trim()
    if (!t) return
    setEditing(false)
    onNameCommit(t)
  }

  function cancel() {
    setEditing(false)
    setDraft(effectiveName)
  }

  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: 'grid', gridTemplateColumns: COLS, columnGap: COL_GAP, alignItems: 'center', padding: '9px 26px', opacity: st.isActive ? 1 : 0.45, background: isPending ? 'rgba(255,220,100,.03)' : hov ? 'rgba(47,243,255,.04)' : (i % 2 === 0 ? 'transparent' : 'rgba(4,9,18,.3)'), borderBottom: isPending ? '1px solid rgba(255,220,100,.14)' : '1px solid rgba(47,243,255,.05)', transition: 'background .15s' }}>

      {/* שם + אווטאר + מגדר */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <div style={{ width: 30, height: 30, borderRadius: '50%', background: isPending ? 'linear-gradient(135deg,rgba(255,220,100,.25),rgba(255,69,230,.15))' : 'linear-gradient(135deg,rgba(47,243,255,.2),rgba(255,69,230,.15))', border: `1px solid ${isPending ? 'rgba(255,220,100,.35)' : 'rgba(47,243,255,.2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: isPending ? '#ffe580' : '#7ef6ff', flexShrink: 0 }}>
          {(effectiveName[0] || '?').toUpperCase()}
        </div>
        {editing ? (
          <input
            ref={inputRef}
            dir="rtl"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel() }}
            onBlur={commit}
            style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-display)', color: nameError ? '#ff8099' : '#ddeeff', background: 'rgba(4,9,18,.7)', border: `1px solid ${nameError ? '#ff8099' : 'rgba(47,243,255,.4)'}`, borderRadius: 6, padding: '3px 8px', outline: 'none' }}
          />
        ) : (
          <span
            onClick={startEdit}
            title="לחץ לעריכת השם"
            style={{ fontSize: 13, fontWeight: 600, color: isPending ? '#ffe580' : '#ddeeff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text', flex: 1, minWidth: 0, borderRadius: 4, padding: '2px 4px', transition: 'background .1s', background: hov ? 'rgba(47,243,255,.06)' : 'transparent' }}>
            {effectiveName}
          </span>
        )}
        <GenderBadge gender={effectiveGender} onChange={onGenderChange} />
        {isPending && !editing && <span style={{ fontSize: 9, color: '#ffe044', lineHeight: 1 }}>●</span>}
      </div>

      <div style={{ fontSize: 13, color: '#7ab0d0', fontWeight: 600 }}>{st.class}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, fontWeight: 700, color: '#2ff3ff', letterSpacing: '.06em', overflow: 'hidden', textOverflow: 'ellipsis' }} dir="ltr">{st.classCode}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, fontWeight: 700, color: 'rgba(255,69,230,.8)', letterSpacing: '.08em' }} dir="ltr">{st.secret ?? '—'}</div>
      <div style={{ fontSize: 12, color: '#7ab0d0' }}>{lastActiveLabel(st.lastActive)}</div>

      <div style={{ display: 'flex', gap: BTN_GAP, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
        <ActionBtn label="הגדרות קושי" color="#ff45e6" rgb="255,69,230" onClick={onOpenDifficulty} />
        <ActionBtn label="התקדמות"    color="#ff9a2e" rgb="255,154,46"  onClick={onOpenProgress} />
        <ActionBtn label="סיכום פדגוגי" color="#b18bff" rgb="177,139,255" onClick={onOpenSummary} />
      </div>
    </div>
  )
}

/* ── Difficulty modal (no own save — changes funnel to parent DiffPending) ── */
interface StudentProfile {
  text_level?: number | null
  per_puzzle_level?: Record<string, number> | null
  rolling_tallies?: RollingTallies | null
  sessions_count?: number | null
}

interface ProfileApiResponse {
  profile: StudentProfile | null
}

function confidenceLabel(n: number): { label: string; color: string } {
  if (n < CALIBRATION.MIN_SAMPLE) return { label: `נ=${n} (טרם מספיק נתונים)`, color: '#ff9a2e' }
  if (n < CALIBRATION.FULL_SAMPLE) return { label: `נ=${n} (ביטחון חלקי)`, color: '#ffe044' }
  return { label: `נ=${n} (ביטחון מלא)`, color: '#44ffaa' }
}

function DifficultyModal({
  student, diffPending, onDiffChange, onClose,
}: {
  student: StudentRow
  diffPending: DiffPending | null
  onDiffChange: (d: Omit<DiffPending, 'studentId' | 'origTextLevel' | 'origPerPuzzleLevel'> & { origTextLevel?: number; origPerPuzzleLevel?: Record<string, number> }) => void
  onClose: () => void
}) {
  const [profile, setProfile] = useState<StudentProfile | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    apiJson<ProfileApiResponse>(`/api/analytics/student/${student.id}`)
      .then((r) => {
        const p = r.profile
        setProfile(p)
        setLoaded(true)
        if (!diffPending) {
          const textLevel = p?.text_level ?? 5
          const perPuzzleLevel: Record<string, number> = {}
          for (const t of PROFILE_PUZZLE_TYPES) perPuzzleLevel[t] = p?.per_puzzle_level?.[t] ?? 5
          onDiffChange({ textLevel, perPuzzleLevel, origTextLevel: textLevel, origPerPuzzleLevel: { ...perPuzzleLevel } })
        }
      })
      .catch((e: Error) => { setErr(e.message); setLoaded(true) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.id])

  const textLevel = diffPending?.textLevel ?? 5
  const levels = diffPending?.perPuzzleLevel ?? Object.fromEntries(PROFILE_PUZZLE_TYPES.map((t) => [t, 5]))

  /* moralDilemma derived depth */
  const gradeNum = gradeNumberFromLabel(student.class) ?? undefined
  const moralDepth = moralDilemmaDepth(gradeNum, textLevel)

  function setTextLevel(v: number) {
    onDiffChange({ textLevel: v, perPuzzleLevel: levels })
  }
  function setLevel(t: ProfilePuzzleType, v: number) {
    onDiffChange({ textLevel, perPuzzleLevel: { ...levels, [t]: v } })
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(4,6,14,.8)', backdropFilter: 'blur(7px)' }}>
      <div onClick={(e) => e.stopPropagation()} dir="rtl" style={{ ...glass, padding: '28px 32px', width: 580, maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 0 60px rgba(255,69,230,.18)' }}>
        <div style={{ ...micro, color: 'rgba(255,69,230,.7)', marginBottom: 6 }}>◇ הגדרות קושי</div>
        <div style={{ fontSize: 19, fontWeight: 800, color: '#fff', marginBottom: 2 }}>{student.name}</div>
        <div style={{ fontSize: 12, color: '#5a7aaa', marginBottom: 4 }}>
          כיתה {student.class}{loaded ? ` · ${profile?.sessions_count ?? 0} הדמיות שכוילו` : ''}
        </div>

        {!loaded && !err && <p style={{ color: '#5a7aaa', fontSize: 13 }}>טוען…</p>}
        {loaded && !profile && <p style={{ color: '#ff9a2e', fontSize: 12 }}>אין עדיין פרופיל אישי — הסליידרים יציגו ברירת מחדל; הכיול יתחיל אחרי הדמיה ראשונה.</p>}
        {err && <p style={{ color: '#ff8099', fontSize: 13 }}>⚠️ {err}</p>}

        {/* ── רמת טקסט ── */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ ...micro, fontSize: 9, color: 'rgba(47,243,255,.55)', marginBottom: 8 }}>רמת טקסט (1-16)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input type="range" min={1} max={16} value={textLevel}
              onChange={(e) => setTextLevel(+e.target.value)}
              style={{ flex: 1, accentColor: '#2ff3ff' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 800, color: '#2ff3ff', minWidth: 28, textAlign: 'center' }}>{textLevel}</span>
          </div>
        </div>

        {/* ── סוגי אתגרים ── */}
        <div style={{ ...micro, fontSize: 9, color: 'rgba(255,69,230,.55)', marginBottom: 10 }}>◇ רמת קושי לכל סוג אתגר (1-10)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {PROFILE_PUZZLE_TYPES.map((t: ProfilePuzzleType) => {
            const tally = profile?.rolling_tallies?.[t]
            const n = tally?.total ?? 0
            const conf = confidenceLabel(n)
            const lv = levels[t] ?? 5
            const isChanged = diffPending && lv !== (diffPending.origPerPuzzleLevel[t] ?? lv)
            return (
              <div key={t} style={{ background: 'rgba(4,9,18,.4)', borderRadius: 10, padding: '10px 14px', border: '1px solid rgba(120,200,255,.1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: '#cfe1f2', fontWeight: 600 }}>{puzzleTypeLabel(t)}</span>
                  {isChanged
                    ? <span style={{ fontSize: 9.5, color: '#ffe044', fontFamily: 'var(--font-mono)' }}>⚡ שינוי ידני ממתין</span>
                    : <span style={{ fontSize: 10, color: conf.color, fontFamily: 'var(--font-mono)' }}>{conf.label}</span>
                  }
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <input type="range" min={1} max={10} value={lv}
                    onChange={(e) => setLevel(t, +e.target.value)}
                    style={{ flex: 1, accentColor: '#ff45e6' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 800, color: '#ff45e6', minWidth: 22, textAlign: 'center' }}>{lv}</span>
                </div>
              </div>
            )
          })}

          {/* ── דילמת מוסר — עומק נגזר ── */}
          <div style={{ background: 'rgba(140,90,255,.05)', borderRadius: 10, padding: '10px 14px', border: '1px solid rgba(140,90,255,.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 13, color: '#c8b0ff', fontWeight: 600 }}>דילמות מוסריות</span>
              <span style={{ fontSize: 9.5, color: '#8a6acc', fontFamily: 'var(--font-mono)' }}>עומק נגזר</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(140,90,255,.15)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(moralDepth / 10) * 100}%`, background: 'linear-gradient(90deg,rgba(140,90,255,.5),rgba(180,130,255,.8))', borderRadius: 3, transition: 'width .3s' }} />
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 800, color: '#b88cff', minWidth: 22, textAlign: 'center' }}>{moralDepth}</span>
            </div>
            <div style={{ fontSize: 9.5, color: '#6a4a99', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
              = min(גיל כיתה={gradeNum ?? '?'}, רמת טקסט={textLevel}) → {moralDepth} / 10
            </div>
          </div>
        </div>

        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <button onClick={onClose} style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, padding: '8px 22px', borderRadius: 9, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(120,200,255,.25)', color: '#5a8aaa' }}>
            סגור (שינויים ישמרו עם הבר התחתון)
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Save bar (fixed bottom) ── */
function SaveBar({ studentName, saving, onSave, onCancel }: { studentName: string; saving: boolean; onSave: () => void; onCancel: () => void }) {
  return (
    <div dir="rtl" style={{ position: 'fixed', bottom: 0, right: 0, left: 0, zIndex: 200, background: 'rgba(12,16,30,.97)', borderTop: '1px solid rgba(255,220,100,.3)', backdropFilter: 'blur(12px)', padding: '14px 28px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 -4px 32px rgba(255,220,100,.12)' }}>
      <span style={{ fontSize: 11, color: '#ffe044', fontFamily: 'var(--font-mono)' }}>●</span>
      <span style={{ fontSize: 13, color: '#cfe1f2', fontWeight: 600, flex: 1 }}>
        שינויים לא שמורים עבור <b style={{ color: '#ffe580' }}>{studentName}</b>
      </span>
      <button onClick={onCancel} disabled={saving}
        style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, padding: '7px 18px', borderRadius: 9, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(200,200,255,.2)', color: '#8aaccc', opacity: saving ? 0.5 : 1 }}>
        בטל
      </button>
      <button onClick={onSave} disabled={saving}
        style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, padding: '7px 22px', borderRadius: 9, cursor: saving ? 'default' : 'pointer', background: saving ? 'rgba(255,220,100,.1)' : 'linear-gradient(120deg,rgba(255,220,100,.28),rgba(255,160,60,.18))', border: '1px solid rgba(255,220,100,.5)', color: '#fff', opacity: saving ? 0.6 : 1 }}>
        {saving ? 'שומר…' : '✓ שמור שינויים'}
      </button>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════ */

export default function Students() {
  const [students, setStudents] = useState<StudentRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [layer, setLayer] = useState('')
  const [klass, setKlass] = useState('')

  /* Pending profile (name + gender) */
  const [profilePending, setProfilePending] = useState<ProfilePending | null>(null)
  /* Pending difficulty (same student) */
  const [diffPending, setDiffPending] = useState<DiffPending | null>(null)
  /* Difficulty modal open for student id */
  const [diffModalStudentId, setDiffModalStudentId] = useState<string | null>(null)

  /* Analytics drill-down */
  const [detail, setDetail] = useState<{ student: StudentRow; mode: 'progress' | 'summary' } | null>(null)

  const [saving, setSaving] = useState(false)

  const isDirty = profilePending !== null || diffPending !== null
  const pendingStudentId = profilePending?.studentId ?? diffPending?.studentId ?? null
  const pendingStudentName = useMemo(() => {
    if (profilePending) return profilePending.name
    if (diffPending && students) return students.find((s) => s.id === diffPending.studentId)?.name ?? ''
    return ''
  }, [profilePending, diffPending, students])

  /* ── Load ── */
  function loadStudents() {
    apiJson<{ students: StudentRow[] }>('/api/staff/students')
      .then((b) => setStudents(b.students))
      .catch((e: Error) => setError(e.message))
  }
  useEffect(loadStudents, [])

  /* ── Warn on browser close/refresh when dirty ── */
  useEffect(() => {
    if (!isDirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [isDirty])

  /* ── Pending profile helpers ── */
  function ensureProfilePending(student: StudentRow) {
    if (profilePending?.studentId === student.id) return profilePending
    if (isDirty && pendingStudentId !== student.id) {
      if (!window.confirm(`יש שינויים לא שמורים עבור תלמיד אחר. לבטל אותם ולהמשיך?`)) return null
      cancelAll()
    }
    const next: ProfilePending = { studentId: student.id, origName: student.name, origGender: student.gender, name: profilePending?.studentId === student.id ? profilePending.name : student.name, gender: profilePending?.studentId === student.id ? profilePending.gender : student.gender }
    setProfilePending(next)
    return next
  }

  function handleNameCommit(student: StudentRow, name: string) {
    const base = ensureProfilePending(student)
    if (!base) return
    setProfilePending({ ...base, name })
  }

  function handleGenderChange(student: StudentRow, gender: 'male' | 'female' | null) {
    const base = ensureProfilePending(student)
    if (!base) return
    setProfilePending({ ...base, gender })
  }

  /* ── Difficulty modal helpers ── */
  function openDifficulty(student: StudentRow) {
    if (isDirty && pendingStudentId !== student.id) {
      if (!window.confirm(`יש שינויים לא שמורים עבור תלמיד אחר. לבטל אותם ולהמשיך?`)) return
      cancelAll()
    }
    setDiffModalStudentId(student.id)
  }

  function handleDiffChange(
    studentId: string,
    d: { textLevel: number; perPuzzleLevel: Record<string, number>; origTextLevel?: number; origPerPuzzleLevel?: Record<string, number> },
  ) {
    setDiffPending((prev) => ({
      studentId,
      textLevel: d.textLevel,
      perPuzzleLevel: d.perPuzzleLevel,
      origTextLevel: d.origTextLevel ?? prev?.origTextLevel ?? d.textLevel,
      origPerPuzzleLevel: d.origPerPuzzleLevel ?? prev?.origPerPuzzleLevel ?? d.perPuzzleLevel,
    }))
  }

  /* ── Save / Cancel ── */
  const cancelAll = useCallback(() => {
    setProfilePending(null)
    setDiffPending(null)
    setDiffModalStudentId(null)
  }, [])

  async function saveAll() {
    if (!pendingStudentId || saving) return
    setSaving(true)
    try {
      /* שמירת שם ומגדר */
      if (profilePending) {
        const body: Record<string, unknown> = {}
        if (profilePending.name !== profilePending.origName) body.name = profilePending.name
        if (profilePending.gender !== profilePending.origGender) body.gender = profilePending.gender
        if (Object.keys(body).length > 0) {
          await apiJson(`/api/staff/students/${pendingStudentId}`, { method: 'PATCH', body: JSON.stringify(body) })
        }
      }
      /* שמירת פרופיל קושי */
      if (diffPending) {
        await apiJson(`/api/analytics/student/${pendingStudentId}/profile`, {
          method: 'PATCH',
          body: JSON.stringify({ textLevel: diffPending.textLevel, perPuzzleLevel: diffPending.perPuzzleLevel }),
        })
      }
      /* עדכון רשימה מקומית */
      if (profilePending) {
        setStudents((prev) => prev?.map((s) =>
          s.id === pendingStudentId ? { ...s, name: profilePending.name, gender: profilePending.gender } : s
        ) ?? prev)
      }
      cancelAll()
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  /* ── Derived lists ── */
  const all = useMemo(() => students ?? [], [students])
  const layers = useMemo(() => [...new Set(all.map((s) => layerOf(s.class)))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'he')), [all])
  const classOptions = useMemo(() => {
    const pool = layer ? all.filter((s) => layerOf(s.class) === layer) : all
    return [...new Set(pool.map((s) => s.class))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'he'))
  }, [all, layer])
  const filtered = useMemo(() => {
    const q = query.trim()
    return all.filter((s) => {
      if (q && !s.name.includes(q)) return false
      if (layer && layerOf(s.class) !== layer) return false
      if (klass && s.class !== klass) return false
      return true
    })
  }, [all, query, layer, klass])

  const filterDirty = !!(query.trim() || layer || klass)
  const clearAll = () => { setQuery(''); setLayer(''); setKlass('') }
  const colHdr: React.CSSProperties = { ...micro, fontSize: 9.5, color: 'rgba(47,243,255,.55)', padding: '0 0 10px', textAlign: 'right' }

  const pane: React.CSSProperties = { flex: '3 1 0', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }
  const sidePane: React.CSSProperties = { flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }

  /* the student whose difficulty modal is open */
  const diffModalStudent = diffModalStudentId ? all.find((s) => s.id === diffModalStudentId) ?? null : null

  return (
    <div dir="rtl" style={{ position: 'relative', minHeight: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-display)', background: 'var(--holo-bg-deep)', paddingBottom: isDirty ? 64 : 0 }}>
      <style>{`select option { background: #070a18; color: #eaf6ff; }
        .holo-scroll::-webkit-scrollbar { width: 5px; }
        .holo-scroll::-webkit-scrollbar-track { background: rgba(4,9,18,.4); border-radius: 4px; }
        .holo-scroll::-webkit-scrollbar-thumb { background: rgba(47,243,255,.25); border-radius: 4px; }
        .holo-scroll::-webkit-scrollbar-thumb:hover { background: rgba(47,243,255,.5); }`}</style>
      <div style={{ position: 'absolute', left: -120, top: -80, width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,69,230,.12), transparent 70%)', filter: 'blur(20px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', right: -120, bottom: -120, width: 460, height: 460, borderRadius: '50%', background: 'radial-gradient(circle, rgba(47,243,255,.12), transparent 70%)', filter: 'blur(20px)', pointerEvents: 'none' }} />

      <StudioTopBar active="students" />

      <div data-studio-content className="holo-tab-enter" style={{ position: 'relative', zIndex: 2, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '12px 24px 26px', width: '100%' }}>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>

          {/* ימין — ניהול */}
          <div style={sidePane} className="holo-scroll">
            <div style={{ ...micro, fontSize: 9, color: 'rgba(47,243,255,.6)', flex: '0 0 auto' }}>⚙️ ניהול</div>
            <ManagementSidebar onClassStudentsChange={loadStudents} />
          </div>

          {/* שמאל — רוסטר */}
          <div style={pane}>
            <div style={{ ...micro, fontSize: 9, color: 'rgba(47,243,255,.6)', flex: '0 0 auto' }}>👥 תלמידים</div>
            {error && <p style={{ color: '#ff9bb3', fontSize: 14 }}>⚠️ {error}</p>}

            {detail ? (
              <StudentDetail studentId={detail.student.id} className={detail.student.class} backLabel="תלמידים" mode={detail.mode} onBack={() => setDetail(null)} />
            ) : (
              <>
                {/* סינון */}
                <div style={{ ...glass, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flex: '0 0 auto' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(4,9,18,.5)', border: '1px solid rgba(47,243,255,.13)', borderRadius: 10, padding: '7px 14px', flex: '1 1 180px', minWidth: 150 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7ef6ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש לפי שם תלמיד…" style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'var(--holo-text-bright)', fontSize: 14, fontFamily: 'var(--font-display)', direction: 'rtl' }} />
                  </div>
                  <HoloSelect value={layer} onChange={(v) => { setLayer(v); setKlass('') }} options={layers} placeholder="שכבה" />
                  <HoloSelect value={klass} onChange={setKlass} options={classOptions} placeholder="כיתה" />
                  {filterDirty && <button onClick={clearAll} style={{ fontSize: 12, fontWeight: 600, color: '#ff8af0', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,69,230,.4)', whiteSpace: 'nowrap' }}>נקה סינון</button>}
                  <div style={{ ...micro, fontSize: 10, color: 'rgba(47,243,255,.5)', marginRight: 'auto' }}>{filtered.length} תלמידים</div>
                </div>

                {/* טבלה */}
                <div style={{ ...glass, flex: 1, minHeight: 0, overflow: 'hidden' }}>
                  <div className="holo-scroll" style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden' }}>
                    <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'grid', gridTemplateColumns: COLS, columnGap: COL_GAP, alignItems: 'center', padding: '12px 26px 10px', borderBottom: '1px solid rgba(47,243,255,.08)', background: 'rgba(4,9,20,.92)', backdropFilter: 'blur(8px)' }}>
                      <div style={colHdr}>שם תלמיד · מגדר</div>
                      <div style={colHdr}>כיתה</div>
                      <div style={colHdr}>קוד כיתה</div>
                      <div style={colHdr}>קוד סודי</div>
                      <div style={colHdr}>פעילות אחרונה</div>
                      <div style={{ ...colHdr, textAlign: 'left' }}>פעולות</div>
                    </div>
                    {!students && !error && <div style={{ textAlign: 'center', padding: '50px 0', color: '#4a6a88', fontSize: 14 }}>טוען…</div>}
                    {students && filtered.length === 0 && <div style={{ textAlign: 'center', padding: '60px 0', color: '#4a6a88', fontSize: 14 }}>{all.length === 0 ? 'אין עדיין תלמידים בכיתות שלך.' : 'לא נמצאו תלמידים תואמים'}</div>}
                    {filtered.map((st, i) => {
                      const effectiveName = profilePending?.studentId === st.id ? profilePending.name : st.name
                      const effectiveGender = profilePending?.studentId === st.id ? profilePending.gender : st.gender
                      const isPending = pendingStudentId === st.id
                      return (
                        <Row key={st.id + st.class} st={st} i={i}
                          effectiveName={effectiveName}
                          effectiveGender={effectiveGender}
                          isPending={isPending}
                          onNameCommit={(name) => handleNameCommit(st, name)}
                          onGenderChange={(g) => handleGenderChange(st, g)}
                          onOpenDifficulty={() => openDifficulty(st)}
                          onOpenProgress={() => setDetail({ student: st, mode: 'progress' })}
                          onOpenSummary={() => setDetail({ student: st, mode: 'summary' })}
                        />
                      )
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* מודאל הגדרות קושי */}
      {diffModalStudent && (
        <DifficultyModal
          student={diffModalStudent}
          diffPending={diffPending?.studentId === diffModalStudent.id ? diffPending : null}
          onDiffChange={(d) => handleDiffChange(diffModalStudent.id, d)}
          onClose={() => setDiffModalStudentId(null)}
        />
      )}

      {/* בר שמור/בטל */}
      {isDirty && (
        <SaveBar
          studentName={pendingStudentName}
          saving={saving}
          onSave={saveAll}
          onCancel={cancelAll}
        />
      )}
    </div>
  )
}
