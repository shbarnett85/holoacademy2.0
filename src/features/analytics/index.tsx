import StudioTopBar from '../creator/StudioTopBar'
import { micro } from '../creator/studioStyles'
import ProgressLens from './ProgressLens'
import LessonsPane from './LessonsPane'

/* שכבה = תווית הכיתה ללא מספר הכיתה בסוף (למשל "ז׳2" → "ז׳") */
export const layerOf = (gradeLabel: string) => gradeLabel.replace(/\s*\d+$/, '').trim() || gradeLabel

/* select הולוגרפי — משותף לפיינים */
export function HoloSelect({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: { v: string; label: string }[]; placeholder: string }) {
  return (
    <div style={{ position: 'relative', flex: '0 0 auto' }}>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ appearance: 'none', WebkitAppearance: 'none', background: 'rgba(4,9,18,.6)', border: '1px solid rgba(47,243,255,.22)', borderRadius: 9, color: value ? 'var(--holo-text-bright)' : '#5a7a99', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, padding: '8px 30px 8px 14px', cursor: 'pointer', outline: 'none', minWidth: 110 }}>
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
      </select>
      <div style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#2ff3ff', fontSize: 10 }}>▾</div>
    </div>
  )
}

/* מסך אנליטיקה — split כמו ספריית ההדמיות (ללא סאב-טאבים):
   ימין = סיכום שיעורים (אנליטיקת ההדמיות); שמאל = התקדמות (גרף רב-ישויות + drill-down).
   נערם אנכית במסך צר (flexWrap + flex-basis, לא 50/50 כפוי). הסקופ מהשרת (הרשאה A לשמאל, B/הקיים לימין). */
export default function AnalyticsPanel() {
  const pane: React.CSSProperties = { flex: '1 1 380px', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }
  return (
    <div dir="rtl" style={{ position: 'relative', minHeight: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-display)', background: 'var(--holo-bg-deep)' }}>
      <style>{`select option { background: #070a18; color: #eaf6ff; }`}</style>
      <div style={{ position: 'absolute', left: -120, top: -80, width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,69,230,.12), transparent 70%)', filter: 'blur(20px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', right: -120, bottom: -120, width: 460, height: 460, borderRadius: '50%', background: 'radial-gradient(circle, rgba(47,243,255,.12), transparent 70%)', filter: 'blur(20px)', pointerEvents: 'none' }} />

      <StudioTopBar active="analytics" />

      <div data-studio-content className="holo-tab-enter" style={{ position: 'relative', zIndex: 2, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '12px 24px 26px', width: '100%' }}>
        {/* split רספונסיבי — נערם אנכית במסך צר */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'stretch' }}>
          {/* ימין (DOM ראשון ב-RTL) — סיכום שיעורים */}
          <div style={pane}><LessonsPane /></div>
          {/* שמאל — התקדמות */}
          <div style={pane}>
            <div style={{ ...micro, fontSize: 9, color: 'rgba(47,243,255,.6)', flex: '0 0 auto' }}>📈 התקדמות</div>
            <ProgressLens />
          </div>
        </div>
      </div>
    </div>
  )
}
