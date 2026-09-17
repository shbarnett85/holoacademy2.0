import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/* ── תצוגה מקדימה של סגנון אמנותי ─────────────────────────────────────────────
   ב-hover/focus על כרטיס סגנון מוצגת תמונת הדגמה (אותו נושא — ד"ר הולו במעבדה —
   בכל ששת הסגנונות, כך שההשוואה היא סגנון ולא תוכן). מבוסס על דפוס ה-Tooltip
   המשותף: portal ל-body, השהיית ~150ms נגד ריצוד, clamp לקצוות + flip מעל/מתחת.
   תמונה שלא נטענה → נסיגה לטקסט ההסבר. במסכי מגע (pointer: coarse) אין hover —
   הכרטיסים עצמם מציגים תמונה זעירה קבועה (מטופל ב-CreationForm דרך isCoarsePointer).
   נגישות: התיאור הטקסטואלי נשאר כ-aria-label על הכפתור; הבועה דקורטיבית. ── */

const SHOW_DELAY = 150
const IMG_W = 228

export const STYLE_PREVIEW_SRC = (key: string) => `/style-previews/${key}.jpg`

/* זיהוי מכשיר מגע — נקבע פעם אחת בטעינה (כמו דפוס reduceMotion) */
export const isCoarsePointer =
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches

/* טעינה מוקדמת של שש התמונות — נקראת בהרכבת בורר הסגנונות */
export function preloadStylePreviews(keys: string[]) {
  for (const k of keys) { const im = new Image(); im.src = STYLE_PREVIEW_SRC(k) }
}

export default function StylePreview({ styleKey, label, desc, children }: {
  styleKey: string
  label: string
  desc?: string
  children: ReactNode
}) {
  const [shown, setShown] = useState(false)
  const [failed, setFailed] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number; above: boolean } | null>(null)
  const anchor = useRef<HTMLSpanElement>(null)
  const bubble = useRef<HTMLDivElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const id = useId()

  function open() {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setShown(true), SHOW_DELAY)
  }
  function close() { window.clearTimeout(timer.current); setShown(false); setPos(null) }
  useEffect(() => () => window.clearTimeout(timer.current), [])

  /* מדידה אחרי רינדור (offscreen) → מיקום סופי עם flip/clamp — לא נחתך בקצוות */
  useLayoutEffect(() => {
    if (!shown || !anchor.current) return
    const r = anchor.current.getBoundingClientRect()
    const bh = bubble.current?.offsetHeight ?? 190
    const gap = 9
    const above = r.bottom + gap + bh > window.innerHeight && r.top - gap - bh > 8
    const y = above ? r.top - gap : r.bottom + gap
    const half = Math.min(IMG_W + 16, window.innerWidth - 16) / 2
    const x = Math.max(half + 8, Math.min(window.innerWidth - half - 8, r.left + r.width / 2))
    setPos({ x, y, above })
  }, [shown, failed])

  /* במגע אין hover — הבועה מנוטרלת (הכרטיס מציג תמונה קבועה במקומה) */
  if (isCoarsePointer) return <span style={{ display: 'block' }}>{children}</span>

  return (
    <span
      ref={anchor}
      onMouseEnter={open} onMouseLeave={close} onFocus={open} onBlur={close}
      style={{ display: 'block' }}
    >
      {children}
      {shown && createPortal(
        <div
          ref={bubble}
          id={id}
          aria-hidden="true"
          dir="rtl"
          style={{
            position: 'fixed',
            left: pos ? pos.x : -9999, top: pos ? pos.y : -9999,
            transform: `translateX(-50%) ${pos?.above ? 'translateY(-100%)' : ''}`,
            zIndex: 9999, pointerEvents: 'none',
            background: 'rgba(8,14,30,0.97)',
            border: '1px solid rgba(47,243,255,0.45)', borderRadius: 12,
            padding: 6,
            boxShadow: '0 8px 28px -8px rgba(0,0,0,0.85), 0 0 18px rgba(47,243,255,0.22)',
            opacity: pos ? 1 : 0, transition: 'opacity 0.12s ease',
          }}
        >
          {failed ? (
            /* נסיגה: התמונה לא נטענה — מציגים את ההסבר הטקסטואלי, לא ריק */
            <div style={{ maxWidth: 240, padding: '6px 8px', fontSize: 12.5, lineHeight: 1.6, color: '#dcebff', textAlign: 'right', fontFamily: 'var(--font-display, inherit)' }}>{desc ?? label}</div>
          ) : (
            <>
              <img
                src={STYLE_PREVIEW_SRC(styleKey)}
                alt=""
                onError={() => setFailed(true)}
                style={{ width: IMG_W, aspectRatio: '3 / 2', objectFit: 'cover', borderRadius: 8, display: 'block' }}
              />
              <div style={{ padding: '5px 4px 1px', fontSize: 11.5, fontWeight: 700, color: '#bfe9ff', textAlign: 'center', fontFamily: 'var(--font-display, inherit)' }}>{label}</div>
            </>
          )}
        </div>,
        document.body,
      )}
    </span>
  )
}
