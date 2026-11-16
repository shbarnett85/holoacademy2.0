import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../shared/hooks/useAuth'
import HoloBackdrop from '../../shared/ui/HoloBackdrop'
import BrandIcon from '../../shared/ui/BrandIcon'
import LessonThumb from '../../shared/ui/LessonThumb'
import SubjectTag from '../../shared/ui/SubjectTag'
import { setSoundOwnerFromToken, useSoundSettings } from '../../shared/lib/sound'
import { GEM_TOTAL } from '../../shared/lib/gemModel'
import { gemTier } from '../../shared/lib/gemTier'
import { formatIsraelDate } from '../../shared/lib/lessonState'
import { GemDefs, GemSocket } from '../../shared/ui/Gem'
import { MyJourney } from './Journey'
import PortalHero from './lab/PortalHero'
import { usePortalDive } from './lab/usePortalDive'
import { BOOK_TEXT, PORTAL_TEXT, SHELF_TEXT } from './gameFeel/text'
import { fieldStyle, infoChip, nameChip, panelStudent } from '../../styles/ui'


type SortKey = 'newest' | 'oldest' | 'alpha' | 'alpha-desc' | 'score-high' | 'score-low'
type StatusFilter = 'all' | 'completed' | 'in_progress' | 'not_started' | 'new'

interface AssignedQuest {
  id: string
  title: string
  sceneCount: number
  artStyle?: string
  subject?: string | null
  /* קוד המקצוע — מזין את התגית; null = "לא סווג" */
  subjectCode?: string | null
  teacherName?: string | null
  entryImageUrl?: string | null
  /* תמונת השיעור (הסצנה השנייה); entryImageUrl נשאר לתאימות */
  thumbUrl?: string | null
  /* שכבות השיעור (1–12, א׳=1) */
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
  /* שיעור חזרה — משימת חיזוק שנוצרה מהמושגים שהכיתה התקשתה בהם */
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
        padding: '5px 12px', borderRadius: 8, fontSize: 14, fontWeight: 600,
        fontFamily: 'var(--font-display)', whiteSpace: 'nowrap',
      }}
    >{label}</button>
  )
}

