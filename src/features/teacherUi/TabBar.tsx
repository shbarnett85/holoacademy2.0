/* טאבים (עיקרון 3: במקום גלילה ארוכה; לכל היותר שתי שורות). role=tablist, אזור לחיצה 44px+, חיצים במקלדת.
   טאב חסום (עיקרון 10): אפור + מנעול + הסיבה כטקסט גלוי בתוך הטאב עצמו (לא tooltip), אינו ניתן לבחירה. */
import { useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { Icon } from './icons'
import { FONT, MIN_TARGET, SMALL, T } from './tokens'

export interface TabItem {
  id: string
  label: string
  /** אייקון/אימוג'י אופציונלי לפני התווית (לא נושא משמעות לבד) */
  icon?: ReactNode
  /** תג קצר במילים, למשל "2 לתשומת לב" */
  badge?: string
  /** טאב חסום: מוצג באפור עם מנעול ואינו נבחר */
  locked?: boolean
  /** חובה כשהטאב חסום — ההסבר הקצר שמוצג בתוך הטאב */
  lockedReason?: string
}

interface TabBarProps {
  items: TabItem[]
  /** id של הטאב הנבחר */
  value: string
  onChange: (id: string) => void
  /** שם הרשימה לקוראי מסך, למשל "חלקי הדוח" */
  ariaLabel: string
  /** 'primary' = השורה הראשונה; 'secondary' = שורה שנייה (קטנה יותר, צורת כדור) */
  variant?: 'primary' | 'secondary'
  /** קידומת למזהי ה-DOM; הפאנל המתאים צריך id=`${idPrefix}-panel-${tabId}` (ראו tabPanelProps) */
  idPrefix?: string
  /** true רק כשהתוכן עטוף ב-tabPanelProps(idPrefix, id) — אז הטאב מצביע עליו ב-aria-controls */
  withPanels?: boolean
}

export default function TabBar({ items, value, onChange, ariaLabel, variant = 'primary', idPrefix = 'tu', withPanels = false }: TabBarProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const secondary = variant === 'secondary'
  /* roving tabindex: הטאב הנבחר, ואם אין כזה (ערך לא תקף/חסום) — הראשון הפעיל, כדי שהרשימה תישאר נגישה במקלדת */
  const focusableId = items.find((t) => !t.locked && t.id === value)?.id ?? items.find((t) => !t.locked)?.id

  function focusTab(id: string): void {
    listRef.current?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(id)}"]`)?.focus()
  }

  /* ניווט מקלדת. בעברית (RTL) הטאב הראשון הוא בימין, ולכן חץ שמאלה = הבא. הטאבים החסומים מדולגים. */
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    const enabled = items.filter((t) => !t.locked)
    if (enabled.length === 0) return
    const rtl = listRef.current ? getComputedStyle(listRef.current).direction === 'rtl' : true
    const idx = Math.max(0, enabled.findIndex((t) => t.id === value))
    let next: number
    if (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight') || e.key === 'ArrowDown') next = (idx + 1) % enabled.length
    else if (e.key === (rtl ? 'ArrowRight' : 'ArrowLeft') || e.key === 'ArrowUp') next = (idx - 1 + enabled.length) % enabled.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = enabled.length - 1
    else return
    e.preventDefault()
    const target = enabled[next]
    onChange(target.id)
    focusTab(target.id)
  }

  return (
    <div ref={listRef} role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown} data-tabbar={variant}
      style={{ display: 'flex', flexWrap: 'wrap', gap: secondary ? 6 : 8, alignItems: 'stretch' }}>
      {items.map((t) => {
        const selected = !t.locked && t.id === value
        const common = {
          id: `${idPrefix}-tab-${t.id}`,
          role: 'tab' as const,
          'data-tab-id': t.id,
          'aria-selected': selected,
          'aria-controls': withPanels ? `${idPrefix}-panel-${t.id}` : undefined,
        }
        const base = {
          display: 'inline-flex', flexDirection: 'column' as const, alignItems: 'flex-start', justifyContent: 'center', gap: 2,
          minHeight: MIN_TARGET, padding: secondary ? '6px 14px' : '8px 18px', borderRadius: secondary ? 22 : 12,
          fontFamily: FONT, fontSize: secondary ? 16 : 17, textAlign: 'start' as const, lineHeight: 1.3,
        }
        if (t.locked) {
          return (
            <button key={t.id} type="button" {...common} aria-disabled="true" aria-selected={false} tabIndex={-1}
              onClick={(e) => e.preventDefault()}
              style={{ ...base, cursor: 'not-allowed', background: 'transparent', border: `1.5px dashed ${T.controlBorder}`, color: T.muted, fontWeight: 600 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="lock" size={secondary ? 15 : 17} />
                {t.label}
              </span>
              {/* ההסבר גלוי בתוך הטאב — לא tooltip */}
              <span style={{ fontSize: SMALL, fontWeight: 500, color: T.muted }}>{t.lockedReason}</span>
            </button>
          )
        }
        return (
          <button key={t.id} type="button" data-tu-press {...common} tabIndex={t.id === focusableId ? 0 : -1} onClick={() => onChange(t.id)}
            style={{
              ...base, flexDirection: 'row', alignItems: 'center', gap: 8, cursor: selected ? 'default' : 'pointer',
              fontWeight: selected ? 800 : 600,
              background: selected ? T.accentFill : T.surface,
              /* נבחר = מסגרת עבה + קו תחתון + משקל כבד (לא צבע בלבד) */
              border: `1.5px solid ${selected ? T.accent : T.controlBorder}`,
              boxShadow: selected ? `inset 0 -4px 0 ${T.accent}, 0 0 0 1px ${T.accent}` : 'none',
              color: selected ? T.text : T.textSoft,
            }}>
            {t.icon && <span aria-hidden="true" style={{ display: 'inline-flex' }}>{t.icon}</span>}
            <span>{t.label}</span>
            {t.badge && (
              <span style={{ fontSize: 16, fontWeight: 700, padding: '1px 9px', borderRadius: 10, border: `1.5px solid ${T.warn}`, color: T.text, whiteSpace: 'nowrap' }}>{t.badge}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
