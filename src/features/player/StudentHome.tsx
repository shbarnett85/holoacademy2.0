import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../shared/hooks/useAuth'
import HoloBackdrop from '../../shared/ui/HoloBackdrop'
import { setSoundOwnerFromToken, useSoundSettings } from '../../shared/lib/sound'
import { GemDefs } from '../../shared/ui/Gem'
import BookShelf from './BookShelf'
import { MyJourney } from './Journey'
import { BOOK_TEXT, SHELF_TEXT } from './gameFeel/text'
import { fieldStyle, nameChip, panelStudent } from '../../styles/ui'


type SortKey = 'newest' | 'oldest' | 'alpha' | 'alpha-desc' | 'score-high' | 'score-low'
type StatusFilter = 'all' | 'completed' | 'in_progress' | 'not_started' | 'new'

interface AssignedQuest {
  id: string
  title: string
  sceneCount: number
  artStyle?: string
  subject?: string | null
  /* קוד המקצוע — מזין את המסגרת והסמל; null = "לא סווג" */
  subjectCode?: string | null
  teacherName?: string | null
  entryImageUrl?: string | null
  /* תמונת השיעור (הסצנה השנייה); entryImageUrl נשאר לתאימות */
  thumbUrl?: string | null
  /* שכבות השיעור (1–12, א׳=1) — תגית השכבות בכרטיס */
  gradeMin?: number | null
  gradeMax?: number | null
  /* מועד ההגשה (ISO) ומצב מפונקציית המצב היחידה בשרת; late = ההשלמה הראשונה הייתה אחרי המועד */
  dueAt?: string | null
  state?: 'active_now' | 'open' | 'ended'
  late?: boolean
  assignedAt?: string | null
  sessionStatus: 'completed' | 'in_progress' | null
  crystals: number | null
  /* הגבישים של המשחק הטוב ביותר */
  gems?: number | null
  /* כל הכיתה סגרה את הסיפור בשיעור הזה */
  classClosed?: boolean
  maxScore: number | null
  /* הדמיית חזרה — משימת חיזוק שנוצרה מהמושגים שהכיתה התקשתה בהם */
  isReview?: boolean
  /* הסימנייה: העמוד שבו נעצרה הקריאה (רק לשיעור בקריאה, כשהשרת יודע) */
  bookmarkPage?: number | null
}

