/* "איך חישבנו?" — המקום היחיד בממשק שבו מותר פירוט חישובי/סטטיסטי (עיקרון 5). שתי צורות, אותו תוכן:
   · HowWeCalcButton — הצורה של כל מסכי המורה: כפתור אחד קבוע בשורת הכותרת (ScreenShell, prop howWeCalc), שפותח חלון קטן מעל התוכן.
     החלון לא דוחף את הנתונים למטה, נסגר בכפתור "סגירה" (וב-Escape ובלחיצה מחוץ לחלון), ואין בו שום דבר שתלוי ב-hover.
   · HowWeCalc — <details> אמיתי (בלי JS), למסמך להדפסה (תדריך): נפתח אוטומטית לפני ההדפסה.
   התוכן בשתיהן: lines (מ-findingsNarrative, למשל howWeCalcResultsLines()) ו/או children. האטריביוט data-how-we-calc מסמן אותו לביקורת
   (מילים טכניות מותרות רק בתוכו; כשהחלון סגור אין ב-DOM שום תוכן טכני). */
import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { RESULTS_TEXT } from '../../shared/lib/findingsNarrative'
import { Icon } from './icons'
import { FONT, MIN_TARGET, RADIUS, T } from './tokens'

export interface HowWeCalcContent {
  /** שורות הסבר (כל אחת פסקה קצרה). עדיף מ-howWeCalcResultsLines() / HOW_WE_CALC.lines */
  lines?: readonly string[]
  /** תוכן חופשי נוסף (למשל שורות ראיה לממצא) */
  children?: ReactNode
  /** מחליף את התווית "איך חישבנו?" רק אם יש סיבה */
  label?: string
  /** HowWeCalcButton בלבד: החלון פתוח מההתחלה (לבדיקות רינדור) */
  defaultOpen?: boolean
}

const CLOSE_LABEL = 'סגירה'

function Body({ lines, children }: { lines?: readonly string[]; children?: ReactNode }) {
  return (
    <>
      {lines?.map((l, i) => <p key={i} style={{ margin: 0 }}>{l}</p>)}
      {children}
    </>
  )
}

/* ── הכפתור + החלון (השקע היחיד של ScreenShell) ── */
export function HowWeCalcButton({ lines, children, label = RESULTS_TEXT.howWeCalcLabel, defaultOpen = false }: HowWeCalcContent) {
  const [open, setOpen] = useState(defaultOpen)
  const rootRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
    const close = (): void => { setOpen(false); btnRef.current?.focus() }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') close() }
    const onDown = (e: PointerEvent): void => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown) }
  }, [open])

  return (
    <div ref={rootRef} data-how-we-calc-slot style={{ position: 'relative', flex: '0 0 auto' }}>
      <button ref={btnRef} type="button" data-tu-press data-how-we-calc-button aria-expanded={open} aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: MIN_TARGET, padding: '0 16px', borderRadius: RADIUS.md, cursor: 'pointer',
          fontFamily: FONT, fontSize: 16, fontWeight: 700, color: T.accentStrong, background: open ? T.accentFill : T.surface, border: `2px solid ${open ? T.accent : T.controlBorder}`,
        }}>
        <Icon name="info" size={18} />
        <span style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>{label}</span>
      </button>
      {open && (
        <div ref={panelRef} id={panelId} role="dialog" aria-label={label} tabIndex={-1} data-how-we-calc
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', insetInlineEnd: 0, zIndex: 40, boxSizing: 'border-box', width: 'min(620px, calc(100vw - 48px))', maxHeight: 'min(70vh, 560px)', overflowY: 'auto',
            padding: '10px 18px 16px', borderRadius: RADIUS.lg, background: T.studioBg, border: `2px solid ${T.accent}`, outline: 'none',
            fontFamily: FONT, fontSize: 16, lineHeight: 1.7, color: T.textSoft,
          }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
            <strong style={{ fontSize: 18, color: T.text }}>{label}</strong>
            <button type="button" data-tu-press onClick={() => { setOpen(false); btnRef.current?.focus() }}
              style={{ minHeight: MIN_TARGET, padding: '0 18px', borderRadius: RADIUS.md, cursor: 'pointer', fontFamily: FONT, fontSize: 16, fontWeight: 800, color: T.text, background: T.surface, border: `2px solid ${T.controlBorder}` }}>
              {CLOSE_LABEL}
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Body lines={lines}>{children}</Body>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── <details> למסמכים (תדריך להדפסה) ── */
export default function HowWeCalc({ lines, children, label = RESULTS_TEXT.howWeCalcLabel }: HowWeCalcContent) {
  return (
    <details data-how-we-calc style={{ borderRadius: RADIUS.md, background: T.surface, border: `1px solid ${T.border}` }}>
      <summary data-tu-press style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: MIN_TARGET, padding: '0 16px', cursor: 'pointer', fontFamily: FONT, fontSize: 16, fontWeight: 700, color: T.accentStrong, borderRadius: RADIUS.md }}>
        <Icon name="info" size={18} />
        <span style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>{label}</span>
        <span data-tu-chev style={{ display: 'inline-flex', marginInlineStart: 'auto' }}><Icon name="chevDown" size={18} /></span>
      </summary>
      <div style={{ padding: '4px 16px 14px', display: 'flex', flexDirection: 'column', gap: 8, fontFamily: FONT, fontSize: 16, lineHeight: 1.7, color: T.textSoft }}>
        <Body lines={lines}>{children}</Body>
      </div>
    </details>
  )
}
