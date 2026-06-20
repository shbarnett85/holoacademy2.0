import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../shared/hooks/useAuth'

/* מסך שלום לתלמיד — placeholder */
export default function StudentHome() {
  const { isLoggedIn, logout } = useAuth()
  const navigate = useNavigate()
  const name = sessionStorage.getItem('holo_student_name') ?? ''

  if (!isLoggedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="holo-panel text-center">
          <p style={{ color: 'var(--holo-text)' }}>לא מחוברים — חזרו לקישור הכיתה</p>
        </div>
      </div>
    )
  }

  return (
    <div className="holo-page-enter flex flex-col items-center justify-center min-h-screen gap-6 p-6">
      <div className="holo-panel text-center max-w-sm w-full">
        <div style={{ fontSize: '3.5rem' }}>🚀</div>
        <h1 className="holo-text-glow text-3xl font-black mt-2">שלום {name}!</h1>
        <p className="mt-3" style={{ color: 'var(--holo-text)', opacity: 0.6 }}>
          ההרפתקה שלך תתחיל כאן בקרוב…
        </p>
        <button
          className="holo-button mt-6"
          onClick={() => {
            logout()
            navigate('/')
          }}
        >
          יציאה
        </button>
      </div>
    </div>
  )
}
