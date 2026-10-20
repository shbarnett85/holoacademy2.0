import { lazy, Suspense, useEffect, useState } from 'react'
import ProgressLens from './ProgressLens'
import ChallengeTypesPanel from './ChallengeTypesPanel'
import { ScreenShell } from '../teacherUi'
import { useStaffAuth } from '../../shared/hooks/useStaffAuth'
import { apiJson } from '../../shared/lib/api'

const AnalyticsV2App = lazy(() => import('../analyticsV2/AnalyticsV2App'))

/* select הולוגרפי — משותף לפיינים */
export function HoloSelect({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: { v: string; label: string }[]; placeholder: string }) {
  return (
    <div style={{ position: 'relative', flex: '0 0 auto' }}>
      <select aria-label={placeholder} value={value} onChange={(e) => onChange(e.target.value)}
        style={{ appearance: 'none', WebkitAppearance: 'none', background: 'var(--t57)', border: '1px solid var(--t81)', borderRadius: 9, color: value ? 'var(--t68)' : 'var(--t82)', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, padding: '8px 30px 8px 14px', cursor: 'pointer', outline: 'none', minWidth: 110 }}>
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
      </select>
      <div style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--t15)', fontSize: 10 }}>▾</div>
    </div>
  )
}

/* האנליטיקה הקיימת (משתמשים אמיתיים, בלי נתוני הדגמה): ההתקדמות לאורך זמן + "ביצועים לפי סוג אתגר".
   רשימת השיעורים ומסך ההדמיה עברו לטאב "תוצאות" (src/features/results) — אין כאן כפילות.
   עמודה אחת; הסקופ מהשרת (הרשאה A להתקדמות). */
function LegacyAnalyticsPanel() {
  const { isGuest } = useStaffAuth()
  return (
    <ScreenShell active="analytics" title="איך התלמידים מתקדמים לאורך זמן?" breadcrumb={[{ label: 'אנליטיקה' }]}>
      <style>{`select option { background: var(--t75); color: var(--t68); }`}</style>
      {/* מצב הדגמה — סימון שהנתונים סינתטיים (כיתת דמו וירטואלית) */}
      {isGuest && (
        <p style={{ margin: 0, alignSelf: 'flex-start', fontSize: 14, fontWeight: 600, padding: '4px 12px', borderRadius: 9, background: 'var(--t106)', border: '1px solid var(--t107)', color: 'var(--t105)' }}>
          🎬 נתוני הדגמה — כיתה וירטואלית להתרשמות; בחשבון אמיתי תראו כאן את התלמידים שלכם
        </p>
      )}
      <div style={{ width: '100%', maxWidth: 1100, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <ProgressLens />
        <ChallengeTypesPanel />
      </div>
    </ScreenShell>
  )
}

/* האנליטיקה החדשה (analyticsV2) מוצגת רק כשהשרת מדליק את הדגל (מורה אורח / ארגון הדגמה).
   כל משתמש אחר ממשיך במסכים הקיימים; כל כשל בבדיקת הדגל = המסכים הקיימים. */
export default function AnalyticsPanel() {
  const [flag, setFlag] = useState<'loading' | 'on' | 'off'>('loading')
  useEffect(() => {
    let cancelled = false
    apiJson<{ data?: { enabled?: boolean } }>('/api/analytics-v2/config')
      .then((r) => { if (!cancelled) setFlag(r.data?.enabled === true ? 'on' : 'off') })
      .catch(() => { if (!cancelled) setFlag('off') })
    return () => { cancelled = true }
  }, [])
  if (flag === 'loading') return <div role="status" style={{ minHeight: '100vh', background: 'var(--t-studio-bg)' }} />
  if (flag === 'on') return <Suspense fallback={<div role="status" style={{ minHeight: '100vh', background: 'var(--t-studio-bg)' }} />}><AnalyticsV2App /></Suspense>
  return <LegacyAnalyticsPanel />
}
