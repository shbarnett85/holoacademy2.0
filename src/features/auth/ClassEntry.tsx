import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PinScreen from './PinScreen'
import EntryShell, { EntryLogo } from '../../shared/ui/EntryShell'
import WelcomeBurst from '../../shared/ui/WelcomeBurst'
import { panelStudent } from '../../styles/ui'

/* שוליים סביב החלון: מקום לצל הקשיח (6px ימינה ולמטה) בתוך המסגרת הגוללת של EntryShell */
const PANEL_MARGIN = '2px 8px 8px 2px'

interface Student {
  id: string
  name: string
}

interface ClassInfo {
  class: { id: string; name: string }
  school: { name: string }
  students: Student[]
}

/* כניסת תלמיד — שלב 1: בחירת תלמיד | שלב 2: הזנת PIN. עיצוב Claude Design, לוגיקה נשמרת. */
export default function ClassEntry() {
  const { urlCode } = useParams<{ urlCode: string }>()
  const navigate = useNavigate()

  const [info, setInfo] = useState<ClassInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Student | null>(null)

  useEffect(() => {
    if (!urlCode) return
    fetch(`/api/class/${urlCode}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          throw new Error(body?.error ?? 'הכיתה לא נמצאה')
        }
        return res.json()
      })
      .then(setInfo)
      .catch((e: Error) => setError(e.message))
  }, [urlCode])

  const [welcome, setWelcome] = useState<string | null>(null)
  /* בהצלחה — שמירת token ומעבר למסך התלמיד */
  function handleLoginSuccess(token: string, student: Student) {
    sessionStorage.setItem('holo_token', token)
    sessionStorage.setItem('holo_student_name', student.name)
    setWelcome(student.name)
  }

  /* אחרי כניסה מוצלחת: אותה אנימציית "ברוכים הבאים" של כניסת הצוות (לבקשת המשתמש), ואז הבית של התלמיד */
  if (welcome !== null) {
    return (
      <EntryShell>
        <WelcomeBurst name={welcome} role="student" onDone={() => navigate('/student')} />
      </EntryShell>
    )
  }

  if (error) {
    return (
      <EntryShell onClose={() => navigate('/')}>
        <div style={{ ...panelStudent, borderRadius: 20, margin: PANEL_MARGIN, padding: '40px 44px', width: 360, textAlign: 'center' }}>
          <div style={{ fontSize: '3rem' }}>🛸</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 8, color: 'var(--color-wrong)' }}>אופס!</h2>
          <p style={{ marginTop: 10, color: 'var(--color-ink)' }}>{error}</p>
          <p style={{ marginTop: 6, fontSize: 13, color: 'var(--color-muted)' }}>בדקו את הקישור שקיבלתם מהמורה</p>
        </div>
      </EntryShell>
    )
  }

  if (!info) {
    return (
      <EntryShell onClose={() => navigate('/')}>
        <div style={{ ...panelStudent, margin: PANEL_MARGIN, padding: '18px 28px' }}><span className="holo-text-glow" style={{ fontSize: '1.25rem' }}>טוען…</span></div>
      </EntryShell>
    )
  }

  /* שלב ה-PIN — אותה קליפה בדיוק: הרקע לא מתחלף במעבר בחירה↔קוד */
  if (selected) {
    return (
      <EntryShell onClose={() => setSelected(null)}>
        <PinScreen
          student={selected}
          onBack={() => setSelected(null)}
          onSuccess={(token) => handleLoginSuccess(token, selected)}
        />
      </EntryShell>
    )
  }

  return (
    <EntryShell onClose={() => navigate('/')}>
      <div
        className="entry-panel"
        style={{
          ...panelStudent, borderRadius: 20, margin: PANEL_MARGIN, padding: '32px 36px',
          width: 380, maxHeight: '78vh', display: 'flex', flexDirection: 'column',
        }}
      >
        <EntryLogo />
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--color-muted)', marginBottom: 10 }}>
          ◇ {info.school.name} · כיתה {info.class.name}
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-machine-deep)', marginBottom: 4 }}>מי אתם?</div>
        <div style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 20 }}>בחרו את השם שלכם</div>

        {/* ריפוד 6px (עם שוליים שליליים, כך שהרוחב לא משתנה): מקום לצל הכפתורים ולטבעת הפוקוס בתוך האזור הגולל */}
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: 6, margin: -6 }}>
          {info.students.length === 0 && <p style={{ color: 'var(--color-muted)' }}>אין תלמידים בכיתה זו.</p>}
          {info.students.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelected(s)}
              className="holo-button"
              style={{ width: '100%', padding: '12px 16px', borderRadius: 11, fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, textAlign: 'right' }}
            >
              🧑‍🚀 {s.name}
            </button>
          ))}
        </div>

        <button
          onClick={() => navigate('/')}
          className="holo-link"
          style={{ marginTop: 18, fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, padding: '9px' }}
        >
          חזרה
        </button>
      </div>
    </EntryShell>
  )
}
