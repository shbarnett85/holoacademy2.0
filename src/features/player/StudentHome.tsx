import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../shared/hooks/useAuth'
import HoloBackdrop from '../../shared/ui/HoloBackdrop'
import { useSoundSettings } from '../../shared/lib/sound'


const ART_ICONS: Record<string, string> = {
  'digital-painting': '🎨', realistic: '📷', comic: '💥',
  storybook: '📖', anime: '🌸', 'pixar-3d': '🧸',
}

type SortKey = 'newest' | 'oldest' | 'alpha' | 'alpha-desc' | 'score-high' | 'score-low'
type StatusFilter = 'all' | 'completed' | 'in_progress' | 'not_started' | 'new'

interface AssignedQuest {
  id: string
  title: string
  sceneCount: number
  artStyle?: string
  subject?: string | null
  teacherName?: string | null
  entryImageUrl?: string | null
  assignedAt?: string | null
  sessionStatus: 'completed' | 'in_progress' | null
  crystals: number | null
  maxScore: number | null
  /* הדמיית חזרה — משימת חיזוק שנוצרה מהמושגים שהכיתה התקשתה בהם */
  isReview?: boolean
}

/* ── crystal dots ── */
function CrystalRow({ crystals, max = 5 }: { crystals: number; max?: number }) {
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
      {Array.from({ length: max }).map((_, i) => (
        <div key={i} style={{
          width: 7, height: 7, borderRadius: 2, transform: 'rotate(45deg)', flexShrink: 0,
          background: i < crystals ? '#2ff3ff' : 'rgba(47,243,255,.18)',
          boxShadow: i < crystals ? '0 0 6px rgba(47,243,255,.8)' : 'none',
        }} />
      ))}
    </div>
  )
}

