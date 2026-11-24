import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../shared/hooks/useAuth'
import HoloBackdrop from '../../shared/ui/HoloBackdrop'
import BrandIcon from '../../shared/ui/BrandIcon'
import BrandLogo from '../../shared/ui/BrandLogo'
import LessonThumb from '../../shared/ui/LessonThumb'
import SubjectTag from '../../shared/ui/SubjectTag'
import PortalConsole from './lab/PortalConsole'
import { setSoundOwnerFromToken, useSoundSettings } from '../../shared/lib/sound'
import { GEM_TOTAL } from '../../shared/lib/gemModel'
import { gemTier } from '../../shared/lib/gemTier'
import { formatIsraelDate } from '../../shared/lib/lessonState'
import { legacySubjectToCode } from '../../shared/lib/subjects'
import { enterGuestStudent, guestProgress, isGuestStudent, leaveGuestStudent } from '../../shared/lib/guestStudent'
import { Gem } from '../../shared/ui/Gem'
import { MyJourney } from './Journey'
import PortalHero from './lab/PortalHero'
import WhereAmI from '../home/WhereAmI'
import type { PortalCaptionData } from './lab/PortalCaption'
import { usePortalDive } from './lab/usePortalDive'
import { BOOK_TEXT, PORTAL_TEXT, SHELF_TEXT } from './gameFeel/text'
import { fieldStyle, panelStudent } from '../../styles/ui'


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

/* מצב השיעור אצל התלמיד/ה: הושלם · הופסק באמצע (עם העמוד, כשהשרת יודע) · לא הושלם */
type LessonStatus = 'done' | 'paused' | 'notDone'
const statusOf = (q: AssignedQuest): LessonStatus => (q.sessionStatus === 'completed' ? 'done' : q.sessionStatus === 'in_progress' ? 'paused' : 'notDone')
function statusText(q: AssignedQuest): string {
  const st = statusOf(q)
  if (st === 'done') return q.late ? PORTAL_TEXT.statusDoneLate : PORTAL_TEXT.statusDone
  if (st === 'paused') return q.bookmarkPage ? PORTAL_TEXT.statusPausedAt(q.bookmarkPage) : PORTAL_TEXT.statusPaused
  return PORTAL_TEXT.statusNotDone
}

/* הסמל של המצב: עיגול בצבע עם סימן בתוכו (וי / שני פסים של השהיה / עיגול ריק). הצבע אף פעם לא לבד: לידו תמיד המילה */
function StatusIcon({ status, size = 26 }: { status: LessonStatus; size?: number }) {
  const fill = status === 'done' ? 'var(--color-correct)' : status === 'paused' ? 'var(--color-human)' : 'var(--color-surface)'
  const mark = status === 'done' ? 'var(--color-surface)' : 'var(--color-ink)'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0, display: 'block' }}>
      <circle cx="12" cy="12" r="10.5" style={{ fill, stroke: 'var(--color-ink)', strokeWidth: 2 }} />
      {status === 'done' && <path d="M7 12.4l3.4 3.4L17.2 9" fill="none" style={{ stroke: mark, strokeWidth: 2.8, strokeLinecap: 'round', strokeLinejoin: 'round' }} />}
      {status === 'paused' && <path d="M9.4 7.8v8.4M14.6 7.8v8.4" fill="none" style={{ stroke: mark, strokeWidth: 2.8, strokeLinecap: 'round' }} />}
      {status === 'notDone' && <circle cx="12" cy="12" r="4.6" fill="none" style={{ stroke: mark, strokeWidth: 2, strokeDasharray: '2.4 2.4' }} />}
    </svg>
  )
}
const gemsOf = (q: AssignedQuest): number => q.gems ?? q.crystals ?? 0

