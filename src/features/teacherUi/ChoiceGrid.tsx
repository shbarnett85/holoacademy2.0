/* בחירה גדולה (למשל בורר כיתה): כפתורים גדולים עם תווית, ותג מספר במילים (לא מספר חשוף).
   BigChoiceButton יכול להיות קישור אמיתי (to) או כפתור (onClick). */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './icons'
import { FONT, RADIUS, SMALL, T, TONE_META } from './tokens'
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
}

const BADGE_ICON = { positive: 'check', attention: 'alert', error: 'alert', neutral: 'info' } as const

export function BigChoiceButton({ label, sublabel, badge, icon, selected, to, onClick }: BigChoiceButtonProps) {
  const style = {
    display: 'flex', flexDirection: 'column' as const, justifyContent: 'center', alignItems: 'flex-start', gap: 6, minHeight: 88, padding: '14px 18px',
    borderRadius: RADIUS.lg, fontFamily: FONT, textAlign: 'start' as const, textDecoration: 'none', cursor: 'pointer', color: T.text,
    background: selected ? T.accentFill : T.surface, border: `2px solid ${selected ? T.accent : T.controlBorder}`,
    boxShadow: selected ? `inset 0 -5px 0 ${T.accent}` : 'none',
  }
  const inner = (
    <>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 22, fontWeight: 800, lineHeight: 1.2 }}>
        {icon && <span aria-hidden="true" style={{ display: 'inline-flex' }}>{icon}</span>}
        {label}
      </span>
      {sublabel && <span style={{ fontSize: 16, fontWeight: 500, color: T.textSoft }}>{sublabel}</span>}
      {badge && (() => {
        const tone = badge.tone ?? 'attention'
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: SMALL, fontWeight: 700, padding: '2px 10px', borderRadius: 14, border: `1.5px solid ${TONE_META[tone].color}` }}>
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