/* ── loading ── */
function LoadingDots() {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center', padding: '1.5rem 0' }}>
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

/* מצב השיעור אצל התלמיד/ה, במילים: חדש · בקריאה (עם העמוד, כשהשרת יודע) · הושלם */
function lessonStateText(q: AssignedQuest, fresh: boolean): string {
  if (q.sessionStatus === 'completed') return q.late ? SHELF_TEXT.doneLate : SHELF_TEXT.done
  if (q.sessionStatus === 'in_progress') return q.bookmarkPage ? SHELF_TEXT.readingAt(q.bookmarkPage) : SHELF_TEXT.reading
  return fresh ? SHELF_TEXT.freshMark : SHELF_TEXT.fresh
}
const gemsOf = (q: AssignedQuest): number => q.gems ?? q.crystals ?? 0

/* הגבישים של המשחק הטוב ביותר */
function GemRow({ gems, size = 22 }: { gems: number; size?: number }) {
  return (
    <span dir="ltr" role="img" aria-label={SHELF_TEXT.gems(gems)} style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
      {Array.from({ length: GEM_TOTAL }).map((_, i) => <GemSocket key={i} fill={i < gems ? 1 : 0} size={size} tier={gemTier(gems)} animated={false} />)}
    </span>
  )
}

const TAG = { ...infoChip, borderRadius: 7, padding: '1px 9px', fontSize: 14, fontWeight: 800, lineHeight: 1.4, whiteSpace: 'nowrap' as const }

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

/* הבית של התלמיד — "הספרייה ההולוגרפית": אותה במה של עמוד הפתיחה (PortalHero). התלמיד/ה נכנס/ת ומולו/ה הפורטל עם
   השיעור האחרון שהתקבל; החצים שמתחת לפורטל מדפדפים בין השיעורים, והכפתור (או לחיצה על הפורטל) צולל פנימה ופותח את השיעור.
   בחלון שמימין: השלום, שם השיעור שבפורטל והמצב שלו (חדש / בקריאה / הושלם עם הגבישים, מועד ההגשה, המורה).
   בתחתית העמוד: חיפוש, סינון ומיון, ורשימת השיעורים — בחירה ברשימה מביאה את השיעור אל הפורטל. מתחתיה "המסע שלי".
   הסינון חל גם על הדפדוף בחצים. הפורטל לא מתחלף מעצמו (כלל 1: בזמן קריאה שום דבר לא זז). */
export default function StudentHome() {
  const { isLoggedIn, logout } = useAuth()
  const { muted, toggleMuted } = useSoundSettings()
  useEffect(() => { setSoundOwnerFromToken() }, [])
  const navigate = useNavigate()
  const { leaving, dive, onDiveEnd } = usePortalDive()
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
  /* השיעור שבפורטל. בלי בחירה (או כשהבחירה לא ברשימה המסוננת): הראשון ברשימה, כלומר האחרון שהתקבל */
  const [curId, setCurId]             = useState<string | null>(null)

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
  /* נוספו מאז הביקור הקודם: הסימן ✦ */
  const freshIds = useMemo(() => new Set(quests.filter((q) => !!(lastLogin && q.assignedAt && q.assignedAt > lastLogin)).map((q) => q.id)), [quests, lastLogin])

  /* רשימות ייחודיות לצ'יפים */
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
  const clearFilters = () => { setSearch(''); setStatus('all'); setSubject('all'); setTeacher('all') }

  if (!isLoggedIn) {
    return (
      <HoloBackdrop>
        <div style={{
          ...panelStudent, borderRadius: 20,
          padding: '40px 44px', width: 340, textAlign: 'center',
        }}>
          <div style={{ fontSize: '2.4rem', marginBottom: 8 }}>🔒</div>
          <p style={{ color: 'var(--color-ink)', fontSize: 15 }}>{PORTAL_TEXT.notLoggedIn}</p>
        </div>
      </HoloBackdrop>
    )
  }

  /* השיעור שבפורטל, והמקום שלו ברשימה (המסוננת) */
  const n = displayed.length
  const idx = Math.max(0, displayed.findIndex((q) => q.id === curId))
  const current: AssignedQuest | undefined = n ? displayed[idx] : undefined
  const step = (dir: 1 | -1) => { if (n) setCurId(displayed[(idx + dir + n) % n].id) }
  const done = current?.sessionStatus === 'completed'
  const reading = current?.sessionStatus === 'in_progress'
  const play = () => { if (current && !leaving) dive(`/play/${current.id}`) }
  /* בחירה ברשימה שבתחתית: השיעור עובר לפורטל, והעמוד חוזר למעלה */
  const choose = (id: string) => {
    setCurId(id)
    document.querySelector('[data-portal-hero]')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  }
  const due = current?.dueAt && !done ? (current.state === 'ended' ? SHELF_TEXT.duePassed(formatIsraelDate(current.dueAt)) : SHELF_TEXT.dueBy(formatIsraelDate(current.dueAt))) : null
  const bubble = loading ? undefined : !current ? (quests.length ? undefined : PORTAL_TEXT.bubbleEmpty) : done ? PORTAL_TEXT.bubbleDone : reading ? PORTAL_TEXT.bubbleReading : PORTAL_TEXT.bubbleNew

  return (
    <div dir="rtl" className="home4" data-student-home>
      <GemDefs />

      <PortalHero
        portalSrc={current?.thumbUrl ?? current?.entryImageUrl ?? undefined}
        portalLabel={current ? `${done ? PORTAL_TEXT.playAgain : reading ? PORTAL_TEXT.playContinue : PORTAL_TEXT.playNew}: ${current.title}` : undefined}
        onPortalClick={current ? play : undefined}
        leaving={leaving}
        onDiveEnd={onDiveEnd}
        bubble={bubble}
        corner={<>
          <button className="holo-button holo-button--sm" onClick={toggleMuted} aria-label={muted ? PORTAL_TEXT.unmute : PORTAL_TEXT.mute} aria-pressed={muted}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 46, height: 46, padding: 0 }}>
            <BrandIcon name={muted ? 'speakerOff' : 'speaker'} size={24} />
          </button>
          <button className="holo-button holo-button--sm" onClick={() => { logout(); navigate('/') }}
            style={{ minHeight: 46, padding: '0 18px', fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-display)' }}>
            {PORTAL_TEXT.exit}
          </button>
        </>}
        under={current ? <>
          <div className="home4-now-row">
            {n > 1 && <button onClick={() => step(-1)} aria-label={PORTAL_TEXT.prev} className="holo-button holo-button--sm home4-arrow" data-portal-prev><span aria-hidden="true">→</span></button>}
            <div className="home4-now-card" aria-live="polite" data-portal-position>
              <span className="home4-now-title">{PORTAL_TEXT.position(idx + 1, n)}</span>
            </div>
            {n > 1 && <button onClick={() => step(1)} aria-label={PORTAL_TEXT.next} className="holo-button holo-button--sm home4-arrow" data-portal-next><span aria-hidden="true">←</span></button>}
          </div>
          <button onClick={play} className="holo-button home4-play" data-portal-play>
            <BrandIcon name="playGem" size={22} />
            <span>{done ? PORTAL_TEXT.playAgain : reading ? PORTAL_TEXT.playContinue : PORTAL_TEXT.playNew}</span>
          </button>
        </> : undefined}
        panel={<>
          <div style={{ fontSize: 17, fontWeight: 700 }}>
            {PORTAL_TEXT.hello} {name && <span style={{ ...nameChip, display: 'inline-block', padding: '0 12px', borderRadius: 999 }}>{name}</span>} 👋
          </div>
          <h1 className="home4-tagline" style={{ fontWeight: 900 }}>{BOOK_TEXT.libraryTitle}</h1>

          {loading && <LoadingDots />}

          {dbgError && (
            <div style={{ padding: '10px 14px', borderRadius: 12, fontSize: 15, color: 'var(--color-ink)', background: 'var(--color-wrong-tint)', border: '2px solid var(--color-wrong)' }}>⚠️ {dbgError}</div>
          )}

          {/* אין שיעורים בכלל */}
          {!loading && !dbgError && quests.length === 0 && (
            <div data-portal-empty>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{PORTAL_TEXT.none}</p>
              <p style={{ margin: '4px 0 0', fontSize: 15, color: 'var(--color-muted)' }}>{PORTAL_TEXT.noneSub}</p>
            </div>
          )}

          {/* יש שיעורים, אבל הסינון לא משאיר אף אחד */}
          {!loading && quests.length > 0 && !current && (
            <div data-portal-nomatch style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <p style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{PORTAL_TEXT.noMatch}</p>
              <button className="holo-button holo-button--sm" onClick={clearFilters} style={{ fontSize: 15, fontWeight: 700, padding: '6px 16px' }}>{PORTAL_TEXT.clear}</button>
            </div>
          )}

          {/* השיעור שבפורטל */}
          {current && (
            <div className="shome-lesson" data-portal-lesson={current.id}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
                <SubjectTag code={current.subjectCode} size="sm" />
                <span data-portal-state style={{ ...TAG, ...(reading ? { background: 'var(--color-human-soft)' } : null) }}>{lessonStateText(current, freshIds.has(current.id))}</span>
                {current.isReview && <span style={TAG}>{SHELF_TEXT.review}</span>}
              </div>
              <h2 className="shome-lesson-title" data-lesson-title>{current.title}</h2>
              {done && <GemRow gems={gemsOf(current)} />}
              {due && <div data-portal-due style={{ fontSize: 16, fontWeight: 700, color: current.state === 'ended' ? 'var(--color-human-deep)' : 'var(--color-ink)' }}>{due}</div>}
              {current.teacherName && <div style={{ fontSize: 15, color: 'var(--color-muted)' }}>{PORTAL_TEXT.fromTeacher(current.teacherName)}</div>}
            </div>
          )}

          {quests.length > 1 && (
            <button className="holo-link" onClick={() => document.getElementById('lesson-finder')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              style={{ alignSelf: 'center', minHeight: 30, fontSize: 16, fontWeight: 600 }}>
              {PORTAL_TEXT.findLink}
            </button>
          )}
        </>}
      />

      {/* ── בתחתית העמוד: חיפוש ובחירה של שיעור, ו"המסע שלי" ── */}
      {!loading && quests.length > 0 && (
        <div className="home4-more">
          <section id="lesson-finder" data-lesson-finder style={{ ...panelStudent, borderRadius: 18, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 'var(--fs-side-title)', fontWeight: 800, color: 'var(--color-machine-deep)', lineHeight: 1.25 }}>{PORTAL_TEXT.findTitle}</h2>
              <div style={{ fontSize: 'var(--fs-side-sub)', color: 'var(--color-muted)', marginTop: 2 }}>{PORTAL_TEXT.findSub}</div>
            </div>

            {/* שורה 1: חיפוש + מיון */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 240px', position: 'relative' }}>
                <span aria-hidden="true" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16, pointerEvents: 'none' }}>🔍</span>
                <input
                  type="text"
                  placeholder={PORTAL_TEXT.searchPlaceholder}
                  aria-label={PORTAL_TEXT.searchPlaceholder}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ ...fieldStyle, width: '100%', boxSizing: 'border-box', padding: '10px 40px 10px 12px', fontFamily: 'var(--font-display)', fontSize: 16, outline: 'none' }}
                  onFocus={(e) => { e.currentTarget.style.outline = '3px solid var(--color-machine-deep)'; e.currentTarget.style.outlineOffset = '2px' }}
                  onBlur={(e) => { e.currentTarget.style.outline = 'none' }}
                />
              </div>
              <select className="holo-button holo-button--sm" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
                style={{ padding: '10px 12px', borderRadius: 10, fontFamily: 'var(--font-display)', fontSize: 15, flexShrink: 0 }}>
                {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </div>

            {/* שורה 2: צ'יפי סטטוס + מקצוע + מורה */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {STATUS_CHIPS.map(c => (
                <Chip key={c.key} label={c.label} active={statusFilter === c.key}
                  onClick={() => setStatus(statusFilter === c.key ? 'all' : c.key)} />
              ))}
              {(subjects.length > 0 || teachers.length > 0) && (
                <div style={{ width: 1, height: 20, background: 'var(--color-line-strong)', margin: '0 2px' }} />
              )}
              {subjects.map(s => (
                <Chip key={s} label={s} active={subjectFilter === s}
                  onClick={() => setSubject(subjectFilter === s ? 'all' : s)} />
              ))}
              {teachers.map(t => (
                <Chip key={t} label={`👤 ${t}`} active={teacherFilter === t}
                  onClick={() => setTeacher(teacherFilter === t ? 'all' : t)} />
              ))}
              {hasFilters && (
                <button className="holo-button holo-button--sm" onClick={clearFilters}
                  style={{ padding: '5px 12px', borderRadius: 8, fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-display)', marginRight: 'auto' }}>
                  {PORTAL_TEXT.clear}
                </button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--color-line-strong)' }} />
              <span style={{ fontSize: 15, fontWeight: 600 }}>{SHELF_TEXT.count(displayed.length, quests.length)}</span>
            </div>

            {displayed.length === 0 && <p style={{ margin: 0, textAlign: 'center', fontSize: 16 }}>{PORTAL_TEXT.noMatch}</p>}

            {/* הרשימה: בחירה מביאה את השיעור אל הפורטל */}
            {displayed.length > 0 && (
              <ul className="shome-results">
                {displayed.map((q) => {
                  const on = q.id === current?.id
                  const qDone = q.sessionStatus === 'completed'
                  return (
                    <li key={q.id}>
                      <button className={`holo-button holo-button--sm shome-result${on ? ' is-selected' : ''}`} aria-pressed={on} data-result={q.id} onClick={() => choose(q.id)}>
                        <LessonThumb url={q.thumbUrl} subjectCode={q.subjectCode} mode="dark" width={76} height={57} radius={8} frame={2} tag="none" alt="" />
                        <span className="shome-result-text">
                          <span className="shome-result-title">{q.title}</span>
                          <span className="shome-result-meta">
                            <SubjectTag code={q.subjectCode} size="sm" ring={false} />
                            <span>{on ? PORTAL_TEXT.inPortal : lessonStateText(q, freshIds.has(q.id))}</span>
                            {qDone && !on && <GemRow gems={gemsOf(q)} size={15} />}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {/* המסע שלי: טאב לכל מקצוע */}
          <MyJourney
            lessons={quests.map((q) => ({ id: q.id, title: q.title, subjectCode: q.subjectCode ?? null, assignedAt: q.assignedAt, gems: q.sessionStatus === 'completed' ? (q.gems ?? q.crystals ?? 0) : null, classClosed: q.classClosed, inProgress: q.sessionStatus === 'in_progress' }))}
            onOpen={(id) => navigate(`/play/${id}`)}
          />
        </div>
      )}
    </div>
  )
}
