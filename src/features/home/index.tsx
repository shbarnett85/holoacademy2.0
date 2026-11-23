import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { trackFunnel } from '../../shared/lib/funnel'
import BrandIcon from '../../shared/ui/BrandIcon'
import SubjectTag from '../../shared/ui/SubjectTag'
import BrandLogo from '../../shared/ui/BrandLogo'
import WhereAmI from './WhereAmI'
import { legacySubjectToCode } from '../../shared/lib/subjects'
import { fieldStyle, infoChip, modalBackdrop, panelStudent } from '../../styles/ui'
import { enterGuestStudent } from '../../shared/lib/guestStudent'
import PortalHero from '../player/lab/PortalHero'
import { usePortalDive } from '../player/lab/usePortalDive'

/* שיעור בחלון הראווה — שיעורי ההתנסות ללא הרשמה, שמוצגים בפורטל */
interface ShowcaseQuest {
  id: string
  title: string
  subject: string | null
  gradeMin: number | null
  gradeMax: number | null
  sceneCount: number
  thumbUrl: string | null
}

/* סימן הבית: הלוגו המלא (holoacademy-logo.svg, כמו שהוא) ומתחתיו שם המותג באותיות בדיו, כי בלוגו עצמו אין אותיות.
   הגובה מ---logo-h (index.css), והשטח הנקי סביב הלוגו הוא הריפוד של BrandLogo. */
function HomeMark() {
  return (
    <div data-home-mark style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <BrandLogo height="var(--logo-h, 96px)" />
      <div aria-hidden="true" dir="ltr" style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 'var(--fs-wordmark, 46px)', lineHeight: 1, letterSpacing: '.04em', color: 'var(--color-ink)' }}>HOLO</div>
      <div aria-hidden="true" dir="ltr" style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'calc(var(--fs-wordmark, 46px) * .3)', lineHeight: 1, letterSpacing: '.52em', marginInlineEnd: '-.52em', marginTop: 4, color: 'var(--color-machine-deep)' }}>ACADEMY</div>
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

/* שלושת השלבים: אדם מתאר → המכונה בונה → משחקים יחד. צבע התג של כל שלב לפי תפקידי הצבע
   (אנושיות / המכונה / משטח), והמספר כתוב בתוכו, כך שהצבע לא נושא משמעות לבד. */
const STEPS: { n: string; icon: 'doc' | 'crystal' | 'chart'; title: string; text: string; fill: string }[] = [
  { n: '1', icon: 'doc', title: 'מתארים חומר לימוד', text: 'המורה כותב במשפט-שניים מה ללמד — כל מקצוע, כל שכבה.', fill: 'var(--color-human-soft)' },
  { n: '2', icon: 'crystal', title: 'ד״ר הולו יוצר הרפתקה', text: 'סצנות, אתגרים ותמונות מותאמים לגיל ולרמת הקריאה — תוך דקות.', fill: 'var(--color-machine)' },
  { n: '3', icon: 'chart', title: 'משחקים — והמורה רואה', text: 'כניסה בקוד כיתה, קושי אישי לכל תלמיד, ותובנות בזמן אמת.', fill: 'var(--color-surface)' },
]

/* כמה זמן שיעור אחד מוצג בפורטל לפני שהוא מתחלף */
const PORTAL_ROTATE_MS = 7000

/* מסך הבית — "הספרייה ההולוגרפית": המסך הראשון הוא הבמה של פתיחת שיעור במסך מלא (PortalHero). הפורטל מציג שיעור התנסות
   כהולוגרמה (מתחלף כל כמה שניות; לחיצה עליו או על "שחקו עכשיו" צוללת לתוכו ופותחת את השיעור), ד"ר הולו מקבל את הפנים,
   ומימין חלון צף עם הסימן ושתי הכניסות. בגלילה למטה: שלושת השלבים ורצועת היתרונות.
   שיעורי ההתנסות מוצגים רק בפורטל (היה גם מדף מתחתיו; הוסר לבקשת המשתמש, כי הוא הציג את אותם שיעורים פעם שנייה).
   הלוגיקה נשמרת: תלמיד → מודאל קוד כיתה → /class/:code; מורה → /staff/login; שיעור התנסות → /play/:id. */
