/* אזור שממלא את גובה המסך שנשאר (ראו useFillHeight): הילדים בנויים כעמודה, והרשימות שבתוכם גוללות בתוך עצמן. */
import type { ReactNode } from 'react'
import { useFillHeight } from './useFillHeight'

/* minHeight: מתחת לגובה הזה לא מכווצים עוד — העמוד עצמו מתחיל לגלול (חלון נמוך), כדי שהרשימות יישארו שמישות */
export default function FillArea({ children, gap = 12, minHeight = 380 }: { children: ReactNode; gap?: number; minHeight?: number }) {
  const { ref, height } = useFillHeight<HTMLDivElement>(minHeight)
  return (
    <div ref={ref} data-fill-area style={{ height, display: 'flex', flexDirection: 'column', gap, minHeight: 0, flex: height === undefined ? '1 0 auto' : '0 0 auto' }}>
      {children}
    </div>
  )
}
