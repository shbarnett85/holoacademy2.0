import { useEffect, useMemo, useState } from 'react'
import { apiJson, apiFetch } from '../../shared/lib/api'
import { useStaffAuth } from '../../shared/hooks/useStaffAuth'
import { glass, micro } from '../creator/studioStyles'
import ConfirmModal from '../superadmin/ConfirmModal'
import ClassManage from './ClassManage'
import type { ClassRow } from './index'

interface Teacher { id: string; name: string; is_active: boolean; classCount: number }

const inputStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(47,243,255,.22)',
  borderRadius: 8, color: 'var(--holo-text-bright)', padding: '7px 11px',
  fontFamily: 'var(--font-display)', fontSize: 13, outline: 'none', width: '100%',
}

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
      <div style={{ ...micro, fontSize: 9, color: 'rgba(47,243,255,.6)' }}>◇ {children}</div>
      {action}
    </div>
  )
}

function SmallBtn({ label, color = '#2ff3ff', onClick, danger }: { label: string; color?: string; onClick: () => void; danger?: boolean }) {
  const [hov, setHov] = useState(false)
  const c = danger ? '#ff7099' : color
  const rgb = danger ? '255,112,153' : '47,243,255'
  return (
    <button onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} onClick={onClick}
      style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 7, cursor: 'pointer', whiteSpace: 'nowrap', background: hov ? `rgba(${rgb},.18)` : `rgba(${rgb},.06)`, border: `1px solid ${hov ? c : `rgba(${rgb},.3)`}`, color: c, transition: 'all .14s', fontFamily: 'var(--font-display)' }}>
      {label}
    </button>
  )
}