/* הגבישים של המשחק הטוב ביותר */
function GemRow({ gems, size = 22 }: { gems: number; size?: number }) {
  return (
    <span dir="ltr" role="img" aria-label={SHELF_TEXT.gems(gems)} style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
      {Array.from({ length: GEM_TOTAL }).map((_, i) => <Gem key={i} fill={i < gems ? 1 : 0} size={size} tier={gemTier(gems)} animated={false} />)}
    </span>
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

const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: 'all',         label: PORTAL_TEXT.allStatuses },
  { key: 'new',         label: '✦ נוספו לאחרונה' },
  { key: 'not_started', label: 'לא הושלמו'      },
  { key: 'in_progress', label: 'הופסקו באמצע'   },
  { key: 'completed',   label: 'הושלמו'         },
]

/* הבית של התלמיד — "הספרייה ההולוגרפית": אותה במה של עמוד הפתיחה (PortalHero), בארבעה אזורים:
   · הפס העליון: השלום לפי השעה ("בוקר טוב, נועה") והסיכום — כמה גבישים נאספו עד היום, כמה שיעורים הושלמו,
     כמה הופסקו באמצע וכמה חדשים; בקצה: השתקה ויציאה.
   · הפורטל: השיעור האחרון שהתקבל. עליו, כשכבת טקסט הולוגרפית, המצב של השיעור (הושלם / הופסק באמצע / לא הושלם).
   · על שלבי הבמה שלפני הפורטל, כמו בעמוד הפתיחה: שם השיעור והמקצוע עם חצים שמדפדפים בין השיעורים. אין כפתור כניסה
     (הוסר לבקשת המשתמש): נכנסים לשיעור בלחיצה על הפורטל. מעל הראש של ד"ר הולו: "איפה אני?".
   · חלון הצד: רשימת השיעורים, עם חיפוש, סינון ומיון. בחירה ברשימה מביאה את השיעור אל הפורטל.
   בגלילה למטה: "המסע שלי". הסינון חל גם על הדפדוף בחצים. הפורטל לא מתחלף מעצמו (כלל 1: בזמן קריאה שום דבר לא זז). */
