import { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import { apiJson } from '../../shared/lib/api'
import StudioTopBar from '../creator/StudioTopBar'
import { glass, micro } from '../creator/studioStyles'
import StudentDetail from '../analytics/StudentDetail'
import ManagementSidebar from './ManagementSidebar'
import { PROFILE_PUZZLE_TYPES, gradeToLevel, type ProfilePuzzleType } from '../../shared/lib/difficultyCalibration'
import { setNavGuard } from '../../shared/lib/navGuard'
import { holoConfirm, holoAlert } from '../../shared/ui/dialog'
import { puzzleTypeLabel } from '../../shared/lib/labels'
import { moralDilemmaDepth } from '../../shared/lib/difficultyScaling'
import { useIsMobile } from '../../shared/lib/useIsMobile'

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
        style={{ appearance: 'none', WebkitAppearance: 'none', background: 'var(--t57)', border: '1px solid var(--t81)', borderRadius: 9, color: value ? 'var(--t68)' : 'var(--t82)', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, padding: '8px 30px 8px 14px', cursor: 'pointer', outline: 'none', minWidth: 110 }}>
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <div style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--t15)', fontSize: 10 }}>▾</div>
    </div>
  )
}

function ActionBtn({ label, color, rgb, onClick }: { label: string; color: string; rgb: string; onClick: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ flex: '0 0 auto', fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 7, cursor: 'pointer', whiteSpace: 'nowrap', background: hov ? `${window.HoloTint(rgb, .2)}` : `${window.HoloTint(rgb, .07)}`, border: `1px solid ${hov ? color : `${window.HoloTint(rgb, .32)}`}`, color: hov ? 'var(--t13)' : color, transition: 'all .15s', boxShadow: hov ? `0 0 12px ${window.HoloTint(rgb, .4)}` : 'none' }}>
      {label}
    </button>
  )
}

/* ── Gender badge (clickable, cycles) ── */
const GENDER_META = {
  male:   { icon: '♂', color: 'var(--t140)', next: 'female' as const, title: 'זכר — לחץ לשינוי' },
  female: { icon: '♀', color: 'var(--t120)', next: null,              title: 'נקבה — לחץ לשינוי' },
  null:   { icon: '⊘', color: 'var(--t258)', next: 'male' as const,   title: 'לא מוגדר (לשון רבים) — לחץ לשינוי' },
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
      style={{ fontSize: 12, color: hov ? 'var(--t13)' : m.color, background: hov ? `color-mix(in oklab, ${m.color} 13%, transparent)` : 'transparent', border: 'none', borderRadius: 5, padding: '0 3px', cursor: 'pointer', flexShrink: 0, lineHeight: 1.6, transition: 'all .12s' }}>
      {m.icon}
    </button>
  )
}

