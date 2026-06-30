import { useNavigate } from 'react-router-dom'
import { useStaffAuth } from '../../shared/hooks/useStaffAuth'
import { glass, micro } from './studioStyles'
import { checkNavGuard } from '../../shared/lib/navGuard'
import { useSoundSettings } from '../../shared/lib/sound'

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

  /* מעבר טאב: מנגן יציאה (holo-tab-out) על תוכן העמוד ואז מנווט; היעד נכנס עם holo-tab-in */
  function navTab(to: string) {
    if (!checkNavGuard()) return
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
    <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '20px 30px 8px', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
        <span style={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 12, background: 'rgba(47,243,255,.08)', border: '1px solid rgba(47,243,255,.35)', color: '#7ef6ff', boxShadow: '0 0 18px rgba(47,243,255,.3)' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
        </span>
        <div>
          <div style={{ fontSize: 19, fontWeight: 800, color: '#fff' }}>{TITLES[active]}</div>
          <div style={{ ...micro, marginTop: 1 }}>HOLOACADEMY · STUDIO</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, ...glass, borderRadius: 14, padding: 5, flexWrap: 'wrap' }}>
        {TABS.map((t) => {
          const isActive = t.id === active
          return (
            <button key={t.id} onClick={() => !isActive && navTab(t.to)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 11, cursor: isActive ? 'default' : 'pointer', fontFamily: 'var(--font-display)', fontSize: 13.5, fontWeight: 600, transition: 'all .18s', whiteSpace: 'nowrap', background: isActive ? 'linear-gradient(120deg, rgba(47,243,255,.2), rgba(255,69,230,.14))' : 'transparent', border: '1px solid ' + (isActive ? 'rgba(47,243,255,.5)' : 'transparent'), color: isActive ? '#fff' : '#8aa0b8', boxShadow: isActive ? '0 0 18px rgba(47,243,255,.2)' : 'none' }}>
              {t.label}
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...glass, borderRadius: 30, padding: '7px 14px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2ff3ff', boxShadow: '0 0 8px #2ff3ff', animation: 'holo-status-pulse 2s infinite' }} />
          <span style={{ fontSize: 12.5, color: '#bfe9ff', fontWeight: 500 }}>{user?.name ?? 'מורה'} מחובר</span>
        </div>
        <button onClick={toggleMuted} title={muted ? 'הפעל סאונד' : 'השתק סאונד'} aria-label={muted ? 'הפעל סאונד' : 'השתק סאונד'} aria-pressed={muted} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 10, cursor: 'pointer', fontSize: '1.05rem', background: 'rgba(47,243,255,.07)', border: '1px solid rgba(47,243,255,.25)', color: '#bfe9ff' }}>
          {muted ? '🔇' : '🔊'}
        </button>
        <button onClick={() => { logout(); navigate('/') }} title="יציאה" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 10, cursor: 'pointer', background: 'rgba(255,69,230,.07)', border: '1px solid rgba(255,69,230,.25)', color: 'rgba(255,150,230,.7)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'rotate(180deg)' }}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
        </button>
      </div>
    </div>
  )
}
