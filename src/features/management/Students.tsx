import { useEffect, useMemo, useState } from 'react'
import { apiJson } from '../../shared/lib/api'
import StudioTopBar from '../creator/StudioTopBar'
import { glass, micro } from '../creator/studioStyles'
import StudentDetail from '../analytics/StudentDetail'
import ManagementSidebar from './ManagementSidebar'
import { PROFILE_PUZZLE_TYPES, CALIBRATION, type ProfilePuzzleType, type RollingTallies } from '../../shared/lib/difficultyCalibration'
import { puzzleTypeLabel } from '../../shared/lib/labels'

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
const COLS = '1fr 1fr 1fr 1fr 1fr 3fr'

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

/* ── מודאל הגדרות קושי ── */
interface StudentProfile {
  text_level?: number | null
  per_puzzle_level?: Record<string, number> | null
  rolling_tallies?: RollingTallies | null
  sessions_count?: number | null
}

function confidenceLabel(n: number): { label: string; color: string } {
  if (n < CALIBRATION.MIN_SAMPLE) return { label: `נ=${n} (אין עדיין מספיק נתונים)`, color: '#ff9a2e' }
  if (n < CALIBRATION.FULL_SAMPLE) return { label: `נ=${n} (ביטחון חלקי)`, color: '#ffe044' }
  return { label: `נ=${n} (ביטחון מלא)`, color: '#44ffaa' }
}

