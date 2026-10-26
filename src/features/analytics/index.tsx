import { lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import ProgressLens from './ProgressLens'
import ChallengeTypesPanel from './ChallengeTypesPanel'
import { FONT, MIN_TARGET, RADIUS, ScreenShell, T } from '../teacherUi'
import { useStaffAuth } from '../../shared/hooks/useStaffAuth'
import { V2_CLIENT_TEXT } from '../../shared/lib/findingsNarrative'

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

/* התצוגה הקודמת: ההתקדמות לאורך זמן + "ביצועים לפי סוג אתגר" (גרף ההתקדמות הכללי).
   רשימת השיעורים ומסך ההדמיה עברו לטאב "תוצאות" (src/features/results) — אין כאן כפילות.
   עמודה אחת; הסקופ מהשרת (הרשאה A להתקדמות).
   מוצגת באחד משלושה מקרים: (א) מתג הכיבוי של האנליטיקה החדשה (config.enabled=false), (ב) מורה אמיתי שבחר "התצוגה הקודמת" במסך הכניסה —
   ואז backTo הוא נתיב חזרה גלוי לתצוגה החדשה, (ג) התצורה של האנליטיקה החדשה לא נטענה אצל מורה אמיתי — ואז notice הוא ההסבר עם "נסו שוב". */
function LegacyAnalyticsPanel({ backTo, notice }: { backTo?: string; notice?: ReactNode }) {
  const { isGuest } = useStaffAuth()
  const breadcrumb = backTo
    ? [{ label: 'התקדמות', to: backTo }, { label: V2_CLIENT_TEXT.previous.crumb }]
    : [{ label: 'התקדמות' }]
  return (
    <ScreenShell active="analytics" title="איך התלמידים מתקדמים לאורך זמן?" breadcrumb={breadcrumb}>
      <style>{`select option { background: var(--t75); color: var(--t68); }`}</style>
      {notice}
      {/* נפתח בבחירה מפורשת ("התצוגה הקודמת"): הערת הקשר בראש המסך — מה זה ושהוא זמני. המסך עצמו לא שונה */}
      {backTo && (
        <p data-previous-view-notice style={{ margin: 0, alignSelf: 'stretch', maxWidth: 1100, padding: '10px 14px', borderRadius: RADIUS.md, background: T.surface, border: `1px solid ${T.border}`, borderInlineStart: `6px solid ${T.accent}`, fontFamily: FONT, fontSize: 16, lineHeight: 1.5, color: T.text }}>
          {V2_CLIENT_TEXT.previous.notice}
        </p>
      )}
      {backTo && (
        <div style={{ alignSelf: 'flex-start' }}>
          <Link to={backTo} data-tu-press
            style={{ display: 'inline-flex', alignItems: 'center', minHeight: MIN_TARGET, padding: '0 18px', borderRadius: RADIUS.md, fontFamily: FONT, fontSize: 16, fontWeight: 800, textDecoration: 'none', color: T.text, background: T.surface, border: `2px solid ${T.controlBorder}` }}>
            {V2_CLIENT_TEXT.previous.backToNew}
          </Link>
        </div>
      )}
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

/* האנליטיקה (analyticsV2) היא המסך של כל המורים והמנהלים. AnalyticsV2App טוען את התצורה פעם אחת ומחליט:
   מתג כיבוי → התצוגה הקודמת (או /admin למנהל-על); "התצוגה הקודמת" מבקשת-במפורש (?view=previous) של מורה אמיתי → גם היא. */
const Loading = () => <div role="status" style={{ minHeight: '100vh', background: 'var(--t-studio-bg)' }} />

export default function AnalyticsPanel() {
  return <Suspense fallback={<Loading />}><AnalyticsV2App Legacy={LegacyAnalyticsPanel} /></Suspense>
}
