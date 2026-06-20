import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import HoloBackdrop from '../../shared/ui/HoloBackdrop'

interface ModeCard {
  id: 'student' | 'teacher'
  label: string
  sub: string
  icon: React.ReactNode
  accent: string
  rgb: string
  grad: string
  border: string
}

/* מסך הבית — שני כרטיסי מצב (תלמיד/מורה). הלוגיקה נשמרת:
   תלמיד → מודאל קוד כיתה → /class/:code (ClassEntry).  מורה → /staff/login. */
export default function Home() {
  const navigate = useNavigate()
  const [hov, setHov] = useState<string | null>(null)
  const [showCodeModal, setShowCodeModal] = useState(false)
  const [classCode, setClassCode] = useState('')
  const [shake, setShake] = useState(false)

  function enterClass() {
    const code = classCode.trim()
    if (code.length < 3) { setShake(true); setTimeout(() => setShake(false), 500); return }
    navigate(`/class/${code}`)
  }

  const cards: ModeCard[] = [
    {
      id: 'student',
      label: 'מצב תלמיד/ה',
      sub: 'היכנסו להדמיות, השלימו אתגרים ואספו רסיסי ידע',
      icon: (
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
        </svg>
      ),
      accent: 'var(--holo-cyan-bright)', rgb: '47,243,255',
      grad: 'linear-gradient(135deg, rgba(47,243,255,.18), rgba(155,140,255,.10))', border: 'rgba(47,243,255,.45)',
    },
    {
      id: 'teacher',
      label: 'מצב מורה',
      sub: 'צרו הדמיות, נהלו כיתות ועקבו אחר התקדמות תלמידים',
      icon: (
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
        </svg>
      ),
      accent: 'var(--holo-magenta)', rgb: '255,69,230',
      grad: 'linear-gradient(135deg, rgba(255,69,230,.18), rgba(255,154,46,.10))', border: 'rgba(255,69,230,.45)',
    },
  ]

  function selectCard(id: 'student' | 'teacher') {
    if (id === 'student') setShowCodeModal(true)
    else navigate('/staff/login')
  }

  return (
    <HoloBackdrop>
      {/* כותרת */}
      <div style={{ textAlign: 'center', marginBottom: 56 }}>
        <h1 style={{
          margin: 0, fontSize: 58, fontWeight: 900, letterSpacing: '-.02em', lineHeight: 1,
          background: 'linear-gradient(135deg, #ffffff 30%, #7ef6ff 65%, #ff45e6 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          filter: 'drop-shadow(0 0 32px rgba(47,243,255,.35))',
        }}>HoloAcademy</h1>
        <p style={{ margin: '14px 0 0', fontSize: 20, fontWeight: 400, color: 'rgba(180,220,255,.65)', letterSpacing: '.06em' }}>ממד חדש של למידה</p>
      </div>

      {/* כרטיסי מצב */}
      <div className="flex flex-wrap justify-center" style={{ gap: 28 }}>
        {cards.map((c) => {
          const isHov = hov === c.id
          return (
            <button
              key={c.id}
              onMouseEnter={() => setHov(c.id)}
              onMouseLeave={() => setHov(null)}
              onClick={() => selectCard(c.id)}
              style={{
                width: 260, padding: '36px 28px', borderRadius: 22,
                background: isHov ? c.grad : 'linear-gradient(135deg, rgba(10,22,46,.82), rgba(4,9,20,.9))',
                border: `1px solid ${isHov ? c.border : 'rgba(120,180,220,.14)'}`,
                backdropFilter: 'blur(18px)',
                boxShadow: isHov ? `0 0 48px rgba(${c.rgb},.22), 0 0 120px rgba(${c.rgb},.08)` : '0 0 0 transparent',
                cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18,
                transition: 'all .22s cubic-bezier(.22,.7,.35,1)', transform: isHov ? 'translateY(-4px) scale(1.025)' : 'none',
                fontFamily: 'var(--font-display)',
              }}
            >
              <div style={{ color: isHov ? c.accent : 'rgba(160,200,230,.55)', transition: 'color .22s', filter: isHov ? `drop-shadow(0 0 12px ${c.accent})` : 'none' }}>{c.icon}</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: isHov ? '#fff' : '#b0cce0', marginBottom: 10, transition: 'color .2s' }}>{c.label}</div>
                <div style={{ fontSize: 13, color: isHov ? 'rgba(220,240,255,.7)' : 'rgba(120,160,200,.5)', lineHeight: 1.6, transition: 'color .2s' }}>{c.sub}</div>
              </div>
              <div style={{
                marginTop: 6, padding: '9px 28px', borderRadius: 10, fontSize: 13.5, fontWeight: 700,
                background: isHov ? `rgba(${c.rgb},.22)` : 'rgba(255,255,255,.04)',
                border: `1px solid ${isHov ? `rgba(${c.rgb},.5)` : 'rgba(255,255,255,.08)'}`,
                color: isHov ? c.accent : 'rgba(160,200,230,.4)', transition: 'all .2s',
                boxShadow: isHov ? `0 0 16px rgba(${c.rgb},.3)` : 'none',
              }}>כניסה</div>
            </button>
          )
        })}
      </div>

      {/* מודאל קוד כיתה */}
      {showCodeModal && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ zIndex: 100, background: 'rgba(4,6,14,.75)', backdropFilter: 'blur(8px)' }}
          onClick={() => { setShowCodeModal(false); setClassCode('') }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'linear-gradient(135deg, rgba(10,22,46,.95), rgba(4,9,20,.98))',
              border: '1px solid rgba(47,243,255,.25)', borderRadius: 22, padding: '40px 44px', width: 380, textAlign: 'center',
              boxShadow: '0 0 80px rgba(47,243,255,.12), 0 20px 60px rgba(0,0,0,.6)',
              animation: shake ? 'holo-shake .4s ease' : 'none',
            }}
          >
            <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(47,243,255,.08)', border: '1px solid rgba(47,243,255,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 22px', boxShadow: '0 0 24px rgba(47,243,255,.15)' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--holo-cyan-bright)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 8 }}>קוד כיתה</div>
            <div style={{ fontSize: 14, color: 'rgba(160,200,240,.6)', marginBottom: 28, lineHeight: 1.6 }}>מה קוד הכיתה שקיבלתם מהמורה?</div>
            <input
              autoFocus
              value={classCode}
              onChange={(e) => setClassCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && enterClass()}
              placeholder="למשל: demo-7b"
              maxLength={32}
              dir="ltr"
              style={{
                width: '100%', boxSizing: 'border-box', background: 'rgba(4,9,18,.7)', border: '1px solid rgba(47,243,255,.3)',
                borderRadius: 12, padding: '14px 18px', fontSize: 20, fontWeight: 700, color: 'var(--holo-cyan-bright)',
                fontFamily: 'var(--font-mono)', outline: 'none', textAlign: 'center', letterSpacing: '.12em', boxShadow: '0 0 20px rgba(47,243,255,.08)',
              }}
            />
            <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
              <button onClick={() => { setShowCodeModal(false); setClassCode('') }}
                style={{ flex: 1, padding: '12px', borderRadius: 11, cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, background: 'transparent', border: '1px solid rgba(120,180,220,.2)', color: 'rgba(150,190,220,.55)' }}>
                ביטול
              </button>
              <button onClick={enterClass}
                style={{ flex: 2, padding: '12px', borderRadius: 11, cursor: classCode.trim() ? 'pointer' : 'default', opacity: classCode.trim() ? 1 : 0.5, fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg, rgba(47,243,255,.22), rgba(47,243,255,.12))', border: '1px solid rgba(47,243,255,.5)', boxShadow: '0 0 20px rgba(47,243,255,.2)' }}>
                כניסה ←
              </button>
            </div>
          </div>
        </div>
      )}

      {/* כותרת תחתונה */}
      <div style={{ position: 'absolute', bottom: 22, fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '.22em', textTransform: 'uppercase', color: 'rgba(47,243,255,.28)' }}>
        © 2026 HoloAcademy. כל הזכויות שמורות.
      </div>
    </HoloBackdrop>
  )
}