export default function StudentHome() {
  const { isLoggedIn, logout } = useAuth()
  /* תלמיד אורח: בלי טוקן. הספרייה שלו היא שיעורי ההתנסות, ושום דבר לא נשמר בשרת (shared/lib/guestStudent.ts) */
  const [guest, setGuest] = useState(() => isGuestStudent())
  const signedIn = isLoggedIn || guest
  const { muted, toggleMuted } = useSoundSettings()
  useEffect(() => { setSoundOwnerFromToken() }, [])
  const navigate = useNavigate()
  const { leaving, dive, onDiveEnd } = usePortalDive()
  const name = sessionStorage.getItem('holo_student_name') ?? (isGuestStudent() ? PORTAL_TEXT.guestName : '')
  const [quests, setQuests] = useState<AssignedQuest[]>([])
  const [loading, setLoading] = useState(true)
  const [dbgError, setDbgError] = useState<string | null>(null)
  const [lastLogin, setLastLogin] = useState<string | null>(null)
  /* השעה בכניסה, לשלום שבפס העליון */
  const [hour] = useState(() => new Date().getHours())
  const listRef = useRef<HTMLUListElement>(null)

  /* מסננים */
  const [search, setSearch]           = useState('')
  const [statusFilter, setStatus]     = useState<StatusFilter>('all')
  const [subjectFilter, setSubject]   = useState<string>('all')
  const [teacherFilter, setTeacher]   = useState<string>('all')
  const [sort, setSort]               = useState<SortKey>('newest')
  /* השיעור שבפורטל. בלי בחירה (או כשהבחירה לא ברשימה המסוננת): הראשון ברשימה, כלומר האחרון שהתקבל */
  const [curId, setCurId]             = useState<string | null>(null)
  /* הכיוון של ההחלפה האחרונה בפורטל: קדימה או אחורה ברשימה. קובע את כיוון המעבר בפורטל ובשם השיעור */
  const [dir, setDir]                 = useState<1 | -1>(1)
  const [showWhere, setShowWhere]     = useState(false)

  useEffect(() => {
    const prev = localStorage.getItem('holo_last_login')
    setLastLogin(prev)
    localStorage.setItem('holo_last_login', new Date().toISOString())
  }, [])

  /* אורח: שיעורי ההתנסות הרשמיים, באותו מבנה של שיעור שהוקצה. המצב (הושלם והגבישים) מהלשונית בלבד */
  useEffect(() => {
    if (!guest || isLoggedIn) return
    let cancelled = false
    setLoading(true)
    fetch('/api/quests/showcase')
      .then((r) => (r.ok ? r.json() : { quests: [] }))
      .then((body: { quests?: { id: string; title: string; subject: string | null; gradeMin: number | null; gradeMax: number | null; sceneCount: number; thumbUrl: string | null }[] }) => {
        if (cancelled) return
        const progress = guestProgress()
        setQuests((body.quests ?? []).map((q) => ({
          id: q.id, title: q.title, sceneCount: q.sceneCount, subject: q.subject, subjectCode: q.subject ? legacySubjectToCode(q.subject) : null,
          thumbUrl: q.thumbUrl, gradeMin: q.gradeMin, gradeMax: q.gradeMax,
          sessionStatus: q.id in progress ? 'completed' as const : null, crystals: progress[q.id] ?? null, gems: progress[q.id] ?? null, maxScore: null,
        })))
      })
      .catch((e) => { if (!cancelled) setDbgError(String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [guest, isLoggedIn])

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

  /* הסיכום שבפס העליון: מכל השיעורים, בלי קשר לסינון. הגבישים: של המשחק הטוב ביותר בכל שיעור שהושלם */
  const stats = useMemo(() => {
    const doneList = quests.filter((q) => q.sessionStatus === 'completed')
    return {
      gems: doneList.reduce((sum, q) => sum + gemsOf(q), 0),
      done: doneList.length,
      paused: quests.filter((q) => q.sessionStatus === 'in_progress').length,
      fresh: quests.filter((q) => freshIds.has(q.id) && !q.sessionStatus).length,
    }
  }, [quests, freshIds])

  /* השיעור שבפורטל, והמקום שלו ברשימה (המסוננת) */
  const n = displayed.length
  const idx = Math.max(0, displayed.findIndex((q) => q.id === curId))
  const current: AssignedQuest | undefined = n ? displayed[idx] : undefined
  const currentId = current?.id

  /* דפדוף בחצים: השורה של השיעור שבפורטל נשארת בתוך האזור הנגלל של הרשימה (רק כשהרשימה נגללת בתוך החלון) */
  useEffect(() => {
    const list = listRef.current
    const row = list?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (!list || !row || list.scrollHeight <= list.clientHeight + 1) return
    const lr = list.getBoundingClientRect(), rr = row.getBoundingClientRect()
    if (rr.top < lr.top) list.scrollTop -= lr.top - rr.top + 6
    else if (rr.bottom > lr.bottom) list.scrollTop += rr.bottom - lr.bottom + 8
  }, [currentId])

  const hasFilters = search || statusFilter !== 'all' || subjectFilter !== 'all' || teacherFilter !== 'all'
  const clearFilters = () => { setSearch(''); setStatus('all'); setSubject('all'); setTeacher('all') }

  if (!signedIn) {
    return (
      <HoloBackdrop>
        <div style={{
          ...panelStudent, borderRadius: 20,
          padding: '40px 44px', width: 340, textAlign: 'center',
        }}>
          <div style={{ fontSize: '2.4rem', marginBottom: 8 }}>🔒</div>
          <p style={{ color: 'var(--color-ink)', fontSize: 16 }}>{PORTAL_TEXT.notLoggedIn}</p>
          <button className="holo-button" data-guest-enter onClick={() => { enterGuestStudent(PORTAL_TEXT.guestName); setGuest(true) }}
            style={{ marginTop: 14, fontSize: 17, fontFamily: 'var(--font-display)' }}>{PORTAL_TEXT.guestEnter}</button>
        </div>
      </HoloBackdrop>
    )
  }

  const step = (d: 1 | -1) => { if (n) { setDir(d); setCurId(displayed[(idx + d + n) % n].id) } }
  const done = current?.sessionStatus === 'completed'
  const reading = current?.sessionStatus === 'in_progress'
  const play = () => { if (current && !leaving) dive(`/play/${current.id}`) }
  /* בחירה ברשימה: השיעור עובר לפורטל. במסך צר, שבו הרשימה מתחת לבמה, העמוד חוזר למעלה */
  const choose = (id: string) => {
    setDir(displayed.findIndex((q) => q.id === id) < idx ? -1 : 1)
    setCurId(id)
    document.querySelector('[data-portal-hero]')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  }
  const due = current?.dueAt && !done ? (current.state === 'ended' ? SHELF_TEXT.duePassed(formatIsraelDate(current.dueAt)) : SHELF_TEXT.dueBy(formatIsraelDate(current.dueAt))) : null
  const playLabel = done ? PORTAL_TEXT.playAgain : reading ? PORTAL_TEXT.playContinue : PORTAL_TEXT.playNew
  /* הטקסט ההולוגרפי שעל הפורטל: המצב, ומתחתיו שורה קטנה (הגבישים / העמוד שבו הקריאה נעצרה / "חדש") */
  const caption: PortalCaptionData | undefined = !current ? undefined
    : done ? { tone: 'done', title: PORTAL_TEXT.statusDone, sub: [PORTAL_TEXT.captionGems(gemsOf(current)), current.late ? PORTAL_TEXT.captionLate : ''].filter(Boolean).join(' · ') }
    : reading ? { tone: 'paused', title: PORTAL_TEXT.statusPaused, sub: current.bookmarkPage ? BOOK_TEXT.pageShort(current.bookmarkPage) : undefined }
    : { tone: 'notDone', title: PORTAL_TEXT.statusNotDone, sub: freshIds.has(current.id) ? PORTAL_TEXT.captionFresh : undefined }
  const select = (label: string, value: string, onChange: (v: string) => void, options: { key: string; label: string }[], name: string) => (
    <select className="holo-button holo-button--sm" aria-label={label} data-filter={name} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
    </select>
  )

  return (
    <div dir="rtl" className="home4" data-student-home data-guest={guest ? '' : undefined}>

      <PortalHero
        portalSrc={current?.thumbUrl ?? current?.entryImageUrl ?? undefined}
        portalDir={dir}
        portalNext={n > 1 ? [displayed[(idx + 1) % n], displayed[(idx - 1 + n) % n]].map((q) => q.thumbUrl ?? q.entryImageUrl) : undefined}
        portalLabel={current ? `${playLabel}: ${current.title}` : undefined}
        onPortalClick={current ? play : undefined}
        leaving={leaving}
        onDiveEnd={onDiveEnd}
        holoAction={
          <button className="holo-button home4-where" onClick={() => setShowWhere(true)} data-home-where aria-haspopup="dialog">
            <span className="home4-where-mark" aria-hidden="true">?</span>
            <span>{PORTAL_TEXT.whereAmI}</span>
          </button>
        }
        caption={caption}
        captionKey={current ? `${current.id}:${statusOf(current)}` : undefined}
        captionProps={current ? { 'data-portal-state': statusOf(current) } : undefined}
        top={
          <div className="shome-bar">
            <span className="shome-brand" aria-hidden="true" data-brand-tile><BrandLogo variant="mark" height={26} clear={false} /></span>
            <h1 className="shome-hello" data-portal-hello>
              <span>{PORTAL_TEXT.greeting(hour)}{name ? ',' : ''}</span>
              {name && <span className="shome-hello-name">{name}</span>}
            </h1>
            {!loading && quests.length > 0 && (
              <ul className="shome-stats" aria-label={PORTAL_TEXT.statsLabel} data-portal-stats>
                <li className="shome-stat" data-stat="gems"><Gem size={22} /><span>{PORTAL_TEXT.statGems}</span><b>{stats.gems}</b></li>
                <li className="shome-stat" data-stat="done"><StatusIcon status="done" size={22} /><span>{PORTAL_TEXT.statDone}</span><b>{PORTAL_TEXT.statOf(stats.done, quests.length)}</b></li>
                {stats.paused > 0 && <li className="shome-stat" data-stat="paused"><StatusIcon status="paused" size={22} /><span>{PORTAL_TEXT.statPaused}</span><b>{stats.paused}</b></li>}
                {stats.fresh > 0 && <li className="shome-stat" data-stat="fresh"><span aria-hidden="true">✦</span><span>{PORTAL_TEXT.statFresh}</span><b>{stats.fresh}</b></li>}
              </ul>
            )}
            <div className="shome-bar-actions">
              <button className="holo-button holo-button--sm" onClick={toggleMuted} aria-label={muted ? PORTAL_TEXT.unmute : PORTAL_TEXT.mute} aria-pressed={muted}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 46, height: 46, padding: 0 }}>
                <BrandIcon name={muted ? 'speakerOff' : 'speaker'} size={24} />
              </button>
              <button className="holo-button holo-button--sm" onClick={() => { leaveGuestStudent(); logout(); navigate('/') }}
                style={{ minHeight: 46, padding: '0 18px', fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                {PORTAL_TEXT.exit}
              </button>
            </div>
          </div>
        }
        under={current ? <>
          <PortalConsole title={current.title} subjectCode={current.subjectCode ?? null} swapKey={current.id} dir={dir}
            onPrev={n > 1 ? () => step(-1) : undefined} onNext={n > 1 ? () => step(1) : undefined}
            onLaunch={play} launchLabel={`${PORTAL_TEXT.launch} ${current.title}`}
            fieldProps={{ 'data-portal-lesson': current.id }} titleProps={{ 'data-lesson-title': '' }} prevProps={{ 'data-portal-prev': '' }} nextProps={{ 'data-portal-next': '' }}>
            {/* לקוראי מסך: המקום ברשימה והמצב (על המסך המצב מוקרן על הפורטל) */}
            <span className="sr-only" data-portal-position>{PORTAL_TEXT.position(idx + 1, n)} · {statusText(current)}</span>
          </PortalConsole>
        </> : undefined}
        panelClass="shome-panel"
        panel={<>
          <div className="shome-panel-head">
            <h2 className="shome-panel-title">{PORTAL_TEXT.listTitle}</h2>
            {quests.length > 0 && <span className="shome-panel-count" data-list-count>{PORTAL_TEXT.listCount(displayed.length, quests.length)}</span>}
            {quests.length > 0 && (
              <button className="holo-link" onClick={() => document.getElementById('my-journey')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                style={{ marginInlineStart: 'auto', minHeight: 30, fontSize: 15, fontWeight: 600 }}>
                {PORTAL_TEXT.journeyLink}
              </button>
            )}
          </div>
          {guest && <p data-guest-note style={{ margin: 0, fontSize: 14, color: 'var(--color-muted)', lineHeight: 1.4 }}>{PORTAL_TEXT.guestNote}</p>}

          {loading && <LoadingDots />}

          {dbgError && (
            <div style={{ padding: '10px 14px', borderRadius: 12, fontSize: 15, color: 'var(--color-ink)', background: 'var(--color-wrong-tint)', border: '2px solid var(--color-wrong)' }}>⚠️ {dbgError}</div>
          )}

          {/* אין שיעורים בכלל */}
          {!loading && !dbgError && quests.length === 0 && (
            <div data-portal-empty style={{ textAlign: 'center', padding: '10px 0' }}>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{PORTAL_TEXT.none}</p>
              <p style={{ margin: '4px 0 0', fontSize: 15, color: 'var(--color-muted)' }}>{PORTAL_TEXT.noneSub}</p>
            </div>
          )}

          {!loading && quests.length > 0 && <>
            {/* חיפוש */}
            <div className="shome-search">
              <span aria-hidden="true">🔍</span>
              <input type="text" placeholder={PORTAL_TEXT.searchPlaceholder} aria-label={PORTAL_TEXT.searchPlaceholder} value={search} onChange={(e) => setSearch(e.target.value)} style={fieldStyle} data-lesson-search />
            </div>

            {/* סינון ומיון: מצב, מקצוע ומורה (רק כשיש יותר מאחד), וסדר הרשימה */}
            <div className="shome-filters">
              {select(PORTAL_TEXT.filterStatus, statusFilter, (v) => setStatus(v as StatusFilter), STATUS_OPTIONS, 'status')}
              {subjects.length > 1 && select(PORTAL_TEXT.filterSubject, subjectFilter, setSubject, [{ key: 'all', label: PORTAL_TEXT.allSubjects }, ...subjects.map((x) => ({ key: x, label: x }))], 'subject')}
              {teachers.length > 1 && select(PORTAL_TEXT.filterTeacher, teacherFilter, setTeacher, [{ key: 'all', label: PORTAL_TEXT.allTeachers }, ...teachers.map((x) => ({ key: x, label: x }))], 'teacher')}
              {select(PORTAL_TEXT.sortLabel, sort, (v) => setSort(v as SortKey), SORT_OPTIONS, 'sort')}
              {hasFilters && displayed.length > 0 && <button className="holo-button holo-button--sm shome-clear" onClick={clearFilters}>{PORTAL_TEXT.clear}</button>}
            </div>

            {/* הסינון לא משאיר אף שיעור */}
            {displayed.length === 0 && (
              <div data-portal-nomatch style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '8px 0' }}>
                <p className="shome-panel-msg" style={{ fontWeight: 700 }}>{PORTAL_TEXT.noMatch}</p>
                <button className="holo-button holo-button--sm" onClick={clearFilters} style={{ fontSize: 15, fontWeight: 700, padding: '6px 16px' }}>{PORTAL_TEXT.clear}</button>
              </div>
            )}

            {/* הרשימה: בחירה מביאה את השיעור אל הפורטל. השורה של השיעור שבפורטל מציגה גם את מועד ההגשה ואת המורה */}
            {displayed.length > 0 && (
              <ul className="shome-results" ref={listRef} data-lesson-list>
                {displayed.map((q) => {
                  const on = q.id === current?.id
                  const qDone = q.sessionStatus === 'completed'
                  const more = on ? [
                    freshIds.has(q.id) && !q.sessionStatus ? PORTAL_TEXT.freshMark : '',
                    q.isReview ? SHELF_TEXT.review : '',
                    due ?? '',
                    q.teacherName ? PORTAL_TEXT.fromTeacher(q.teacherName) : '',
                  ].filter(Boolean) : []
                  return (
                    <li key={q.id}>
                      <button className="holo-button holo-button--sm shome-result" aria-pressed={on} data-result={q.id} onClick={() => choose(q.id)}>
                        <LessonThumb url={q.thumbUrl} subjectCode={q.subjectCode} mode="dark" width={68} height={51} radius={8} frame={2} tag="none" alt="" />
                        <span className="shome-result-text">
                          <span className="shome-result-title">{q.title}</span>
                          <span className="shome-result-meta">
                            <SubjectTag code={q.subjectCode} size="sm" ring={false} />
                            <span className="shome-result-status"><StatusIcon status={statusOf(q)} size={18} />{statusText(q)}</span>
                            {qDone && <GemRow gems={gemsOf(q)} size={15} />}
                          </span>
                          {more.length > 0 && <span className="shome-result-meta" data-result-more style={{ fontWeight: 400 }}>{more.join(' · ')}</span>}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </>}
        </>}
      />

      {showWhere && <WhereAmI onClose={() => setShowWhere(false)} onPlay={current ? () => { setShowWhere(false); play() } : undefined} playLabel={playLabel} />}

      {/* ── בגלילה למטה: "המסע שלי", טאב לכל מקצוע ── */}
      {!loading && quests.length > 0 && (
        <div className="home4-more" id="my-journey">
          <MyJourney
            lessons={quests.map((q) => ({ id: q.id, title: q.title, subjectCode: q.subjectCode ?? null, assignedAt: q.assignedAt, gems: q.sessionStatus === 'completed' ? (q.gems ?? q.crystals ?? 0) : null, classClosed: q.classClosed, inProgress: q.sessionStatus === 'in_progress' }))}
            onOpen={(id) => navigate(`/play/${id}`)}
          />
        </div>
      )}
    </div>
  )
}
