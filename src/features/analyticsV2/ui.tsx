/* ──────────────────────────────────────────────────────────────────────────
   רכיבי עזר קטנים לאנליטיקה, מעל ערכת הממשק (teacherUi). מבנה ומקצועות — מהערכה; כאן רק מה שהערכה לא מכסה:
   כרטיס, כפתורי פעולה (תמיד מילה, 44px), מגמה/מיקום באייקון+מילה, כדור מקצוע, מצבי טעינה/שגיאה.
   צבעים: טוקני הערכה בלבד. צבע לעולם לא לבד: תמיד אייקון + מילה.
   ────────────────────────────────────────────────────────────────────────── */
import { Link } from 'react-router-dom'
import type { CSSProperties, ReactNode } from 'react'
import { useSubjectStyle } from '../../shared/lib/subjectStyle'
import type { Position, Trend } from '../../shared/lib/analyticsConfig'
import type { SubjectRef } from '../../shared/types/analyticsV2'
import { FONT, Icon, MIN_TARGET, RADIUS, T, TONE_META, VisuallyHidden } from '../teacherUi'
import type { IconName, Tone } from '../teacherUi'
import { isRetryable, v2ErrorMessage } from './errors'
import type { V2Error } from './errors'
import { L } from './labels'

/* ── כרטיס וכותרת קטע ── */
export function Card({ children, style, label }: { children: ReactNode; style?: CSSProperties; label?: string }) {
  return (
    <section aria-label={label} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: RADIUS.md, padding: '12px 16px', minWidth: 0, ...style }}>
      {children}
    </section>
  )
}

export function CardTitle({ children, aside, style }: { children: ReactNode; aside?: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8, ...style }}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, lineHeight: 1.4, color: T.text }}>{children}</h2>
      {aside}
    </div>
  )
}

/* הסתייגות / הערה: משפטים, לכן 16px */
export function Note({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5, color: T.textSoft, ...style }}>{children}</p>
  )
}

/* ── כפתורים: תמיד מילה, גובה ≥ 44px ── */
const buttonBase: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: MIN_TARGET, padding: '0 18px', borderRadius: RADIUS.md,
  fontFamily: FONT, fontSize: 16, fontWeight: 800, textDecoration: 'none', cursor: 'pointer', color: T.text, lineHeight: 1.3, whiteSpace: 'nowrap',
}
const primaryStyle: CSSProperties = { ...buttonBase, background: T.accentFill, border: `2px solid ${T.accent}`, boxShadow: `inset 0 -4px 0 ${T.accent}` }
const secondaryStyle: CSSProperties = { ...buttonBase, background: T.surface, border: `2px solid ${T.controlBorder}` }

interface ButtonProps { children: ReactNode; kind?: 'primary' | 'secondary'; style?: CSSProperties; icon?: ReactNode }

export function ActionButton({ children, kind = 'secondary', onClick, disabled, expanded, style, icon }: ButtonProps & { onClick?: () => void; disabled?: boolean; expanded?: boolean }) {
  return (
    <button type="button" data-tu-press onClick={onClick} disabled={disabled} aria-expanded={expanded}
      style={{ ...(kind === 'primary' ? primaryStyle : secondaryStyle), ...(disabled ? { opacity: 0.55, cursor: 'not-allowed' } : null), ...style }}>
      {icon}{children}
    </button>
  )
}

export function LinkButton({ to, children, kind = 'secondary', style, icon }: ButtonProps & { to: string }) {
  return (
    <Link to={to} data-tu-press style={{ ...(kind === 'primary' ? primaryStyle : secondaryStyle), ...style }}>
      {icon}{children}
    </Link>
  )
}

/* ── תג קצר (מילה או מספר + מילה, 16px) ──
   בלי טון: תווית שטוחה (מילוי עדין, פינות חדות, בלי מסגרת) — כך היא לא נראית ככפתור. עם טון: מסגרת בצבע הטון (ותמיד מילה/אייקון לידה). */
