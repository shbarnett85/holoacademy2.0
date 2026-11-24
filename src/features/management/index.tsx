import { useEffect, useMemo, useState } from 'react'
import { leaveWith } from '../../shared/lib/leave'
import { useNavigate } from 'react-router-dom'
import { apiJson, apiFetch } from '../../shared/lib/api'
import { useStaffAuth } from '../../shared/hooks/useStaffAuth'
import ConfirmModal from '../superadmin/ConfirmModal'
import ClassManage from './ClassManage'
import DemoDataPanel from './DemoDataPanel'
import TeacherRequests from './TeacherRequests'
import DemoStudentBadge from '../../shared/ui/DemoStudentBadge'
import { fieldStyle, infoChip, nameChip, panelWrong } from '../../styles/ui'
import type { V2LinkInfo } from './v2Link'

interface Teacher { id: string; name: string; is_active: boolean; classCount: number }
export interface ClassTeacher { teacherId: string; name: string; subject: string; subjectCode?: string | null; isHomeroom?: boolean }
/* v2Linked / v2UnlinkedReason: האם יש מסך אנליטיקה לכיתה (השרת; ארגון הדגמה — לא). ראו v2Link.ts */
export interface ClassRow extends V2LinkInfo { id: string; name: string; slug: string; url_code: string; gradeLabel: string; gradeLevel?: number | null; effectsLevel?: string; teachers: ClassTeacher[]; studentCount: number; is_active: boolean; is_fictitious?: boolean }

const inputStyle: React.CSSProperties = { ...fieldStyle, padding: '0.5rem 0.7rem' }
const rowBtn = 'holo-button holo-button--staff holo-button--sm text-sm'
const muted: React.CSSProperties = { color: 'var(--color-muted)' }
/* תג מצב (פעיל / מושבת): קו דיו, אייקון ומילה — לא צבע לבד */
const statusChip = (active: boolean): React.CSSProperties => (active ? infoChip : { ...infoChip, background: 'var(--color-ink-wash)' })

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="holo-panel holo-panel--staff text-center" style={{ padding: '1rem 1.4rem' }}>
      <div className="holo-text-glow text-3xl font-black">{value}</div>
      <div className="text-xs mt-1" style={muted}>{label}</div>
    </div>
  )
}

