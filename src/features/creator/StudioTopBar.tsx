import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStaffAuth } from '../../shared/hooks/useStaffAuth'
import { glass, micro } from './studioStyles'
import { checkNavGuard } from '../../shared/lib/navGuard'
import { useSoundSettings } from '../../shared/lib/sound'
import ThemeToggle from '../../shared/ui/ThemeToggle'

type TabId = 'create' | 'library' | 'analytics' | 'students'

const TABS: { id: TabId; label: string; to: string }[] = [
  { id: 'create', label: 'צור הדמיה', to: '/creator' },
  { id: 'library', label: 'ספריית הדמיות', to: '/creator/library' },
  { id: 'analytics', label: 'אנליטיקה', to: '/analytics' },
  { id: 'students', label: 'תלמידים', to: '/manage/students' },
]

/* כותרת הסרגל העליון לפי הטאב הפעיל */
const TITLES: Record<TabId, string> = {
  create: 'יוצר ההדמיות',
  library: 'ספריית הדמיות',
  analytics: 'אנליטיקה',
  students: 'תלמידים',
}

/* סרגל עליון משותף לאולפן (לוגו + טאבים שמנווטים ב-router + סטטוס + יציאה) */
export default function StudioTopBar({ active }: { active: TabId }) {
  const navigate = useNavigate()
  const { logout, user } = useStaffAuth()
  const { muted, toggleMuted } = useSoundSettings()

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
    <div data-studio-shell style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '20px 30px 8px', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
        <span style={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 12, background: 'var(--t20)', border: '1px solid var(--t23)', color: 'var(--t1)', boxShadow: '0 0 18px var(--t21)' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
        </span>
        <div>
          <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--t13)' }}>{TITLES[active]}</div>
          <div style={{ ...micro, marginTop: 1 }}>HOLOACADEMY · STUDIO</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, ...glass, borderRadius: 14, padding: 5, flexWrap: 'wrap' }}>
        {TABS.map((t) => {
          const isActive = t.id === active
          return (
            <button key={t.id} onClick={() => !isActive && navTab(t.to)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 11, cursor: isActive ? 'default' : 'pointer', fontFamily: 'var(--font-display)', fontSize: 13.5, fontWeight: 600, transition: 'all .18s', whiteSpace: 'nowrap', background: isActive ? 'linear-gradient(120deg, var(--t88), var(--t96))' : 'transparent', border: '1px solid ' + (isActive ? 'var(--t77)' : 'transparent'), color: isActive ? 'var(--t-on-accent)' : 'var(--t6)', boxShadow: isActive ? '0 0 18px var(--t88)' : 'none' }}>
              {t.label}
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...glass, borderRadius: 30, padding: '7px 14px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--t15)', boxShadow: '0 0 8px var(--t15)', animation: 'holo-status-pulse 2s infinite' }} />
          <span style={{ fontSize: 12.5, color: 'var(--t19)', fontWeight: 500 }}>{user?.name ?? 'מורה'} מחובר</span>
        </div>
        <ThemeToggle />
        <button onClick={toggleMuted} title={muted ? 'הפעל סאונד' : 'השתק סאונד'} aria-label={muted ? 'הפעל סאונד' : 'השתק סאונד'} aria-pressed={muted} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 10, cursor: 'pointer', fontSize: '1.05rem', background: 'var(--t241)', border: '1px solid var(--t41)', color: 'var(--t19)' }}>
          {muted ? '🔇' : '🔊'}
        </button>
        <button onClick={() => { logout(); navigate('/') }} title="יציאה" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 10, cursor: 'pointer', background: 'var(--t242)', border: '1px solid var(--t231)', color: 'var(--t243)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'rotate(180deg)' }}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
        </button>
      </div>
    </div>
  )
}