export function Tag({ children, tone, style }: { children: ReactNode; tone?: Tone; style?: CSSProperties }) {
  if (!tone) {
    return (
      <span data-label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FONT, fontSize: 16, fontWeight: 600, padding: '1px 8px', borderRadius: 4, background: T.surfaceSoft, color: T.textSoft, lineHeight: 1.5, ...style }}>
        {children}
      </span>
    )
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FONT, fontSize: 16, fontWeight: 700, padding: '2px 10px', borderRadius: 14, border: `1.5px solid ${TONE_META[tone].color}`, color: T.text, lineHeight: 1.5, ...style }}>
      {children}
    </span>
  )
}

/* ── טון: אייקון + מילה (הצבע משני) ── */
const TONE_ICON: Record<Tone, IconName> = { positive: 'check', attention: 'alert', error: 'alert', neutral: 'info' }
export function ToneMark({ tone, size = 18 }: { tone: Tone; size?: number }) {
  const m = TONE_META[tone]
  return (
    <span style={{ color: m.color, display: 'inline-flex', position: 'relative', flexShrink: 0 }}>
      <Icon name={TONE_ICON[tone]} size={size} />
      <VisuallyHidden>{m.word}: </VisuallyHidden>
    </span>
  )
}

/* ── מגמה: חץ + מילה ── */
const TREND_COLOR: Record<Trend, string> = { improving: T.good, steady: T.muted, declining: T.warn, insufficient: T.muted }

export function TrendArrow({ trend, size = 20 }: { trend: Trend; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, focusable: false as const, style: { flexShrink: 0, display: 'block' } }
  if (trend === 'improving') return <svg {...common}><path d="M6 18L18 6" /><path d="M9 6h9v9" /></svg>
  if (trend === 'declining') return <svg {...common}><path d="M6 6l12 12" /><path d="M18 9v9H9" /></svg>
  if (trend === 'steady') return <svg {...common}><path d="M5 12h14" /><path d="M14 7l5 5-5 5" /></svg>
  return <svg {...common}><path d="M6 12h2" /><path d="M11 12h2" /><path d="M16 12h2" /></svg>
}

/* text מגיע מהחוזה (trendText / groupTrendText) — "משתפר/ת", "יציב/ה", "בירידה", "אין עדיין מספיק נתונים" */
export function TrendWord({ trend, text, size = 16, bold = true }: { trend: Trend; text: string; size?: number; bold?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: size, fontWeight: bold ? 700 : 500, color: T.text, lineHeight: 1.4 }}>
      <span style={{ color: TREND_COLOR[trend], display: 'inline-flex' }}><TrendArrow trend={trend} size={size + 4} /></span>
      {text}
    </span>
  )
}

/* ── מיקום מול הטווח המיועד לשכבה: אייקון + מילים מהחוזה ── */
const POSITION_ICON: Record<Position, { icon: IconName; color: string }> = {
  above: { icon: 'check', color: T.good },
  within: { icon: 'circle', color: T.muted },
  below: { icon: 'alert', color: T.warn },
}
export function PositionWord({ position, text, size = 16 }: { position: Position | null; text: string | null; size?: number }) {
  if (!position || !text) return <span style={{ fontSize: size, color: T.textSoft }}>{L.levelLabel(null)}</span>
  const m = POSITION_ICON[position]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: size, fontWeight: 600, color: T.text, lineHeight: 1.4 }}>
      <span style={{ color: m.color, display: 'inline-flex' }}><Icon name={m.icon} size={size + 1} /></span>
      {text}
    </span>
  )
}