/* אזור ניהול בית הספר — מנהל (מורים + כל הכיתות) / מורה (הכיתות שלי) */
export default function ManagementPanel() {
  const navigate = useNavigate()
  const { user, role, isAdmin, logout } = useStaffAuth()
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<ClassRow | null>(null)
  const [confirm, setConfirm] = useState<{ kind: 'teacher' | 'class'; id: string; name: string } | null>(null)
  const [addTeacher, setAddTeacher] = useState(false)
  const [addClass, setAddClass] = useState(false)
  const [tForm, setTForm] = useState({ name: '', email: '', password: '' })
  const [cForm, setCForm] = useState({ name: '', slug: '', gradeLabel: '' })
  const [busy, setBusy] = useState(false)

  function load() {
    apiJson<{ classes: ClassRow[] }>('/api/staff/classes').then((b) => { setClasses(b.classes); setError(null) }).catch((e: Error) => setError(e.message))
    if (isAdmin) apiJson<{ teachers: Teacher[] }>('/api/staff/teachers').then((b) => setTeachers(b.teachers)).catch(() => {})
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
      setCForm({ name: '', slug: '', gradeLabel: '' }); setAddClass(false); load()
    } catch (e) { setError(e instanceof Error ? e.message : 'שגיאה') } finally { setBusy(false) }
  }

  async function toggle(kind: 'teacher' | 'class', id: string, active: boolean) {
    setConfirm(null)
    try {
      const path = kind === 'teacher' ? `/api/staff/teachers/${id}/${active ? 'reactivate' : 'deactivate'}` : `/api/staff/classes/${id}/${active ? 'reactivate' : 'deactivate'}`
      await apiFetch(path, { method: 'POST' }); load()
    } catch (e) { setError(e instanceof Error ? e.message : 'שגיאה') }
  }

  if (view) {
    return (
      <div className="holo-page-enter flex flex-col items-center min-h-screen p-6 gap-4 max-w-2xl mx-auto">
        <ClassManage cls={view} onBack={() => { setView(null); load() }} />
      </div>
    )
  }

  return (
    <div className="holo-page-enter flex flex-col items-center min-h-screen p-6 gap-5 max-w-2xl mx-auto">
      <header className="w-full">
        <div className="flex items-center justify-between">
          <span className="text-sm rounded-full px-3 py-0.5" style={nameChip}>{user?.name} · {role === 'admin' ? 'מנהל' : role === 'municipal_admin' ? 'מנהל עירוני' : role === 'super_admin' ? 'מנהל-על' : 'מורה'}</span>
          <div className="flex gap-3">
            <button className={rowBtn} onClick={() => navigate('/analytics')}>📊 התקדמות</button>
            <button className={rowBtn} onClick={() => leaveWith(() => { logout(); navigate('/staff/login') })}>יציאה</button>
          </div>
        </div>
        <h1 className="holo-text-glow text-3xl font-black mt-2 text-center">ניהול בית הספר</h1>
        <div className="flex justify-center mt-2">
          <button className="holo-button holo-button--staff text-sm" onClick={() => navigate('/manage/students')}>👥 כל התלמידים</button>
        </div>
      </header>

      {error && <p className="text-sm" style={{ ...panelWrong, padding: '6px 12px' }}>⚠️ {error}</p>}

      <DemoDataPanel classes={classes} onChanged={load} />

      {isAdmin && (
        <>
          <div className="flex gap-3 flex-wrap justify-center">
            <Stat label="מורים" value={teachers.length} />
            <Stat label="כיתות" value={classes.length} />
            <Stat label="תלמידים" value={totalStudents} />
          </div>

          {/* בקשות הצטרפות של מורים שנרשמו לבית הספר — מוצג רק כשיש */}
          <TeacherRequests onChanged={load} />

          {/* מורים */}
          <div className="w-full flex justify-between items-center mt-2">
            <h2 className="font-bold">מורים</h2>
            <button className="holo-button holo-button--staff text-sm" onClick={() => setAddTeacher((v) => !v)}>+ מורה</button>
          </div>
          {addTeacher && (
            <div className="holo-panel holo-panel--staff w-full grid grid-cols-2 gap-2">
              <input placeholder="שם" value={tForm.name} onChange={(e) => setTForm({ ...tForm, name: e.target.value })} style={inputStyle} />
              <span />
              <input dir="ltr" placeholder="email" value={tForm.email} onChange={(e) => setTForm({ ...tForm, email: e.target.value })} style={inputStyle} />
              <input dir="ltr" type="password" placeholder="סיסמה (6+)" value={tForm.password} onChange={(e) => setTForm({ ...tForm, password: e.target.value })} style={inputStyle} />
              <button className="holo-button holo-button--staff col-span-2" disabled={busy} onClick={createTeacher}>{busy ? 'יוצר…' : 'צור מורה'}</button>
            </div>
          )}
          <div className="w-full flex flex-col gap-2">
            {teachers.map((t) => (
              <div key={t.id} className="holo-panel holo-panel--staff flex items-center justify-between" style={{ padding: '0.6rem 1rem', opacity: t.is_active ? 1 : 0.45 }}>
                <span className="font-bold"><span className="rounded-full px-3 py-0.5" style={{ ...nameChip, display: 'inline-block' }}>{t.name}</span> <span className="text-xs" style={{ ...muted, fontWeight: 400 }}>· {t.classCount} כיתות</span></span>
                <div className="flex items-center gap-2">
                  <span className="text-xs rounded-full px-2 py-0.5" style={statusChip(t.is_active)}>{t.is_active ? '● פעיל' : '○ מושבת'}</span>
                  {t.is_active
                    ? <button className={rowBtn} onClick={() => setConfirm({ kind: 'teacher', id: t.id, name: t.name })}>השבתה</button>
                    : <button className={rowBtn} onClick={() => toggle('teacher', t.id, true)}>הפעלה</button>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* כיתות */}
      <div className="w-full flex justify-between items-center mt-2">
        <h2 className="font-bold">{isAdmin ? 'כל הכיתות' : 'הכיתות שלי'}</h2>
        <button className="holo-button holo-button--staff text-sm" onClick={() => setAddClass((v) => !v)}>+ כיתה</button>
      </div>
      {addClass && (
        <div className="holo-panel holo-panel--staff w-full grid grid-cols-2 gap-2">
          <input placeholder="שכבה נוכחית (grade_label, למשל ז׳3)" value={cForm.gradeLabel} onChange={(e) => setCForm({ ...cForm, gradeLabel: e.target.value, name: e.target.value })} style={inputStyle} />
          <input dir="ltr" placeholder="slug יציב (למשל 7c)" value={cForm.slug} onChange={(e) => setCForm({ ...cForm, slug: e.target.value })} style={inputStyle} />
          <p className="col-span-2 text-xs" style={muted}>ℹ️ ה-slug וה-url_code יציבים לאורך השנים; השכבה (grade_label) מתעדכנת בתחילת שנה. שיוך מורים נעשה בתוך ניהול הכיתה.</p>
          <button className="holo-button holo-button--staff col-span-2" disabled={busy} onClick={createClass}>{busy ? 'יוצר…' : 'צור כיתה'}</button>
        </div>
      )}
      <div className="w-full flex flex-col gap-2 mb-8">
        {classes.length === 0 && <p style={muted}>אין כיתות עדיין.</p>}
        {classes.map((c) => (
          <div key={c.id} className="holo-panel holo-panel--staff flex items-center justify-between" style={{ padding: '0.7rem 1rem', opacity: c.is_active ? 1 : 0.45 }}>
            <div>
              <span className="font-bold">{c.gradeLabel}</span>
              {c.is_fictitious && <span className="mr-2"><DemoStudentBadge show /></span>}
              <span className="text-xs mr-2" style={muted}>· {c.studentCount} תלמידים{c.teachers.length ? ` · ${c.teachers.map((t) => t.name).join(', ')}` : ''}</span>
              {!c.is_active && <span className="text-xs mr-2 rounded-full px-2 py-0.5" style={statusChip(false)}>○ מושבת</span>}
            </div>
            <div className="flex gap-2">
              <button className={rowBtn} onClick={() => setView(c)}>ניהול ←</button>
              {isAdmin && (c.is_active
                ? <button className={rowBtn} onClick={() => setConfirm({ kind: 'class', id: c.id, name: c.name })}>השבתה</button>
                : <button className={rowBtn} onClick={() => toggle('class', c.id, true)}>הפעלה</button>)}
            </div>
          </div>
        ))}
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
