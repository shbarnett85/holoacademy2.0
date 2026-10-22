import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStaffAuth } from '../../shared/hooks/useStaffAuth'
import BrandIcon from '../../shared/ui/BrandIcon'
import { glass } from './studioStyles'
import { checkNavGuard } from '../../shared/lib/navGuard'
import { useSoundSettings } from '../../shared/lib/sound'
import { useTheme } from '../../shared/lib/useTheme'
import { withGuestLens } from '../teacherUi/guestLens'

export type TabId = 'create' | 'library' | 'results' | 'analytics' | 'students'

const TABS: { id: TabId; label: string; to: string }[] = [
  { id: 'create', label: 'צור הדמיה', to: '/creator' },
  { id: 'library', label: 'ספריית הדמיות', to: '/creator/library' },
  { id: 'results', label: 'תוצאות', to: '/results' },
  { id: 'analytics', label: 'אנליטיקה', to: '/analytics' },
  { id: 'students', label: 'תלמידים', to: '/manage/students' },
]

/* כותרת הסרגל העליון לפי הטאב הפעיל */
const TITLES: Record<TabId, string> = {
  create: 'יוצר ההדמיות',
  library: 'ספריית הדמיות',
  results: 'תוצאות',
  analytics: 'אנליטיקה',
  students: 'תלמידים',
}

/* מורה אורח: העדשה שבחר (מחנך/ת | מורה מקצועי/ת | מנהל/ת + מקצוע) נשמרת במעבר בין תוצאות ↔ אנליטיקה — מצרפים אותה לכתובת.
   לכל משתמש אחר, ולטאבים האחרים, הכתובת נשארת כמות שהיא. */
const tabHref = (t: { id: TabId; to: string }): string => (t.id === 'results' || t.id === 'analytics' ? withGuestLens(t.to) : t.to)

/* עקרונות ממשק למסכי מורה: אזור לחיצה ≥44px, כפתור נושא מילה (לא אייקון בלבד), גוף טקסט 16px */
const TARGET = 44

function BarButton({ icon, label, onClick, tone }: { icon: React.ReactNode; label: string; onClick: () => void; tone?: 'danger' }) {
  const danger = tone === 'danger'
  return (
    <button type="button" data-tu-press onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: TARGET, padding: '0 10px', borderRadius: 12, cursor: 'pointer',
        fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, whiteSpace: 'nowrap',
        background: danger ? 'var(--t242)' : 'var(--t241)', border: `1px solid ${danger ? 'var(--t231)' : 'var(--t22)'}`, color: danger ? 'var(--t243)' : 'var(--t19)',
      }}>
      {icon}
      {label}
    </button>
  )
}