/* ── כרטיס הדמיה ── */
function QuestCard({ q, isNew, onPlay }: { q: AssignedQuest; isNew: boolean; onPlay: () => void }) {
  const [hov, setHov] = useState(false)
  const status = q.sessionStatus
  const crystals = q.crystals ?? 0

  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onClick={onPlay}
      style={{
        position: 'relative', overflow: 'hidden', borderRadius: 16, cursor: 'pointer',
        border: `1px solid ${hov ? 'rgba(47,243,255,.55)' : 'rgba(47,243,255,.16)'}`,
        boxShadow: hov ? '0 0 36px rgba(47,243,255,.18),0 6px 28px rgba(0,0,0,.55)' : '0 3px 16px rgba(0,0,0,.4)',
        transition: 'border-color .22s,box-shadow .22s,transform .18s',
        transform: hov ? 'translateY(-3px)' : 'translateY(0)',
        background: '#04060f', height: 'clamp(180px,17.5vw,260px)',
      }}
    >
      {q.entryImageUrl ? (
        <img src={q.entryImageUrl} alt={q.title} style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
          transform: hov ? 'scale(1.05)' : 'scale(1)', transition: 'transform .4s ease',
        }} />
      ) : (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(135deg,rgba(10,22,60,.9),rgba(4,9,24,.95))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 36, opacity: 0.35,
        }}>{ART_ICONS[q.artStyle ?? ''] ?? '🎮'}</div>
      )}

      {/* overlay */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top,rgba(2,5,15,.97) 0%,rgba(2,5,15,.5) 50%,rgba(2,5,15,.08) 100%)' }} />

      {/* badge: חדש */}
      {isNew && (
        <div style={{
          position: 'absolute', top: 10, right: 10,
          background: 'rgba(47,243,255,.15)', border: '1px solid rgba(47,243,255,.7)',
          borderRadius: 7, padding: '3px 8px', fontSize: 10, fontWeight: 800,
          color: '#2ff3ff', fontFamily: 'var(--font-display)', letterSpacing: '0.1em',
          boxShadow: '0 0 12px rgba(47,243,255,.5)', backdropFilter: 'blur(6px)',
          animation: 'holo-status-pulse 2s ease-in-out infinite',
        }}>✦ חדש</div>
      )}

      {/* badge: הדמיית חזרה (משימת חיזוק) — מוזז שמאלה כשיש גם "חדש" */}
      {q.isReview && (
        <div style={{
          position: 'absolute', top: 10, right: isNew ? 62 : 10,
          background: 'rgba(155,140,255,.18)', border: '1px solid rgba(155,140,255,.65)',
          borderRadius: 7, padding: '3px 8px', fontSize: 10, fontWeight: 800,
          color: '#c9b6ff', fontFamily: 'var(--font-display)', backdropFilter: 'blur(6px)',
        }}>🔄 חיזוק</div>
      )}

      {/* badge: הושלם */}
      {status === 'completed' && (
        <div style={{
          position: 'absolute', top: 10, left: 10,
          background: 'rgba(16,185,80,.18)', border: '1px solid rgba(16,185,80,.55)',
          borderRadius: 7, padding: '3px 8px', fontSize: 11, fontWeight: 800,
          color: '#22d46a', fontFamily: 'var(--font-display)', backdropFilter: 'blur(6px)',
        }}>✓ הושלם</div>
      )}

      {/* badge: בתהליך */}
      {status === 'in_progress' && (
        <div style={{
          position: 'absolute', top: 10, left: 10,
          background: 'rgba(255,180,0,.14)', border: '1px solid rgba(255,180,0,.5)',
          borderRadius: 7, padding: '3px 8px', fontSize: 11, fontWeight: 800,
          color: '#fbbf24', fontFamily: 'var(--font-display)', backdropFilter: 'blur(6px)',
        }}>↻ בתהליך</div>
      )}

      {/* תחתית */}
      <div style={{ position: 'absolute', bottom: 0, right: 0, left: 0, padding: '10px 12px 11px' }}>
        <div style={{
          fontWeight: 800, fontSize: 13, color: '#fff', fontFamily: 'var(--font-display)',
          textShadow: '0 1px 6px rgba(0,0,0,.9)', marginBottom: 5,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{q.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <div>
            {status === 'completed'
              ? <CrystalRow crystals={crystals} />
              : <span style={{
                  fontSize: 10, padding: '1px 7px', borderRadius: 5, fontWeight: 600,
                  background: 'rgba(47,243,255,.1)', border: '1px solid rgba(47,243,255,.25)',
                  color: 'rgba(47,243,255,.85)', backdropFilter: 'blur(4px)',
                }}>{q.sceneCount} סצנות</span>
            }
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onPlay() }}
            style={{
              background: status === 'completed'
                ? 'linear-gradient(135deg,rgba(34,212,106,.9),rgba(16,160,70,.9))'
                : 'linear-gradient(135deg,#2ff3ff,#00b8d4)',
              color: '#021018', fontWeight: 800, fontSize: 11,
              padding: '6px 14px', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-display)', flexShrink: 0,
              boxShadow: hov ? (status === 'completed' ? '0 0 20px rgba(34,212,106,.6)' : '0 0 20px rgba(47,243,255,.6)') : 'none',
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

/* ── chip לשורת סינון ── */
function Chip({ label, active, color = 'cyan', onClick }: {
  label: string; active: boolean; color?: 'cyan' | 'green' | 'yellow' | 'purple'; onClick: () => void
}) {
  const colors = {
    cyan:   { on: 'rgba(47,243,255,.18)',  border: 'rgba(47,243,255,.7)',  text: '#2ff3ff' },
    green:  { on: 'rgba(34,212,106,.15)',  border: 'rgba(34,212,106,.6)',  text: '#22d46a' },
    yellow: { on: 'rgba(255,180,0,.14)',   border: 'rgba(255,180,0,.55)',  text: '#fbbf24' },
    purple: { on: 'rgba(136,85,255,.15)',  border: 'rgba(136,85,255,.55)', text: '#c084fc' },
  }
  const c = colors[color]
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
        fontFamily: 'var(--font-display)', whiteSpace: 'nowrap',
        background: active ? c.on : 'rgba(255,255,255,.04)',
        border: `1px solid ${active ? c.border : 'rgba(255,255,255,.1)'}`,
        color: active ? c.text : 'rgba(160,200,240,.5)',
        transition: 'all .16s',
      }}
    >{label}</button>
  )
}

/* ── loading ── */
function LoadingDots() {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center', padding: '4rem 0' }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{
          width: 8, height: 8, borderRadius: '50%', background: 'var(--holo-cyan-bright)',
          animation: 'holo-dot-pulse 1.4s ease-in-out infinite',
          animationDelay: `${i * 0.22}s`, opacity: 0.7,
        }} />
      ))}
    </div>
  )
}

/* ══════════════════════════════════════════════════ */

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'newest',     label: 'הוקצו לאחרונה' },
  { key: 'oldest',     label: 'הוקצו ראשונים' },
  { key: 'alpha',      label: 'א → ת' },
  { key: 'alpha-desc', label: 'ת → א' },
  { key: 'score-high', label: 'ציון גבוה → נמוך' },
  { key: 'score-low',  label: 'ציון נמוך → גבוה' },
]

