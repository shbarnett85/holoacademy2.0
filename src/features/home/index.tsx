import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import HoloBackdrop from '../../shared/ui/HoloBackdrop'
import { trackFunnel } from '../../shared/lib/funnel'
import BrandIcon from '../../shared/ui/BrandIcon'
import SubjectTag from '../../shared/ui/SubjectTag'
import { GemDefs, GemIcon } from '../../shared/ui/Gem'
import { legacySubjectToCode, subjectVisual } from '../../shared/lib/subjects'
import { fieldStyle, infoChip, modalBackdrop, panelStudent } from '../../styles/ui'

/* שיעור בחלון הראווה — המדף "התנסו עכשיו" ללא הרשמה */
interface ShowcaseQuest {
  id: string
  title: string
  subject: string | null
  gradeMin: number | null
  gradeMax: number | null
  sceneCount: number
  thumbUrl: string | null
}

const GRADE_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י', 'יא', 'יב']
function gradeRangeLabel(min: number | null, max: number | null): string | null {
  const a = min && min >= 1 && min <= 12 ? GRADE_LETTERS[min - 1] : null
  const b = max && max >= 1 && max <= 12 ? GRADE_LETTERS[max - 1] : null
  if (a && b) return a === b ? `כיתה ${a}׳` : `כיתות ${a}׳-${b}׳`
  return a ? `כיתה ${a}׳` : null
}

/* סימן הבית: הקריסטל בשפה החזותית החדשה (אותו קריסטל של המשחק, מקובץ הטוקנים) ומתחתיו שם המותג באותיות בדיו.
   זה סימן זמני שמצויר בקוד: קובצי הלוגו עצמם לא נערכו ולא מוצגים כאן, כי שניהם בפלטה הישנה
   (הדיוקן עם הכיתוב הלבן נועד לרקע כהה, והקריסטל במעבר ציאן-מג'נטה). כשיגיע לוגו חדש, מחליפים רק את הרכיב הזה. */
function HomeMark() {
  return (
    <div data-home-mark style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <GemIcon size={84} style={{ width: 'var(--logo-w, 84px)', height: 'auto' }} />
      <div aria-hidden="true" dir="ltr" style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'var(--fs-wordmark, 46px)', lineHeight: 1, letterSpacing: '.04em', color: 'var(--color-ink)', marginTop: 6 }}>HOLO</div>
      <div aria-hidden="true" dir="ltr" style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'calc(var(--fs-wordmark, 46px) * .3)', lineHeight: 1, letterSpacing: '.52em', marginInlineEnd: '-.52em', color: 'var(--color-machine-deep)' }}>ACADEMY</div>
    </div>
  )
}

/* cache מודול לחלון הראווה — הבית מרונדר שוב כרקע חי של מסכי הכניסה */
let showcaseMemo: ShowcaseQuest[] | null = null

const reduceMotion =
  typeof window !== 'undefined' &&
  ((!!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) ||
    /* override ל-QA — מדמה reduced-motion בלי לשנות הגדרת מערכת */
    new URLSearchParams(window.location.search).has('reduce-motion'))

/* ── המדף: השיעורים כספרים שעומדים על מדף (אופקי, מעגלי) ──────────────────────
   כל שיעור הוא כריכה: תמונה, שם, ופס בצבע המקצוע בצד הכריכה (ימין, כמו ספר בעברית).
   כל השיעורים ב-DOM תמיד (נגישות מקלדת); הנראוּת נגזרת מהמרחק המעגלי d מהאינדקס הנוכחי:
   d<cols גלוי על המדף, d=n-1 חונה מימין (כניסה/יציאה), השאר משמאל. transform/opacity בלבד.
   סיבוב אוטומטי 7ש׳ לספר; נעצר בריחוף/פוקוס; כבוי לגמרי ב-reduced-motion.
   פוקוס על ספר נסתר מביא אותו אל המדף (אין מלכודת מקלדת). */
const COVER_W = 160
const COVER_H = 244
const COVER_GAP = 14
const COVER_STEP = COVER_W + COVER_GAP
const SPINE_W = 12
/* הספר מתרומם מעט בריחוף: משאירים לו מקום מעל המדף */
const LIFT_ROOM = 8