/* ── Row with inline name editing ── */
function Row({
  st, i, effectiveName, effectiveGender, isPending,
  onNameCommit, onGenderChange,
  onOpenDifficulty, onOpenProgress, onOpenSummary, isMobile,
}: {
  st: StudentRow; i: number
  effectiveName: string; effectiveGender: 'male' | 'female' | null; isPending: boolean; isMobile: boolean
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

  /* אשכול השם (אווטאר + שם בר-עריכה + מגדר) — זהה בטבלה ובכרטיס */
  const nameCluster = (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <div style={{ width: 30, height: 30, borderRadius: '50%', background: isPending ? 'linear-gradient(135deg,var(--t259),var(--t260))' : 'linear-gradient(135deg,var(--t88),var(--t260))', border: `1px solid ${isPending ? 'var(--t261)' : 'var(--t88)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: isPending ? 'var(--t262)' : 'var(--t1)', flexShrink: 0 }}>
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
            style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-display)', color: nameError ? 'var(--t263)' : 'var(--t251)', background: 'var(--t85)', border: `1px solid ${nameError ? 'var(--t263)' : 'var(--t2)'}`, borderRadius: 6, padding: '3px 8px', outline: 'none' }}
          />
        ) : (
          <span
            onClick={startEdit}
            title="לחץ לעריכת השם"
            style={{ fontSize: 13, fontWeight: 600, color: isPending ? 'var(--t262)' : 'var(--t251)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text', flex: 1, minWidth: 0, borderRadius: 4, padding: '2px 4px', transition: 'background .1s', background: hov ? 'var(--t40)' : 'transparent' }}>
            {effectiveName}
          </span>
        )}
      <GenderBadge gender={effectiveGender} onChange={onGenderChange} />
      {isPending && !editing && <span style={{ fontSize: 9, color: 'var(--t264)', lineHeight: 1 }}>●</span>}
    </div>
  )

  const actions = (
    <>
      <ActionBtn label="הגדרות קושי" color="var(--t118)" rgb="255,69,230" onClick={onOpenDifficulty} />
      <ActionBtn label="התקדמות"    color="var(--t265)" rgb="255,154,46"  onClick={onOpenProgress} />
      <ActionBtn label="סיכום פדגוגי" color="var(--t54)" rgb="177,139,255" onClick={onOpenSummary} />
    </>
  )

  const rowBg = isPending ? 'var(--t266)' : hov ? 'var(--t267)' : (i % 2 === 0 ? 'transparent' : 'var(--t268)')
  const rowBorder = isPending ? '1px solid var(--t269)' : '1px solid var(--t178)'

  /* ── מובייל: כרטיס במקום שורת-טבלה ──────────────────────────────────────
     6 עמודות על 375px הצטמצמו ל-22-36px כל אחת, ושמות התלמידים קיבלו 8px
     (מתוך 31-39 שנדרשו) תחת overflowX:hidden — כלומר התוכן אבד, לא רק הוסתר.
     כרטיס עם תוויות מפורשות קריא ביד אחת ושומר על כל הפעולות. */
  if (isMobile) {
    return (
      <div style={{ padding: '12px 14px', opacity: st.isActive ? 1 : 0.45, background: rowBg, borderBottom: rowBorder }}>
        {nameCluster}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', margin: '9px 0 10px', fontSize: 12 }}>
          <Field label="כיתה"><span style={{ color: 'var(--t252)', fontWeight: 600 }}>{st.class}</span></Field>
          <Field label="קוד כיתה"><span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--t15)', letterSpacing: '.06em' }} dir="ltr">{st.classCode}</span></Field>
          <Field label="קוד סודי"><span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--t270)', letterSpacing: '.08em' }} dir="ltr">{st.secret ?? '—'}</span></Field>
          <Field label="פעילות"><span style={{ color: 'var(--t252)' }}>{lastActiveLabel(st.lastActive)}</span></Field>
        </div>
        <div style={{ display: 'flex', gap: BTN_GAP, flexWrap: 'wrap' }}>{actions}</div>
      </div>
    )
  }

  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: 'grid', gridTemplateColumns: COLS, columnGap: COL_GAP, alignItems: 'center', padding: '9px 26px', opacity: st.isActive ? 1 : 0.45, background: rowBg, borderBottom: rowBorder, transition: 'background .15s' }}>

      {nameCluster}

      <div style={{ fontSize: 13, color: 'var(--t252)', fontWeight: 600 }}>{st.class}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, fontWeight: 700, color: 'var(--t15)', letterSpacing: '.06em', overflow: 'hidden', textOverflow: 'ellipsis' }} dir="ltr">{st.classCode}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, fontWeight: 700, color: 'var(--t270)', letterSpacing: '.08em' }} dir="ltr">{st.secret ?? '—'}</div>
      <div style={{ fontSize: 12, color: 'var(--t252)' }}>{lastActiveLabel(st.lastActive)}</div>

      <div style={{ display: 'flex', gap: BTN_GAP, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>{actions}</div>
    </div>
  )
}

/* זוג תווית-ערך לכרטיס המובייל — התווית נדרשת כי אין שורת כותרות עמודות */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, minWidth: 0 }}>
      <span style={{ fontSize: 10, color: 'var(--t271)', fontWeight: 600 }}>{label}</span>
      {children}
    </span>
  )
}

/* ── Difficulty modal (no own save — changes funnel to parent DiffPending) ── */
interface StudentProfile {
  text_level?: number | null
  per_puzzle_level?: Record<string, number> | null
  sessions_count?: number | null
}

interface ProfileApiResponse {
  profile: StudentProfile | null
}


function DifficultyModal({
  student, diffPending, effectiveGender, onDiffChange, onGenderChange, onClose,
}: {
  student: StudentRow
  diffPending: DiffPending | null
  effectiveGender: 'male' | 'female' | null
  onDiffChange: (d: Omit<DiffPending, 'studentId' | 'origTextLevel' | 'origPerPuzzleLevel'> & { origTextLevel?: number; origPerPuzzleLevel?: Record<string, number> }) => void
  onGenderChange: (g: 'male' | 'female' | null) => void
  onClose: () => void
}) {
  const [profile, setProfile] = useState<StudentProfile | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  /* דיפולט (אין פרופיל) = רמת שכבת-הגיל על סקאלת 1-20 (כיתה א'→5, ג'→7). */
  const gradeDefault = gradeToLevel(student.class) ?? 10

  useEffect(() => {
    apiJson<ProfileApiResponse>(`/api/analytics/student/${student.id}`)
      .then((r) => {
        const p = r.profile
        setProfile(p)
        setLoaded(true)
        if (!diffPending) {
          const textLevel = p?.text_level ?? gradeDefault
          const perPuzzleLevel: Record<string, number> = {}
          for (const t of PROFILE_PUZZLE_TYPES) perPuzzleLevel[t] = p?.per_puzzle_level?.[t] ?? gradeDefault
          onDiffChange({ textLevel, perPuzzleLevel, origTextLevel: textLevel, origPerPuzzleLevel: { ...perPuzzleLevel } })
        }
      })
      .catch((e: Error) => { setErr(e.message); setLoaded(true) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.id])

  const textLevel = diffPending?.textLevel ?? gradeDefault
  const levels = diffPending?.perPuzzleLevel ?? Object.fromEntries(PROFILE_PUZZLE_TYPES.map((t) => [t, gradeDefault]))

  /* moralDilemma derived depth — על סקאלת 1-20 (min(רמת שכבה, רמת טקסט)) */
  const moralDepth = moralDilemmaDepth(gradeDefault, textLevel)

  function setTextLevel(v: number) {
    onDiffChange({ textLevel: v, perPuzzleLevel: levels })
  }
  function setLevel(t: ProfilePuzzleType, v: number) {
    onDiffChange({ textLevel, perPuzzleLevel: { ...levels, [t]: v } })
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--t250)', backdropFilter: 'blur(7px)' }}>
      <div onClick={(e) => e.stopPropagation()} dir="rtl" style={{ ...glass, padding: '28px 32px', width: 580, maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 0 60px var(--t272)' }}>
        <div style={{ ...micro, color: 'var(--t273)', marginBottom: 6 }}>◇ הגדרות קושי</div>
        <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--t13)', marginBottom: 2 }}>{student.name}</div>
        <div style={{ fontSize: 12, color: 'var(--t274)', marginBottom: 4 }}>
          כיתה {student.class}{loaded ? ` · ${profile?.sessions_count ?? 0} הדמיות שכוילו` : ''}
        </div>

        {/* ── מגדר ── */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ ...micro, fontSize: 9, color: 'var(--t135)', marginBottom: 8 }}>פנייה לתלמיד/ה בהדמיות</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {([['male', '♂ זכר', 'var(--t140)'], ['female', '♀ נקבה', 'var(--t120)'], [null, '◇ לא מוגדר', 'var(--t274)']] as const).map(([val, label, color]) => {
              const active = effectiveGender === val
              return (
                <button key={String(val)} onClick={() => onGenderChange(val)}
                  style={{ flex: 1, padding: '7px 0', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: active ? 700 : 500, color: active ? color : 'var(--t275)', background: active ? `${window.HoloTint(val === 'male' ? '122,184,255' : val === 'female' ? '255,155,214' : '90,122,170', .13)}` : 'var(--t70)', border: `1px solid ${active ? color : 'var(--t276)'}`, transition: 'all .15s' }}>
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {!loaded && !err && <p style={{ color: 'var(--t274)', fontSize: 13 }}>טוען…</p>}
        {loaded && !profile && <p style={{ color: 'var(--t265)', fontSize: 12 }}>אין עדיין פרופיל אישי — הסליידרים יציגו ברירת מחדל; הכיול יתחיל אחרי הדמיה ראשונה.</p>}
        {err && <p style={{ color: 'var(--t263)', fontSize: 13 }}>⚠️ {err}</p>}

        {/* ── רמת טקסט ── */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ ...micro, fontSize: 9, color: 'var(--t135)', marginBottom: 8 }}>רמת טקסט (1-20)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input type="range" min={1} max={20} value={textLevel}
              onChange={(e) => setTextLevel(+e.target.value)}
              style={{ flex: 1, accentColor: 'var(--t15)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 800, color: 'var(--t15)', minWidth: 28, textAlign: 'center' }}>{textLevel}</span>
          </div>
        </div>

        {/* ── סוגי אתגרים ── */}
        <div style={{ ...micro, fontSize: 9, color: 'var(--t277)', marginBottom: 10 }}>◇ רמת קושי לכל סוג אתגר (1-20)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {PROFILE_PUZZLE_TYPES.map((t: ProfilePuzzleType) => {
            const lv = levels[t] ?? gradeDefault
            const isChanged = diffPending && lv !== (diffPending.origPerPuzzleLevel[t] ?? lv)
            return (
              <div key={t} style={{ background: 'var(--t70)', borderRadius: 10, padding: '10px 14px', border: '1px solid var(--t62)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: 'var(--t12)', fontWeight: 600 }}>{puzzleTypeLabel(t)}</span>
                  {isChanged && <span style={{ fontSize: 9.5, color: 'var(--t264)', fontFamily: 'var(--font-mono)' }}>⚡ שינוי ידני ממתין</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <input type="range" min={1} max={20} value={lv}
                    onChange={(e) => setLevel(t, +e.target.value)}
                    style={{ flex: 1, accentColor: 'var(--t118)' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 800, color: 'var(--t118)', minWidth: 22, textAlign: 'center' }}>{lv}</span>
                </div>
              </div>
            )
          })}

          {/* ── דילמת מוסר — עומק נגזר ── */}
          <div style={{ background: 'var(--t278)', borderRadius: 10, padding: '10px 14px', border: '1px solid var(--t279)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 13, color: 'var(--t280)', fontWeight: 600 }}>דילמות מוסריות</span>
              <span style={{ fontSize: 9.5, color: 'var(--t281)', fontFamily: 'var(--font-mono)' }}>עומק נגזר</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--t282)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(moralDepth / 20) * 100}%`, background: 'linear-gradient(90deg,var(--t283),var(--t284))', borderRadius: 3, transition: 'width .3s' }} />
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 800, color: 'var(--t285)', minWidth: 22, textAlign: 'center' }}>{moralDepth}</span>
            </div>
            <div style={{ fontSize: 9.5, color: 'var(--t286)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
              = min(רמת שכבה={gradeDefault}, רמת טקסט={textLevel}) → {moralDepth} / 20
            </div>
          </div>
        </div>

        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <button onClick={onClose} style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, padding: '8px 22px', borderRadius: 9, cursor: 'pointer', background: 'transparent', border: '1px solid var(--t59)', color: 'var(--t258)' }}>
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
    <div dir="rtl" style={{ position: 'fixed', bottom: 0, right: 0, left: 0, zIndex: 200, background: 'var(--t287)', borderTop: '1px solid var(--t288)', backdropFilter: 'blur(12px)', padding: '14px 28px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 -4px 32px var(--t289)' }}>
      <span style={{ fontSize: 11, color: 'var(--t264)', fontFamily: 'var(--font-mono)' }}>●</span>
      <span style={{ fontSize: 13, color: 'var(--t12)', fontWeight: 600, flex: 1 }}>
        שינויים לא שמורים עבור <b style={{ color: 'var(--t262)' }}>{studentName}</b>
      </span>
      <button onClick={onCancel} disabled={saving}
        style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, padding: '7px 18px', borderRadius: 9, cursor: 'pointer', background: 'transparent', border: '1px solid var(--t290)', color: 'var(--t291)', opacity: saving ? 0.5 : 1 }}>
        בטל
      </button>
      <button onClick={onSave} disabled={saving}
        style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, padding: '7px 22px', borderRadius: 9, cursor: saving ? 'default' : 'pointer', background: saving ? 'var(--t292)' : 'linear-gradient(120deg,var(--t293),var(--t294))', border: '1px solid var(--t295)', color: 'var(--t13)', opacity: saving ? 0.6 : 1 }}>
        {saving ? 'שומר…' : '✓ שמור שינויים'}
      </button>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════ */

