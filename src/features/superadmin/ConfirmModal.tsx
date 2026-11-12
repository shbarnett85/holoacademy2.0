import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/* מודאל אישור — לפני פעולות השבתה. (danger נשאר ב-props לתאימות; אין יותר כפתור אדום: כל הכפתורים באותה שפה)
   מוצג דרך portal ב-body: העמודים שמציגים אותו נכנסים באנימציה עם transform (holo-page-enter / holo-tab-enter),
   ו-position: fixed בתוך אב כזה נצמד לאב ולא למסך — המסך הכהה כיסה רק את העמודה.
   הגופן נקרא מהמקום שבו המודאל הוצב (span נסתר), כדי שהמעבר ל-body לא ישנה אותו. */
export default function ConfirmModal({ title, message, confirmLabel = 'אישור', onConfirm, onCancel }: Props) {
  const anchor = useRef<HTMLSpanElement>(null)
  const [font, setFont] = useState<string | undefined>(undefined)
  useLayoutEffect(() => { if (anchor.current) setFont(getComputedStyle(anchor.current).fontFamily || undefined) }, [])
  return (
    <>
      <span ref={anchor} hidden />
      {createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ background: 'var(--color-scrim)', zIndex: 80, fontFamily: font }}
          onClick={onCancel}
        >
          <div className="holo-panel holo-panel--staff max-w-sm w-full text-center" onClick={(e) => e.stopPropagation()}>
            <h3 className="holo-text-glow text-lg font-bold">{title}</h3>
            <p className="mt-3 text-sm" style={{ color: 'var(--color-ink)' }}>{message}</p>
            <div className="flex gap-3 justify-center mt-5">
              <button className="holo-button holo-button--staff" onClick={onConfirm}>
                {confirmLabel}
              </button>
              <button className="holo-button holo-button--staff" onClick={onCancel}>
                ביטול
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
