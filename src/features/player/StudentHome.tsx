import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../shared/hooks/useAuth'

interface AssignedQuest {
  id: string
  title: string
  sceneCount: number
  artStyle?: string
}

export default function StudentHome() {
  const { isLoggedIn, logout } = useAuth()
  const navigate = useNavigate()
  const name = sessionStorage.getItem('holo_student_name') ?? ''
  const [quests, setQuests] = useState<AssignedQuest[]>([])
  const [loading, setLoading] = useState(true)
  const [dbgError, setDbgError] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoggedIn) return
    const token = sessionStorage.getItem('holo_token')
    if (!token) { setLoading(false); setDbgError('אין token בסשן — נסה להתחבר מחדש'); return }
    fetch('/api/sessions/assigned', { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) { setDbgError(`שגיאה ${r.status}: ${body.error ?? JSON.stringify(body)}`); return }
        setQuests(body.quests ?? [])
      })
      .catch((e) => setDbgError(String(e)))
      .finally(() => setLoading(false))
  }, [isLoggedIn])

  if (!isLoggedIn) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p style={{ color: 'var(--holo-text)' }}>לא מחוברים — חזרו לקישור הכיתה</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', padding: '2rem', maxWidth: 700, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ color: 'var(--holo-cyan)', fontFamily: 'var(--font-display)', fontSize: '1.8rem', margin: 0 }}>
          שלום {name}! 👋
        </h1>
        <button
          onClick={() => { logout(); navigate('/') }}
          style={{ fontSize: 13, padding: '6px 14px', borderRadius: 8, cursor: 'pointer', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.15)', color: '#8aa0b8' }}
        >
          יציאה
        </button>
      </div>

      <h2 style={{ color: 'rgba(180,220,255,.7)', fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
        ההדמיות שלך
      </h2>

      {loading && <p style={{ color: 'rgba(140,170,200,.5)', fontSize: 14 }}>טוען…</p>}

      {dbgError && (
        <div style={{ padding: '12px 16px', background: 'rgba(255,80,80,.1)', border: '1px solid rgba(255,80,80,.3)', borderRadius: 10, fontSize: 13, color: '#ff8099', marginBottom: 12 }}>
          ⚠️ {dbgError}
        </div>
      )}

      {!loading && quests.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem', background: 'rgba(4,9,18,.5)', borderRadius: 16, border: '1px solid rgba(47,243,255,.1)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚀</div>
          <p style={{ color: 'rgba(140,170,200,.6)', fontSize: 14 }}>עדיין לא הוקצו לך הדמיות — המורה יעדכן בקרוב</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {quests.map((q) => (
          <div key={q.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: 'rgba(4,9,18,.6)', borderRadius: 14, border: '1px solid rgba(47,243,255,.15)' }}>
            <div>
              <div style={{ fontWeight: 700, color: '#e8f4ff', fontSize: 15 }}>{q.title}</div>
              <div style={{ fontSize: 12, color: 'rgba(140,170,200,.6)', marginTop: 3 }}>{q.sceneCount} סצנות</div>
            </div>
            <button
              onClick={() => navigate(`/play/${q.id}`)}
              style={{ fontSize: 14, fontWeight: 700, padding: '9px 20px', borderRadius: 10, cursor: 'pointer', background: 'linear-gradient(135deg,#2ff3ff,#00c8e0)', color: '#031018', border: 'none' }}
            >
              שחק ▶
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