const STATUS_CHIPS: { key: StatusFilter; label: string; color: 'cyan' | 'green' | 'yellow' | 'purple' }[] = [
  { key: 'all',         label: 'הכל',       color: 'cyan'   },
  { key: 'new',         label: '✦ חדשות',   color: 'cyan'   },
  { key: 'not_started', label: 'טרם התחלתי', color: 'purple' },
  { key: 'in_progress', label: '↻ בתהליך',  color: 'yellow' },
  { key: 'completed',   label: '✓ הושלמו',  color: 'green'  },
]

export default function StudentHome() {
  const { isLoggedIn, logout } = useAuth()
  const { muted, toggleMuted } = useSoundSettings()
  const navigate = useNavigate()
  const name = sessionStorage.getItem('holo_student_name') ?? ''
  const [quests, setQuests] = useState<AssignedQuest[]>([])
  const [loading, setLoading] = useState(true)
  const [dbgError, setDbgError] = useState<string | null>(null)
  const [lastLogin, setLastLogin] = useState<string | null>(null)

  /* מסננים */
  const [search, setSearch]           = useState('')
  const [statusFilter, setStatus]     = useState<StatusFilter>('all')
  const [subjectFilter, setSubject]   = useState<string>('all')
  const [teacherFilter, setTeacher]   = useState<string>('all')
  const [sort, setSort]               = useState<SortKey>('newest')

  useEffect(() => {
    const prev = localStorage.getItem('holo_last_login')
    setLastLogin(prev)
    localStorage.setItem('holo_last_login', new Date().toISOString())
  }, [])

  useEffect(() => {
    if (!isLoggedIn) return
    const token = sessionStorage.getItem('holo_token')
    if (!token) { setLoading(false); setDbgError('אין token בסשן — נסה להתחבר מחדש'); return }
    /* דגל ביטול — ניווט החוצה באמצע הטעינה לא יפעיל setState על קומפוננטה מנותקת */
    let cancelled = false
    fetch('/api/sessions/assigned', { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        const body = await r.json()
        if (cancelled) return
        if (!r.ok) { setDbgError(`שגיאה ${r.status}: ${body.error ?? JSON.stringify(body)}`); return }
        setQuests(body.quests ?? [])
      })
      .catch((e) => { if (!cancelled) setDbgError(String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [isLoggedIn])

  const isNew = (q: AssignedQuest) => !!(lastLogin && q.assignedAt && q.assignedAt > lastLogin)

  /* רשימות ייחודיות לדרופדאונים */
  const subjects  = useMemo(() => [...new Set(quests.map(q => q.subject).filter(Boolean))] as string[], [quests])
  const teachers  = useMemo(() => [...new Set(quests.map(q => q.teacherName).filter(Boolean))] as string[], [quests])

  /* סינון + מיון */
  const displayed = useMemo(() => {
    let res = [...quests]

    /* חיפוש טקסטואלי */
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      res = res.filter(x => x.title.toLowerCase().includes(q))
    }

    /* מקצוע */
    if (subjectFilter !== 'all') res = res.filter(x => x.subject === subjectFilter)

    /* מורה */
    if (teacherFilter !== 'all') res = res.filter(x => x.teacherName === teacherFilter)

    /* סטטוס */
    switch (statusFilter) {
      case 'completed':   res = res.filter(x => x.sessionStatus === 'completed'); break
      case 'in_progress': res = res.filter(x => x.sessionStatus === 'in_progress'); break
      case 'not_started': res = res.filter(x => !x.sessionStatus); break
      case 'new':         res = res.filter(x => isNew(x)); break
    }

    /* מיון */
    res.sort((a, b) => {
      switch (sort) {
        case 'newest':     return (b.assignedAt ?? '').localeCompare(a.assignedAt ?? '')
        case 'oldest':     return (a.assignedAt ?? '').localeCompare(b.assignedAt ?? '')
        case 'alpha':      return a.title.localeCompare(b.title, 'he')
        case 'alpha-desc': return b.title.localeCompare(a.title, 'he')
        case 'score-high': return (b.crystals ?? -1) - (a.crystals ?? -1)
        case 'score-low':  return (a.crystals ?? 999) - (b.crystals ?? 999)
        default: return 0
      }
    })

    return res
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quests, search, statusFilter, subjectFilter, teacherFilter, sort, lastLogin])

  const hasFilters = search || statusFilter !== 'all' || subjectFilter !== 'all' || teacherFilter !== 'all'

  if (!isLoggedIn) {
    return (
      <HoloBackdrop>
        <div style={{
          background: 'linear-gradient(135deg,rgba(10,22,46,.95),rgba(4,9,20,.98))',
          border: '1px solid rgba(255,80,120,.35)', borderRadius: 22,
          padding: '40px 44px', width: 340, textAlign: 'center',
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
          display: 'flex', flexDirection: 'column',
          padding: '0 clamp(0.5rem, 1.5vw, 1.25rem) 3rem',
        }}
      >
        {/* ── HEADER ── */}
        <div style={{
          width: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1.6rem 0 1.4rem',
          borderBottom: '1px solid rgba(47,243,255,.08)',
          marginBottom: '1.4rem',
        }}>
          <div>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.22em',
              color: 'rgba(47,243,255,.45)', textTransform: 'uppercase', marginBottom: 3,
            }}>HoloAcademy</div>
            <h1 style={{
              margin: 0, fontFamily: 'var(--font-display)',
              fontSize: 'clamp(1.25rem,3.5vw,1.65rem)', fontWeight: 800,
              color: 'var(--holo-text-bright)', textShadow: '0 0 22px rgba(47,243,255,.3)',
            }}>
              שלום, <span style={{ color: 'var(--holo-cyan-bright)' }}>{name}</span> 👋
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={toggleMuted}
              title={muted ? 'הפעל סאונד' : 'השתק סאונד'}
              aria-label={muted ? 'הפעל סאונד' : 'השתק סאונד'}
              aria-pressed={muted}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 38, height: 38, borderRadius: 10, fontSize: '1.1rem',
                cursor: 'pointer',
                background: 'rgba(47,243,255,.05)', border: '1px solid rgba(47,243,255,.2)',
                color: '#bfe9ff',
              }}
            >{muted ? '🔇' : '🔊'}</button>
            <button
              onClick={() => { logout(); navigate('/') }}
              style={{
                fontSize: 13, fontWeight: 600, padding: '7px 16px', borderRadius: 10,
                cursor: 'pointer', fontFamily: 'var(--font-display)',
                background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)',
                color: 'rgba(160,200,240,.55)', transition: 'border-color .18s,color .18s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,80,120,.4)'; e.currentTarget.style.color = '#ff8099' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.1)'; e.currentTarget.style.color = 'rgba(160,200,240,.55)' }}
            >יציאה</button>
          </div>
        </div>

        {/* ── SEARCH & FILTER BAR ── */}
        {!loading && quests.length > 0 && (
          <div style={{
            width: '100%', marginBottom: '1.25rem',
            background: 'linear-gradient(135deg,rgba(10,18,40,.85),rgba(4,8,18,.9))',
            border: '1px solid rgba(47,243,255,.12)', borderRadius: 16,
            padding: '14px 16px', backdropFilter: 'blur(14px)',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            {/* שורה 1: חיפוש + מיון */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {/* שדה חיפוש */}
              <div style={{ flex: 1, position: 'relative' }}>
                <span style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  fontSize: 14, color: 'rgba(47,243,255,.4)', pointerEvents: 'none',
                }}>🔍</span>
                <input
                  type="text"
                  placeholder="חיפוש לפי שם הדמיה…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    width: '100%', paddingRight: 36, paddingLeft: 12, paddingTop: 8, paddingBottom: 8,
                    background: 'rgba(4,9,20,.6)', border: '1px solid rgba(47,243,255,.2)',
                    borderRadius: 10, color: 'var(--holo-text-bright)',
                    fontFamily: 'var(--font-display)', fontSize: 13,
                    outline: 'none', transition: 'border-color .18s',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(47,243,255,.55)')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(47,243,255,.2)')}
                />
              </div>

              {/* מיון */}
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                style={{
                  padding: '8px 12px', borderRadius: 10, cursor: 'pointer',
                  background: 'rgba(4,9,20,.7)', border: '1px solid rgba(47,243,255,.2)',
                  color: 'rgba(160,200,240,.8)', fontFamily: 'var(--font-display)', fontSize: 12,
                  outline: 'none', flexShrink: 0,
                }}
              >
                {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </div>

            {/* שורה 2: צ'יפי סטטוס + מקצוע + מורה */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {/* סטטוס */}
              {STATUS_CHIPS.map(c => (
                <Chip key={c.key} label={c.label} active={statusFilter === c.key}
                  color={c.color} onClick={() => setStatus(statusFilter === c.key ? 'all' : c.key)} />
              ))}

              {/* מפריד */}
              {(subjects.length > 0 || teachers.length > 0) && (
                <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,.1)', margin: '0 2px' }} />
              )}

              {/* מקצועות */}
              {subjects.map(s => (
                <Chip key={s} label={s} active={subjectFilter === s} color="purple"
                  onClick={() => setSubject(subjectFilter === s ? 'all' : s)} />
              ))}

              {/* מורים */}
              {teachers.map(t => (
                <Chip key={t} label={`👤 ${t}`} active={teacherFilter === t} color="cyan"
                  onClick={() => setTeacher(teacherFilter === t ? 'all' : t)} />
              ))}

              {/* נקה סינון */}
              {hasFilters && (
                <button
                  onClick={() => { setSearch(''); setStatus('all'); setSubject('all'); setTeacher('all') }}
                  style={{
                    padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
                    fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-display)',
                    background: 'transparent', border: '1px solid rgba(255,80,120,.3)',
                    color: 'rgba(255,120,140,.7)', marginRight: 'auto',
                    transition: 'all .16s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,80,120,.1)'; e.currentTarget.style.color = '#ff8099' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,120,140,.7)' }}
                >✕ נקה סינון</button>
              )}
            </div>
          </div>
        )}

        {/* ── CONTENT ── */}
        <div style={{ width: '100%' }}>

          {/* כותרת מקטע */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1rem' }}>
            <span style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.18em',
              color: 'rgba(47,243,255,.5)', textTransform: 'uppercase', fontFamily: 'var(--font-display)',
            }}>ההדמיות שלך</span>
            <div style={{ flex: 1, height: 1, background: 'linear-gradient(to left,rgba(47,243,255,.18),transparent)' }} />
            {!loading && (
              <span style={{ fontSize: 11, color: 'rgba(120,160,200,.4)', fontFamily: 'var(--font-display)' }}>
                {displayed.length}{displayed.length !== quests.length ? `/${quests.length}` : ''} הדמיות
              </span>
            )}
          </div>

          {dbgError && (
            <div style={{
              padding: '12px 16px', marginBottom: 14, borderRadius: 12, fontSize: 13, color: '#ff8099',
              background: 'rgba(255,80,80,.08)', border: '1px solid rgba(255,80,80,.25)',
            }}>⚠️ {dbgError}</div>
          )}

          {loading && <LoadingDots />}

          {/* ריק — אין הדמיות כלל */}
          {!loading && !dbgError && quests.length === 0 && (
            <div style={{
              textAlign: 'center', padding: '3.5rem 2rem',
              background: 'linear-gradient(135deg,rgba(10,22,46,.7),rgba(4,9,20,.8))',
              border: '1px solid rgba(47,243,255,.1)', borderRadius: 22, backdropFilter: 'blur(10px)',
            }}>
              <div style={{ fontSize: '3.2rem', marginBottom: '0.9rem', filter: 'drop-shadow(0 0 12px rgba(47,243,255,.3))' }}>🚀</div>
              <p style={{ color: 'rgba(160,200,240,.55)', fontSize: 14, margin: 0, fontFamily: 'var(--font-display)' }}>
                עדיין לא הוקצו לך הדמיות
              </p>
              <p style={{ color: 'rgba(120,160,200,.35)', fontSize: 12, marginTop: 4 }}>המורה יעדכן בקרוב ✨</p>
            </div>
          )}

          {/* ריק — אחרי סינון */}
          {!loading && quests.length > 0 && displayed.length === 0 && (
            <div style={{
              textAlign: 'center', padding: '2.5rem 2rem',
              background: 'rgba(10,18,40,.5)', border: '1px solid rgba(47,243,255,.08)',
              borderRadius: 18, backdropFilter: 'blur(8px)',
            }}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔍</div>
              <p style={{ color: 'rgba(160,200,240,.5)', fontSize: 14, margin: 0, fontFamily: 'var(--font-display)' }}>
                לא נמצאו הדמיות התואמות לסינון
              </p>
              <button
                onClick={() => { setSearch(''); setStatus('all'); setSubject('all'); setTeacher('all') }}
                style={{
                  marginTop: 12, padding: '6px 16px', borderRadius: 9, cursor: 'pointer',
                  background: 'rgba(47,243,255,.1)', border: '1px solid rgba(47,243,255,.3)',
                  color: '#2ff3ff', fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 600,
                }}
              >נקה סינון</button>
            </div>
          )}

          {/* גריד 3 עמודות */}
          {!loading && displayed.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 'clamp(8px,1.2vw,16px)' }}>
              {displayed.map((q) => (
                <QuestCard key={q.id} q={q} isNew={isNew(q)} onPlay={() => navigate(`/play/${q.id}`)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </HoloBackdrop>
  )
}
