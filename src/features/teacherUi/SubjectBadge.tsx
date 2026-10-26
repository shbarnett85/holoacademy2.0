/* תג/נקודת מקצוע (עיקרון 11): לכל מקצוע צבע ואייקון קבועים בכל המערכת (shared/lib/subjectStyle.ts).
   הצבע לעולם לא לבד — תמיד אייקון + שם המקצוע, יחד. code=null → "לא סווג". */
import { Link } from 'react-router-dom'
import { useSubjectStyle } from '../../shared/lib/subjectStyle'
import { Icon } from './icons'
import { FONT, MIN_TARGET, RADIUS, T } from './tokens'

interface SubjectProps {
  /** קוד המקצוע (SubjectCode), או null/לא מוכר = "לא סווג" */
  code: string | null | undefined
}

/* כדור קטן עם האייקון, מוקף בצבע המקצוע (color-mix: אם הדפדפן לא תומך — נשאר רק הגבול, שגם הוא נושא את הצבע) */
function Orb({ color, icon, size }: { color: string; icon: string; size: number }) {
  return (
    <span aria-hidden="true" style={{
      display: 'inline-grid', placeItems: 'center', width: size, height: size, borderRadius: '50%', flexShrink: 0,
      border: `2px solid ${color}`, background: `color-mix(in srgb, ${color} 16%, transparent)`, fontSize: Math.max(16, Math.round(size * 0.56)), lineHeight: 1,
    }}>{icon}</span>
  )
}

/** תג מקצוע ממוסגר: [אייקון] שם. לכותרות, כרטיסים ורשימות. */
export function SubjectBadge({ code }: SubjectProps) {
  const s = useSubjectStyle(code)
  return (
    <span data-subject={code ?? 'unclassified'} style={{
      display: 'inline-flex', alignItems: 'center', gap: 8, padding: '3px 12px 3px 4px', borderRadius: 20,
      border: `1.5px solid ${s.color}`, fontFamily: FONT, fontSize: 16, fontWeight: 700, color: T.text, whiteSpace: 'nowrap', lineHeight: 1.4,
    }}>
      <Orb color={s.color} icon={s.icon} size={28} />
      <span>{s.label}</span>
    </span>
  )
}

/** נקודת מקצוע לא-ממוסגרת: [אייקון] שם. לטבלאות ולמקרא גרפים — השם תמיד מוצג לידה. */
export function SubjectDot({ code }: SubjectProps) {
  const s = useSubjectStyle(code)
  return (
    <span data-subject={code ?? 'unclassified'} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FONT, fontSize: 16, fontWeight: 600, color: T.text, whiteSpace: 'nowrap' }}>
      <Orb color={s.color} icon={s.icon} size={26} />
      <span>{s.label}</span>
    </span>
  )
}

interface SubjectLinkButtonProps extends SubjectProps {
  /** יעד הניווט (קישור אמיתי) */
  to: string
  /** שם המקצוע להצגה; בלעדיו — השם הקבוע מ-subjectStyle */
  label?: string
  /** חץ "הלאה" בסוף הכפתור (ברירת מחדל: יש) */
  chevron?: boolean
}

/** כפתור מקצוע: [אייקון] שם — קישור אמיתי, תג מקצוע בגובה 44px לפחות (קיצור דרך אל המקצוע, או שם מקצוע בטבלה). */
export function SubjectLinkButton({ code, to, label, chevron = true }: SubjectLinkButtonProps) {
  const s = useSubjectStyle(code)
  return (
    <Link to={to} data-tu-press data-subject={code ?? 'unclassified'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: MIN_TARGET, padding: '0 12px 0 8px', borderRadius: RADIUS.lg,
        border: `2px solid ${s.color}`, background: T.surface, fontFamily: FONT, fontSize: 16, fontWeight: 800, color: T.accentStrong,
        whiteSpace: 'nowrap', lineHeight: 1.3, textDecoration: 'none', cursor: 'pointer',
      }}>
      <Orb color={s.color} icon={s.icon} size={28} />
      <span style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>{label ?? s.label}</span>
      {chevron && <Icon name="chevLeft" size={16} />}
    </Link>
  )
}
