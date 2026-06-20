import { useEffect, useState } from 'react'
import { apiJson, apiFetch } from '../../shared/lib/api'
import { useStaffAuth } from '../../shared/hooks/useStaffAuth'
import { glass, micro } from '../creator/studioStyles'
import ConfirmModal from '../superadmin/ConfirmModal'
import PedagogicalSummary from '../analytics/PedagogicalSummary'
import type { ClassRow, ClassTeacher } from './index'

type Gender = 'male' | 'female' | null
interface Student { id: string; name: string; is_active: boolean; gender: Gender }
interface NewStudent { id?: string; name: string; pin: string }
interface SchoolTeacher { id: string; name: string; is_active: boolean }

const inputStyle: React.CSSProperties = {
  background: 'rgba(4,9,18,.55)', border: '1px solid rgba(47,243,255,.22)',
  borderRadius: 8, color: 'var(--holo-text-bright)', padding: '7px 11px',
  fontFamily: 'var(--font-display)', fontSize: 13, outline: 'none', width: '100%',
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ ...micro, fontSize: 9, color: 'rgba(47,243,255,.6)', marginBottom: 10 }}>◇ {children}</div>
}

function HoloBtn({ label, onClick, disabled, color = '#2ff3ff', rgb = '47,243,255', danger }: { label: string; onClick: () => void; disabled?: boolean; color?: string; rgb?: string; danger?: boolean }) {
  const [hov, setHov] = useState(false)
  const c = danger ? '#ff7099' : color
  const r = danger ? '255,112,153' : rgb
  return (
    <button onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} onClick={onClick} disabled={disabled}
      style={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, padding: '7px 14px', borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', background: hov ? `rgba(${r},.2)` : `rgba(${r},.07)`, border: `1px solid ${hov ? c : `rgba(${r},.32)`}`, color: disabled ? '#4a6a88' : (hov ? '#fff' : c), transition: 'all .14s', opacity: disabled ? 0.5 : 1 }}>
      {label}
    </button>
  )
}

function PinModal({ title, students, onClose }: { title: string; students: NewStudent[]; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const text = students.map((s) => `${s.name}\t${s.pin}`).join('\n')
  function copy() { navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }
  function print() {
    const w = window.open('', '_blank', 'width=420,height=600')
    if (!w) return
    const rows = students.map((s) => `<tr><td style="padding:6px 14px;border-bottom:1px solid #ccc">${s.name}</td><td style="padding:6px 14px;border-bottom:1px solid #ccc;font-weight:bold;font-family:monospace">${s.pin}</td></tr>`).join('')
    w.document.write(`<html dir="rtl"><head><title>${title}</title></head><body style="font-family:sans-serif"><h2>${title}</h2><table style="border-collapse:collapse"><tr><th style="text-align:right;padding:6px 14px">שם</th><th style="text-align:right;padding:6px 14px">PIN</th></tr>${rows}</table><script>window.onload=()=>window.print()<\/script></body></html>`)
    w.document.close()
  }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(4,6,14,.8)', backdropFilter: 'blur(6px)' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...glass, padding: 28, minWidth: 340, maxWidth: 480, width: '100%', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 0 60px rgba(47,243,255,.14)' }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', textAlign: 'center', marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 12, color: '#ffce5e', textAlign: 'center', marginBottom: 16 }}>⚠️ רשמו את ה-PIN-ים עכשיו — הם לא יוצגו שוב!</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
          {students.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderRadius: 10, background: 'rgba(47,243,255,.06)', border: '1px solid rgba(47,243,255,.18)' }}>
              <span style={{ fontSize: 14, color: '#ddeeff' }}>{s.name}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 16, color: '#2ff3ff', letterSpacing: 3 }}>{s.pin}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <HoloBtn label={copied ? 'הועתק ✓' : 'העתק 📋'} onClick={copy} />
          <HoloBtn label="הדפס 🖨️" onClick={print} />
          <HoloBtn label="סגור" onClick={onClose} color="#8aa0b8" rgb="138,160,184" />
        </div>
      </div>
    </div>
  )
}

