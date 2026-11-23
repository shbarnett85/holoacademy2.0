import { useNavigate } from 'react-router-dom'
import { useStaffAuth } from '../../shared/hooks/useStaffAuth'
import BrandIcon from '../../shared/ui/BrandIcon'
import BrandLogo from '../../shared/ui/BrandLogo'
import { checkNavGuard } from '../../shared/lib/navGuard'
import { useSoundSettings } from '../../shared/lib/sound'
import { withGuestLens } from '../teacherUi/guestLens'

export type TabId = 'create' | 'library' | 'results' | 'analytics' | 'students'

const TABS: { id: TabId; label: string; to: string }[] = [
  { id: 'create', label: 'שיעור חדש', to: '/creator' },
  { id: 'library', label: 'ספריית שיעורים', to: '/creator/library' },
  { id: 'results', label: 'סיכום שיעור', to: '/results' },
  { id: 'analytics', label: 'התקדמות', to: '/analytics' },
  { id: 'students', label: 'כיתות ותלמידים', to: '/manage/students' },
]

/* כותרת הסרגל העליון לפי הטאב הפעיל */
const TITLES: Record<TabId, string> = {
  create: 'יוצר השיעורים',
  library: 'ספריית שיעורים',
  results: 'סיכום שיעור',
  analytics: 'התקדמות',
  students: 'כיתות ותלמידים',
}

/* מורה אורח: העדשה שבחר (מחנך/ת | מורה מקצועי/ת | מנהל/ת + מקצוע) נשמרת במעבר בין תוצאות ↔ אנליטיקה — מצרפים אותה לכתובת.
   לכל משתמש אחר, ולטאבים האחרים, הכתובת נשארת כמות שהיא. */
const tabHref = (t: { id: TabId; to: string }): string => (t.id === 'results' || t.id === 'analytics' ? withGuestLens(t.to) : t.to)

/* עקרונות ממשק למסכי מורה: אזור לחיצה ≥44px, כפתור נושא מילה (לא אייקון בלבד), גוף טקסט 16px */
const TARGET = 44

function BarButton({ icon, label, onClick, pressed }: { icon: React.ReactNode; label: string; onClick: () => void; pressed?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={pressed} className="holo-button holo-button--staff holo-button--sm"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: TARGET, padding: '0 12px', fontFamily: 'var(--font-display)', fontSize: 16, whiteSpace: 'nowrap' }}>
      {icon}
      {label}
    </button>
  )
}

/* סרגל עליון משותף למסכי המורה והמנהל: פס ברקע "המכונה" עם טקסט בדיו.
   הלשוניות הן כפתורים בתכלת, והפעילה ברקע דיו עם טקסט לבן; שם המורה והאווטאר באפרסק; כפתורי הפעולה בתכלת. */
export default function StudioTopBar({ active }: { active: TabId }) {
  const navigate = useNavigate()
  const { logout, user, isStaff } = useStaffAuth()
  const { muted, toggleMuted } = useSoundSettings()

  /* "סיכום שיעור" לכל הצוות המחובר: מורה — הרשימה; מנהל בית ספר/רשות — טבלה כללית אחת (שכבה × מקצוע), בלי תוצאות ברמת תלמיד. האנונימי לא מחובר */
  const showResults = isStaff
  const tabs = TABS.filter((t) => t.id !== 'results' || showResults || active === 'results')

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

  const teacherName = user?.name ?? 'מורה'
  return (
    <header data-studio-shell data-teacher-ui style={{
      position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '6px 24px', flexWrap: 'wrap',
      background: 'var(--color-machine)', color: 'var(--color-ink)', borderBottom: 'var(--border-staff)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* האייקון של הלוגו באריח לבן (הלוגו לא מוצג ישר על הפס הסגול); השוליים של האריח הם השטח הנקי שלו */}
        <span aria-hidden="true" data-brand-tile style={{ display: 'grid', placeItems: 'center', width: 44, height: 44, flex: 'none', borderRadius: 12, background: 'var(--color-surface)', border: 'var(--border-staff)' }}>
          <BrandLogo variant="mark" height={26} clear={false} />
        </span>
        <div>
          <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--color-ink)' }}>{TITLES[active]}</div>
          {/* שם המותג — 16px (עיקרון 7: גוף טקסט 16px לפחות). על רקע "המכונה" רק דיו עובר ניגודיות */}
          <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '.04em', color: 'var(--color-ink)', marginTop: 1 }}>HoloAcademy</div>
        </div>
      </div>
      <nav aria-label="ניווט ראשי" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {tabs.map((t) => {
          const isActive = t.id === active
          return (
            <button key={t.id} type="button" aria-current={isActive ? 'page' : undefined} onClick={() => !isActive && navTab(tabHref(t))}
              /* כפתור בתכלת על הפס הסגול; הלשונית הפעילה ברקע דיו עם טקסט לבן ובמשקל כבד (לא בצבע בלבד) */
              className={`holo-button holo-button--staff${isActive ? ' is-selected' : ''}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, minHeight: TARGET, padding: '0 14px', cursor: isActive ? 'default' : 'pointer',
                fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: isActive ? 800 : 600, whiteSpace: 'nowrap',
              }}>
              {t.label}
            </button>
          )
        })}
      </nav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', minWidth: 0 }}>
        {isStaff ? (
          <div data-staff-chip style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 36, padding: '3px 14px 3px 4px', borderRadius: 30, background: 'var(--color-human-soft)', border: 'var(--border-staff)', color: 'var(--color-ink)' }}>
            <span aria-hidden="true" style={{ display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: '50%', background: 'var(--color-human)', border: '2px solid var(--color-ink)', fontSize: 15, fontWeight: 900 }}>{teacherName.charAt(0)}</span>
            <span style={{ fontSize: 16, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>{teacherName} מחובר</span>
          </div>
        ) : (
          /* יוצר אנונימי — יצירה חופשית; ההדמיות נשמרות בדפדפן ועוברות לחשבון בהרשמה */
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ borderRadius: 30, padding: '8px 14px', fontSize: 16, color: 'var(--color-ink)', background: 'var(--color-surface)', border: 'var(--border-staff)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flexShrink: 1 }}>מצב ניסיון — נשמר בדפדפן זה</span>
            <button type="button" onClick={() => navigate('/staff/login')} className="holo-button holo-button--staff" style={{ minHeight: TARGET, padding: '0 18px', fontFamily: 'var(--font-display)', fontSize: 16, whiteSpace: 'nowrap' }}>התחברות / הרשמה</button>
          </div>
        )}
        <BarButton onClick={toggleMuted} pressed={muted} label={muted ? 'הפעל סאונד' : 'השתק סאונד'} icon={<BrandIcon name={muted ? 'speakerOff' : 'speaker'} size={16} />} />
        {isStaff && (
          <BarButton onClick={() => { logout(); navigate('/') }} label="יציאה"
            icon={<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'rotate(180deg)' }}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>} />
        )}
      </div>
    </header>
  )
}
