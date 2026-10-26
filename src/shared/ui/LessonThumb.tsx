/* ──────────────────────────────────────────────────────────────────────────
   LessonThumb — תמונת השיעור במסגרת בצבע המקצוע (CLAUDE.md "שפה חזותית של מקצועות"). משמשת את כרטיס השיעור
   (`LessonCard`: תלמיד, ספריית המורה) ואת הרשימות הקטנות ("סיכום שיעור").
   · התמונה היא התמונה הממוזערת (480×360) ולא תמונת הסצנה בגודל מלא; נטענת רק כשהיא נכנסת למסך (lazy).
   · מסגרת בצבע המקצוע; תגית המקצוע (שם המקצוע על הצבע) בפינה — כך הצבע אף פעם לא לבד. "לא סווג" = אפור + "לא סווג".
   · שיעור בלי תמונה (או שהתמונה לא נטענה): משטח בצבע המקצוע ועליו שם המקצוע — ואז אין תגית נפרדת (השם כבר כתוב).
   · tag="none": רק כשהשם כתוב ליד התמונה בטקסט (למשל ראש מסך שבו שם המקצוע כבר מופיע) ובתמונה קטנה מדי לתגית.
   · mode: 'auto' = לפי ערכת המורה הפעילה (בהיר כברירת מחדל); 'dark' = מסכי תלמיד (תמיד כהים).
   · children — שכבת תוכן מעל התמונה; פונקציה מקבלת `{ hasImage }` כדי להסתיר מה שמיותר כשהמשטח הוא צבע המקצוע.
   ────────────────────────────────────────────────────────────────────────── */
import { useState, type CSSProperties, type ReactNode } from 'react'
import { subjectTagColors, subjectVisual, type SubjectVisualMode } from '../lib/subjects'
import { useTheme } from '../lib/useTheme'
import SubjectTag from './SubjectTag'

export interface LessonThumbProps {
  url?: string | null
  subjectCode: string | null | undefined
  mode?: 'auto' | SubjectVisualMode
  width?: number | string
  height?: number | string
  radius?: number
  /** עובי המסגרת בפיקסלים (0 = בלי מסגרת — כשהמסגרת היא של הכרטיס כולו) */
  frame?: number
  /** תגית המקצוע על התמונה; 'none' רק כשהשם כתוב ליד התמונה */
  tag?: 'overlay' | 'none'
  /** תיאור התמונה; ריק = דקורטיבית (השם כתוב ליד) */
  alt?: string
  style?: CSSProperties
  children?: ReactNode | ((s: { hasImage: boolean }) => ReactNode)
}

/* משטח מאחורי התמונה: כמו הרקע הרגיל של כל מצב */
const SURFACE: Record<SubjectVisualMode, string> = { light: '#ffffff', dark: '#0b1220' }

export default function LessonThumb({ url, subjectCode, mode = 'auto', width = 88, height = 66, radius = 12, frame = 3, tag = 'overlay', alt = '', style, children }: LessonThumbProps) {
  const light = useTheme()
  const resolved: SubjectVisualMode = mode === 'auto' ? (light ? 'light' : 'dark') : mode
  const v = subjectVisual(subjectCode, resolved)
  const c = subjectTagColors(subjectCode, resolved)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const hasImage = !!url && failedUrl !== url

  /* גודל השם על המשטח הריק: קטן בתמונות קטנות (14px לפחות), גדול בכרטיס */
  const narrow = typeof width === 'number' && width < 120
  const nameSize = narrow ? 14 : 20

  return (
    <div data-lesson-thumb data-subject={v.code} data-has-image={hasImage ? 'true' : 'false'} style={{
      position: 'relative', width, height, flexShrink: 0, boxSizing: 'border-box', overflow: 'hidden', borderRadius: radius,
      border: frame > 0 ? `${frame}px solid ${v.color}` : 'none',
      background: hasImage ? SURFACE[resolved] : v.color,
      ...style,
    }}>
      {hasImage ? (
        <img src={url!} alt={alt} loading="lazy" decoding="async" onError={() => setFailedUrl(url!)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <span data-thumb-name style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: narrow ? 4 : 12, textAlign: 'center',
          fontFamily: 'var(--font-display)', fontSize: nameSize, fontWeight: 800, lineHeight: 1.25, color: c.fg, overflowWrap: 'anywhere',
        }}>{c.label}</span>
      )}
      {hasImage && tag === 'overlay' && (
        <span style={{ position: 'absolute', zIndex: 2, top: 8, insetInlineStart: 8, maxWidth: 'calc(100% - 16px)', display: 'inline-flex' }}>
          <SubjectTag code={subjectCode} mode={resolved} size={narrow ? 'sm' : 'md'} />
        </span>
      )}
      {typeof children === 'function' ? children({ hasImage }) : children}
    </div>
  )
}
