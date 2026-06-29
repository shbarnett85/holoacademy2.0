import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/* ── Tooltip עצמאי משותף ──────────────────────────────────────────────────────
   בועת הסבר ב-hover + focus (נגישות מקלדת). השהיה לפני הופעה. RTL: טקסט מיושר
   לימין; הבועה ממורכזת על האלמנט עם clamp לקצוות + auto-flip מעל/מתחת. portal
   ל-body כדי לא להיחתך ע"י scroll-containers. aria-describedby מקשר אלמנט↔בועה.
   טקסט ריק/חסר → לא מוצג (כך אפשר לחווט לפני שיש טקסטים). block=true לאלמנט מלא-רוחב.
   ─────────────────────────────────────────────────────────────────────────── */
const SHOW_DELAY = 350
const MAX_W = 270

export default function Tooltip({ text, block, children }: { text?: string; block?: boolean; children: ReactNode }) {
  const [shown, setShown] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number; above: boolean } | null>(null)
  const anchor = useRef<HTMLSpanElement>(null)
  const bubble = useRef<HTMLDivElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const id = useId()

  function open() {
    if (!text) return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setShown(true), SHOW_DELAY)
  }
  function close() { window.clearTimeout(timer.current); setShown(false); setPos(null) }

  /* מדידה אחרי שהבועה רונדרה (offscreen) — קביעת מיקום סופי + flip/clamp */
  useLayoutEffect(() => {
    if (!shown || !anchor.current) return
    const r = anchor.current.getBoundingClientRect()
    const bh = bubble.current?.offsetHeight ?? 60
    const gap = 9
    const above = r.bottom + gap + bh > window.innerHeight && r.top - gap - bh > 8
    const y = above ? r.top - gap : r.bottom + gap
    const half = Math.min(MAX_W, window.innerWidth - 16) / 2
    const x = Math.max(half + 8, Math.min(window.innerWidth - half - 8, r.left + r.width / 2))
    setPos({ x, y, above })
  }, [shown, text])

  return (
    <span
      ref={anchor}
      onMouseEnter={open} onMouseLeave={close} onFocus={open} onBlur={close}
      aria-describedby={shown && text ? id : undefined}
      style={{ display: block ? 'block' : 'inline-flex' }}
    >
      {children}
      {shown && text && createPortal(
        <div
          ref={bubble}
          id={id}
          role="tooltip"
          dir="rtl"
          style={{
            position: 'fixed',
            left: pos ? pos.x : -9999, top: pos ? pos.y : -9999,
            transform: `translateX(-50%) ${pos?.above ? 'translateY(-100%)' : ''}`,
            zIndex: 9999, pointerEvents: 'none', maxWidth: MAX_W,
            background: 'rgba(8,14,30,0.97)', color: '#dcebff',
            border: '1px solid rgba(47,243,255,0.45)', borderRadius: 10,
            padding: '9px 12px', fontSize: 12.5, lineHeight: 1.6, textAlign: 'right',
            fontFamily: 'var(--font-display, inherit)',
            boxShadow: '0 8px 28px -8px rgba(0,0,0,0.85), 0 0 18px rgba(47,243,255,0.22)',
            backdropFilter: 'blur(6px)',
            opacity: pos ? 1 : 0, transition: 'opacity 0.12s ease',
          }}
        >
          {text}
          {/* חץ — מצביע אל האלמנט (למעלה כשהבועה מתחת, ולהיפך) */}
          <span style={{
            position: 'absolute', left: '50%', marginLeft: -5, width: 10, height: 10,
            background: 'rgba(8,14,30,0.97)',
            borderLeft: '1px solid rgba(47,243,255,0.45)', borderTop: '1px solid rgba(47,243,255,0.45)',
            transform: 'rotate(45deg)',
            ...(pos?.above ? { bottom: -6, borderLeft: 'none', borderTop: 'none', borderRight: '1px solid rgba(47,243,255,0.45)', borderBottom: '1px solid rgba(47,243,255,0.45)' } : { top: -6 }),
          }} />
        </div>,
        document.body,
      )}
    </span>
  )
}
