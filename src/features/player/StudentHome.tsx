import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../shared/hooks/useAuth'
import HoloBackdrop from '../../shared/ui/HoloBackdrop'

const ART_ICONS: Record<string, string> = {
  'digital-painting': '🎨', realistic: '📷', comic: '💥',
  storybook: '📖', anime: '🌸', 'pixar-3d': '🧸',
}

interface AssignedQuest {
  id: string
  title: string
  sceneCount: number
  artStyle?: string
  entryImageUrl?: string | null
  assignedAt?: string | null
  sessionStatus: 'completed' | 'in_progress' | null
  crystals: number | null
  maxScore: number | null
}

/* ── crystal dots (max 5) ── */
function CrystalRow({ crystals, max = 5 }: { crystals: number; max?: number }) {
  const full = Math.min(crystals, max)
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
      {Array.from({ length: max }).map((_, i) => (
        <div key={i} style={{
          width: 7, height: 7, borderRadius: 2,
          background: i < full ? '#2ff3ff' : 'rgba(47,243,255,.18)',
          boxShadow: i < full ? '0 0 6px rgba(47,243,255,.8)' : 'none',
          transform: 'rotate(45deg)',
          flexShrink: 0,
        }} />
      ))}
    </div>
  )
}

/* ── כרטיס הדמיה בודד ── */
function QuestCard({ q, isNew, onPlay }: { q: AssignedQuest; isNew: boolean; onPlay: () => void }) {
  const [hovered, setHovered] = useState(false)
  const status = q.sessionStatus
  const crystals = q.crystals ?? 0

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onPlay}
      style={{
        position: 'relative', overflow: 'hidden', borderRadius: 16, cursor: 'pointer',
        border: `1px solid ${hovered ? 'rgba(47,243,255,.55)' : 'rgba(47,243,255,.16)'}`,
        boxShadow: hovered
          ? '0 0 36px rgba(47,243,255,.18), 0 6px 28px rgba(0,0,0,.55)'
          : '0 3px 16px rgba(0,0,0,.4)',
        transition: 'border-color .22s, box-shadow .22s, transform .18s',
        transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
        background: '#04060f',
        aspectRatio: '16/10',
      }}
    >
      {/* תמונת רקע */}
      {q.entryImageUrl ? (
        <img src={q.entryImageUrl} alt={q.title} style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover',
          transform: hovered ? 'scale(1.05)' : 'scale(1)',
          transition: 'transform .4s ease',
        }} />
      ) : (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(135deg,rgba(10,22,60,.9),rgba(4,9,24,.95))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 36, opacity: 0.35,
        }}>
          {ART_ICONS[q.artStyle ?? ''] ?? '🎮'}
        </div>
      )}

      {/* עמעום תחתון לטקסט */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to top, rgba(2,5,15,.97) 0%, rgba(2,5,15,.5) 50%, rgba(2,5,15,.08) 100%)',
      }} />

      {/* ── BADGES פינה עליונה ── */}

      {/* badge: חדש (cyan) — פינה שמאלית עליונה ב-RTL */}
      {isNew && (
        <div style={{
          position: 'absolute', top: 10, right: 10,
          background: 'linear-gradient(135deg,rgba(47,243,255,.22),rgba(0,184,212,.18))',
          border: '1px solid rgba(47,243,255,.7)',
          borderRadius: 7, padding: '3px 8px',
          fontSize: 10, fontWeight: 800, color: '#2ff3ff',
          fontFamily: 'var(--font-display)', letterSpacing: '0.1em',
          boxShadow: '0 0 12px rgba(47,243,255,.5)',
          backdropFilter: 'blur(6px)',
          textTransform: 'uppercase',
          animation: 'holo-status-pulse 2s ease-in-out infinite',
        }}>
          ✦ חדש
        </div>
      )}

      {/* badge: הושלם (ירוק) */}
      {status === 'completed' && (
        <div style={{
          position: 'absolute', top: 10, left: 10,
          background: 'rgba(16,185,80,.18)',
          border: '1px solid rgba(16,185,80,.55)',
          borderRadius: 7, padding: '3px 8px',
          fontSize: 11, fontWeight: 800, color: '#22d46a',
          fontFamily: 'var(--font-display)',
          backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          ✓ הושלם
        </div>
      )}

      {/* badge: בתהליך (צהוב) */}
      {status === 'in_progress' && (
        <div style={{
          position: 'absolute', top: 10, left: 10,
          background: 'rgba(255,180,0,.14)',
          border: '1px solid rgba(255,180,0,.5)',
          borderRadius: 7, padding: '3px 8px',
          fontSize: 11, fontWeight: 800, color: '#fbbf24',
          fontFamily: 'var(--font-display)',
          backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          ↻ בתהליך
        </div>
      )}

      {/* ── תוכן תחתון ── */}
      <div style={{
        position: 'absolute', bottom: 0, right: 0, left: 0,
        padding: '10px 12px 11px',
      }}>
        {/* שם */}
        <div style={{
          fontWeight: 800, fontSize: 13, color: '#fff',
          fontFamily: 'var(--font-display)',
          textShadow: '0 1px 6px rgba(0,0,0,.9)',
          marginBottom: status === 'completed' ? 5 : 4,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {q.title}
        </div>

        {/* שורת מידע תחתונה */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
            {status === 'completed' ? (
              /* קריסטלים שהושגו */
              <CrystalRow crystals={crystals} />
            ) : (
              /* סצנות */
              <span style={{
                fontSize: 10, padding: '1px 7px', borderRadius: 5, fontWeight: 600,
                background: 'rgba(47,243,255,.1)', border: '1px solid rgba(47,243,255,.25)',
                color: 'rgba(47,243,255,.85)', backdropFilter: 'blur(4px)',
              }}>
                {q.sceneCount} סצנות
              </span>
            )}
          </div>

          {/* כפתור שחק */}
          <button
            onClick={(e) => { e.stopPropagation(); onPlay() }}
            style={{
              background: status === 'completed'
                ? 'linear-gradient(135deg,rgba(34,212,106,.9),rgba(16,160,70,.9))'
                : 'linear-gradient(135deg,#2ff3ff,#00b8d4)',
              color: '#021018', fontWeight: 800, fontSize: 11,
              padding: '6px 14px', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-display)', flexShrink: 0,
              boxShadow: hovered
                ? status === 'completed'
                  ? '0 0 20px rgba(34,212,106,.6)'
                  : '0 0 20px rgba(47,243,255,.6)'
                : 'none',
              transition: 'box-shadow .2s',
            }}
          >
            {status === 'completed' ? '▶ שחק שוב' : status === 'in_progress' ? '▶ המשך' : '▶ שחק'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── טעינה ── */
function LoadingDots() {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center', padding: '4rem 0' }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{
          width: 8, height: 8, borderRadius: '50%',
          background: 'var(--holo-cyan-bright)',
          animation: 'holo-dot-pulse 1.4s ease-in-out infinite',
          animationDelay: `${i * 0.22}s`, opacity: 0.7,
        }} />
      ))}
    </div>
  )
}

/* ══════════════════════════════════════════ */

export default function StudentHome() {
  const { isLoggedIn, logout } = useAuth()
  const navigate = useNavigate()
  const name = sessionStorage.getItem('holo_student_name') ?? ''
  const [quests, setQuests] = useState<AssignedQuest[]>([])
  const [loading, setLoading] = useState(true)
  const [dbgError, setDbgError] = useState<string | null>(null)
  const [lastLogin, setLastLogin] = useState<string | null>(null)

  useEffect(() => {
    /* שמירת "כניסה קודמת" — מה שנשמר מהביקור הקודם */
    const prev = localStorage.getItem('holo_last_login')
    setLastLogin(prev)
    /* עדכון לכניסה הנוכחית */
    localStorage.setItem('holo_last_login', new Date().toISOString())
  }, [])

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

  /* הדמיה חדשה = הוקצתה אחרי הכניסה הקודמת */
  function isNew(q: AssignedQuest) {
    if (!lastLogin || !q.assignedAt) return false
    return q.assignedAt > lastLogin
  }

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
      <div
        dir="rtl"
        className="holo-screen-fade"
        style={{
          position: 'absolute', inset: 0, overflowY: 'auto',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '0 1.25rem 3rem',
        }}
      >
        {/* ── HEADER ── */}
        <div style={{
          width: '100%', maxWidth: 960,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1.6rem 0 1.4rem',
          borderBottom: '1px solid rgba(47,243,255,.08)',
          marginBottom: '1.5rem',
        }}>
          <div>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.22em',
              color: 'rgba(47,243,255,.45)', textTransform: 'uppercase', marginBottom: 3,
            }}>HoloAcademy</div>
            <h1 style={{
              margin: 0, fontFamily: 'var(--font-display)',
              fontSize: 'clamp(1.25rem,3.5vw,1.65rem)', fontWeight: 800,
              color: 'var(--holo-text-bright)',
              textShadow: '0 0 22px rgba(47,243,255,.3)',
            }}>
              שלום,{' '}
              <span style={{ color: 'var(--holo-cyan-bright)' }}>{name}</span>
              {' '}👋
            </h1>
          </div>
          <button
            onClick={() => { logout(); navigate('/') }}
            style={{
              fontSize: 13, fontWeight: 600, padding: '7px 16px', borderRadius: 10,
              cursor: 'pointer', fontFamily: 'var(--font-display)',
              background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)',
              color: 'rgba(160,200,240,.55)', transition: 'border-color .18s, color .18s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,80,120,.4)'; e.currentTarget.style.color = '#ff8099' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.1)'; e.currentTarget.style.color = 'rgba(160,200,240,.55)' }}
          >
            יציאה
          </button>
        </div>

        {/* ── CONTENT ── */}
        <div style={{ width: '100%', maxWidth: 960 }}>

          {/* כותרת מקטע */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1.1rem' }}>
            <span style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.18em',
              color: 'rgba(47,243,255,.5)', textTransform: 'uppercase',
              fontFamily: 'var(--font-display)',
            }}>ההדמיות שלך</span>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(to left,rgba(47,243,255,.18),transparent)' }} />
            {!loading && quests.length > 0 && (
              <span style={{ fontSize: 11, color: 'rgba(120,160,200,.4)', fontFamily: 'var(--font-display)' }}>
                {quests.length} הדמיות
              </span>
            )}
          </div>

          {/* שגיאת debug */}
          {dbgError && (
            <div style={{
              padding: '12px 16px', marginBottom: 14,
              background: 'rgba(255,80,80,.08)', border: '1px solid rgba(255,80,80,.25)',
              borderRadius: 12, fontSize: 13, color: '#ff8099',
            }}>⚠️ {dbgError}</div>
          )}

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
              <p style={{ color: 'rgba(160,200,240,.55)', fontSize: 14, margin: 0, fontFamily: 'var(--font-display)' }}>
                עדיין לא הוקצו לך הדמיות
              </p>
              <p style={{ color: 'rgba(120,160,200,.35)', fontSize: 12, marginTop: 4 }}>
                המורה יעדכן בקרוב ✨
              </p>
            </div>
          )}

          {/* גריד 3 עמודות */}
          {!loading && quests.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 14,
            }}>
              {quests.map((q) => (
                <QuestCard
                  key={q.id}
                  q={q}
                  isNew={isNew(q)}
                  onPlay={() => navigate(`/play/${q.id}`)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </HoloBackdrop>
  )
}
