/* המסך הראשון של עמוד הפתיחה ושל הבית של התלמיד: הבמה של פתיחת שיעור (LabStage) במסך מלא, עם פורטל שמציג שיעור.
   מסביב לבמה ארבעה אזורים שהעמוד ממלא:
   · panel  — החלון הלבן הצף מימין, ברווח שבין טבעת הפורטל לקצה המסך (במסך צר: מתחת לבמה)
   · under  — מתחת לפורטל: איזה שיעור מוצג בו, חצים להחלפה וכפתור הכניסה לשיעור
   · bubble — בועת דיבור מעל הראש של ד"ר הולו (בקואורדינטות של תמונת הספרייה, ולכן נשארת במקום בכל גודל מסך)
   · corner — כפתורים קטנים בפינה שמול החלון (השתקה, יציאה)
   הבמה היא position: fixed, ולכן .home4-stage עם transform: היא ממלאת רק את המסך הראשון, והעמוד נגלל הלאה.
   הסגנון: index.css (.home4-*). */
import { useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react'
import { panelStudent } from '../../../styles/ui'
import LabStage from './LabStage'
import { OPENING_STAGE, labCover } from './labComposition'

/* איפה הבועה של ד"ר הולו, בקואורדינטות של תמונת הספרייה: מעל הראש שלו */
const BUBBLE_AT = { x: OPENING_STAGE.holo.centerX, y: OPENING_STAGE.holo.top + 18 }

export default function PortalHero({ portalSrc, portalLabel, onPortalClick, leaving, onDiveEnd, bubble, under, underProps, panel, corner }: {
  /* התמונה שבפורטל; בלי ערך הפורטל ריק */
  portalSrc?: string
  /* השם של הלחיצה על הפורטל, לקוראי מסך ולמקלדת */
  portalLabel?: string
  onPortalClick?: () => void
  leaving?: 'dive'
  onDiveEnd?: () => void
  bubble?: ReactNode
  under?: ReactNode
  underProps?: HTMLAttributes<HTMLDivElement>
  panel: ReactNode
  corner?: ReactNode
}) {
  const stageRef = useRef<HTMLDivElement>(null)
  const [bubbleAt, setBubbleAt] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = () => { const c = labCover(el.clientWidth, el.clientHeight, OPENING_STAGE); setBubbleAt({ left: c.x + BUBBLE_AT.x * c.scale, top: c.y + BUBBLE_AT.y * c.scale }) }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <section className="home4-hero" data-portal-hero data-leaving={leaving}>
      <div ref={stageRef} className="home4-stage">
        <LabStage state="opening" portalSrc={portalSrc} mood="neutral" leaving={leaving} onDiveEnd={onDiveEnd} onPortalClick={onPortalClick} portalLabel={portalLabel} />
        {bubble && bubbleAt && <div className="home4-bubble home4-fade" data-portal-bubble style={bubbleAt}>{bubble}</div>}
        {under && <div className="home4-now home4-fade" data-portal-under {...underProps}>{under}</div>}
        {corner && <div className="home4-corner home4-fade">{corner}</div>}
      </div>
      <div className="home4-panel home4-fade" data-portal-panel style={panelStudent}>{panel}</div>
    </section>
  )
}
