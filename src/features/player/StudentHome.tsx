import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../shared/hooks/useAuth'
import HoloBackdrop from '../../shared/ui/HoloBackdrop'
import { artStyleLabel } from '../../shared/lib/labels'

const ART_ICONS: Record<string, string> = {
  'digital-painting': '🎨',
  realistic: '📷',
  comic: '💥',
  storybook: '📖',
  anime: '🌸',
  'pixar-3d': '🧸',
}

interface AssignedQuest {
  id: string
  title: string
  sceneCount: number
  artStyle?: string
  entryImageUrl?: string | null
}

/* ── כרטיס הדמיה בודד ── */
function QuestCard({ q, onPlay }: { q: AssignedQuest; onPlay: () => void }) {
  const [hovered, setHovered] = useState(false)
  const hasImage = !!q.entryImageUrl

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onPlay}
      style={{
        position: 'relative', overflow: 'hidden', borderRadius: 20, cursor: 'pointer',
        border: `1px solid ${hovered ? 'rgba(47,243,255,.55)' : 'rgba(47,243,255,.18)'}`,
        boxShadow: hovered
          ? '0 0 48px rgba(47,243,255,.18), 0 8px 32px rgba(0,0,0,.55)'
          : '0 4px 20px rgba(0,0,0,.4)',
        transition: 'border-color .22s, box-shadow .22s, transform .18s',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        background: '#04060f',
        aspectRatio: '16/7',
      }}
    >
      {/* תמונת הסצנה הראשונה — רקע מלא */}
      {hasImage ? (
        <img
          src={q.entryImageUrl!}
          alt={q.title}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover',
            transform: hovered ? 'scale(1.04)' : 'scale(1)',
            transition: 'transform .4s ease',
          }}
        />
      ) : (
        /* פלייסהולדר אם אין תמונה */
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(135deg,rgba(10,22,60,.9),rgba(4,9,24,.95))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 48, opacity: 0.4,
        }}>
          {ART_ICONS[q.artStyle ?? ''] ?? '🎮'}
        </div>
      )}

      {/* גרדיאנט overlay — מאפיל מלמטה לטקסט */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to top, rgba(2,5,15,.96) 0%, rgba(2,5,15,.55) 45%, rgba(2,5,15,.1) 100%)',
      }} />

      {/* תוכן — תחתית הכרטיס */}
      <div style={{
        position: 'absolute', bottom: 0, right: 0, left: 0,
        padding: '14px 20px 16px',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12,
      }}>
        {/* שם + מידע */}
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontWeight: 800, fontSize: 17, color: '#fff',
            fontFamily: 'var(--font-display)',
            textShadow: '0 1px 8px rgba(0,0,0,.8)',
            marginBottom: 5,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {q.title}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 600,
              background: 'rgba(47,243,255,.12)', border: '1px solid rgba(47,243,255,.3)',
              color: 'rgba(47,243,255,.9)',
              backdropFilter: 'blur(6px)',
            }}>
              {q.sceneCount} סצנות
            </span>
            <span style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 600,
              background: 'rgba(136,85,255,.12)', border: '1px solid rgba(136,85,255,.3)',
              color: 'rgba(200,160,255,.9)',
              backdropFilter: 'blur(6px)',
            }}>
              {artStyleLabel(q.artStyle)}
            </span>
          </div>
        </div>

        {/* כפתור שחק */}
        <button
          onClick={(e) => { e.stopPropagation(); onPlay() }}
          style={{
            background: 'linear-gradient(135deg,#2ff3ff,#00b8d4)',
            color: '#021018', fontWeight: 800, fontSize: 14,
            padding: '10px 22px', borderRadius: 12, border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-display)', flexShrink: 0,
            boxShadow: hovered ? '0 0 32px rgba(47,243,255,.7)' : '0 0 16px rgba(47,243,255,.4)',
            transition: 'box-shadow .2s',
          }}
        >
          שחק ▶
        </button>
      </div>
    </div>
  )
}

/* ── טעינה — שלוש נקודות פועמות ── */
function LoadingDots() {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center', padding: '3rem 0' }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{
          width: 8, height: 8, borderRadius: '50%',
          background: 'var(--holo-cyan-bright)',
          animation: 'holo-dot-pulse 1.4s ease-in-out infinite',
          animationDelay: `${i * 0.22}s`,
          opacity: 0.7,
        }} />
      ))}
    </div>
  )
}