export default function Home() {
  const navigate = useNavigate()
  const { leaving, dive, onDiveEnd } = usePortalDive()
  const [showCodeModal, setShowCodeModal] = useState(false)
  const [classCode, setClassCode] = useState('')
  const [showWhere, setShowWhere] = useState(false)
  const [shake, setShake] = useState(false)
  const [showcase, setShowcase] = useState<ShowcaseQuest[]>(showcaseMemo ?? [])
  useEffect(() => {
    if (showcaseMemo) return /* cache מודול — הבית מרונדר גם כרקע מסכי הכניסה, בלי הבהוב */
    fetch('/api/quests/showcase')
      .then((res) => (res.ok ? res.json() : { quests: [] }))
      .then((body: { quests?: ShowcaseQuest[] }) => { showcaseMemo = (body.quests ?? []).filter((q) => q.thumbUrl).slice(0, 8); setShowcase(showcaseMemo) })
      .catch(() => setShowcase([]))
  }, [])

  /* השיעור שבפורטל: מתחלף מעצמו, ונעצר בריחוף ובפוקוס על השורה שמתחת לפורטל, בתנועה מופחתת ובזמן הצלילה */
  const [cur, setCur] = useState(0)
  const [paused, setPaused] = useState(false)
  const n = showcase.length
  const featured: ShowcaseQuest | undefined = n ? showcase[cur % n] : undefined
  useEffect(() => {
    /* גם כשחלון "איפה אני?" פתוח: השיעור שבפורטל לא מתחלף מאחוריו */
    if (n < 2 || paused || showWhere || leaving || reduceMotion) return
    const t = window.setInterval(() => setCur((c) => (c + 1) % n), PORTAL_ROTATE_MS)
    return () => window.clearInterval(t)
  }, [n, paused, showWhere, leaving])
  const step = (dir: 1 | -1) => setCur((c) => (c + dir + n) % n)

  function play() {
    if (leaving) return
    if (featured) trackFunnel('showcase_click', featured.id)
    dive(featured ? `/play/${featured.id}` : '/play/leonardo')
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

  return (
    <div dir="rtl" className="home4">

      {/* ── המסך הראשון: הספרייה, הפורטל, ד"ר הולו והכניסות ── */}
      <PortalHero
        portalSrc={featured?.thumbUrl ?? undefined}
        portalLabel={featured ? `שחקו עכשיו: ${featured.title}` : 'שחקו בשיעור ההתנסות'}
        onPortalClick={play}
        leaving={leaving}
        onDiveEnd={onDiveEnd}
        holoAction={
          <button className="holo-button home4-where" onClick={() => setShowWhere(true)} data-home-where aria-haspopup="dialog">
            <span className="home4-where-mark" aria-hidden="true">?</span>
            <span>איפה אני?</span>
          </button>
        }
        underProps={{
          'data-layout': 'row',
          onMouseEnter: () => setPaused(true), onMouseLeave: () => setPaused(false),
          onFocusCapture: () => setPaused(true), onBlurCapture: (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setPaused(false) },
        }}
        under={<>
          {featured && (
            <div className="home4-now-row" data-home-lesson>
              {n > 1 && <button onClick={() => step(-1)} aria-label="השיעור הקודם" className="holo-button holo-button--sm home4-arrow"><span aria-hidden="true">→</span></button>}
              <div className="home4-now-card" aria-live="polite">
                <span className="home4-now-title">{featured.title}</span>
                {featured.subject && <SubjectTag code={legacySubjectToCode(featured.subject)} size="sm" />}
              </div>
              {n > 1 && <button onClick={() => step(1)} aria-label="השיעור הבא" className="holo-button holo-button--sm home4-arrow"><span aria-hidden="true">←</span></button>}
            </div>
          )}
          <button onClick={play} className="holo-button home4-play" data-home-play>
            <BrandIcon name="playGem" size={22} />
            <span>שחקו עכשיו <small>· בלי הרשמה</small></span>
          </button>
        </>}
        panel={<>
          <HomeMark />
          <h1 style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)', margin: 0 }}>HoloAcademy</h1>
          <p className="home4-tagline">ממד חדש של למידה!</p>
          <p className="home4-lead">שיעורים אינטראקטיביים בהדמיה: המורה מתאר את החומר, וד״ר הולו יוצר ממנו הרפתקה.</p>
          <div className="home4-doors">
            <button onClick={() => navigate('/staff/login')} className="holo-button home4-door home4-door--teacher" data-home-door="teacher">
              <span className="home4-door-icon" aria-hidden="true">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
                </svg>
              </span>
              <span className="home4-door-text">
                <span className="home4-door-title">כניסת מורים</span>
                <span className="home4-door-sub">יצירת שיעורים, כיתות והתקדמות</span>
              </span>
              <span className="home4-door-arrow" aria-hidden="true">←</span>
            </button>
            <button onClick={() => setShowCodeModal(true)} className="holo-button home4-door" data-home-door="student">
              <span className="home4-door-icon" aria-hidden="true">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                </svg>
              </span>
              <span className="home4-door-text">
                <span className="home4-door-title">כניסת תלמידים</span>
                <span className="home4-door-sub">עם קוד הכיתה מהמורה</span>
              </span>
              <span className="home4-door-arrow" aria-hidden="true">←</span>
            </button>
          </div>
          <button className="holo-link" onClick={() => document.getElementById('home-how')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })}
            style={{ alignSelf: 'center', minHeight: 30, fontSize: 'var(--fs-chip)', fontWeight: 600 }}>
            איך זה עובד?
          </button>
        </>}
      />

      {/* ── בגלילה למטה: שלושת השלבים ורצועת היתרונות ── */}
      <div className="home4-more">
        <section id="home-how" className="home4-steps">
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

        {/* רצועת היתרונות + זכויות */}
        <footer style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
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

      {showWhere && <WhereAmI onClose={() => setShowWhere(false)} onPlay={() => { setShowWhere(false); play() }} />}

      {/* מודאל קוד כיתה */}
      {showCodeModal && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ zIndex: 100, ...modalBackdrop }}
          onClick={() => { setShowCodeModal(false); setClassCode('') }}
        >
          <div
            className="entry-panel"
            onClick={(e) => e.stopPropagation()}
            style={{
              ...panelStudent, borderRadius: 20, padding: '40px 44px', width: 380, textAlign: 'center',
              animation: shake ? 'holo-shake .4s ease' : 'none',
            }}
          >
            <div className="entry-logo" data-entry-logo><BrandLogo height="var(--entry-logo-h)" /></div>
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
            {/* בלי קוד כיתה: כניסת אורחים, עם שיעורי ההתנסות. שום דבר לא נשמר */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 14px', color: 'var(--color-muted)', fontSize: 14 }}>
              <span style={{ flex: 1, height: 1, background: 'var(--color-line-strong)' }} />או<span style={{ flex: 1, height: 1, background: 'var(--color-line-strong)' }} />
            </div>
            <button onClick={() => { enterGuestStudent('אורחים'); navigate('/student') }} className="holo-button" data-guest-enter
              style={{ width: '100%', padding: '12px', borderRadius: 11, fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, background: 'var(--color-surface)' }}>
              כניסת אורחים
            </button>
            <div style={{ marginTop: 8, fontSize: 14, color: 'var(--color-muted)', lineHeight: 1.5 }}>בלי קוד כיתה: שיעורים לדוגמה, וההתקדמות לא נשמרת</div>
          </div>
        </div>
      )}
    </div>
  )
}