/* סרגל עליון משותף לאולפן (לוגו + טאבים שמנווטים ב-router + סטטוס + יציאה) */
export default function StudioTopBar({ active }: { active: TabId }) {
  const navigate = useNavigate()
  const { logout, user, isStaff, role } = useStaffAuth()
  const { muted, toggleMuted } = useSoundSettings()
  const light = useTheme()

  /* "תוצאות" שייך למורים (ומנהל-על): מנהל בית ספר/רשות אין לו תוצאות ברמת הדמיה, והאנונימי לא מחובר */
  const showResults = isStaff && role !== 'admin' && role !== 'municipal_admin'
  const tabs = TABS.filter((t) => t.id !== 'results' || showResults || active === 'results')

  /* מסמן ל-CSS שמסך אולפן מורכב, כדי שהמצב הבהיר יבהיר גם את רקע ה-body —
     ורק כאן. מוסר בפירוק, כך שיציאה לנגן/לדף הבית מחזירה רקע כהה מיד. */
  useEffect(() => {
    document.body.classList.add('holo-studio')
    return () => document.body.classList.remove('holo-studio')
  }, [])

  /* מעבר טאב: מנגן יציאה (holo-tab-out) על תוכן העמוד ואז מנווט; היעד נכנס עם holo-tab-in */
  async function navTab(to: string) {
    if (!(await checkNavGuard())) return
    const el = document.querySelector('[data-studio-content]')
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (el && !reduce) {
      el.classList.remove('holo-tab-enter')
      el.classList.add('holo-tab-exit')
      window.setTimeout(() => navigate(to), 150)
    } else {
      navigate(to)
    }
  }

  return (
    <header data-studio-shell data-teacher-ui style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '6px 24px 4px', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span aria-hidden="true" style={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 12, background: 'var(--t20)', border: '1px solid var(--t23)', color: 'var(--t1)', boxShadow: '0 0 18px var(--t21)' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
        </span>
        <div>
          <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--t13)' }}>{TITLES[active]}</div>
          {/* שם המותג — 16px (עיקרון 7: גוף טקסט 16px לפחות) */}
          <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '.04em', color: 'var(--t6)', marginTop: 1 }}>HoloAcademy</div>
        </div>
      </div>
      <nav aria-label="ניווט ראשי" style={{ display: 'flex', gap: 6, ...glass, borderRadius: 14, padding: 5, flexWrap: 'wrap' }}>
        {tabs.map((t) => {
          const isActive = t.id === active
          return (
            <button key={t.id} type="button" data-tu-press aria-current={isActive ? 'page' : undefined} onClick={() => !isActive && navTab(tabHref(t))}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, minHeight: TARGET, padding: '0 12px', borderRadius: 11, cursor: isActive ? 'default' : 'pointer',
                fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: isActive ? 800 : 600, transition: 'all .18s', whiteSpace: 'nowrap',
                background: isActive ? 'linear-gradient(120deg, var(--t88), var(--t96))' : 'transparent',
                border: '1px solid ' + (isActive ? 'var(--t77)' : 'transparent'),
                color: isActive ? 'var(--t13)' : 'var(--t6)',
                /* קו תחתון = סימון פעיל שאינו צבע בלבד */
                boxShadow: isActive ? '0 0 18px var(--t88), inset 0 -3px 0 var(--t15)' : 'none',
              }}>
              {t.label}
            </button>
          )
        })}
      </nav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', minWidth: 0 }}>
        {isStaff ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...glass, borderRadius: 30, minHeight: 36, padding: '4px 14px' }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--t15)', boxShadow: '0 0 8px var(--t15)', animation: 'holo-status-pulse 2s infinite' }} />
            <span style={{ fontSize: 16, color: 'var(--t19)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>{user?.name ?? 'מורה'} מחובר</span>
          </div>
        ) : (
          /* יוצר אנונימי — יצירה חופשית; ההדמיות נשמרות בדפדפן ועוברות לחשבון בהרשמה */
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ ...glass, borderRadius: 30, padding: '8px 14px', fontSize: 16, color: 'var(--t6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flexShrink: 1 }}>מצב ניסיון — נשמר בדפדפן זה</span>
            <button type="button" data-tu-press onClick={() => navigate('/staff/login')} style={{ minHeight: TARGET, padding: '0 18px', borderRadius: 12, cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--t-on-accent)', background: 'linear-gradient(120deg,var(--t15),var(--t14))', border: 'none' }}>התחברות / הרשמה</button>
          </div>
        )}
        <BarButton onClick={() => window.HoloTheme?.toggle()} label={light ? 'מצב כהה' : 'מצב בהיר'} icon={<BrandIcon name={light ? 'moon' : 'sun'} size={16} />} />
        <BarButton onClick={toggleMuted} label={muted ? 'הפעל סאונד' : 'השתק סאונד'} icon={<BrandIcon name={muted ? 'speakerOff' : 'speaker'} size={16} />} />
        {isStaff && (
          <BarButton tone="danger" onClick={() => { logout(); navigate('/') }} label="יציאה"
            icon={<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'rotate(180deg)' }}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>} />
        )}
      </div>
    </header>
  )
}