/* ═══════════════════════════════════════════════════ */

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
      <HoloBackdrop>
        <div style={{
          background: 'linear-gradient(135deg,rgba(10,22,46,.95),rgba(4,9,20,.98))',
          border: '1px solid rgba(255,80,120,.35)', borderRadius: 22,
          padding: '40px 44px', width: 340, textAlign: 'center',
          boxShadow: '0 0 60px rgba(255,80,120,.1)',
        }}>
          <div style={{ fontSize: '2.4rem', marginBottom: 8 }}>🔒</div>
          <p style={{ color: 'rgba(180,220,255,.75)', fontSize: 15 }}>לא מחוברים — חזרו לקישור הכיתה</p>
        </div>
      </HoloBackdrop>
    )
  }

  return (
    <HoloBackdrop>
      {/* שכבת גלילה מעל הרקע */}
      <div
        dir="rtl"
        className="holo-screen-fade"
        style={{
          position: 'absolute', inset: 0, overflowY: 'auto',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '0 1rem 3rem',
        }}
      >
        {/* ── HEADER ── */}
        <div style={{
          width: '100%', maxWidth: 680,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1.75rem 0 1.5rem',
          borderBottom: '1px solid rgba(47,243,255,.08)',
          marginBottom: '1.75rem',
        }}>
          {/* לוגו + שם */}
          <div>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.22em',
              color: 'rgba(47,243,255,.45)', textTransform: 'uppercase', marginBottom: 4,
            }}>
              HoloAcademy
            </div>
            <h1 style={{
              margin: 0, fontFamily: 'var(--font-display)',
              fontSize: 'clamp(1.35rem,4vw,1.75rem)', fontWeight: 800,
              color: 'var(--holo-text-bright)',
              textShadow: '0 0 24px rgba(47,243,255,.35)',
            }}>
              שלום,{' '}
              <span style={{ color: 'var(--holo-cyan-bright)' }}>{name}</span>
              {' '}👋
            </h1>
          </div>

          {/* כפתור יציאה */}
          <button
            onClick={() => { logout(); navigate('/') }}
            style={{
              fontSize: 13, fontWeight: 600, padding: '7px 16px', borderRadius: 10,
              cursor: 'pointer', fontFamily: 'var(--font-display)',
              background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)',
              color: 'rgba(160,200,240,.55)',
              transition: 'border-color .18s, color .18s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,80,120,.4)'; e.currentTarget.style.color = '#ff8099' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.1)'; e.currentTarget.style.color = 'rgba(160,200,240,.55)' }}
          >
            יציאה
          </button>
        </div>

        {/* ── CONTENT ── */}
        <div style={{ width: '100%', maxWidth: 680 }}>

          {/* כותרת מקטע */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1.1rem' }}>
            <span style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.18em',
              color: 'rgba(47,243,255,.5)', textTransform: 'uppercase',
              fontFamily: 'var(--font-display)',
            }}>
              ההדמיות שלך
            </span>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(to left, rgba(47,243,255,.18), transparent)' }} />
          </div>

          {/* שגיאת debug */}
          {dbgError && (
            <div style={{
              padding: '12px 16px', marginBottom: 14,
              background: 'rgba(255,80,80,.08)', border: '1px solid rgba(255,80,80,.25)',
              borderRadius: 12, fontSize: 13, color: '#ff8099',
            }}>
              ⚠️ {dbgError}
            </div>
          )}

          {/* טעינה */}
          {loading && <LoadingDots />}

          {/* ריק */}
          {!loading && !dbgError && quests.length === 0 && (
            <div style={{
              textAlign: 'center', padding: '3.5rem 2rem',
              background: 'linear-gradient(135deg,rgba(10,22,46,.7),rgba(4,9,20,.8))',
              border: '1px solid rgba(47,243,255,.1)', borderRadius: 22,
              backdropFilter: 'blur(10px)',
            }}>
              <div style={{ fontSize: '3.2rem', marginBottom: '0.9rem', filter: 'drop-shadow(0 0 12px rgba(47,243,255,.3))' }}>🚀</div>
              <p style={{
                color: 'rgba(160,200,240,.55)', fontSize: 14, margin: 0,
                fontFamily: 'var(--font-display)',
              }}>
                עדיין לא הוקצו לך הדמיות
              </p>
              <p style={{ color: 'rgba(120,160,200,.35)', fontSize: 12, marginTop: 4 }}>
                המורה יעדכן בקרוב ✨
              </p>
            </div>
          )}

          {/* כרטיסי הדמיות */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {quests.map((q) => (
              <QuestCard key={q.id} q={q} onPlay={() => navigate(`/play/${q.id}`)} />
            ))}
          </div>
        </div>
      </div>
    </HoloBackdrop>
  )
}