/* ── כדור מקצוע (צבע + אייקון קבועים; השם תמיד לידו) ── */
export function SubjectOrb({ code, size = 26 }: { code: string | null | undefined; size?: number }) {
  const s = useSubjectStyle(code)
  return (
    <span aria-hidden="true" style={{
      display: 'inline-grid', placeItems: 'center', width: size, height: size, borderRadius: '50%', flexShrink: 0,
      border: `2px solid ${s.color}`, background: `color-mix(in srgb, ${s.color} 16%, transparent)`, fontSize: Math.max(16, Math.round(size * 0.56)), lineHeight: 1,
    }}>{s.icon}</span>
  )
}

export function SubjectLabel({ subject, size = 16 }: { subject: SubjectRef | { code: string; nameHe: string }; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: size, fontWeight: 700, color: T.text, whiteSpace: 'nowrap' }}>
      <SubjectOrb code={subject.code} size={size + 10} />{subject.nameHe}
    </span>
  )
}

/* ── תחומים: רשימה במילים, או מקף עם טקסט לקורא מסך ── */
export function AreasText({ items, empty }: { items: string[]; empty?: string }) {
  if (items.length === 0) return empty ? <span style={{ color: T.textSoft }}>{empty}</span> : <span style={{ color: T.muted }}>—<VisuallyHidden>{L.none}</VisuallyHidden></span>
  return <>{items.join(' · ')}</>
}

/* ── טעינה / שגיאה / ריק ── */
export function LoadingBlock({ label = L.loading }: { label?: string }) {
  return <div role="status" style={{ padding: '28px 0', textAlign: 'center', fontSize: 17, color: T.textSoft }}>{label}</div>
}

/* שגיאת טעינה בעברית פשוטה לפי הסטטוס (errors.ts). "נסו שוב" רק כשיש טעם (תקלה זמנית / עומס / אין חיבור); הרשאה ו"לא נמצא" — נתיב חזרה */
export function ErrorBlock({ error, onRetry, backTo }: { error: V2Error; onRetry?: () => void; backTo?: string }) {
  const retry = onRetry && isRetryable(error.status)
  return (
    <section role="alert" data-v2-error={error.status} style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '14px 18px', borderRadius: RADIUS.md, background: T.surface, border: `2px solid ${T.bad}` }}>
      <span style={{ color: T.bad, display: 'inline-flex' }}><Icon name="alert" size={26} /></span>
      <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: T.text, flex: '1 1 280px' }}>{v2ErrorMessage(error.status, error.message)}</p>
      {retry && <ActionButton onClick={onRetry}>{L.retry}</ActionButton>}
      {backTo && <LinkButton to={backTo} kind={retry ? 'secondary' : 'primary'}>{L.backToEntry}</LinkButton>}
    </section>
  )
}

/* גריד ברירת מחדל לשתי עמודות/שלוש — נערם במסך צר */
export function Columns({ children, template, gap = 12, style }: { children: ReactNode; template: string; gap?: number; style?: CSSProperties }) {
  return <div style={{ display: 'grid', gridTemplateColumns: template, gap, alignItems: 'start', ...style }}>{children}</div>
}

/* "X מתוך Y תלמידים (42%)": הטקסט מגיע מהחוזה (countText) והבר הוא תוספת חזותית בלבד — המספרים תמיד גלויים כטקסט */
export function CountBar({ done, total, text, tone = 'attention', barHeight = 10 }: { done: number; total: number; text: string; tone?: Tone | 'accent'; barHeight?: number }) {
  const share = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0
  const color = tone === 'accent' ? T.accent : TONE_META[tone].color
  return (
    <div data-count-bar style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
      <span style={{ fontFamily: FONT, fontSize: 16, fontWeight: 700, color: T.text, whiteSpace: 'nowrap' }}>{text}</span>
      <div role="progressbar" aria-label={text} aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.min(done, total)} aria-valuetext={text}
        style={{ flex: 1, minWidth: 60, height: barHeight, borderRadius: barHeight, background: T.grid, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
        <div style={{ width: `${share * 100}%`, height: '100%', borderRadius: barHeight, background: color }} />
      </div>
    </div>
  )
}
