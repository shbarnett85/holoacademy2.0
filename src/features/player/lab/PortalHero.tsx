/* המסך הראשון של עמוד הפתיחה ושל הבית של התלמיד: הבמה של פתיחת שיעור (LabStage) במסך מלא, עם פורטל שמציג שיעור.
   מסביב לבמה האזורים שהעמוד ממלא:
   · top     — פס לכל רוחב המסך מעל הבמה (אצל התלמיד: השלום והסיכום). בלי ערך: הבמה מתחילה מראש המסך
   · panel   — החלון הלבן הצף מימין, ברווח שבין טבעת הפורטל לקצה המסך (במסך צר: מתחת לבמה)
   · under   — על שלבי הבמה שלפני הפורטל (steps): איזה שיעור מוצג בו, וחצים להחלפה. לבקשת המשתמש, הקו העליון של הכרטיס
               תמיד על קו האור השני שלהם (--steps-y, בקואורדינטות של תמונת הספרייה). כשהבמה רחבה ונמוכה ואין לכרטיס
               מקום מתחת לקו, התמונה כולה עולה (מוקד החיתוך האנכי, focalY) עד שיש. אין כפתור כניסה: נכנסים בלחיצה על הפורטל
   · holoAction — כפתור מעל הראש של ד"ר הולו (בעמוד הפתיחה: "איפה אני?"): לרוחב באמצע הדמות (בקואורדינטות של תמונת
               הספרייה), והקצה העליון שלו על הקו העליון של החלון שמימין (לבקשת המשתמש)
   · caption — שכבת טקסט הולוגרפית על הפורטל עצמו (אצל התלמיד: מצב השיעור; בעמוד הפתיחה: "נסו עכשיו"), גם היא
               בקואורדינטות של תמונת הספרייה
   הבמה היא position: fixed, ולכן .home4-stage עם transform: היא ממלאת רק את האזור שלה, והעמוד נגלל הלאה.
   הסגנון: index.css (.home4-*); הטקסט ההולוגרפי: PortalCaption. */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react'
import { panelStudent } from '../../../styles/ui'
import LabStage from './LabStage'
import PortalCaption, { type PortalCaptionData } from './PortalCaption'
import { OPENING_STAGE, labCover } from './labComposition'
import { CONSOLE_ASPECT } from './PortalConsole'

/* ד"ר הולו, בקואורדינטות של תמונת הספרייה: אמצע הדמות לרוחב, וקצת מתחת לקצה העליון שלה */
const HOLO_AT = { x: OPENING_STAGE.holo.centerX, y: OPENING_STAGE.holo.top + 18 }
/* הטקסט שעל הפורטל: באמצע הרוחב, בשליש העליון של הפתח (לבקשת המשתמש) */
const PORTAL = OPENING_STAGE.portal.box
const CAPTION_X = PORTAL.x + PORTAL.width / 2
const CAPTION_Y = PORTAL.y + PORTAL.height * 0.27
/* גודל האות בקואורדינטות של התמונה, והמינימום על המסך */
const CAPTION_FONT = 31
const CAPTION_FONT_MIN = 17
/* קו האור השני בשלבי הבמה שלפני הפורטל (step 2): הקו העליון של כרטיס שם השיעור */
const STEP_LINE = OPENING_STAGE.stepLine ?? PORTAL.y + PORTAL.height + 24
/* הקצה התחתון של פתח הפורטל: כשאין מקום, הקונסולה עולה עד אליו (ומכסה את שלבי הבמה), ורק אחר כך התמונה כולה עולה */
const OPENING_BOTTOM = PORTAL.y + PORTAL.height
/* החלק העליון של הקונסולה (הבליטה עם הכפתור) צר, ולכן מותר לו לעלות על תחתית הפתח: עד החלק הזה מגובה הקונסולה */
const BUMP_PART = 0.3
/* כמה מהפתח נשאר מעל הקצה העליון של הבמה לפני שמוותרים ונותנים לבליטה לעלות על תחתיתו */
const OPENING_TOP_MARGIN = 8
/* מתחת לקונסולה: הצל שלה ומעט אוויר */
const UNDER_GAP = 12
/* רוחב הקונסולה (אותו חישוב כמו ב-index.css: .home4-now), כדי לדעת את הגובה שלה לפני שהיא מוצגת ושהתמונה לא תזוז כשהיא מגיעה */
const consoleWidth = (stageW: number, stageH: number) => Math.min(stageW - 20, Math.max(350, Math.min(760, window.innerWidth * 0.38, stageH * 0.9)))