function DifficultyModal({ student, onClose }: { student: StudentRow; onClose: () => void }) {
  const [profile, setProfile] = useState<StudentProfile | null>(null)
  const [levels, setLevels] = useState<Record<string, number>>({})
  const [textLevel, setTextLevel] = useState<number>(5)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    apiJson<{ profile: StudentProfile | null; profileVersion: number }>(`/api/analytics/student/${student.id}`)
      .then((r) => {
        const p = r.profile
        setProfile(p)
        setTextLevel(p?.text_level ?? 5)
        const init: Record<string, number> = {}
        for (const t of PROFILE_PUZZLE_TYPES) init[t] = p?.per_puzzle_level?.[t] ?? 5
        setLevels(init)
      })
      .catch((e: Error) => setErr(e.message))
  }, [student.id])

  async function save() {
    setSaving(true); setSaved(false); setErr(null)
    try {
      await apiJson(`/api/analytics/student/${student.id}/profile`, {
        method: 'PATCH',
        body: JSON.stringify({ perPuzzleLevel: levels, textLevel }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setErr((e as Error).message)
    } finally { setSaving(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(4,6,14,.8)', backdropFilter: 'blur(7px)' }}>
      <div onClick={(e) => e.stopPropagation()} dir="rtl" style={{ ...glass, padding: '28px 32px', width: 560, maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 0 60px rgba(255,69,230,.18)' }}>
        <div style={{ ...micro, color: 'rgba(255,69,230,.7)', marginBottom: 6 }}>◇ הגדרות קושי</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 2 }}>{student.name}</div>
        <div style={{ fontSize: 12, color: '#5a7aaa', marginBottom: 20 }}>
          כיתה {student.class} · {profile?.sessions_count ?? 0} הדמיות שכוילו
          {profile && !profile.text_level && <span style={{ color: '#ff9a2e' }}> · אין עדיין פרופיל אישי</span>}
        </div>

        {!profile && !err && <p style={{ color: '#5a7aaa', fontSize: 13 }}>טוען…</p>}
        {err && <p style={{ color: '#ff8099', fontSize: 13 }}>⚠️ {err}</p>}

        {profile !== undefined && (
          <>
            {/* רמת טקסט */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ ...micro, fontSize: 9, color: 'rgba(47,243,255,.55)', marginBottom: 8 }}>רמת טקסט (1-16)</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input type="range" min={1} max={16} value={textLevel} onChange={(e) => setTextLevel(+e.target.value)}
                  style={{ flex: 1, accentColor: '#2ff3ff' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 800, color: '#2ff3ff', minWidth: 28, textAlign: 'center' }}>{textLevel}</span>
              </div>
            </div>

            <div style={{ ...micro, fontSize: 9, color: 'rgba(255,69,230,.55)', marginBottom: 10 }}>◇ רמת קושי לכל סוג אתגר (1-10)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {PROFILE_PUZZLE_TYPES.map((t: ProfilePuzzleType) => {
                const tally = profile?.rolling_tallies?.[t]
                const n = tally?.total ?? 0
                const conf = confidenceLabel(n)
                const lv = levels[t] ?? 5
                return (
                  <div key={t} style={{ background: 'rgba(4,9,18,.4)', borderRadius: 10, padding: '10px 14px', border: '1px solid rgba(120,200,255,.1)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, color: '#cfe1f2', fontWeight: 600 }}>{puzzleTypeLabel(t)}</span>
                      <span style={{ fontSize: 10, color: conf.color, fontFamily: 'var(--font-mono)' }}>{conf.label}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <input type="range" min={1} max={10} value={lv}
                        onChange={(e) => setLevels((prev) => ({ ...prev, [t]: +e.target.value }))}
                        style={{ flex: 1, accentColor: '#ff45e6' }} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 800, color: '#ff45e6', minWidth: 22, textAlign: 'center' }}>{lv}</span>
                    </div>
                  </div>
                )
              })}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
              {err && <span style={{ fontSize: 12, color: '#ff8099', flex: 1, alignSelf: 'center' }}>⚠️ {err}</span>}
              {saved && <span style={{ fontSize: 12, color: '#44ffaa', flex: 1, alignSelf: 'center' }}>✓ נשמר</span>}
              <button onClick={onClose} style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, padding: '8px 18px', borderRadius: 9, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(120,200,255,.25)', color: '#5a8aaa' }}>ביטול</button>
              <button onClick={save} disabled={saving} style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, padding: '8px 20px', borderRadius: 9, cursor: saving ? 'default' : 'pointer', background: saving ? 'rgba(255,69,230,.1)' : 'linear-gradient(120deg,rgba(255,69,230,.25),rgba(47,243,255,.18))', border: '1px solid rgba(255,69,230,.5)', color: '#fff', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'שומר…' : 'שמור שינויים'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Row({ st, i, onAction }: { st: StudentRow; i: number; onAction: (a: string) => void }) {
  const [hov, setHov] = useState(false)
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: 'grid', gridTemplateColumns: COLS, columnGap: COL_GAP, alignItems: 'center', padding: '10px 26px', opacity: st.isActive ? 1 : 0.45, background: hov ? 'rgba(47,243,255,.04)' : (i % 2 === 0 ? 'transparent' : 'rgba(4,9,18,.3)'), borderBottom: '1px solid rgba(47,243,255,.05)', transition: 'background .15s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, rgba(47,243,255,.2), rgba(255,69,230,.15))', border: '1px solid rgba(47,243,255,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#7ef6ff', flexShrink: 0 }}>{st.name[0] || '?'}</div>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#ddeeff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {st.name}
          {st.gender === 'male' && <span style={{ fontSize: 11, color: '#7ab8ff', marginRight: 5 }}>♂</span>}
          {st.gender === 'female' && <span style={{ fontSize: 11, color: '#ff9bd6', marginRight: 5 }}>♀</span>}
        </span>
      </div>
      <div style={{ fontSize: 13, color: '#7ab0d0', fontWeight: 600 }}>{st.class}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, fontWeight: 700, color: '#2ff3ff', letterSpacing: '.06em', overflow: 'hidden', textOverflow: 'ellipsis' }} dir="ltr">{st.classCode}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, fontWeight: 700, color: 'rgba(255,69,230,.8)', letterSpacing: '.08em' }} dir="ltr">{st.secret ?? '—'}</div>
      <div style={{ fontSize: 12, color: '#7ab0d0' }}>{lastActiveLabel(st.lastActive)}</div>
      <div style={{ display: 'flex', gap: BTN_GAP, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
        <ActionBtn label="פרטים" color="#2ff3ff" rgb="47,243,255" onClick={() => onAction('פרטים')} />
        <ActionBtn label="הגדרות קושי" color="#ff45e6" rgb="255,69,230" onClick={() => onAction('הגדרות קושי')} />
        <ActionBtn label="התקדמות" color="#ff9a2e" rgb="255,154,46" onClick={() => onAction('התקדמות')} />
        <ActionBtn label="סיכום פדגוגי" color="#b18bff" rgb="177,139,255" onClick={() => onAction('סיכום פדגוגי')} />
      </div>
    </div>
  )
}

export default function Students() {
  const [students, setStudents] = useState<StudentRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [layer, setLayer] = useState('')
  const [klass, setKlass] = useState('')
  const [modal, setModal] = useState<{ student: StudentRow; action: string } | null>(null)
  const [detail, setDetail] = useState<{ student: StudentRow; mode: 'progress' | 'summary' } | null>(null)
  const [difficultyStudent, setDifficultyStudent] = useState<StudentRow | null>(null)

  function loadStudents() {
    apiJson<{ students: StudentRow[] }>('/api/staff/students')
      .then((b) => setStudents(b.students))
      .catch((e: Error) => setError(e.message))
  }
  useEffect(loadStudents, [])

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

  const dirty = !!(query.trim() || layer || klass)
  const clearAll = () => { setQuery(''); setLayer(''); setKlass('') }
  const colHdr: React.CSSProperties = { ...micro, fontSize: 9.5, color: 'rgba(47,243,255,.55)', padding: '0 0 10px', textAlign: 'right' }

  function onAction(student: StudentRow, action: string) {
    if (action === 'התקדמות') { setDetail({ student, mode: 'progress' }); return }
    if (action === 'סיכום פדגוגי') { setDetail({ student, mode: 'summary' }); return }
    if (action === 'הגדרות קושי') { setDifficultyStudent(student); return }
    setModal({ student, action })
  }

  const pane: React.CSSProperties = { flex: '3 1 0', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }
  const sidePane: React.CSSProperties = { flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }

  return (
    <div dir="rtl" style={{ position: 'relative', minHeight: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-display)', background: 'var(--holo-bg-deep)' }}>
      <style>{`select option { background: #070a18; color: #eaf6ff; }
        .holo-scroll::-webkit-scrollbar { width: 5px; }
        .holo-scroll::-webkit-scrollbar-track { background: rgba(4,9,18,.4); border-radius: 4px; }
        .holo-scroll::-webkit-scrollbar-thumb { background: rgba(47,243,255,.25); border-radius: 4px; }
        .holo-scroll::-webkit-scrollbar-thumb:hover { background: rgba(47,243,255,.5); }`}</style>
      <div style={{ position: 'absolute', left: -120, top: -80, width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,69,230,.12), transparent 70%)', filter: 'blur(20px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', right: -120, bottom: -120, width: 460, height: 460, borderRadius: '50%', background: 'radial-gradient(circle, rgba(47,243,255,.12), transparent 70%)', filter: 'blur(20px)', pointerEvents: 'none' }} />

      <StudioTopBar active="students" />

      <div data-studio-content className="holo-tab-enter" style={{ position: 'relative', zIndex: 2, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '12px 24px 26px', width: '100%' }}>

        {/* split רספונסיבי: פאנל ניהול (שמאל) + רוסטר (ימין) */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>

          {/* ימין (DOM ראשון ב-RTL) — פאנל ניהול */}
          <div style={sidePane} className="holo-scroll">
            <div style={{ ...micro, fontSize: 9, color: 'rgba(47,243,255,.6)', flex: '0 0 auto' }}>⚙️ ניהול</div>
            <ManagementSidebar onClassStudentsChange={loadStudents} />
          </div>

          {/* שמאל — רוסטר תלמידים */}
          <div style={pane}>
            <div style={{ ...micro, fontSize: 9, color: 'rgba(47,243,255,.6)', flex: '0 0 auto' }}>👥 תלמידים</div>
            {error && <p style={{ color: '#ff9bb3', fontSize: 14 }}>⚠️ {error}</p>}

            {detail ? (
              <StudentDetail studentId={detail.student.id} className={detail.student.class} backLabel="תלמידים" mode={detail.mode} onBack={() => setDetail(null)} />
            ) : (
              <>
                {/* שורת סינון */}
                <div style={{ ...glass, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flex: '0 0 auto' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(4,9,18,.5)', border: '1px solid rgba(47,243,255,.13)', borderRadius: 10, padding: '7px 14px', flex: '1 1 180px', minWidth: 150 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7ef6ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש לפי שם תלמיד…" style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'var(--holo-text-bright)', fontSize: 14, fontFamily: 'var(--font-display)', direction: 'rtl' }} />
                  </div>
                  <HoloSelect value={layer} onChange={(v) => { setLayer(v); setKlass('') }} options={layers} placeholder="שכבה" />
                  <HoloSelect value={klass} onChange={setKlass} options={classOptions} placeholder="כיתה" />
                  {dirty && <button onClick={clearAll} style={{ fontSize: 12, fontWeight: 600, color: '#ff8af0', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,69,230,.4)', whiteSpace: 'nowrap' }}>נקה סינון</button>}
                  <div style={{ ...micro, fontSize: 10, color: 'rgba(47,243,255,.5)', marginRight: 'auto' }}>{filtered.length} תלמידים</div>
                </div>

                {/* טבלת התלמידים — כותרת ושורות באותו scroll container למניעת הסחה */}
                <div style={{ ...glass, flex: 1, minHeight: 0, overflow: 'hidden' }}>
                  <div className="holo-scroll" style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden' }}>
                    {/* כותרת sticky — רוחבה זהה לשורות הנתונים (כולל scrollbar) */}
                    <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'grid', gridTemplateColumns: COLS, columnGap: COL_GAP, alignItems: 'center', padding: '12px 26px 10px', borderBottom: '1px solid rgba(47,243,255,.08)', background: 'rgba(4,9,20,.92)', backdropFilter: 'blur(8px)' }}>
                      <div style={colHdr}>שם תלמיד</div>
                      <div style={colHdr}>כיתה</div>
                      <div style={colHdr}>קוד כיתה</div>
                      <div style={colHdr}>קוד סודי</div>
                      <div style={colHdr}>פעילות אחרונה</div>
                      <div style={{ ...colHdr, textAlign: 'left' }}>פעולות</div>
                    </div>
                    {!students && !error && <div style={{ textAlign: 'center', padding: '50px 0', color: '#4a6a88', fontSize: 14 }}>טוען…</div>}
                    {students && filtered.length === 0 && <div style={{ textAlign: 'center', padding: '60px 0', color: '#4a6a88', fontSize: 14 }}>{all.length === 0 ? 'אין עדיין תלמידים בכיתות שלך.' : 'לא נמצאו תלמידים תואמים'}</div>}
                    {filtered.map((st, i) => <Row key={st.id + st.class} st={st} i={i} onAction={(a) => onAction(st, a)} />)}
                  </div>
                </div>
              </>
            )}
          </div>


        </div>
      </div>

      {/* מודאל הגדרות קושי */}
      {difficultyStudent && (
        <DifficultyModal student={difficultyStudent} onClose={() => setDifficultyStudent(null)} />
      )}

      {/* מודאל פעולה (placeholder — פרטים) */}
      {modal && (
        <div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(4,6,14,.75)', backdropFilter: 'blur(6px)' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...glass, padding: '30px 40px', minWidth: 320, textAlign: 'center', boxShadow: '0 0 60px rgba(47,243,255,.12)' }}>
            <div style={{ ...micro, color: 'rgba(47,243,255,.7)', marginBottom: 10 }}>◇ {modal.action}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 4 }}>{modal.student.name}</div>
            <div style={{ fontSize: 13, color: '#5a8aaa', marginBottom: 20 }}>כיתה {modal.student.class}</div>
            <p style={{ fontSize: 13, color: '#9fb6cf', lineHeight: 1.7 }}>תוכן {modal.action} יתווסף בשלב הבא.</p>
            <button onClick={() => setModal(null)} style={{ marginTop: 22, fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, padding: '8px 22px', borderRadius: 9, cursor: 'pointer', background: 'rgba(47,243,255,.12)', border: '1px solid rgba(47,243,255,.3)', color: '#2ff3ff' }}>סגור</button>
          </div>
        </div>
      )}
    </div>
  )
}
