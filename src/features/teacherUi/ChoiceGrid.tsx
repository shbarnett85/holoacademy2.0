/* בחירה גדולה (למשל בורר כיתה): כפתורים גדולים עם תווית, ותג מספר במילים (לא מספר חשוף).
   BigChoiceButton יכול להיות קישור אמיתי (to) או כפתור (onClick). */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './icons'
import { FONT, RADIUS, T, TONE_META } from './tokens'
import type { Tone } from './tokens'

export interface ChoiceBadge {
  /** במילים: "3 תלמידים לתשומת לב" (attentionBadgeText) — לא רק מספר */
  text: string
  tone?: Tone
}

interface BigChoiceButtonProps {
  label: string
  /** שורה משנית: "24 תלמידים" */
  sublabel?: string
  badge?: ChoiceBadge
  /** אייקון/אימוג'י לפני התווית */
  icon?: ReactNode
  /** מצב נבחר (כשהבחירה נשארת על המסך) */
  selected?: boolean
  /** קישור ניווט. לא נדרש כש-onClick קיים */
  to?: string
  onClick?: () => void
  /** בלי מסגרת ורקע משלו — לכפתור שיושב בתוך כרטיס עוטף (למשל כרטיס כיתה עם קיצורי מקצועות מתחתיו) */
  flat?: boolean
  /** מילת פעולה גלויה בקצה שורת הכותרת ("לסקירת הכיתה") — עם קו תחתון וחץ, כדי שיהיה ברור שהכותרת לחיצה */
  actionLabel?: string
  /** שורת מידע קטנה ליד התת-כותרת (למשל תג תפקיד: "מחנך/ת") — מילים בלבד */
  meta?: ReactNode
}

const BADGE_ICON = { positive: 'check', attention: 'alert', error: 'alert', neutral: 'info' } as const

export function BigChoiceButton({ label, sublabel, badge, icon, selected, to, onClick, flat, actionLabel, meta }: BigChoiceButtonProps) {
  const style = {
    display: 'flex', flexDirection: 'column' as const, justifyContent: 'center', alignItems: 'flex-start', gap: 6, minHeight: flat ? 64 : 88, padding: flat ? '14px 16px' : '14px 18px',
    borderRadius: RADIUS.lg, fontFamily: FONT, textAlign: 'start' as const, textDecoration: 'none', cursor: 'pointer', color: T.text,
    background: flat ? 'transparent' : selected ? T.accentFill : T.surface, border: flat ? 'none' : `2px solid ${selected ? T.accent : T.controlBorder}`,
    boxShadow: selected && !flat ? `inset 0 -5px 0 ${T.accent}` : 'none',
    ...(flat ? { width: '100%', boxSizing: 'border-box' as const, borderRadius: `${RADIUS.lg - 2}px ${RADIUS.lg - 2}px 0 0` } : null),
  }
  const inner = (
    <>
      <span style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 16, rowGap: 2, width: '100%', fontSize: 22, fontWeight: 800, lineHeight: 1.2 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          {icon && <span aria-hidden="true" style={{ display: 'inline-flex' }}>{icon}</span>}
          {label}
        </span>
        {actionLabel && (
          <span data-choice-action style={{ marginInlineStart: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 16, fontWeight: 800, color: T.accentStrong, textDecoration: 'underline', textUnderlineOffset: 3, whiteSpace: 'nowrap' }}>
            {actionLabel}<Icon name="chevLeft" size={16} />
          </span>
        )}
      </span>
      {(sublabel || meta) && (
        <span style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 12, rowGap: 2, fontSize: 16, fontWeight: 500, color: T.textSoft }}>
          {sublabel && <span>{sublabel}</span>}
          {meta}
        </span>
      )}
      {badge && (() => {
        const tone = badge.tone ?? 'attention'
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 16, fontWeight: 700, padding: '2px 10px', borderRadius: 14, border: `1.5px solid ${TONE_META[tone].color}`, whiteSpace: 'nowrap' }}>
            <span style={{ color: TONE_META[tone].color, display: 'inline-flex' }}><Icon name={BADGE_ICON[tone]} size={16} /></span>
            {badge.text}
          </span>
        )
      })()}
    </>
  )
  if (to && !onClick) {
    return <Link to={to} data-tu-press aria-current={selected ? 'true' : undefined} style={style}>{inner}</Link>
  }
  return <button type="button" data-tu-press aria-pressed={selected} onClick={onClick} style={style}>{inner}</button>
}

interface ChoiceGridProps {
  /** שם הקבוצה לקוראי מסך, למשל "בחרו כיתה" */
  ariaLabel: string
  /** רוחב מינימלי לעמודה (ברירת מחדל 220) */
  minColumn?: number
  children: ReactNode
}

export function ChoiceGrid({ ariaLabel, minColumn = 220, children }: ChoiceGridProps) {
  return (
    <div role="group" aria-label={ariaLabel} style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${minColumn}px, 1fr))`, gap: 12 }}>
      {children}
    </div>
  )
}
