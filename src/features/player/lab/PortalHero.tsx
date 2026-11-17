/* המסך הראשון של עמוד הפתיחה ושל הבית של התלמיד: הבמה של פתיחת שיעור (LabStage) במסך מלא, עם פורטל שמציג שיעור.
   מסביב לבמה האזורים שהעמוד ממלא:
   · top     — פס לכל רוחב המסך מעל הבמה (אצל התלמיד: השלום והסיכום). בלי ערך: הבמה מתחילה מראש המסך
   · panel   — החלון הלבן הצף מימין, ברווח שבין טבעת הפורטל לקצה המסך (במסך צר: מתחת לבמה)
   · under   — מתחת לפורטל: איזה שיעור מוצג בו, חצים להחלפה וכפתור הכניסה לשיעור
   · bubble  — בועת דיבור מעל הראש של ד"ר הולו (בקואורדינטות של תמונת הספרייה, ולכן נשארת במקום בכל גודל מסך)
   · caption — שכבת טקסט הולוגרפית על הפורטל עצמו (אצל התלמיד: מצב השיעור), גם היא בקואורדינטות של תמונת הספרייה
   הבמה היא position: fixed, ולכן .home4-stage עם transform: היא ממלאת רק את האזור שלה, והעמוד נגלל הלאה.
   הסגנון: index.css (.home4-*); הטקסט ההולוגרפי: PortalCaption. */
import { useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react'
import { panelStudent } from '../../../styles/ui'
import LabStage from './LabStage'
import PortalCaption, { type PortalCaptionData } from './PortalCaption'
import { OPENING_STAGE, labCover } from './labComposition'

/* איפה הבועה של ד"ר הולו, בקואורדינטות של תמונת הספרייה: מעל הראש שלו */
const BUBBLE_AT = { x: OPENING_STAGE.holo.centerX, y: OPENING_STAGE.holo.top + 18 }
/* הטקסט שעל הפורטל: באמצע הרוחב, בשליש התחתון של הפתח (מתחת לנושא התמונה). כשהשורה שמתחת לפורטל מכסה את
   המקום הזה (מסך צר, שבו הבמה נמוכה), הטקסט עולה לשליש העליון */
const PORTAL = OPENING_STAGE.portal.box
const CAPTION_X = PORTAL.x + PORTAL.width / 2
const CAPTION_LOW = PORTAL.y + PORTAL.height * 0.76
const CAPTION_HIGH = PORTAL.y + PORTAL.height * 0.27
/* גודל האות בקואורדינטות של התמונה, והמינימום על המסך */
const CAPTION_FONT = 31
const CAPTION_FONT_MIN = 17

export default function PortalHero({ portalSrc, portalLabel, onPortalClick, leaving, onDiveEnd, bubble, caption, captionKey, captionProps, under, underProps, panel, panelClass, top }: {
  /* התמונה שבפורטל; בלי ערך הפורטל ריק */
  portalSrc?: string
  /* השם של הלחיצה על הפורטל, לקוראי מסך ולמקלדת */
  portalLabel?: string
  onPortalClick?: () => void
  leaving?: 'dive'
  onDiveEnd?: () => void
  bubble?: ReactNode
  caption?: PortalCaptionData
  /* כשהמפתח מתחלף (שיעור אחר בפורטל) הטקסט נדלק מחדש */
  captionKey?: string
  captionProps?: HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, string | undefined>
  under?: ReactNode
  underProps?: HTMLAttributes<HTMLDivElement>
  panel: ReactNode
  panelClass?: string
  top?: ReactNode
}) {
  const stageRef = useRef<HTMLDivElement>(null)
  const underRef = useRef<HTMLDivElement>(null)
  const [bubbleAt, setBubbleAt] = useState<{ left: number; top: number } | null>(null)
  const [captionAt, setCaptionAt] = useState<CSSProperties | null>(null)
  const hasUnder = !!under
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = () => {
      const c = labCover(el.clientWidth, el.clientHeight, OPENING_STAGE)
      setBubbleAt({ left: c.x + BUBBLE_AT.x * c.scale, top: c.y + BUBBLE_AT.y * c.scale })
      const fontSize = Math.max(CAPTION_FONT_MIN, CAPTION_FONT * c.scale)
      const low = c.y + CAPTION_LOW * c.scale
      const underTop = underRef.current ? underRef.current.offsetTop : Infinity
      const y = low + fontSize * 1.5 > underTop ? c.y + CAPTION_HIGH * c.scale : low
      setCaptionAt({ left: c.x + CAPTION_X * c.scale, top: Math.max(fontSize * 1.6, y), fontSize })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    if (underRef.current) ro.observe(underRef.current)
    return () => ro.disconnect()
  }, [hasUnder])

  return (
    <section className="home4-hero" data-portal-hero data-leaving={leaving}>
      {top && <header className="home4-top" data-portal-top>{top}</header>}
      <div className="home4-body">
        <div ref={stageRef} className="home4-stage">
          <LabStage state="opening" portalSrc={portalSrc} mood="neutral" leaving={leaving} onDiveEnd={onDiveEnd} onPortalClick={onPortalClick} portalLabel={portalLabel} />
          {bubble && bubbleAt && <div className="home4-bubble home4-fade" data-portal-bubble style={bubbleAt}>{bubble}</div>}
          {caption && captionAt && (
            <div className="home4-caption home4-fade" aria-hidden="true" data-portal-caption {...captionProps} style={captionAt}>
              <PortalCaption key={captionKey} {...caption} />
            </div>
          )}
          {under && <div ref={underRef} className="home4-now home4-fade" data-portal-under {...underProps}>{under}</div>}
        </div>
        <div className={`home4-panel home4-fade${panelClass ? ` ${panelClass}` : ''}`} data-portal-panel style={panelStudent}>{panel}</div>
      </div>
    </section>
  )
}
