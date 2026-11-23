/* המסך הראשון של עמוד הפתיחה ושל הבית של התלמיד: הבמה של פתיחת שיעור (LabStage) במסך מלא, עם פורטל שמציג שיעור.
   מסביב לבמה האזורים שהעמוד ממלא:
   · top     — פס לכל רוחב המסך מעל הבמה (אצל התלמיד: השלום והסיכום). בלי ערך: הבמה מתחילה מראש המסך
   · panel   — החלון הלבן הצף מימין, ברווח שבין טבעת הפורטל לקצה המסך (במסך צר: מתחת לבמה)
   · under   — מתחת לפורטל: איזה שיעור מוצג בו, חצים להחלפה וכפתור הכניסה לשיעור
   · bubble  — בועת דיבור מעל הראש של ד"ר הולו (בקואורדינטות של תמונת הספרייה, ולכן נשארת במקום בכל גודל מסך)
   · mirrorAction — כפתור בצד שמאל של הבמה, במקום שהוא תמונת המראה של אלמנט בחלון שמימין (mirrorOf, בורר CSS):
               אותו גובה, ואותו מרחק מאמצע המסך לצד השני. בעמוד הפתיחה: "איפה אני?" מול הלוגו (לבקשת המשתמש)
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
/* הטקסט שעל הפורטל: באמצע הרוחב, בשליש העליון של הפתח (לבקשת המשתמש) */
const PORTAL = OPENING_STAGE.portal.box
const CAPTION_X = PORTAL.x + PORTAL.width / 2
const CAPTION_Y = PORTAL.y + PORTAL.height * 0.27
/* גודל האות בקואורדינטות של התמונה, והמינימום על המסך */
const CAPTION_FONT = 31
const CAPTION_FONT_MIN = 17

export default function PortalHero({ portalSrc, portalLabel, onPortalClick, leaving, onDiveEnd, bubble, mirrorAction, mirrorOf, caption, captionKey, captionProps, under, underProps, panel, panelClass, top }: {
  /* התמונה שבפורטל; בלי ערך הפורטל ריק */
  portalSrc?: string
  /* השם של הלחיצה על הפורטל, לקוראי מסך ולמקלדת */
  portalLabel?: string
  onPortalClick?: () => void
  leaving?: 'dive'
  onDiveEnd?: () => void
  bubble?: ReactNode
  mirrorAction?: ReactNode
  /* בורר של אלמנט בתוך החלון; הכפתור מוצב מולו */
  mirrorOf?: string
  caption?: PortalCaptionData
  /* כשהמפתח מתחלף (שיעור אחר בפורטל) הטקסט נדלק מחדש */
  captionKey?: string
  captionProps?: HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, string | undefined>
  under?: ReactNode
  underProps?: HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, string | undefined>
  panel: ReactNode
  panelClass?: string
  top?: ReactNode
}) {
  const stageRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [mirrorAt, setMirrorAt] = useState<{ left: number; top: number } | null>(null)
  const [bubbleAt, setBubbleAt] = useState<{ left: number; top: number } | null>(null)
  const [captionAt, setCaptionAt] = useState<CSSProperties | null>(null)
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = () => {
      const c = labCover(el.clientWidth, el.clientHeight, OPENING_STAGE)
      setBubbleAt({ left: c.x + BUBBLE_AT.x * c.scale, top: c.y + BUBBLE_AT.y * c.scale })
      const fontSize = Math.max(CAPTION_FONT_MIN, CAPTION_FONT * c.scale)
      /* לא עולה מעל קצה הבמה, גם כשהמסך נמוך והפורטל נחתך מלמעלה */
      setCaptionAt({ left: c.x + CAPTION_X * c.scale, top: Math.max(fontSize * 1.6, c.y + CAPTION_Y * c.scale), fontSize })
      /* תמונת מראה: המרכז של האלמנט שבחלון, משוקף סביב אמצע הבמה */
      const target = mirrorOf ? panelRef.current?.querySelector(mirrorOf) : null
      if (target) {
        const t = target.getBoundingClientRect(), s = el.getBoundingClientRect()
        setMirrorAt({ left: s.width - (t.left + t.width / 2 - s.left), top: t.top + t.height / 2 - s.top })
      } else setMirrorAt(null)
    }
    measure()
    /* החלון נכנס באנימציה (הזזה והגדלה), והגופנים משנים את הגובה שלו: מודדים שוב כשהוא במקומו */
    const panel = panelRef.current
    panel?.addEventListener('animationend', measure)
    const settle = window.setTimeout(measure, 1000)
    let live = true
    void document.fonts?.ready.then(() => { if (live) measure() })
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    ro?.observe(el)
    if (panel) ro?.observe(panel)
    return () => { live = false; ro?.disconnect(); panel?.removeEventListener('animationend', measure); window.clearTimeout(settle) }
  }, [mirrorOf])

  return (
    <section className="home4-hero" data-portal-hero data-leaving={leaving}>
      {top && <header className="home4-top" data-portal-top>{top}</header>}
      <div className="home4-body">
        <div ref={stageRef} className="home4-stage">
          {/* ד"ר הולו ממתין ליד הפורטל ולא מדבר: לופ העמידה המחויך (לבקשת המשתמש), ולא "ברוכים הבאים" */}
          <LabStage state="opening" portalSrc={portalSrc} mood="neutral" holoAnimation="idle" leaving={leaving} onDiveEnd={onDiveEnd} onPortalClick={onPortalClick} portalLabel={portalLabel} />
          {bubble && bubbleAt && <div className="home4-bubble home4-fade" data-portal-bubble style={bubbleAt}>{bubble}</div>}
          {mirrorAction && mirrorAt && <div className="home4-mirror-action home4-fade" data-portal-mirror-action style={mirrorAt}>{mirrorAction}</div>}
          {caption && captionAt && (
            <div className="home4-caption home4-fade" aria-hidden="true" data-portal-caption {...captionProps} style={captionAt}>
              <PortalCaption key={captionKey} {...caption} />
            </div>
          )}
          {under && <div className="home4-now home4-fade" data-portal-under {...underProps}>{under}</div>}
        </div>
        <div ref={panelRef} className={`home4-panel home4-fade${panelClass ? ` ${panelClass}` : ''}`} data-portal-panel style={panelStudent}>{panel}</div>
      </div>
    </section>
  )
}
