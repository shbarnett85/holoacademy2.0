/* מסגרת גרף משותפת: מודדת את הרוחב בפועל ומציירת SVG בגודל פיקסלים אמיתי (בלי viewBox שמכווץ טקסט),
   כך ש-fontSize=14 הוא באמת 14px. כיוון ציר הזמן: ישן → חדש משמאל לימין (direction:ltr).
   אין מידע במעבר עכבר בלבד: ערכים חשובים נכתבים כטקסט בגרף או לידו. */
import { useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

interface ChartFrameProps {
  /** גובה הגרף (px) */
  height: number
  /** תיאור קצר לקוראי מסך: מה הגרף מראה */
  ariaLabel: string
  /** פונקציה שמקבלת את הרוחב המדוד ומחזירה את תוכן ה-SVG */
  children: (size: { width: number; height: number }) => ReactNode
}

export function ChartFrame({ height, ariaLabel, children }: ChartFrameProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(Math.round(el.getBoundingClientRect().width))
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => { for (const e of entries) setWidth(Math.round(e.contentRect.width)) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div ref={ref} style={{ width: '100%', direction: 'ltr' }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} style={{ display: 'block', overflow: 'visible' }}>
          {children({ width, height })}
        </svg>
      )}
    </div>
  )
}
