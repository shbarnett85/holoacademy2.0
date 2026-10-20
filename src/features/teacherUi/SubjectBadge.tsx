/* תג/נקודת מקצוע (עיקרון 11): לכל מקצוע צבע ואייקון קבועים בכל המערכת (shared/lib/subjectStyle.ts).
   הצבע לעולם לא לבד — תמיד אייקון + שם המקצוע, יחד. code=null → "לא סווג". */
import { subjectStyle } from '../../shared/lib/subjectStyle'
import { FONT, SMALL, T } from './tokens'

interface SubjectProps {
  /** קוד המקצוע (SubjectCode), או null/לא מוכר = "לא סווג" */
  code: string | null | undefined
}

/* כדור קטן עם האייקון, מוקף בצבע המקצוע (color-mix: אם הדפדפן לא תומך — נשאר רק הגבול, שגם הוא נושא את הצבע) */
function Orb({ color, icon, size }: { color: string; icon: string; size: number }) {
  return (
    <span aria-hidden="true" style={{
      display: 'inline-grid', placeItems: 'center', width: size, height: size, borderRadius: '50%', flexShrink: 0,
      border: `2px solid ${color}`, background: `color-mix(in srgb, ${color} 16%, transparent)`, fontSize: Math.max(14, Math.round(size * 0.56)), lineHeight: 1,
    }}>{icon}</span>
  )
}

/** תג מקצוע ממוסגר: [אייקון] שם. לכותרות, כרטיסים ורשימות. */
export function SubjectBadge({ code }: SubjectProps) {
  const s = subjectStyle(code)
  return (
    <span data-subject={code ?? 'unclassified'} style={{
      display: 'inline-flex', alignItems: 'center', gap: 8, padding: '3px 12px 3px 4px', borderRadius: 20,
      border: `1.5px solid ${s.color}`, fontFamily: FONT, fontSize: SMALL, fontWeight: 700, color: T.text, whiteSpace: 'nowrap', lineHeight: 1.4,
    }}>
      <Orb color={s.color} icon={s.icon} size={28} />
      <span>{s.label}</span>
    </span>
  )
}

/** נקודת מקצוע לא-ממוסגרת: [אייקון] שם. לטבלאות ולמקרא גרפים — השם תמיד מוצג לידה. */
export function SubjectDot({ code }: SubjectProps) {
  const s = subjectStyle(code)
  return (
    <span data-subject={code ?? 'unclassified'} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FONT, fontSize: SMALL, fontWeight: 600, color: T.text, whiteSpace: 'nowrap' }}>
      <Orb color={s.color} icon={s.icon} size={26} />
      <span>{s.label}</span>
    </span>
  )
}
