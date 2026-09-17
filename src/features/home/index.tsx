import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import HoloBackdrop from '../../shared/ui/HoloBackdrop'
import { trackFunnel } from '../../shared/lib/funnel'
import BrandIcon from '../../shared/ui/BrandIcon'

/* הדמיה בחלון הראווה — מדף "התנסו עכשיו" ללא הרשמה */
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

/* מסמן מספר שלב — יהלום קו-מתאר דק עם הספרה בציאן (דיסקרטי, סימון סדר בלבד) */
function StepNum({ n }: { n: string }) {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M12 2.5L21.5 12L12 21.5L2.5 12Z" stroke="#2ff3ff" strokeWidth="1.6" strokeLinejoin="round" opacity="0.55" />
      <text x="12" y="12.5" textAnchor="middle" dominantBaseline="central" fontSize="10" fontWeight="700" fill="#2ff3ff" fontFamily="var(--font-display)">{n}</text>
    </svg>
  )
}

const reduceMotion =
  typeof window !== 'undefined' &&
  ((!!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) ||
    /* override ל-QA — מדמה reduced-motion בלי לשנות הגדרת מערכת */
    new URLSearchParams(window.location.search).has('reduce-motion'))

/* ── קרוסלת ההדמיות (אנכית, מעגלית) ─────────────────────────────────────────
   כל ההדמיות ב-DOM תמיד (נגישות מקלדת); הנראוּת נגזרת מהמרחק המעגלי d מהאינדקס
   הנוכחי: ‏d≤2 גלוי בחלון, d=n-1 חונה מעל (כניסה/יציאה מלמעלה), השאר מתחת.
   כל תנועה "בלתי-נראית" קורית ב-opacity 0 בתוך חלון עם overflow:hidden — כך
   המעבר מהאחרון לראשון רציף, בלי קפיצה. transform/opacity בלבד.
   סיבוב אוטומטי 7ש׳ לפריט; נעצר בריחוף/פוקוס; כבוי לגמרי ב-reduced-motion.
   פוקוס על כרטיס נסתר מקפיץ אותו לחלון (אין מלכודת מקלדת). */
const CARD_H = 104
const CARD_GAP = 10
const STEP = CARD_H + CARD_GAP
const VISIBLE = 3

/* ── טוקנים משותפים לשני הטורים הצדדיים — סימטריה מדויקת: ערך אחד לשניהם ──
   כותרת, רוחב, גובה כרטיס, מרווח, גובה ערימה ושורת-תחתית זהים בין
   "התנסו עכשיו" (שמאל) ל"איך זה עובד" (ימין). */
export const SIDE = { cardH: CARD_H, gap: CARD_GAP, footH: 26 }
/* גובה הערימה נגזר ממספר השורות הגלויות (גדל עם גובה המסך) — זהה לשני הטורים */
export const stackHFor = (rows: number) => rows * STEP - CARD_GAP

/* כמה שורות קרוסלה נכנסות — לפי גובה החלון: 3 רגיל, 4 במסך מלא, 5 בענק */
function useVisibleRows() {
  const calc = () => (typeof window === 'undefined' ? VISIBLE : window.innerHeight >= 1250 ? 5 : window.innerHeight >= 980 ? 4 : 3)
  const [rows, setRows] = useState(calc)
  useEffect(() => {
    const on = () => setRows(calc())
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return rows
}

/* כותרת טור צדדי — אייקון + כותרת + שורת משנה, מבנה זהה לשני הצדדים */
function SideHead({ icon, glow, title, sub }: { icon: React.ReactNode; glow: string; title: React.ReactNode; sub: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 'var(--fs-side-title)', fontWeight: 800, color: '#fff' }}>
        <span style={{ filter: `drop-shadow(0 0 10px ${glow})` }}>{icon}</span> {title}
      </div>
      <div style={{ fontSize: 'var(--fs-side-sub)', color: 'rgba(160,200,240,.55)', marginTop: 3, lineHeight: 1.35, minHeight: 'calc(var(--fs-side-sub) * 2.7)' }}>{sub}</div>
    </div>
  )
}