/* פאנל ניהול צדי — כיתות + מורים (admin בלבד) */
export default function ManagementSidebar({ onClassStudentsChange }: { onClassStudentsChange?: () => void }) {
  const { isAdmin } = useStaffAuth()
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<ClassRow | null>(null)
  const [confirm, setConfirm] = useState<{ kind: 'teacher' | 'class'; id: string; name: string; active: boolean } | null>(null)

  const [addTeacher, setAddTeacher] = useState(false)
  const [addClass, setAddClass] = useState(false)
  const [tForm, setTForm] = useState({ name: '', email: '', password: '' })
  const [cForm, setCForm] = useState({ name: '', slug: '', gradeLabel: '' })
  const [busy, setBusy] = useState(false)

  function load() {
    apiJson<{ classes: ClassRow[] }>('/api/staff/classes')
      .then((b) => { setClasses(b.classes); setError(null) })
      .catch((e: Error) => setError(e.message))
    if (isAdmin) {
      apiJson<{ teachers: Teacher[] }>('/api/staff/teachers')
        .then((b) => setTeachers(b.teachers))
        .catch(() => {})
    }
  }
  useEffect(load, [isAdmin])

  const totalStudents = useMemo(() => classes.reduce((s, c) => s + c.studentCount, 0), [classes])

  async function createTeacher() {
    if (busy || !tForm.name.trim() || !/\S+@\S+/.test(tForm.email) || tForm.password.length < 6) return
    setBusy(true); setError(null)
    try {
      await apiJson('/api/staff/teachers', { method: 'POST', body: JSON.stringify({ ...tForm, name: tForm.name.trim(), email: tForm.email.trim() }) })
      setTForm({ name: '', email: '', password: '' }); setAddTeacher(false); load()
    } catch (e) { setError(e instanceof Error ? e.message : 'שגיאה') } finally { setBusy(false) }
  }

  async function createClass() {
    if (busy || !cForm.name.trim() || !/^[a-z0-9-]+$/.test(cForm.slug)) return
    setBusy(true); setError(null)
    try {
      const body: Record<string, unknown> = { name: cForm.name.trim(), slug: cForm.slug.trim() }
      if (cForm.gradeLabel.trim()) body.gradeLabel = cForm.gradeLabel.trim()
      await apiJson('/api/staff/classes', { method: 'POST', body: JSON.stringify(body) })
      setCForm({ name: '', slug: '', gradeLabel: '' }); setAddClass(false); load(); onClassStudentsChange?.()
    } catch (e) { setError(e instanceof Error ? e.message : 'שגיאה') } finally { setBusy(false) }
  }

  async function toggle(kind: 'teacher' | 'class', id: string, activate: boolean) {
    setConfirm(null)
    try {
      const path = kind === 'teacher'
        ? `/api/staff/teachers/${id}/${activate ? 'reactivate' : 'deactivate'}`
        : `/api/staff/classes/${id}/${activate ? 'reactivate' : 'deactivate'}`
      await apiFetch(path, { method: 'POST' }); load(); onClassStudentsChange?.()
    } catch (e) { setError(e instanceof Error ? e.message : 'שגיאה') }
  }

  /* מצב ניהול כיתה */
  if (view) {
    return (
      <div style={{ ...glass, padding: 18, flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button onClick={() => { setView(null); load(); onClassStudentsChange?.() }}
          style={{ background: 'none', border: 'none', color: 'var(--holo-cyan-bright)', cursor: 'pointer', fontSize: 13, fontWeight: 600, alignSelf: 'flex-start' }}>← כיתות</button>
        <ClassManage cls={view} onBack={() => { setView(null); load(); onClassStudentsChange?.() }} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
      {error && <p style={{ color: '#ff9bb3', fontSize: 12 }}>⚠️ {error}</p>}

      {/* סטטיסטיקות — admin בלבד */}
      {isAdmin && (
        <div style={{ ...glass, padding: '14px 16px' }}>
          <SectionTitle>סטטיסטיקות</SectionTitle>
          <div style={{ display: 'flex', gap: 10 }}>
            {[['מורים', teachers.length], ['כיתות', classes.length], ['תלמידים', totalStudents]].map(([l, v]) => (
              <div key={String(l)} style={{ flex: 1, textAlign: 'center', padding: '8px 4px', borderRadius: 9, background: 'rgba(4,9,18,.5)', border: '1px solid rgba(47,243,255,.1)' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#7ef6ff' }}>{v}</div>
                <div style={{ ...micro, fontSize: 8.5, marginTop: 4 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* מורים — admin בלבד */}
      {isAdmin && (
        <div style={{ ...glass, padding: '14px 16px' }}>
          <SectionTitle action={<SmallBtn label="+ מורה" onClick={() => setAddTeacher((v) => !v)} />}>
            מורים
          </SectionTitle>
          {addTeacher && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 12 }}>
              <input placeholder="שם" value={tForm.name} onChange={(e) => setTForm({ ...tForm, name: e.target.value })} style={inputStyle} />
              <input dir="ltr" placeholder="email" value={tForm.email} onChange={(e) => setTForm({ ...tForm, email: e.target.value })} style={inputStyle} />
              <input dir="ltr" type="password" placeholder="סיסמה (6+ תווים)" value={tForm.password} onChange={(e) => setTForm({ ...tForm, password: e.target.value })} style={inputStyle} />
              <button onClick={createTeacher} disabled={busy}
                style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, padding: '8px 0', borderRadius: 9, cursor: busy ? 'not-allowed' : 'pointer', background: 'rgba(47,243,255,.14)', border: '1px solid rgba(47,243,255,.35)', color: '#2ff3ff', opacity: busy ? 0.5 : 1 }}>
                {busy ? 'יוצר…' : 'צור מורה'}
              </button>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {teachers.map((t) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', borderRadius: 9, background: 'rgba(4,9,18,.5)', border: '1px solid rgba(120,200,255,.1)', opacity: t.is_active ? 1 : 0.5 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#ddeeff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                  <div style={{ ...micro, fontSize: 8.5, marginTop: 2 }}>{t.classCount} כיתות</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, ...(t.is_active ? { color: '#5fffb0', border: '1px solid rgba(0,255,150,.4)' } : { color: '#ff9bb3', border: '1px solid rgba(255,120,150,.4)' }) }}>
                  {t.is_active ? '● פעיל' : '○ מושבת'}
                </span>
                {t.is_active
                  ? <SmallBtn label="השבת" danger onClick={() => setConfirm({ kind: 'teacher', id: t.id, name: t.name, active: true })} />
                  : <SmallBtn label="הפעל" onClick={() => toggle('teacher', t.id, true)} />}
              </div>
            ))}
            {isAdmin && teachers.length === 0 && <p style={{ ...micro, fontSize: 10, color: 'rgba(140,170,200,.5)', textAlign: 'center', padding: 12 }}>אין מורים עדיין.</p>}
          </div>
        </div>
      )}

      {/* כיתות */}
      <div style={{ ...glass, padding: '14px 16px' }}>
        <SectionTitle action={<SmallBtn label="+ כיתה" onClick={() => setAddClass((v) => !v)} />}>
          {isAdmin ? 'כל הכיתות' : 'הכיתות שלי'}
        </SectionTitle>
        {addClass && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 12 }}>
            <input placeholder='שכבה (למשל ז׳3)' value={cForm.gradeLabel} onChange={(e) => setCForm({ ...cForm, gradeLabel: e.target.value, name: e.target.value })} style={inputStyle} />
            <input dir="ltr" placeholder="slug יציב (למשל 7c)" value={cForm.slug} onChange={(e) => setCForm({ ...cForm, slug: e.target.value })} style={inputStyle} />
            <p style={{ ...micro, fontSize: 8.5, color: 'rgba(180,200,220,.5)', margin: 0 }}>ℹ️ ה-slug יציב לאורך השנים; השכבה מתעדכנת.</p>
            <button onClick={createClass} disabled={busy}
              style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, padding: '8px 0', borderRadius: 9, cursor: busy ? 'not-allowed' : 'pointer', background: 'rgba(47,243,255,.14)', border: '1px solid rgba(47,243,255,.35)', color: '#2ff3ff', opacity: busy ? 0.5 : 1 }}>
              {busy ? 'יוצר…' : 'צור כיתה'}
            </button>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {classes.length === 0 && <p style={{ ...micro, fontSize: 10, color: 'rgba(140,170,200,.5)', textAlign: 'center', padding: 12 }}>אין כיתות עדיין.</p>}
          {classes.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 10, background: 'rgba(4,9,18,.5)', border: '1px solid rgba(120,200,255,.1)', opacity: c.is_active ? 1 : 0.5 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#ddeeff' }}>{c.gradeLabel}</div>
                <div style={{ ...micro, fontSize: 8.5, marginTop: 2, color: 'rgba(140,170,200,.7)' }}>
                  {c.studentCount} תלמידים
                  {c.teachers.length > 0 && ` · ${c.teachers.map((t) => t.name).join(', ')}`}
                  {!c.is_active && <span style={{ color: '#ff9bb3' }}> · מושבת</span>}
                </div>
              </div>
              <SmallBtn label="ניהול ←" onClick={() => setView(c)} />
              {isAdmin && (c.is_active
                ? <SmallBtn label="השבת" danger onClick={() => setConfirm({ kind: 'class', id: c.id, name: c.gradeLabel, active: true })} />
                : <SmallBtn label="הפעל" onClick={() => toggle('class', c.id, true)} />)}
            </div>
          ))}
        </div>
      </div>

      {confirm && (
        <ConfirmModal
          title={confirm.kind === 'teacher' ? 'השבתת מורה' : 'השבתת כיתה'}
          message={`האם להשבית את ${confirm.name}? ניתן להפעיל מחדש בכל עת.`}
          confirmLabel="השבת" danger
          onConfirm={() => toggle(confirm.kind, confirm.id, false)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