/* ── chip לשורת סינון: כפתור בחירה; הנבחר ברקע דיו ── */
function Chip({ label, active, onClick }: {
  label: string; active: boolean; onClick: () => void
}) {
  return (
    <button
      className={`holo-button holo-button--sm${active ? ' is-selected' : ''}`}
      onClick={onClick}
      style={{
        padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
        fontFamily: 'var(--font-display)', whiteSpace: 'nowrap',
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
          width: 8, height: 8, borderRadius: '50%', background: 'var(--color-ink)',
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

const STATUS_CHIPS: { key: StatusFilter; label: string }[] = [
  { key: 'all',         label: 'הכל'        },
  { key: 'new',         label: '✦ נוספו לאחרונה' },
  { key: 'not_started', label: 'חדשים'      },
  { key: 'in_progress', label: 'בקריאה'     },
  { key: 'completed',   label: '✓ הושלמו'   },
]

export default function StudentHome() {
  const { isLoggedIn, logout } = useAuth()
  const { muted, toggleMuted } = useSoundSettings()
  useEffect(() => { setSoundOwnerFromToken() }, [])
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
    if (!token) { setLoading(false); setDbgError('אין token בסשן — נסו להתחבר מחדש'); return }
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
  /* נוספו למדף מאז הביקור הקודם: הסימן ✦ על הכריכה */
  const freshIds = useMemo(() => new Set(quests.filter((q) => !!(lastLogin && q.assignedAt && q.assignedAt > lastLogin)).map((q) => q.id)), [quests, lastLogin])

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
          ...panelStudent, borderRadius: 20,
          padding: '40px 44px', width: 340, textAlign: 'center',
        }}>
          <div style={{ fontSize: '2.4rem', marginBottom: 8 }}>🔒</div>
          <p style={{ color: 'var(--color-ink)', fontSize: 15 }}>לא מחוברים — חזרו לקישור הכיתה</p>
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
          borderBottom: '1px solid var(--color-line-strong)',
          marginBottom: '1.4rem',
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)', fontFamily: 'var(--font-display)', marginBottom: 4 }}>
              שלום, <span style={{ ...nameChip, display: 'inline-block', padding: '0 12px', borderRadius: 999 }}>{name}</span> 👋
            </div>
            <h1 style={{
              margin: 0, fontFamily: 'var(--font-display)',
              fontSize: 'clamp(1.5rem,3.6vw,2rem)', fontWeight: 900, lineHeight: 1.2,
              color: 'var(--color-machine-deep)',
            }}>{BOOK_TEXT.libraryTitle}</h1>
            {/* פעם אחת, כאן: מי מנהל את הספרייה. בתוך ספר הוא "המדריך שלכם" */}
            <p data-holo-librarian style={{ margin: '8px 0 0', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, lineHeight: 1.35, color: 'var(--color-ink)', fontFamily: 'var(--font-display)' }}>
              <span aria-hidden="true" style={{ flex: '0 0 auto', width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', boxSizing: 'border-box', border: '2px solid var(--color-ink)', background: 'var(--color-holo)' }}>
                <img src="/dr-holo/neutral.webp" alt="" draggable={false} style={{ display: 'block', width: '100%', transform: 'scale(2.7)', transformOrigin: '50% 9%' }} />
              </span>
              {BOOK_TEXT.holoLibrarian}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              className="holo-button holo-button--sm"
              onClick={toggleMuted}
              title={muted ? 'הפעל סאונד' : 'השתק סאונד'}
              aria-label={muted ? 'הפעל סאונד' : 'השתק סאונד'}
              aria-pressed={muted}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 38, height: 38, padding: 0, borderRadius: 10, fontSize: '1.1rem',
              }}
            >{muted ? '🔇' : '🔊'}</button>
            <button
              className="holo-button holo-button--sm"
              onClick={() => { logout(); navigate('/') }}
              style={{
                fontSize: 13, fontWeight: 600, padding: '7px 16px', borderRadius: 10,
                fontFamily: 'var(--font-display)',
              }}
            >יציאה</button>
          </div>
        </div>

        {/* ── SEARCH & FILTER BAR ── */}
        {!loading && quests.length > 0 && (
          <div style={{
            ...panelStudent, borderRadius: 16,
            width: '100%', marginBottom: '1.25rem',
            padding: '14px 16px',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            {/* שורה 1: חיפוש + מיון */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {/* שדה חיפוש */}
              <div style={{ flex: 1, position: 'relative' }}>
                <span style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  fontSize: 14, color: 'var(--color-muted)', pointerEvents: 'none',
                }}>🔍</span>
                <input
                  type="text"
                  placeholder="חיפוש לפי שם שיעור…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    ...fieldStyle,
                    width: '100%', paddingRight: 36, paddingLeft: 12, paddingTop: 8, paddingBottom: 8,
                    fontFamily: 'var(--font-display)', fontSize: 13,
                    outline: 'none',
                  }}
                  onFocus={(e) => { e.currentTarget.style.outline = '3px solid var(--color-machine-deep)'; e.currentTarget.style.outlineOffset = '2px' }}
                  onBlur={(e) => { e.currentTarget.style.outline = 'none' }}
                />
              </div>

              {/* מיון */}
              <select
                className="holo-button holo-button--sm"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                style={{
                  padding: '8px 12px', borderRadius: 10,
                  fontFamily: 'var(--font-display)', fontSize: 12,
                  flexShrink: 0,
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
                  onClick={() => setStatus(statusFilter === c.key ? 'all' : c.key)} />
              ))}

              {/* מפריד */}
              {(subjects.length > 0 || teachers.length > 0) && (
                <div style={{ width: 1, height: 20, background: 'var(--color-line-strong)', margin: '0 2px' }} />
              )}

              {/* מקצועות */}
              {subjects.map(s => (
                <Chip key={s} label={s} active={subjectFilter === s}
                  onClick={() => setSubject(subjectFilter === s ? 'all' : s)} />
              ))}

              {/* מורים */}
              {teachers.map(t => (
                <Chip key={t} label={`👤 ${t}`} active={teacherFilter === t}
                  onClick={() => setTeacher(teacherFilter === t ? 'all' : t)} />
              ))}

              {/* נקה סינון */}
              {hasFilters && (
                <button
                  className="holo-button holo-button--sm"
                  onClick={() => { setSearch(''); setStatus('all'); setSubject('all'); setTeacher('all') }}
                  style={{
                    padding: '5px 12px', borderRadius: 8,
                    fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-display)',
                    marginRight: 'auto',
                  }}
                >✕ נקה סינון</button>
              )}
            </div>
          </div>
        )}

        {/* ── CONTENT ── */}
        <div style={{ width: '100%' }}>
          <GemDefs />
          {/* כמה ספרים על המדף (אחרי הסינון) */}
          {!loading && quests.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.6rem' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--color-line-strong)' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)', fontFamily: 'var(--font-display)' }}>{SHELF_TEXT.count(displayed.length, quests.length)}</span>
            </div>
          )}

          {dbgError && (
            <div style={{
              padding: '12px 16px', marginBottom: 14, borderRadius: 12, fontSize: 13, color: 'var(--color-ink)',
              background: 'var(--color-wrong-tint)', border: '2px solid var(--color-wrong)',
            }}>⚠️ {dbgError}</div>
          )}

          {loading && <LoadingDots />}

          {/* ריק — אין שיעורים כלל */}
          {!loading && !dbgError && quests.length === 0 && (
            <div style={{
              ...panelStudent, borderRadius: 20,
              textAlign: 'center', padding: '3.5rem 2rem',
            }}>
              <div style={{ fontSize: '3.2rem', marginBottom: '0.9rem' }}>🚀</div>
              <p style={{ color: 'var(--color-ink)', fontSize: 14, margin: 0, fontFamily: 'var(--font-display)' }}>
                עדיין לא הוקצו לכם שיעורים
              </p>
              <p style={{ color: 'var(--color-muted)', fontSize: 12, marginTop: 4 }}>המורה יעדכן בקרוב ✨</p>
            </div>
          )}

          {/* ריק — אחרי סינון */}
          {!loading && quests.length > 0 && displayed.length === 0 && (
            <div style={{
              ...panelStudent,
              textAlign: 'center', padding: '2.5rem 2rem',
            }}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔍</div>
              <p style={{ color: 'var(--color-ink)', fontSize: 14, margin: 0, fontFamily: 'var(--font-display)' }}>
                לא נמצאו שיעורים התואמים לסינון
              </p>
              <button
                className="holo-button holo-button--sm"
                onClick={() => { setSearch(''); setStatus('all'); setSubject('all'); setTeacher('all') }}
                style={{
                  marginTop: 12, padding: '6px 16px', borderRadius: 9,
                  fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 600,
                }}
              >נקה סינון</button>
            </div>
          )}

          {/* מדף הספרים: כל שיעור הוא כריכה, והכריכה היא הקישור לשיעור */}
          {!loading && displayed.length > 0 && <BookShelf books={displayed} freshIds={freshIds} />}

          {/* המסע שלי: טאב לכל מקצוע. מתחת למדף, כדי שהמדף יהיה הדבר הראשון שרואים מתחת לכותרת */}
          {!loading && quests.length > 0 && (
            <div style={{ marginTop: 26 }}><MyJourney
              lessons={quests.map((q) => ({ id: q.id, title: q.title, subjectCode: q.subjectCode ?? null, assignedAt: q.assignedAt, gems: q.sessionStatus === 'completed' ? (q.gems ?? q.crystals ?? 0) : null, classClosed: q.classClosed, inProgress: q.sessionStatus === 'in_progress' }))}
              onOpen={(id) => navigate(`/play/${id}`)}
            /></div>
          )}
        </div>
      </div>
    </HoloBackdrop>
  )
}