function ShowcaseCarousel({ quests, rows }: { quests: ShowcaseQuest[]; rows: number }) {
  const navigate = useNavigate()
  const [cur, setCur] = useState(0)
  const [paused, setPaused] = useState(false)
  const n = quests.length
  const rotate = n > rows
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!rotate || reduceMotion || paused) return
    timer.current = window.setInterval(() => setCur((c) => (c + 1) % n), 7000)
    return () => window.clearInterval(timer.current)
  }, [rotate, paused, n])

  const go = (dir: 1 | -1) => setCur((c) => (c + dir + n) % n)

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setPaused(false) }}
      aria-label="הדמיות מוכנות להתנסות"
      style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <SideHead
        icon={<BrandIcon name="playGem" size={19} style={{ color: '#f241da' }} />} glow="rgba(242,65,218,.55)"
        title={<>התנסו עכשיו — <span style={{ color: 'var(--holo-orange, #ff9a2e)' }}>בלי הרשמה</span></>}
        sub="מהספרייה הרשמית — לחצו ושחקו"
      />

      {/* חלון הקרוסלה */}
      <div style={{ position: 'relative', height: stackHFor(rows), overflow: 'hidden' }}>
        {quests.map((q, i) => {
          const d = ((i - cur) % n + n) % n
          const visible = d < rows
          /* מיקום: גלויים בחלון; האחרון-במעגל חונה מעל (ציר הכניסה/יציאה העליון); השאר מתחת */
          const slot = visible ? d : d === n - 1 ? -1 : rows
          const grades = gradeRangeLabel(q.gradeMin, q.gradeMax)
          return (
            <button
              key={q.id}
              onClick={() => { trackFunnel('showcase_click', q.id); navigate(`/play/${q.id}`) }}
              onFocus={() => { if (!visible) setCur(i) }}
              tabIndex={0}
              aria-hidden={visible ? undefined : true}
              style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: CARD_H,
                transform: `translateY(${slot * STEP}px)`,
                opacity: visible ? 1 : 0,
                pointerEvents: visible ? 'auto' : 'none',
                transition: reduceMotion ? 'none' : 'transform .55s cubic-bezier(.3,.7,.3,1), opacity .35s ease',
                display: 'flex', alignItems: 'stretch', gap: 0, padding: 0, borderRadius: 14, overflow: 'hidden',
                cursor: 'pointer', textAlign: 'right', fontFamily: 'var(--font-display)',
                background: 'linear-gradient(135deg, rgba(10,22,46,.85), rgba(4,9,20,.92))',
                border: '1px solid rgba(120,180,220,.16)',
              }}
            >
              {q.thumbUrl && (
                <img src={q.thumbUrl} alt="" loading="lazy"
                  style={{ width: 92, height: '100%', objectFit: 'cover', flexShrink: 0, display: 'block' }} />
              )}
              <div style={{ flex: 1, minWidth: 0, padding: '9px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ fontSize: 'var(--fs-body)', fontWeight: 700, color: '#d5e9f8', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{q.title}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginTop: 'auto' }}>
                  {q.subject && <span style={{ fontSize: 'var(--fs-tag)', fontWeight: 600, padding: '1px 7px', borderRadius: 6, background: 'rgba(47,243,255,.08)', border: '1px solid rgba(47,243,255,.25)', color: '#7ef6ff' }}>{q.subject}</span>}
                  {grades && <span style={{ fontSize: 'var(--fs-tag)', fontWeight: 600, padding: '1px 7px', borderRadius: 6, background: 'rgba(155,140,255,.08)', border: '1px solid rgba(155,140,255,.25)', color: '#b9adff' }}>{grades}</span>}
                  <span style={{ marginRight: 'auto', fontSize: 'var(--fs-tag)', fontWeight: 700, padding: '3px 10px', borderRadius: 7, background: 'rgba(255,154,46,.14)', border: '1px solid rgba(255,154,46,.4)', color: '#ffc98c' }}>שחקו <BrandIcon name="play" size={11} /></span>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* חצים ידניים — גלויים תמיד (וגם היחידים ב-reduced-motion) */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, height: SIDE.footH }}>
        {rotate && ([['chevUp', -1, 'ההדמיה הקודמת'], ['chevDown', 1, 'ההדמיה הבאה']] as const).map(([name, dir, label]) => (
          <button key={name} onClick={() => go(dir)} aria-label={label}
            style={{ width: 34, height: SIDE.footH, borderRadius: 8, cursor: 'pointer', lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(10,22,46,.8)', border: '1px solid rgba(120,180,220,.28)', color: '#2ff3ff' }}>
            <BrandIcon name={name} size={14} />
          </button>
        ))}
      </div>
    </div>
  )
}

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

/* מסך הבית — שלושה טורים במסך אחד: שלבים (ימין) · כניסה (מרכז, שולט) ·
   הדמיות (שמאל) · רצועת יתרונות. הלוגיקה נשמרת: תלמיד → מודאל קוד כיתה →
   /class/:code, מורה → /staff/login. */
export default function Home() {
  const navigate = useNavigate()
  const [hov, setHov] = useState<string | null>(null)
  const [showCodeModal, setShowCodeModal] = useState(false)
  const [classCode, setClassCode] = useState('')
  const [shake, setShake] = useState(false)
  const [showcase, setShowcase] = useState<ShowcaseQuest[]>([])
  const rowsByHeight = useVisibleRows()
  /* לא פותחים חלון גדול ממספר ההדמיות — חריץ ריק שובר את מלאות הטור */
  const rows = Math.max(3, Math.min(rowsByHeight, showcase.length || 3))
  /* גובה כרטיס-שלב: שלושת השלבים נמתחים בדיוק לגובה ערימת הקרוסלה — איזון נשמר */
  const stepH = (stackHFor(rows) - 2 * SIDE.gap) / 3
  useEffect(() => {
    fetch('/api/quests/showcase')
      .then((res) => (res.ok ? res.json() : { quests: [] }))
      .then((body: { quests?: ShowcaseQuest[] }) => setShowcase((body.quests ?? []).filter((q) => q.thumbUrl).slice(0, 8)))
      .catch(() => setShowcase([]))
  }, [])

  function startDemo() {
    navigate('/play/leonardo')
  }

  function enterClass() {
    const code = classCode.trim()
    if (code.length < 3) { setShake(true); setTimeout(() => setShake(false), 500); return }
    navigate(`/class/${code}`)
  }

  const cards: ModeCard[] = [
    {
      id: 'teacher',
      label: 'מצב מורה',
      sub: 'צרו הדמיות, נהלו כיתות ועקבו אחר התקדמות',
      icon: (
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
        </svg>
      ),
      accent: 'var(--holo-magenta)', rgb: '255,69,230',
      grad: 'linear-gradient(135deg, rgba(255,69,230,.18), rgba(255,154,46,.10))', border: 'rgba(255,69,230,.45)',
    },
    {
      id: 'student',
      label: 'מצב תלמיד/ה',
      sub: 'היכנסו להדמיות, פתרו אתגרים ואספו רסיסי ידע',
      icon: (
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
        </svg>
      ),
      accent: 'var(--holo-cyan-bright)', rgb: '47,243,255',
      grad: 'linear-gradient(135deg, rgba(47,243,255,.18), rgba(155,140,255,.10))', border: 'rgba(47,243,255,.45)',
    },
  ]

  function selectCard(id: 'student' | 'teacher') {
    if (id === 'student') setShowCodeModal(true)
    else navigate('/staff/login')
  }

  const colTitle: React.CSSProperties = { textAlign: 'center', fontSize: 'var(--fs-side-title)', fontWeight: 800, color: '#fff', marginBottom: 10 }

  return (
    <HoloBackdrop>
      <div className="home3">

        {/* ── טור ימני: איך זה עובד — מבנה ומידות זהים לטור "התנסו עכשיו" ── */}
        <div className="home3-steps" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SideHead
            icon={<BrandIcon name="compass" size={19} style={{ color: '#2ff3ff' }} />} glow="rgba(47,243,255,.55)"
            title="איך זה עובד?"
            sub="הדמיות למידה אינטראקטיביות — לכל מקצוע, שכבה ורמה"
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: SIDE.gap, height: stackHFor(rows) }}>
            {[
              { n: '1', icon: 'doc' as const, title: 'מתארים חומר לימוד', text: 'המורה כותב במשפט-שניים מה ללמד — כל מקצוע, כל שכבה.' },
              { n: '2', icon: 'crystal' as const, title: 'ד״ר הולו בונה הרפתקה', text: 'סצנות, אתגרים ותמונות מותאמים לגיל ולרמת הקריאה — תוך דקות.' },
              { n: '3', icon: 'chart' as const, title: 'משחקים — והמורה רואה', text: 'כניסה בקוד כיתה, קושי אישי לכל תלמיד, ותובנות בזמן אמת.' },
            ].map((s) => (
              <div key={s.n} style={{
                height: stepH, boxSizing: 'border-box', padding: '12px 14px', borderRadius: 14, textAlign: 'right',
                background: 'linear-gradient(135deg, rgba(10,22,46,.75), rgba(4,9,20,.85))',
                border: '1px solid rgba(120,180,220,.14)',
                display: 'flex', flexDirection: 'column', justifyContent: 'center',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <StepNum n={s.n} />
                  <BrandIcon name={s.icon} size={17} style={{ color: '#2ff3ff' }} />
                  <span style={{ fontSize: 'var(--fs-step-title)', fontWeight: 800, color: '#dff2ff' }}>{s.title}</span>
                </div>
                <div style={{ fontSize: 'var(--fs-body)', color: 'rgba(170,205,235,.72)', lineHeight: 1.6 }}>{s.text}</div>
              </div>
            ))}
          </div>
          {/* מקביל לשורת החצים של הקרוסלה — אותו גובה, משני צידי המסך */}
          <div style={{ display: 'flex', justifyContent: 'center', height: SIDE.footH }}>
            <a href="/files/holoacademy-brief.pdf" target="_blank" rel="noopener" style={{
              display: 'inline-flex', alignItems: 'center', height: SIDE.footH, boxSizing: 'border-box',
              fontSize: 'var(--fs-chip)', fontWeight: 600, padding: '0 12px', borderRadius: 8,
              color: 'rgba(200,230,255,.8)', background: 'rgba(10,22,46,.8)', border: '1px solid rgba(120,180,220,.28)', textDecoration: 'none',
            }}><BrandIcon name="brief" size={13} style={{ color: '#2ff3ff', marginLeft: 5 }} />תקציר לרשויות ובתי ספר</a>
          </div>
        </div>

        {/* ── טור מרכזי: לוגו + כניסה (הדומיננטי) ── */}
        <div className="home3-login" style={{ textAlign: 'center' }}>
          <div className="holo-logo-glow">
            <img
              src="/holoacademy-logo.png"
              alt="HOLO ACADEMY"
              /* כשל טעינה חולף (רשת רעועה / שרת שקם מחדש) — ניסיון חוזר אחד אחרי 1.5ש׳ */
              onError={(e) => {
                const el = e.currentTarget
                if (el.dataset.retried) return
                el.dataset.retried = '1'
                setTimeout(() => { el.src = '/holoacademy-logo.png?r=' + Date.now() }, 1500)
              }}
              style={{ width: 'var(--logo-w, clamp(180px, 21vw, 240px))', height: 'auto', margin: '0 auto', display: 'block' }}
            />
            {/* שכבות הגליץ' — עותקים ציאן/מג׳נטה שמתפרצים לרגע (CSS בלבד) */}
            <span className="hlg-glitch hlg-glitch--c" aria-hidden="true"><img src="/holoacademy-logo.png" alt="" /></span>
            <span className="hlg-glitch hlg-glitch--m" aria-hidden="true"><img src="/holoacademy-logo.png" alt="" /></span>
          </div>
          <h1 style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)', margin: 0 }}>HoloAcademy</h1>
          {/* טאגליין — גרדיאנט תכלת-לבן בהתאמה לזוהר הלוגו */}
          <p style={{
            margin: '10px 0 0',
            fontSize: 'var(--fs-tagline)',
            fontWeight: 600,
            letterSpacing: '.09em',
            background: 'linear-gradient(120deg, #eaf9ff 15%, #9fdcff 55%, #d9b8ff 90%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            textShadow: '0 0 26px rgba(120,200,255,.28)',
          }}>ממד חדש של למידה!</p>

          {/* שני כפתורי הכניסה — זה לצד זה */}
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 16, marginTop: 20 }}>
            {cards.map((c) => {
              const isHov = hov === c.id
              return (
                <button
                  key={c.id}
                  onMouseEnter={() => setHov(c.id)}
                  onMouseLeave={() => setHov(null)}
                  onClick={() => selectCard(c.id)}
                  style={{
                    width: 'var(--mode-card-w)', padding: 'clamp(16px, 1.6vh, 26px) 16px 16px', borderRadius: 18,
                    background: isHov ? c.grad : 'linear-gradient(135deg, rgba(10,22,46,.86), rgba(4,9,20,.92))',
                    border: `1px solid ${isHov ? c.border : `rgba(${c.rgb},.22)`}`,
                    backdropFilter: 'blur(18px)',
                    boxShadow: isHov ? `0 0 48px rgba(${c.rgb},.22), 0 0 120px rgba(${c.rgb},.08)` : `0 0 22px rgba(${c.rgb},.07)`,
                    cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9,
                    transition: 'all .22s cubic-bezier(.22,.7,.35,1)', transform: isHov ? 'translateY(-4px) scale(1.025)' : 'none',
                    fontFamily: 'var(--font-display)',
                  }}
                >
                  <div style={{ color: isHov ? c.accent : `rgba(${c.rgb},.65)`, transition: 'color .22s', filter: isHov ? `drop-shadow(0 0 12px ${c.accent})` : 'none' }}>{c.icon}</div>
                  <div style={{ fontSize: 'var(--fs-mode-title)', fontWeight: 800, color: isHov ? '#fff' : '#cfe4f2', transition: 'color .2s' }}>{c.label}</div>
                  <div style={{ fontSize: 'var(--fs-mode-sub)', color: isHov ? 'rgba(220,240,255,.7)' : 'rgba(130,170,205,.55)', lineHeight: 1.55, transition: 'color .2s' }}>{c.sub}</div>
                  <div style={{
                    marginTop: 2, padding: '7px 26px', borderRadius: 9, fontSize: 'var(--fs-btn)', fontWeight: 700,
                    background: isHov ? `rgba(${c.rgb},.22)` : `rgba(${c.rgb},.08)`,
                    border: `1px solid ${isHov ? `rgba(${c.rgb},.5)` : `rgba(${c.rgb},.3)`}`,
                    color: isHov ? c.accent : `rgba(${c.rgb},.75)`, transition: 'all .2s',
                    boxShadow: isHov ? `0 0 16px rgba(${c.rgb},.3)` : 'none',
                  }}>כניסה</div>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── טור שמאלי: קרוסלת ההדמיות ── */}
        <div className="home3-shelf">
          {showcase.length > 0 ? (
            <ShowcaseCarousel quests={showcase} rows={rows} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div style={colTitle}>התנסו עכשיו</div>
              <button
                onClick={startDemo}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '13px 24px', borderRadius: 14,
                  cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700,
                  color: 'rgba(200,230,255,.85)',
                  background: 'linear-gradient(135deg, rgba(10,22,46,.82), rgba(4,9,20,.9))',
                  border: '1px solid rgba(255,154,46,.28)',
                }}
              >
                <BrandIcon name="playGem" size={18} style={{ color: '#f241da' }} />
                הדמיית דמו — לאונרדו דה וינצ׳י
              </button>
            </div>
          )}
        </div>

        {/* ── רצועת יתרונות + קישור התקציר + זכויות ── */}
        {/* פוטר: רצועת היתרונות ממורכזת על ציר הדף, והזכויות בשורה נפרדת מתחתיה */}
        <div className="home3-strip" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, paddingTop: 4 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
            {['עברית מלאה, RTL', 'התאמת קושי אישית', 'בדיקת עובדות ובטיחות תוכן', 'ללא התקנה — עובד בדפדפן'].map((c) => (
              <span key={c} style={{ fontSize: 'var(--fs-chip)', fontWeight: 600, padding: '4px 12px', borderRadius: 9, background: 'rgba(47,243,255,.06)', border: '1px solid rgba(47,243,255,.22)', color: 'rgba(126,246,255,.85)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <BrandIcon name="check" size={11} style={{ color: '#2ff3ff' }} /> {c}
              </span>
            ))}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-foot)', letterSpacing: '.18em', textTransform: 'uppercase', color: 'rgba(47,243,255,.28)', textAlign: 'center' }}>
            © 2026 HoloAcademy
          </div>
        </div>
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
    </HoloBackdrop>
  )
}
