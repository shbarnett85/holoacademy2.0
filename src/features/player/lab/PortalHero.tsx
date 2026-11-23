/* המסך הראשון של עמוד הפתיחה ושל הבית של התלמיד: הבמה של פתיחת שיעור (LabStage) במסך מלא, עם פורטל שמציג שיעור.
   מסביב לבמה האזורים שהעמוד ממלא:
   · top     — פס לכל רוחב המסך מעל הבמה (אצל התלמיד: השלום והסיכום). בלי ערך: הבמה מתחילה מראש המסך
   · panel   — החלון הלבן הצף מימין, ברווח שבין טבעת הפורטל לקצה המסך (במסך צר: מתחת לבמה)
   · under   — מתחת לפורטל: איזה שיעור מוצג בו, חצים להחלפה וכפתור הכניסה לשיעור
   · bubble  — בועת דיבור מעל הראש של ד"ר הולו (בקואורדינטות של תמונת הספרייה, ולכן נשארת במקום בכל גודל מסך)
   · holoAction — כפתור מעל הראש של ד"ר הולו (בעמוד הפתיחה: "איפה אני?"): לרוחב באמצע הדמות (בקואורדינטות של תמונת
               הספרייה), והקצה העליון שלו על הקו העליון של החלון שמימין (לבקשת המשתמש)
   המסגרת (לבקשת המשתמש): כל מה שעל הבמה יושב על הצלעות של מלבן אחד. למעלה, למטה ומימין: הקצוות של החלון.
   משמאל: הקצה השמאלי של הכפתור שמעל ד"ר הולו (--frame-left), וגם "שחקו עכשיו" מתחיל בו
   · caption — שכבת טקסט הולוגרפית על הפורטל עצמו (אצל התלמיד: מצב השיעור), גם היא בקואורדינטות של תמונת הספרייה
   הבמה היא position: fixed, ולכן .home4-stage עם transform: היא ממלאת רק את האזור שלה, והעמוד נגלל הלאה.
   הסגנון: index.css (.home4-*); הטקסט ההולוגרפי: PortalCaption. */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react'
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

export default function PortalHero({ portalSrc, portalDir, portalNext, portalLabel, onPortalClick, leaving, onDiveEnd, bubble, holoAction, caption, captionKey, captionProps, under, underProps, panel, panelClass, top }: {
  /* התמונה שבפורטל; בלי ערך הפורטל ריק */
  portalSrc?: string
  /* כיוון המעבר כשהתמונה שבפורטל מתחלפת: 1 קדימה, -1 אחורה */
  portalDir?: 1 | -1
  /* תמונות שעשויות להגיע לפורטל בלחיצה הבאה: נטענות מראש, כדי שהמעבר יתחיל מיד ולא יחכה לרשת */
  portalNext?: (string | null | undefined)[]
  /* השם של הלחיצה על הפורטל, לקוראי מסך ולמקלדת */
  portalLabel?: string
  onPortalClick?: () => void
  leaving?: 'dive'
  onDiveEnd?: () => void
  bubble?: ReactNode
  holoAction?: ReactNode
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
  const nextKey = (portalNext ?? []).filter(Boolean).join('|')
  useEffect(() => {
    /* באותה צורת בקשה כמו ההולוגרמה (crossOrigin), כדי שהדפדפן ישתמש באותו עותק */
    for (const src of nextKey ? nextKey.split('|') : []) { const img = new Image(); img.crossOrigin = 'anonymous'; img.src = src }
  }, [nextKey])
  const stageRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const actionRef = useRef<HTMLDivElement>(null)
  const [actionAt, setActionAt] = useState<{ left: number; top: number } | null>(null)
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
      /* נקודות ייחוס לסגנון (index.css): אמצע הפורטל, אמצע ד"ר הולו, והקו התחתון של החלון שמימין.
         בעמוד הפתיחה שם השיעור ממורכז מתחת לפורטל ונשען על הקו הזה, ו"שחקו עכשיו" על אותו קו */
      el.style.setProperty('--portal-x', `${c.x + CAPTION_X * c.scale}px`)
      el.style.setProperty('--holo-x', `${c.x + BUBBLE_AT.x * c.scale}px`)
      const panelBox = panelRef.current?.getBoundingClientRect()
      const stageTop = el.getBoundingClientRect().top
      if (panelBox) el.style.setProperty('--panel-bottom', `${panelBox.bottom - stageTop}px`)
      /* הכפתור שמעל ד"ר הולו: לרוחב באמצע הדמות, והקצה העליון שלו על הקו העליון של החלון */
      setActionAt(panelBox ? { left: c.x + BUBBLE_AT.x * c.scale, top: panelBox.top - stageTop } : null)
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
  }, [])
  /* הצלע השמאלית של המסגרת: הקצה השמאלי של הכפתור שמעל ד"ר הולו. הרוחב שלו תלוי בגופן, ולכן נמדד מהכפתור עצמו */
  const actionLeft = holoAction && actionAt ? actionAt.left : null
  useLayoutEffect(() => {
    const el = stageRef.current, a = actionRef.current
    if (!el) return
    if (!a || actionLeft === null) { el.style.removeProperty('--frame-left'); return }
    const set = () => el.style.setProperty('--frame-left', `${actionLeft - a.offsetWidth / 2}px`)
    set()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(set)
    ro?.observe(a)
    return () => ro?.disconnect()
  }, [actionLeft])

  return (
    <section className="home4-hero" data-portal-hero data-leaving={leaving}>
      {top && <header className="home4-top" data-portal-top>{top}</header>}
      <div className="home4-body">
        <div ref={stageRef} className="home4-stage">
          {/* ד"ר הולו ממתין ליד הפורטל ולא מדבר: לופ העמידה המחויך (לבקשת המשתמש), ולא "ברוכים הבאים" */}
          <LabStage state="opening" portalSrc={portalSrc} portalDir={portalDir} mood="neutral" holoAnimation="idle" leaving={leaving} onDiveEnd={onDiveEnd} onPortalClick={onPortalClick} portalLabel={portalLabel} />
          {bubble && bubbleAt && <div className="home4-bubble home4-fade" data-portal-bubble style={bubbleAt}>{bubble}</div>}
          {holoAction && actionAt && <div ref={actionRef} className="home4-holo-action home4-fade" data-portal-holo-action style={actionAt}>{holoAction}</div>}
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
