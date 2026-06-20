import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PinScreen from './PinScreen'
import HoloBackdrop from '../../shared/ui/HoloBackdrop'

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

  /* בהצלחה — שמירת token ומעבר למסך התלמיד */
  function handleLoginSuccess(token: string, student: Student) {
    sessionStorage.setItem('holo_token', token)
    sessionStorage.setItem('holo_student_name', student.name)
    navigate('/student')
  }

  if (error) {
    return (
      <HoloBackdrop>
        <div style={{ background: 'linear-gradient(135deg,rgba(10,22,46,.95),rgba(4,9,20,.98))', border: '1px solid rgba(255,80,120,.4)', borderRadius: 22, padding: '40px 44px', width: 360, textAlign: 'center', boxShadow: '0 0 80px rgba(255,80,120,.12)' }}>
          <div style={{ fontSize: '3rem' }}>🛸</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 8, color: '#ff7099' }}>אופס!</h2>
          <p style={{ marginTop: 10, color: 'rgba(180,220,255,.7)' }}>{error}</p>
          <p style={{ marginTop: 6, fontSize: 13, color: 'rgba(160,200,240,.4)' }}>בדקו את הקישור שקיבלתם מהמורה</p>
        </div>
      </HoloBackdrop>
    )
  }

  if (!info) {
    return (
      <HoloBackdrop>
        <span className="holo-text-glow" style={{ fontSize: '1.25rem' }}>טוען…</span>
      </HoloBackdrop>
    )
  }

  if (selected) {
    return (
      <PinScreen
        student={selected}
        onBack={() => setSelected(null)}
        onSuccess={(token) => handleLoginSuccess(token, selected)}
      />
    )
  }

  return (
    <HoloBackdrop>
      <div
        style={{
          background: 'linear-gradient(135deg,rgba(10,22,46,.97),rgba(4,9,20,.99))',
          border: '1px solid rgba(47,243,255,.22)', borderRadius: 22, padding: '32px 36px',
          width: 380, maxHeight: '78vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 0 80px rgba(47,243,255,.12), 0 20px 60px rgba(0,0,0,.6)',
        }}
      >
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '.22em', textTransform: 'uppercase', color: 'rgba(47,243,255,.6)', marginBottom: 10 }}>
          ◇ {info.school.name} · כיתה {info.class.name}
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 4 }}>מי את/ה?</div>
        <div style={{ fontSize: 13, color: 'rgba(160,200,240,.5)', marginBottom: 20 }}>בחר/י את השם שלך</div>

        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {info.students.length === 0 && <p style={{ color: 'rgba(160,200,240,.5)' }}>אין תלמידים בכיתה זו.</p>}
          {info.students.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelected(s)}
              style={{ width: '100%', padding: '12px 16px', borderRadius: 11, cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: '#ddeeff', background: 'rgba(4,9,18,.6)', border: '1px solid rgba(47,243,255,.15)', textAlign: 'right', transition: 'all .15s' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(47,243,255,.12)'; e.currentTarget.style.borderColor = 'rgba(47,243,255,.5)'; e.currentTarget.style.color = '#fff' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(4,9,18,.6)'; e.currentTarget.style.borderColor = 'rgba(47,243,255,.15)'; e.currentTarget.style.color = '#ddeeff' }}
            >
              🧑‍🚀 {s.name}
            </button>
          ))}
        </div>

        <button
          onClick={() => navigate('/')}
          style={{ marginTop: 18, fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, color: 'rgba(150,190,220,.5)', padding: '9px', borderRadius: 10, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(120,180,220,.15)' }}
        >
          חזרה
        </button>
      </div>
    </HoloBackdrop>
  )
}