export default function Students() {
  /* שני ספים נפרדים, כי שני הדברים נשברים ברוחב שונה:
     · cardView (900px) — הטבלה עצמה. נמדד: ב-900px כל השמות נחתכים (הגרוע קיבל
       38% מהרוחב הדרוש), ב-1000px רק אחד וב-92%. כלומר כבר ברוחב טאבלט
       (768/810/834) הטבלה בלתי-שמישה, הרבה לפני סף המובייל.
     · isMobile (480px) — הערמת הפאנלים והריפוד. ברוחב טאבלט הפיצול עדיין מרווח
       (הרוסטר מקבל ~625px), ולכן אין סיבה לערום שם. */
  const cardView = useIsMobile(900)
  const isMobile = useIsMobile()
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

  /* ── cancelAll מוקדם — נדרש לפני ה-useEffect שמשתמש בו בתלויות ── */
  const cancelAll = useCallback(() => {
    setProfilePending(null)
    setDiffPending(null)
    setDiffModalStudentId(null)
  }, [])

  /* ── Warn on browser close/refresh when dirty ── */
  useEffect(() => {
    if (!isDirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [isDirty])

  /* ── חסום ניווט טאב-פנימי כשיש שינויים לא שמורים ── */
  useEffect(() => {
    if (isDirty) {
      setNavGuard(async () => {
        if (!(await holoConfirm(`יש שינויים לא שמורים עבור ${pendingStudentName}.\nלבטל את השינויים ולעזוב?`, 'בטל ועזוב', 'הישאר'))) return false
        cancelAll()
        return true
      })
    } else {
      setNavGuard(null)
    }
    return () => setNavGuard(null)
  }, [isDirty, pendingStudentName, cancelAll])

  /* ── Pending profile helpers ── */
  async function ensureProfilePending(student: StudentRow): Promise<ProfilePending | null> {
    if (profilePending?.studentId === student.id) return profilePending
    if (isDirty && pendingStudentId !== student.id) {
      if (!(await holoConfirm(`יש שינויים לא שמורים עבור תלמיד אחר. לבטל אותם ולהמשיך?`, 'בטל והמשך', 'הישאר'))) return null
      cancelAll()
    }
    const next: ProfilePending = { studentId: student.id, origName: student.name, origGender: student.gender, name: profilePending?.studentId === student.id ? profilePending.name : student.name, gender: profilePending?.studentId === student.id ? profilePending.gender : student.gender }
    setProfilePending(next)
    return next
  }

  async function handleNameCommit(student: StudentRow, name: string) {
    const base = await ensureProfilePending(student)
    if (!base) return
    setProfilePending({ ...base, name })
  }

  async function handleGenderChange(student: StudentRow, gender: 'male' | 'female' | null) {
    const base = await ensureProfilePending(student)
    if (!base) return
    setProfilePending({ ...base, gender })
  }

  /* ── Difficulty modal helpers ── */
  async function openDifficulty(student: StudentRow) {
    if (isDirty && pendingStudentId !== student.id) {
      if (!(await holoConfirm(`יש שינויים לא שמורים עבור תלמיד אחר. לבטל אותם ולהמשיך?`, 'בטל והמשך', 'הישאר'))) return
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

  /* ── Save ── */
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
      void holoAlert((e as Error).message)
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
  const colHdr: React.CSSProperties = { ...micro, fontSize: 9.5, color: 'var(--t135)', padding: '0 0 10px', textAlign: 'right' }

  /* במובייל שני הפאנלים נערמים לרוחב מלא (basis 0 לעולם לא מפעיל wrap — הוא רק
     מכווץ, ולכן הרוסטר נדחס ל-232px לצד הסרגל). הרוסטר עולה ראשון (order) כי הוא
     התוכן העיקרי של הדף. בדסקטופ היחס 3:1 המקורי נשמר במדויק. */
  const pane: React.CSSProperties = { flex: isMobile ? '1 1 100%' : '3 1 0', order: isMobile ? 1 : undefined, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }
  const sidePane: React.CSSProperties = { flex: isMobile ? '1 1 100%' : '1 1 0', order: isMobile ? 2 : undefined, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }

  /* the student whose difficulty modal is open */
  const diffModalStudent = diffModalStudentId ? all.find((s) => s.id === diffModalStudentId) ?? null : null

  return (
    <div dir="rtl" style={{ position: 'relative', minHeight: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-display)', background: 'var(--t-studio-bg)', paddingBottom: isDirty ? 64 : 0 }}>
      <style>{`select option { background: var(--t75); color: var(--t68); }
        .holo-scroll::-webkit-scrollbar { width: 5px; }
        .holo-scroll::-webkit-scrollbar-track { background: var(--t70); border-radius: 4px; }
        .holo-scroll::-webkit-scrollbar-thumb { background: var(--t41); border-radius: 4px; }
        .holo-scroll::-webkit-scrollbar-thumb:hover { background: var(--t77); }`}</style>
      <div style={{ position: 'absolute', left: -120, top: -80, width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle, var(--t83), transparent 70%)', filter: 'blur(20px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', right: -120, bottom: -120, width: 460, height: 460, borderRadius: '50%', background: 'radial-gradient(circle, var(--t84), transparent 70%)', filter: 'blur(20px)', pointerEvents: 'none' }} />

      <StudioTopBar active="students" />

      <div data-studio-content className="holo-tab-enter" style={{ position: 'relative', zIndex: 2, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: isMobile ? '12px 10px 26px' : '12px 24px 26px', width: '100%' }}>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>

          {/* ימין — ניהול */}
          <div style={sidePane} className="holo-scroll">
            <div style={{ ...micro, fontSize: 9, color: 'var(--t28)', flex: '0 0 auto' }}>⚙️ ניהול</div>
            <ManagementSidebar onClassStudentsChange={loadStudents} />
          </div>

          {/* שמאל — רוסטר */}
          <div style={pane}>
            <div style={{ ...micro, fontSize: 9, color: 'var(--t28)', flex: '0 0 auto' }}>👥 תלמידים</div>
            {error && <p style={{ color: 'var(--t18)', fontSize: 14 }}>⚠️ {error}</p>}

            {detail ? (
              <StudentDetail studentId={detail.student.id} className={detail.student.class} backLabel="תלמידים" mode={detail.mode} onBack={() => setDetail(null)} />
            ) : (
              <>
                {/* סינון */}
                <div style={{ ...glass, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flex: '0 0 auto' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--t25)', border: '1px solid var(--t33)', borderRadius: 10, padding: '7px 14px', flex: '1 1 180px', minWidth: 150 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ stroke: 'var(--t1)' }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש לפי שם תלמיד…" style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'var(--t68)', fontSize: 14, fontFamily: 'var(--font-display)', direction: 'rtl' }} />
                  </div>
                  <HoloSelect value={layer} onChange={(v) => { setLayer(v); setKlass('') }} options={layers} placeholder="שכבה" />
                  <HoloSelect value={klass} onChange={setKlass} options={classOptions} placeholder="כיתה" />
                  {filterDirty && <button onClick={clearAll} style={{ fontSize: 12, fontWeight: 600, color: 'var(--t34)', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: '1px solid var(--t35)', whiteSpace: 'nowrap' }}>נקה סינון</button>}
                  <div style={{ ...micro, fontSize: 10, color: 'var(--t77)', marginRight: 'auto' }}>{filtered.length} תלמידים</div>
                </div>

                {/* טבלה */}
                <div style={{ ...glass, flex: 1, minHeight: 0, overflow: 'hidden' }}>
                  <div className="holo-scroll" style={{ height: '100%', overflowY: 'auto', overflowX: 'hidden' }}>
                    {/* שורת כותרות העמודות — לא רלוונטית בתצוגת הכרטיסים (לכל ערך תווית משלו) */}
                    {!cardView && (
                      <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'grid', gridTemplateColumns: COLS, columnGap: COL_GAP, alignItems: 'center', padding: '12px 26px 10px', borderBottom: '1px solid var(--t20)', background: 'var(--t296)', backdropFilter: 'blur(8px)' }}>
                        <div style={colHdr}>שם תלמיד · מגדר</div>
                        <div style={colHdr}>כיתה</div>
                        <div style={colHdr}>קוד כיתה</div>
                        <div style={colHdr}>קוד סודי</div>
                        <div style={colHdr}>פעילות אחרונה</div>
                        <div style={{ ...colHdr, textAlign: 'left' }}>פעולות</div>
                      </div>
                    )}
                    {!students && !error && <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--t248)', fontSize: 14 }}>טוען…</div>}
                    {students && filtered.length === 0 && <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--t248)', fontSize: 14 }}>{all.length === 0 ? 'אין עדיין תלמידים בכיתות שלך.' : 'לא נמצאו תלמידים תואמים'}</div>}
                    {filtered.map((st, i) => {
                      const effectiveName = profilePending?.studentId === st.id ? profilePending.name : st.name
                      const effectiveGender = profilePending?.studentId === st.id ? profilePending.gender : st.gender
                      const isPending = pendingStudentId === st.id
                      return (
                        <Row key={st.id + st.class} st={st} i={i}
                          isMobile={cardView}
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
          effectiveGender={profilePending?.studentId === diffModalStudent.id ? profilePending.gender : diffModalStudent.gender}
          onDiffChange={(d) => handleDiffChange(diffModalStudent.id, d)}
          onGenderChange={(g) => handleGenderChange(diffModalStudent, g)}
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