export default function ClassManage({ cls, onBack }: { cls: ClassRow; onBack: () => void }) {
  const { isAdmin } = useStaffAuth()
  const [students, setStudents] = useState<Student[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [single, setSingle] = useState('')
  const [singleGender, setSingleGender] = useState<Gender>(null)
  const [bulk, setBulk] = useState('')
  const [showBulk, setShowBulk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pinModal, setPinModal] = useState<{ title: string; students: NewStudent[] } | null>(null)
  const [confirm, setConfirm] = useState<Student | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)
  const [teachers, setTeachers] = useState<ClassTeacher[]>(cls.teachers)
  const [gradeLabel, setGradeLabel] = useState(cls.gradeLabel)
  const [schoolTeachers, setSchoolTeachers] = useState<SchoolTeacher[]>([])
  const [newT, setNewT] = useState({ teacherId: '', subject: '' })

  const link = `holoacademy.ai/class/${cls.url_code}`

  function load() {
    apiJson<{ students: Student[] }>(`/api/staff/classes/${cls.id}/students`).then((b) => setStudents(b.students)).catch((e: Error) => setError(e.message))
  }
  function refreshClass() {
    apiJson<{ classes: ClassRow[] }>('/api/staff/classes').then((b) => {
      const me = b.classes.find((c) => c.id === cls.id)
      if (me) { setTeachers(me.teachers); setGradeLabel(me.gradeLabel) }
    }).catch(() => {})
  }
  useEffect(() => {
    load()
    if (isAdmin) apiJson<{ teachers: SchoolTeacher[] }>('/api/staff/teachers').then((b) => setSchoolTeachers(b.teachers.filter((t) => t.is_active))).catch(() => {})
  }, [cls.id, isAdmin])

  async function addTeacher() {
    if (busy || !newT.teacherId) return
    setBusy(true); setError(null)
    try {
      await apiJson(`/api/staff/classes/${cls.id}/teachers`, { method: 'POST', body: JSON.stringify({ teacherId: newT.teacherId, subject: newT.subject.trim() }) })
      setNewT({ teacherId: '', subject: '' }); refreshClass()
    } catch (e) { setError(e instanceof Error ? e.message : 'שגיאה') } finally { setBusy(false) }
  }
  async function removeTeacher(teacherId: string) {
    try { await apiJson(`/api/staff/classes/${cls.id}/teachers/${teacherId}`, { method: 'DELETE' }); refreshClass() }
    catch (e) { setError(e instanceof Error ? e.message : 'שגיאה') }
  }
  async function promote() {
    const label = window.prompt('שכבה חדשה (למשל ד׳3):', gradeLabel)
    if (!label?.trim() || label.trim() === gradeLabel) return
    try { await apiJson(`/api/staff/classes/${cls.id}/promote`, { method: 'POST', body: JSON.stringify({ gradeLabel: label.trim() }) }); refreshClass() }
    catch (e) { setError(e instanceof Error ? e.message : 'שגיאה') }
  }
  async function addSingle() {
    if (busy || !single.trim()) return
    setBusy(true); setError(null)
    try {
      const { student } = await apiJson<{ student: NewStudent }>(`/api/staff/classes/${cls.id}/students`, { method: 'POST', body: JSON.stringify({ name: single.trim(), gender: singleGender }) })
      setSingle(''); setSingleGender(null); setPinModal({ title: 'תלמיד חדש', students: [student] }); load()
    } catch (e) { setError(e instanceof Error ? e.message : 'שגיאה') } finally { setBusy(false) }
  }
  async function addBulk() {
    const names = bulk.split('\n').map((n) => n.trim()).filter(Boolean)
    if (busy || names.length === 0) return
    setBusy(true); setError(null)
    try {
      const { students: created } = await apiJson<{ students: NewStudent[] }>('/api/staff/students/bulk', { method: 'POST', body: JSON.stringify({ classId: cls.id, names }) })
      setBulk(''); setShowBulk(false); setPinModal({ title: `נוספו ${created.length} תלמידים`, students: created }); load()
    } catch (e) { setError(e instanceof Error ? e.message : 'שגיאה') } finally { setBusy(false) }
  }
  async function resetPin(s: Student) {
    try {
      const { pin } = await apiJson<{ pin: string }>(`/api/staff/students/${s.id}/reset-pin`, { method: 'POST' })
      setPinModal({ title: `PIN חדש — ${s.name}`, students: [{ name: s.name, pin }] })
    } catch (e) { setError(e instanceof Error ? e.message : 'שגיאה') }
  }
  async function setActive(s: Student, active: boolean) {
    setConfirm(null)
    try { await apiFetch(`/api/staff/students/${s.id}/${active ? 'reactivate' : 'deactivate'}`, { method: 'POST' }); load() }
    catch (e) { setError(e instanceof Error ? e.message : 'שגיאה') }
  }
  async function rename(s: Student) {
    const name = window.prompt('שם חדש:', s.name)
    if (!name?.trim() || name.trim() === s.name) return
    try { await apiFetch(`/api/staff/students/${s.id}`, { method: 'PATCH', body: JSON.stringify({ name: name.trim() }) }); load() }
    catch (e) { setError(e instanceof Error ? e.message : 'שגיאה') }
  }
  async function setGender(s: Student, gender: Gender) {
    try { await apiFetch(`/api/staff/students/${s.id}`, { method: 'PATCH', body: JSON.stringify({ gender }) }); load() }
    catch (e) { setError(e instanceof Error ? e.message : 'שגיאה') }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
      <style>{`select option { background: #070a18; color: #eaf6ff; }`}</style>

      {/* כותרת */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--holo-cyan-bright)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>← כיתות</button>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', textShadow: '0 0 18px rgba(47,243,255,.35)' }}>כיתה {gradeLabel}</div>
        <HoloBtn label="קדם שכבה ⬆️" onClick={promote} color="#ffce5e" rgb="255,206,94" />
      </div>

      {error && <div style={{ ...glass, padding: '10px 14px', borderColor: 'rgba(255,112,153,.35)', color: '#ff9bb3', fontSize: 13 }}>⚠️ {error}</div>}

      {/* מורי הכיתה */}
      <div style={{ ...glass, padding: '14px 16px' }}>
        <SectionTitle>מורי הכיתה</SectionTitle>
        {teachers.length === 0
          ? <p style={{ fontSize: 12, color: '#4a6a88' }}>אין מורים משויכים.</p>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: isAdmin ? 10 : 0 }}>
              {teachers.map((t) => (
                <div key={t.teacherId + t.subject} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px', borderRadius: 9, background: 'rgba(47,243,255,.05)', border: '1px solid rgba(47,243,255,.15)' }}>
                  <span style={{ fontSize: 13, color: '#cfe1f2' }}>{t.name}{t.subject ? <span style={{ fontSize: 11, color: '#7ab0d0', marginRight: 6 }}>· {t.subject}</span> : null}</span>
                  {isAdmin && <button onClick={() => removeTeacher(t.teacherId)} style={{ background: 'none', border: 'none', color: '#ff7099', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>הסר</button>}
                </div>
              ))}
            </div>
        }
        {isAdmin && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={newT.teacherId} onChange={(e) => setNewT({ ...newT, teacherId: e.target.value })}
              style={{ ...inputStyle, width: 'auto', flex: '1 1 120px' }}>
              <option value="">בחר מורה…</option>
              {schoolTeachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <input placeholder="מקצוע (אופציונלי)" value={newT.subject} onChange={(e) => setNewT({ ...newT, subject: e.target.value })} style={{ ...inputStyle, flex: '1 1 100px' }} />
            <HoloBtn label="+ שייך" onClick={addTeacher} disabled={busy || !newT.teacherId} />
          </div>
        )}
      </div>

      {/* קישור הכיתה */}
      <div style={{ ...glass, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <SectionTitle>קישור לתלמידים</SectionTitle>
          <div dir="ltr" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#2ff3ff', letterSpacing: '.03em' }}>{link}</div>
        </div>
        <HoloBtn label={copiedLink ? 'הועתק ✓' : 'העתק 📋'} onClick={() => { navigator.clipboard?.writeText('https://' + link); setCopiedLink(true); setTimeout(() => setCopiedLink(false), 1500) }} />
      </div>

      {/* סיכום פדגוגי */}
      <PedagogicalSummary scope="class" id={cls.id} title={`כיתה ${gradeLabel}`} />

      {/* הוספת תלמידים */}
      <div style={{ ...glass, padding: '14px 16px' }}>
        <SectionTitle>הוספת תלמידים</SectionTitle>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <input placeholder="שם תלמיד/ה" value={single} onChange={(e) => setSingle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addSingle()} style={{ ...inputStyle, flex: '1 1 130px' }} />
          <select value={singleGender ?? ''} onChange={(e) => setSingleGender((e.target.value || null) as Gender)} style={{ ...inputStyle, width: 'auto', flex: '0 0 80px' }}>
            <option value="">מגדר…</option>
            <option value="male">בן</option>
            <option value="female">בת</option>
          </select>
          <HoloBtn label="+ הוסף" onClick={addSingle} disabled={busy || !single.trim()} />
          <HoloBtn label={showBulk ? 'בודד ←' : 'מרובה ↓'} onClick={() => setShowBulk((v) => !v)} color="#ff8af0" rgb="255,138,240" />
        </div>
        <div style={{ ...micro, fontSize: 8.5, color: 'rgba(140,170,200,.5)', marginBottom: showBulk ? 10 : 0 }}>מגדר קובע את צורת הפנייה בטקסט — לא מוגדר = לשון רבים ניטרלית.</div>
        {showBulk && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <textarea placeholder="הדביקו רשימת שמות — שורה לכל תלמיד/ה" rows={4} value={bulk} onChange={(e) => setBulk(e.target.value)}
              style={{ ...inputStyle, resize: 'vertical', width: '100%', boxSizing: 'border-box' }} />
            <HoloBtn label={busy ? 'יוצר…' : `צור ${bulk.split('\n').filter((n) => n.trim()).length} תלמידים`} onClick={addBulk} disabled={busy} />
          </div>
        )}
      </div>

      {/* רשימת תלמידים */}
      <div style={{ ...glass, padding: '14px 16px' }}>
        <SectionTitle>תלמידים ({students?.length ?? '…'})</SectionTitle>
        {!students
          ? <p style={{ fontSize: 13, color: '#4a6a88', textAlign: 'center', padding: '16px 0' }}>טוען…</p>
          : students.length === 0
          ? <p style={{ fontSize: 13, color: '#4a6a88', textAlign: 'center', padding: '16px 0' }}>אין תלמידים בכיתה.</p>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {students.map((s) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 10, background: 'rgba(4,9,18,.5)', border: '1px solid rgba(120,200,255,.1)', opacity: s.is_active ? 1 : 0.5 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#ddeeff' }}>{s.name}</span>
                    {s.gender === 'male' && <span style={{ fontSize: 10, color: '#7ab8ff', marginRight: 6 }}>♂</span>}
                    {s.gender === 'female' && <span style={{ fontSize: 10, color: '#ff9bd6', marginRight: 6 }}>♀</span>}
                    {!s.is_active && <span style={{ fontSize: 10, color: '#ff9bb3', marginRight: 6 }}>מושבת</span>}
                  </div>
                  <select value={s.gender ?? ''} onChange={(e) => setGender(s, (e.target.value || null) as Gender)}
                    style={{ ...inputStyle, width: 'auto', padding: '4px 8px', fontSize: 11, flex: '0 0 auto' }}>
                    <option value="">מגדר</option>
                    <option value="male">בן</option>
                    <option value="female">בת</option>
                  </select>
                  <button onClick={() => resetPin(s)} style={{ background: 'none', border: 'none', color: '#2ff3ff', cursor: 'pointer', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>PIN חדש</button>
                  <button onClick={() => rename(s)} style={{ background: 'none', border: 'none', color: '#9fb6cf', cursor: 'pointer', fontSize: 13 }}>✏️</button>
                  {s.is_active
                    ? <button onClick={() => setConfirm(s)} style={{ background: 'none', border: 'none', color: '#ff7099', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>השבת</button>
                    : <button onClick={() => setActive(s, true)} style={{ background: 'none', border: 'none', color: '#5fffb0', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>הפעל</button>}
                </div>
              ))}
            </div>
        }
      </div>

      {pinModal && <PinModal title={pinModal.title} students={pinModal.students} onClose={() => setPinModal(null)} />}
      {confirm && (
        <ConfirmModal title="השבתת תלמיד" message={`האם להשבית את ${confirm.name}? לא יוכל/תוכל להתחבר עד הפעלה מחדש.`} confirmLabel="השבת" danger onConfirm={() => setActive(confirm, false)} onCancel={() => setConfirm(null)} />
      )}
    </div>
  )
}