/* כמה ספרים נכנסים במדף, לפי הרוחב שלו בפועל */
function useShelfCols(ref: React.RefObject<HTMLDivElement | null>): number {
  const [cols, setCols] = useState(3)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const calc = () => setCols(Math.max(1, Math.floor((el.clientWidth + COVER_GAP) / COVER_STEP)))
    calc()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(calc)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return cols
}

function SectionHead({ icon, title, sub }: { icon: React.ReactNode; title: React.ReactNode; sub: string }) {
  return (
    <div>
      <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-side-title)', fontWeight: 800, color: 'var(--color-machine-deep)', lineHeight: 1.25 }}>
        <span aria-hidden="true" style={{ display: 'inline-flex' }}>{icon}</span>
        <span>{title}</span>
      </h2>
      <div style={{ fontSize: 'var(--fs-side-sub)', color: 'var(--color-muted)', marginTop: 2, lineHeight: 1.4 }}>{sub}</div>
    </div>
  )
}

function Bookshelf({ quests }: { quests: ShowcaseQuest[] }) {
  const navigate = useNavigate()
  const railRef = useRef<HTMLDivElement>(null)
  const colsFit = useShelfCols(railRef)
  const [cur, setCur] = useState(0)
  const [paused, setPaused] = useState(false)
  const n = quests.length
  const cols = Math.min(colsFit, n)
  const rotate = n > cols
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!rotate || reduceMotion || paused) return
    timer.current = window.setInterval(() => setCur((c) => (c + 1) % n), 7000)
    return () => window.clearInterval(timer.current)
  }, [rotate, paused, n])

  const go = (dir: 1 | -1) => setCur((c) => (c + dir + n) % n)
  /* הספרים ממורכזים על המדף כשיש פחות ספרים מהמקום */
  const rowW = cols * COVER_STEP - COVER_GAP

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setPaused(false) }}
      aria-label="שיעורים מוכנים להתנסות"
      style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <SectionHead
          icon={<BrandIcon name="playGem" size={22} style={{ color: 'var(--color-ink)' }} />}
          title={<>התנסו עכשיו - <span style={{ color: 'var(--color-human-deep)' }}>ללא הרשמה</span></>}
          sub="מהספרייה הרשמית — לחצו ושחקו"
        />
        {/* חצים ידניים — גלויים תמיד כשיש יותר ספרים מהמקום (וגם היחידים ב-reduced-motion) */}
        {rotate && (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {([['chevUp', -1, 'השיעור הקודם', 'rotate(90deg)'], ['chevDown', 1, 'השיעור הבא', 'rotate(90deg)']] as const).map(([name, dir, label, turn]) => (
              <button key={name} onClick={() => go(dir)} aria-label={label} className="holo-button holo-button--sm"
                style={{ width: 44, height: 36, padding: 0, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <BrandIcon name={name} size={16} style={{ transform: turn }} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* המדף: הספרים, ומתחתיהם הקרש */}
      <div>
        <div ref={railRef} style={{ position: 'relative', height: COVER_H + LIFT_ROOM, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: LIFT_ROOM, bottom: 0, left: '50%', width: rowW, transform: 'translateX(-50%)' }}>
            {quests.map((q, i) => {
              const d = ((i - cur) % n + n) % n
              const visible = d < cols
              /* מיקום: גלויים על המדף (מימין לשמאל); האחרון במעגל חונה מימין; השאר משמאל */
              const slot = visible ? d : d === n - 1 ? -1 : cols
              const grades = gradeRangeLabel(q.gradeMin, q.gradeMax)
              const code = legacySubjectToCode(q.subject)
              return (
                <div key={q.id} style={{
                  position: 'absolute', top: 0, right: 0, width: COVER_W, height: COVER_H,
                  transform: `translateX(${-slot * COVER_STEP}px)`,
                  opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none',
                  transition: reduceMotion ? 'none' : 'transform .55s cubic-bezier(.3,.7,.3,1), opacity .35s ease',
                }}>
                  <button
                    className="home-cover"
                    data-showcase-cover={q.id}
                    onClick={() => { trackFunnel('showcase_click', q.id); navigate(`/play/${q.id}`) }}
                    onFocus={() => { if (!visible) setCur(i) }}
                    tabIndex={0}
                    aria-hidden={visible ? undefined : true}
                    style={{
                      position: 'relative', width: '100%', height: '100%', boxSizing: 'border-box', padding: 0, overflow: 'hidden',
                      display: 'flex', flexDirection: 'column', textAlign: 'right', cursor: 'pointer', fontFamily: 'var(--font-display)',
                      background: 'var(--color-surface)', color: 'var(--color-ink)', border: 'var(--border-student)', borderRadius: '6px 12px 12px 6px',
                      paddingInlineStart: SPINE_W,
                    }}
                  >
                    {/* שדרת הספר: פס בצבע המקצוע (שם המקצוע כתוב בתגית שעל התמונה) */}
                    <span aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, insetInlineStart: 0, width: SPINE_W, background: subjectVisual(code).color, borderInlineEnd: '2px solid var(--color-ink)' }} />
                    <span style={{ position: 'relative', display: 'block', flex: '0 0 auto', height: 112, background: 'var(--color-machine-tint)', borderBottom: '2px solid var(--color-ink)' }}>
                      {q.thumbUrl && <img src={q.thumbUrl} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                      {q.subject && <span style={{ position: 'absolute', top: 6, insetInlineStart: 6, maxWidth: 'calc(100% - 12px)', display: 'inline-flex' }}><SubjectTag code={code} size="sm" /></span>}
                    </span>
                    <span style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 6, padding: '7px 9px 8px' }}>
                      <span style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>{q.title}</span>
                      {grades && <span style={{ ...infoChip, alignSelf: 'flex-start', fontSize: 12.5, fontWeight: 600, padding: '1px 7px', borderRadius: 6, whiteSpace: 'nowrap' }}>{grades}</span>}
                      <span className="holo-button holo-button--sm" style={{ marginTop: 'auto', marginInlineEnd: 3, marginBottom: 3, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, padding: '3px 9px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>שחקו <BrandIcon name="play" size={11} /></span>
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
        {/* הקרש של המדף */}
        <div aria-hidden="true" style={{ height: 14, background: 'var(--color-human-soft)', border: 'var(--border-student)', borderRadius: 6, boxShadow: 'var(--shadow-button)' }} />
      </div>
    </div>
  )
}

interface ModeCard {
  id: 'student' | 'teacher'
  label: string
  sub: string
  icon: React.ReactNode
}

/* שלושת השלבים: אדם מתאר → המכונה בונה → משחקים יחד. צבע התג של כל שלב לפי תפקידי הצבע
   (אנושיות / המכונה / משטח), והמספר כתוב בתוכו, כך שהצבע לא נושא משמעות לבד. */
const STEPS: { n: string; icon: 'doc' | 'crystal' | 'chart'; title: string; text: string; fill: string }[] = [
  { n: '1', icon: 'doc', title: 'מתארים חומר לימוד', text: 'המורה כותב במשפט-שניים מה ללמד — כל מקצוע, כל שכבה.', fill: 'var(--color-human-soft)' },
  { n: '2', icon: 'crystal', title: 'ד״ר הולו בונה הרפתקה', text: 'סצנות, אתגרים ותמונות מותאמים לגיל ולרמת הקריאה — תוך דקות.', fill: 'var(--color-machine)' },
  { n: '3', icon: 'chart', title: 'משחקים — והמורה רואה', text: 'כניסה בקוד כיתה, קושי אישי לכל תלמיד, ותובנות בזמן אמת.', fill: 'var(--color-surface)' },
]

/* מסך הבית — "דלפק הספרייה": מימין הכניסה (לוגו ושתי דלתות: תלמידים ומורים), משמאל מדף
   השיעורים להתנסות, ומתחת שלושת השלבים ורצועת היתרונות. הלוגיקה נשמרת: תלמיד → מודאל קוד כיתה →
   /class/:code; מורה → /staff/login; ספר במדף → /play/:id. */
export default function Home() {
  const navigate = useNavigate()
  const [showCodeModal, setShowCodeModal] = useState(false)
  const [classCode, setClassCode] = useState('')
  const [shake, setShake] = useState(false)
  const [showcase, setShowcase] = useState<ShowcaseQuest[]>(showcaseMemo ?? [])
  useEffect(() => {
    if (showcaseMemo) return /* cache מודול — הבית מרונדר גם כרקע מסכי הכניסה, בלי הבהוב */
    fetch('/api/quests/showcase')
      .then((res) => (res.ok ? res.json() : { quests: [] }))
      .then((body: { quests?: ShowcaseQuest[] }) => { showcaseMemo = (body.quests ?? []).filter((q) => q.thumbUrl).slice(0, 8); setShowcase(showcaseMemo) })
      .catch(() => setShowcase([]))
  }, [])

  function startDemo() {
    navigate('/play/leonardo')
  }

  /* ‏Escape סוגר את מודאל קוד-הכיתה — אותה התנהגות כמו כל חלונות הכניסה */
  useEffect(() => {
    if (!showCodeModal) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setShowCodeModal(false); setClassCode('') } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showCodeModal])

  function enterClass() {
    const code = classCode.trim()
    if (code.length < 3) { setShake(true); setTimeout(() => setShake(false), 500); return }
    navigate(`/class/${code}`)
  }

  const cards: ModeCard[] = [
    {
      id: 'teacher',
      label: 'מצב מורה',
      sub: 'צרו שיעורים, נהלו כיתות ועקבו אחר התקדמות',
      icon: (
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
        </svg>
      ),
    },
    {
      id: 'student',
      label: 'מצב תלמיד/ה',
      sub: 'היכנסו לשיעורים, פתרו אתגרים ואספו רסיסי ידע',
      icon: (
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
        </svg>
      ),
    },
  ]

  function selectCard(id: 'student' | 'teacher') {
    if (id === 'student') setShowCodeModal(true)
    else navigate('/staff/login')
  }

  return (
    <HoloBackdrop>
      <div className="home3">

        {/* ── הדלפק: לוגו ושתי הכניסות ── */}
        <section className="home3-login" style={{ ...panelStudent, textAlign: 'center' }}>
          <GemDefs />
          <HomeMark />
          <h1 style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)', margin: 0 }}>HoloAcademy</h1>
          <p style={{ margin: '8px 0 0', fontSize: 'var(--fs-tagline)', fontWeight: 700, letterSpacing: '.06em', color: 'var(--color-machine-deep)' }}>ממד חדש של למידה!</p>

          {/* שתי הכניסות — זו לצד זו. כרטיס לחיץ = כפתור; המבטא של כניסת המורה במשפחת האנושיות */}
          <div className="home3-doors">
            {cards.map((c) => (
              <button
                key={c.id}
                onClick={() => selectCard(c.id)}
                className="holo-button"
                style={{
                  padding: 'clamp(12px, 1.6vh, 20px) 12px 14px', borderRadius: 16,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
                  fontFamily: 'var(--font-display)', fontWeight: 400, minWidth: 0,
                }}
              >
                <div>{c.icon}</div>
                <div style={{ fontSize: 'var(--fs-mode-title)', fontWeight: 800 }}>{c.label}</div>
                <div style={{ fontSize: 'var(--fs-mode-sub)', color: 'var(--color-muted)', lineHeight: 1.5 }}>{c.sub}</div>
                <div style={{
                  marginTop: 'auto', padding: '6px 26px', borderRadius: 9, fontSize: 'var(--fs-btn)', fontWeight: 700,
                  background: c.id === 'teacher' ? 'var(--color-human-soft)' : 'var(--color-surface)',
                  color: 'var(--color-ink)', border: '2px solid var(--color-ink)',
                }}>כניסה</div>
              </button>
            ))}
          </div>
        </section>

        {/* ── המדף: שיעורים להתנסות ── */}
        <section className="home3-shelf">
          {showcase.length > 0 ? (
            <Bookshelf quests={showcase} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div style={{ textAlign: 'center', fontSize: 'var(--fs-side-title)', fontWeight: 800, color: 'var(--color-machine-deep)', marginBottom: 10 }}>התנסו עכשיו</div>
              <button
                onClick={startDemo}
                className="holo-button"
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '13px 24px', borderRadius: 14,
                  fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700,
                }}
              >
                <BrandIcon name="playGem" size={18} />
                שיעור דמו — לאונרדו דה וינצ׳י
              </button>
            </div>
          )}
        </section>

        {/* ── איך זה עובד: שלושה שלבים ברצף ── */}
        <section className="home3-steps">
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <SectionHead
              icon={<BrandIcon name="compass" size={22} style={{ color: 'var(--color-ink)' }} />}
              title="איך זה עובד?"
              sub="שיעורים אינטראקטיביים בהדמיה — לכל מקצוע, שכבה ורמה"
            />
            <a href="/files/holoacademy-brief.pdf" target="_blank" rel="noopener" className="holo-link" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 30, fontSize: 'var(--fs-chip)', fontWeight: 600 }}>
              <BrandIcon name="brief" size={14} style={{ marginLeft: 5 }} />תקציר לרשויות ובתי ספר
            </a>
          </div>
          <ol className="home3-step-row">
            {STEPS.map((s, i) => (
              <li key={s.n} className="home3-step">
                <div style={{ ...panelStudent, borderRadius: 16, boxShadow: 'var(--shadow-button)', flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 12, textAlign: 'right' }}>
                  <span aria-hidden="true" style={{ flexShrink: 0, width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center', background: s.fill, border: '2px solid var(--color-ink)', fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 900, color: 'var(--color-ink)' }}>{s.n}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--fs-step-title)', fontWeight: 800, color: 'var(--color-ink)', lineHeight: 1.3 }}>
                      <BrandIcon name={s.icon} size={17} style={{ color: 'var(--color-ink)', flexShrink: 0 }} />
                      <span>{s.title}</span>
                    </div>
                    <div style={{ fontSize: 'var(--fs-body)', color: 'var(--color-muted)', lineHeight: 1.5, marginTop: 3 }}>{s.text}</div>
                  </div>
                </div>
                {i < STEPS.length - 1 && <span className="home3-step-arrow" aria-hidden="true">←</span>}
              </li>
            ))}
          </ol>
        </section>

        {/* ── רצועת היתרונות + זכויות ── */}
        <footer className="home3-strip" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
            {['עברית מלאה, RTL', 'התאמת קושי אישית', 'בדיקת עובדות ובטיחות תוכן', 'ללא התקנה — עובד בדפדפן'].map((c) => (
              <span key={c} style={{ ...infoChip, fontSize: 'var(--fs-chip)', fontWeight: 600, padding: '4px 12px', borderRadius: 9, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <BrandIcon name="check" size={11} /> {c}
              </span>
            ))}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-foot)', letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--color-muted)', textAlign: 'center' }}>
            © 2026 HoloAcademy
          </div>
        </footer>
      </div>

      {/* מודאל קוד כיתה */}
      {showCodeModal && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ zIndex: 100, ...modalBackdrop }}
          onClick={() => { setShowCodeModal(false); setClassCode('') }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              ...panelStudent, borderRadius: 20, padding: '40px 44px', width: 380, textAlign: 'center',
              animation: shake ? 'holo-shake .4s ease' : 'none',
            }}
          >
            <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--color-machine-tint)', border: '2px solid var(--color-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 22px' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: 'var(--color-ink)' }}>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-machine-deep)', marginBottom: 8 }}>קוד כיתה</div>
            <div style={{ fontSize: 14, color: 'var(--color-muted)', marginBottom: 28, lineHeight: 1.6 }}>מה קוד הכיתה שקיבלתם מהמורה?</div>
            <input
              autoFocus
              value={classCode}
              onChange={(e) => setClassCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && enterClass()}
              placeholder="למשל: demo-7b"
              maxLength={32}
              dir="ltr"
              style={{
                width: '100%', boxSizing: 'border-box', ...fieldStyle,
                borderRadius: 12, padding: '14px 18px', fontSize: 20, fontWeight: 700,
                fontFamily: 'var(--font-mono)', textAlign: 'center', letterSpacing: '.12em',
              }}
            />
            <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
              <button onClick={() => { setShowCodeModal(false); setClassCode('') }} className="holo-link"
                style={{ flex: 1, padding: '12px', fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600 }}>
                ביטול
              </button>
              <button onClick={enterClass} className="holo-button"
                style={{ flex: 2, padding: '12px', borderRadius: 11, cursor: classCode.trim() ? 'pointer' : 'default', opacity: classCode.trim() ? 1 : 0.7, fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700 }}>
                כניסה ←
              </button>
            </div>
          </div>
        </div>
      )}
    </HoloBackdrop>
  )
}
