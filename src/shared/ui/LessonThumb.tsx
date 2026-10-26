/* ──────────────────────────────────────────────────────────────────────────
   LessonThumb — רכיב אחד לשיעור בכל רשימה: ספריית המורה, "סיכום שיעור", ורשימת השיעורים של התלמיד
   (CLAUDE.md "שפה חזותית של מקצועות"). תמונת השיעור במסגרת בצבע המקצוע, וסמל המקצוע בפינה.
   · הצבע והסמל ממקור אחד — `subjectVisual` (shared/lib/subjects.ts); "לא סווג" = אפור.
   · צבע לעולם לא לבד: הסמל תמיד בפינה, והשם נגיש ל-AT (`aria-label`) ול-title.
   · mode: 'auto' = לפי ערכת המורה הפעילה (בהיר כברירת מחדל); 'dark' = מסכי תלמיד (תמיד כהים).
   · children — שכבת תוכן מעל התמונה (כרטיס התלמיד: תגיות וכותרת).
   ────────────────────────────────────────────────────────────────────────── */
import { useState, type CSSProperties, type ReactNode } from 'react'
import { subjectVisual, type SubjectVisualMode } from '../lib/subjects'
import { useTheme } from '../lib/useTheme'

export type LessonThumbCorner = 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end'

export interface LessonThumbProps {
  url?: string | null
  subjectCode: string | null | undefined
  mode?: 'auto' | SubjectVisualMode
  width?: number | string
  height?: number | string
  radius?: number
  /** עובי המסגרת בפיקסלים */
  frame?: number
  /** פינת הסמל. בכרטיס התלמיד "top-start" הוא ימין־למעלה (RTL) */
  corner?: LessonThumbCorner
  chipSize?: number
  /** תיאור התמונה; ריק = דקורטיבית (השם כתוב ליד) */
  alt?: string
  style?: CSSProperties
  children?: ReactNode
}

/* משטח השבב: בהיר/כהה כמו הרקע הרגיל של כל מצב */
const CHIP_SURFACE: Record<SubjectVisualMode, string> = { light: '#ffffff', dark: '#0b1220' }

/* בשבב ובמסגרת: אותו צבע; ב-hover/focus מוסיפים הילה בלבד */
export default function LessonThumb({ url, subjectCode, mode = 'auto', width = 88, height = 66, radius = 12, frame = 3, corner = 'top-start', chipSize, alt = '', style, children }: LessonThumbProps) {
  const light = useTheme()
  const resolved: SubjectVisualMode = mode === 'auto' ? (light ? 'light' : 'dark') : mode
  const v = subjectVisual(subjectCode, resolved)
  const [failed, setFailed] = useState(false)
  const showImg = !!url && !failed

  const minSide = typeof width === 'number' && typeof height === 'number' ? Math.min(width, height) : 72
  const chip = chipSize ?? Math.max(26, Math.min(32, Math.round(minSide * 0.36)))
  const inset = Math.max(3, Math.round(frame))
  const place: CSSProperties = {
    ...(corner.startsWith('top') ? { top: inset } : { bottom: inset }),
    ...(corner.endsWith('start') ? { insetInlineStart: inset } : { insetInlineEnd: inset }),
  }

  return (
    <div data-lesson-thumb data-subject={v.code} style={{
      position: 'relative', width, height, flexShrink: 0, boxSizing: 'border-box', overflow: 'hidden', borderRadius: radius,
      border: `${frame}px solid ${v.color}`,
      background: showImg ? CHIP_SURFACE[resolved] : `color-mix(in srgb, ${v.color} 14%, ${CHIP_SURFACE[resolved]})`,
      ...style,
    }}>
      {showImg ? (
        <img src={url!} alt={alt} loading="lazy" onError={() => setFailed(true)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke={v.color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
          style={{ position: 'absolute', inset: 0, margin: 'auto', width: '42%', height: '42%', maxWidth: 64, maxHeight: 64, opacity: 0.85 }}>
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
      )}
      {children}
      <span role="img" aria-label={v.label} title={v.label} style={{
        position: 'absolute', ...place, zIndex: 2, width: chip, height: chip, borderRadius: '50%', display: 'grid', placeItems: 'center',
        background: CHIP_SURFACE[resolved], border: `2px solid ${v.color}`, fontSize: Math.max(16, Math.round(chip * 0.56)), lineHeight: 1, boxSizing: 'border-box',
      }}>{v.glyph}</span>
    </div>
  )
}
