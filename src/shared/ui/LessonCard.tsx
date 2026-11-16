/* ──────────────────────────────────────────────────────────────────────────
   LessonCard — כרטיס השיעור בספריית המורה (הספרייה שלי + הציבורית), בכל מקום ובמראה זהה (CLAUDE.md "שפה חזותית של מקצועות").
   אצל התלמיד השיעורים מוצגים בפורטל וברשימה שמתחתיו (features/player/StudentHome.tsx), לא בכרטיס הזה.
   · תמונת השיעור (הממוזערת, lazy) במסגרת הכרטיס בצבע המקצוע; מעליה תגית המקצוע (שם המקצוע על הצבע) ותגית השכבות.
   · שיעור "לא סווג": מסגרת אפורה ותגית "לא סווג". שיעור בלי תמונה: משטח בצבע המקצוע ועליו שם המקצוע.
   · כותרת השיעור מתחת לתמונה; מתחתיה `body` (שבבי מידע) ו-`actions` — אצל התלמיד הכפתור "שחקו", אצל המורה פעולות המורה.
   · mode: 'dark' = מסכי תלמיד (קו עבה וצל גדול); 'auto' = מסכי המורה (קו וצל שקטים יותר). הצבעים זהים: משטח לבן, מסגרת בדיו.
   · צבע המקצוע: פס מתחת לתמונה ותגית עם שם המקצוע. "לא סווג": מסגרת מקווקוות ותגית "לא סווג".
   ────────────────────────────────────────────────────────────────────────── */
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import { gradeLayersLabel } from '../lib/lessonGrade'
import { subjectVisual, type SubjectVisualMode } from '../lib/subjects'
import LessonThumb from './LessonThumb'
import SubjectTag from './SubjectTag'

export interface LessonCardProps {
  title: string
  subjectCode: string | null | undefined
  thumbUrl?: string | null
  gradeMin?: number | null
  gradeMax?: number | null
  mode?: 'auto' | SubjectVisualMode
  /** תגיות מצב (חדש / הושלם / משותף…) — שורה מתחת לתגיות המקצוע והשכבות, מעל התמונה */
  badges?: ReactNode
  /** שורת מידע מתחת לכותרת (שבבים, תאריך הגשה, מי יצר) */
  body?: ReactNode
  /** שורת הפעולות בתחתית הכרטיס: "שחקו" אצל התלמיד; פעולות המורה בספרייה */
  actions?: ReactNode
  onClick?: () => void
  /** הילה סביב הכרטיס (hover) */
  glow?: boolean
  /** תג קריאת מסך לכרטיס */
  ariaLabel?: string
  /** גובה אזור התמונה כיחס רוחב:גובה */
  imageAspect?: string
  style?: CSSProperties
}

export default function LessonCard({ title, subjectCode, thumbUrl, gradeMin, gradeMax, mode = 'auto', badges, body, actions, onClick, glow, ariaLabel, imageAspect = '16 / 10', style }: LessonCardProps) {
  /* mode="dark" = מסכי התלמיד (קו 3px וצל 6px); אחרת מסכי המורה (קו 2px וצל 3px). הצבעים זהים בשניהם */
  const student = mode === 'dark'
  const resolved: SubjectVisualMode = student ? 'dark' : 'light'
  const v = subjectVisual(subjectCode)
  const lineWidth = student ? 3 : 2
  const grades = gradeLayersLabel(gradeMin, gradeMax)
  const clickable = !!onClick
  const onKey = (e: KeyboardEvent<HTMLElement>): void => {
    if (!clickable || e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.() }
  }

  return (
    <article data-lesson-card data-subject={v.code} aria-label={ariaLabel ?? title}
      role={clickable ? 'link' : undefined} tabIndex={clickable ? 0 : undefined} onClick={onClick} onKeyDown={onKey}
      style={{
        display: 'flex', flexDirection: 'column', flex: '1 1 auto', boxSizing: 'border-box', minWidth: 0, overflow: 'hidden',
        borderRadius: student ? 16 : 12, background: 'var(--color-surface)', color: 'var(--color-ink)',
        /* מסגרת בדיו; "לא סווג" מובחן במסגרת מקווקוות (ובתגית) */
        border: `${lineWidth}px ${v.code === 'unclassified' ? 'dashed' : 'solid'} var(--color-ink)`,
        boxShadow: student ? 'var(--shadow-student)' : 'var(--shadow-staff)',
        cursor: clickable ? 'pointer' : 'default', transition: 'transform .16s',
        transform: glow && clickable ? 'translate(-2px, -2px)' : 'none',
        /* עשרות כרטיסים: לא מציירים את מה שמחוץ למסך (הגובה המשוער שומר על פס הגלילה יציב) */
        contentVisibility: 'auto', containIntrinsicSize: 'auto 340px',
        ...style,
      }}>
      <div style={{ position: 'relative', aspectRatio: imageAspect, flex: '0 0 auto' }}>
        <LessonThumb url={thumbUrl} subjectCode={subjectCode} mode={resolved} width="100%" height="100%" radius={0} frame={0} tag="none" alt="">
          {({ hasImage }) => (
            <div style={{ position: 'absolute', zIndex: 2, top: 8, insetInline: 8, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, pointerEvents: 'none' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, maxWidth: '100%' }}>
                {hasImage && <SubjectTag code={subjectCode} mode={resolved} />}
                {grades && (
                  <span data-grade-tag style={{
                    display: 'inline-flex', alignItems: 'center', padding: '3px 12px', borderRadius: 999, boxSizing: 'border-box',
                    fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, lineHeight: 1.35, whiteSpace: 'nowrap',
                    background: 'var(--color-surface)', color: 'var(--color-ink)', border: '2px solid var(--color-ink)',
                  }}>{grades}</span>
                )}
              </div>
              {badges && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, pointerEvents: 'auto' }}>{badges}</div>}
            </div>
          )}
        </LessonThumb>
      </div>
      {/* פס בצבע המקצוע: הצבע לעולם לא לבד, שם המקצוע כתוב בתגית שמעל התמונה */}
      <div data-subject-stripe aria-hidden="true" style={{ flex: '0 0 auto', height: 10, background: v.color, borderBlock: `${lineWidth}px solid var(--color-ink)` }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px 12px', flex: 1, minHeight: 0 }}>
        <h3 data-lesson-title style={{
          margin: 0, fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 800, lineHeight: 1.35, color: 'var(--color-ink)',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere',
        }} title={title}>{title}</h3>
        {body}
        {actions && <div style={{ marginTop: 'auto' }}>{actions}</div>}
      </div>
    </article>
  )
}