export default function PortalHero({ portalSrc, portalDir, portalNext, portalLabel, onPortalClick, onPortalHover, leaving, onDiveEnd, holoAction, caption, captionKey, captionProps, under, underProps, panel, panelClass, top }: {
  /* התמונה שבפורטל; בלי ערך הפורטל ריק */
  portalSrc?: string
  /* כיוון המעבר כשהתמונה שבפורטל מתחלפת: 1 קדימה, -1 אחורה */
  portalDir?: 1 | -1
  /* תמונות שעשויות להגיע לפורטל בלחיצה הבאה: נטענות מראש, כדי שהמעבר יתחיל מיד ולא יחכה לרשת */
  portalNext?: (string | null | undefined)[]
  /* השם של הלחיצה על הפורטל, לקוראי מסך ולמקלדת */
  portalLabel?: string
  onPortalClick?: () => void
  /* העכבר או הפוקוס על הפורטל */
  onPortalHover?: (over: boolean) => void
  leaving?: 'dive'
  onDiveEnd?: () => void
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
  const underRef = useRef<HTMLDivElement>(null)
  const [actionAt, setActionAt] = useState<{ left: number; top: number } | null>(null)
  const [captionAt, setCaptionAt] = useState<CSSProperties | null>(null)
  const [focalY, setFocalY] = useState(OPENING_STAGE.focal.y)
  const hasUnder = !!under
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = () => {
      const W = el.clientWidth, H = el.clientHeight
      const stageBox = el.getBoundingClientRect()
      const panelBox = panelRef.current?.getBoundingClientRect()
      /* מקום לכרטיס שם השיעור מתחת לקו האור השני: כשהתמונה נחתכת למעלה ולמטה (במה רחבה ונמוכה) ואין מקום,
         מוקד החיתוך יורד והתמונה כולה עולה. במסך צר החלון שמתחת לבמה עולה מעט על הקצה התחתון שלה, וגם זה נלקח בחשבון */
      const scale = Math.max(W / OPENING_STAGE.width, H / OPENING_STAGE.height)
      const spare = OPENING_STAGE.height * scale - H
      const portalX = (W - OPENING_STAGE.width * scale) * OPENING_STAGE.focal.x + CAPTION_X * scale
      const covered = panelBox && panelBox.left < stageBox.left + portalX && panelBox.right > stageBox.left + portalX ? Math.max(0, stageBox.bottom - panelBox.top) : 0
      const underH = underRef.current?.offsetHeight || consoleWidth(W, H) / CONSOLE_ASPECT
      const need = underH + UNDER_GAP + covered
      /* כמה התמונה עולה: עד שהקונסולה כולה מתחת לפתח, אבל לא עד כדי כך שראש הפתח נחתך; במקרה כזה הבליטה שבראש
         הקונסולה עולה על תחתית הפתח, ורק כשגם זה לא מספיק התמונה ממשיכה לעלות */
      const lift = (px: number) => (px + OPENING_BOTTOM * scale - H) / spare
      const keepTop = (PORTAL.y * scale - OPENING_TOP_MARGIN) / spare
      const fy = spare > 0.5 ? Math.round(Math.min(1, Math.max(OPENING_STAGE.focal.y, Math.min(lift(need), Math.max(keepTop, lift(need - BUMP_PART * underH))))) * 1000) / 1000 : OPENING_STAGE.focal.y
      setFocalY((prev) => (prev === fy ? prev : fy))
      const c = labCover(W, H, { ...OPENING_STAGE, focal: { ...OPENING_STAGE.focal, y: fy } })
      const fontSize = Math.max(CAPTION_FONT_MIN, CAPTION_FONT * c.scale)
      /* לא עולה מעל קצה הבמה, גם כשהמסך נמוך והפורטל נחתך מלמעלה */
      setCaptionAt({ left: c.x + CAPTION_X * c.scale, top: Math.max(fontSize * 1.6, c.y + CAPTION_Y * c.scale), fontSize })
      /* נקודות ייחוס לסגנון (index.css): אמצע הפורטל, אמצע ד"ר הולו, וקו האור השני שלפני הפורטל */
      el.style.setProperty('--portal-x', `${c.x + CAPTION_X * c.scale}px`)
      el.style.setProperty('--holo-x', `${c.x + HOLO_AT.x * c.scale}px`)
      el.style.setProperty('--steps-y', `${c.y + STEP_LINE * c.scale}px`)
      /* הקונסולה: הקצה העליון שלה על קו האור השני כשיש מקום מתחתיו; אחרת היא צמודה לתחתית הבמה ועולה על השלבים */
      el.style.setProperty('--under-top', `${Math.max(0, Math.min(c.y + STEP_LINE * c.scale, H - need))}px`)
      el.style.setProperty('--stage-h', `${H}px`)
      const stageTop = stageBox.top
      /* הכפתור שמעל ד"ר הולו: לרוחב באמצע הדמות, והקצה העליון שלו על הקו העליון של החלון */
      setActionAt(panelBox ? { left: c.x + HOLO_AT.x * c.scale, top: panelBox.top - stageTop } : null)
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
    if (underRef.current) ro?.observe(underRef.current)
    return () => { live = false; ro?.disconnect(); panel?.removeEventListener('animationend', measure); window.clearTimeout(settle) }
  }, [hasUnder])

  return (
    <section className="home4-hero" data-portal-hero data-leaving={leaving}>
      {top && <header className="home4-top" data-portal-top>{top}</header>}
      <div className="home4-body">
        <div ref={stageRef} className="home4-stage">
          {/* ד"ר הולו ממתין ליד הפורטל ולא מדבר: לופ העמידה המחויך (לבקשת המשתמש), ולא "ברוכים הבאים" */}
          <LabStage state="opening" portalSrc={portalSrc} portalDir={portalDir} mood="neutral" holoAnimation="idle" leaving={leaving} onDiveEnd={onDiveEnd} onPortalClick={onPortalClick} onPortalHover={onPortalHover} portalLabel={portalLabel} focalY={focalY} />
          {holoAction && actionAt && <div className="home4-holo-action home4-fade" data-portal-holo-action style={actionAt}>{holoAction}</div>}
          {caption && captionAt && (
            <div className="home4-caption home4-fade" aria-hidden="true" data-portal-caption {...captionProps} style={captionAt}>
              <PortalCaption key={captionKey} {...caption} />
            </div>
          )}
          {under && <div ref={underRef} className="home4-now home4-fade" data-portal-under {...underProps}>{under}</div>}
        </div>
        <div ref={panelRef} className={`home4-panel home4-fade${panelClass ? ` ${panelClass}` : ''}`} data-portal-panel style={panelStudent}>{panel}</div>
      </div>
    </section>
  )
}
