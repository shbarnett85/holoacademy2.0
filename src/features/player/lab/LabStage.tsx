/* המעבדה הקבועה של מסכי הפתיחה והסיכום. בכל שיעור משתנים רק מה שרואים בפורטל ומצב הרוח של ד"ר הולו.
   הכול יושב בעולם אחד בקואורדינטות של תמונת המעבדה, עם טרנספורמציה אחת, ולכן נשאר מיושר בכל גודל מסך.
   · הפורטל: מסכה לפי הצורה, שוליים זוהרים שמסתחררים לאט, ופני מים שהתמונה נראית דרכם (PortalPuddle).
   · state=open (הסיפור נשאר פתוח): הפורטל לא יציב — מהבהב קלות, והמים גועשים יותר.
   · הפורטל לחיץ (onPortalClick): בפתיחה כמו "המשך", בסיפור פתוח ניסיון נוסף, בסיפור שנסגר חזרה למסך הראשי.
   · התאורה מגיבה לפורטל: זוהר בצבע הממוצע של התמונה, על הרצפה ועל הקירות הקרובים.
   · מצלמה: טרנספורמציה אחת על כל הקומפוזיציה (.lab-camera). פתיחה: קירוב איטי, ובסיום צלילה לפורטל (leaving=dive) עד שתמונתו ממלאת את המסך.
     סיכום: מתחילים בתוך הפורטל, נסוגים, ואז קירוב איטי אל ד"ר הולו. בעוצמה עדינה: דהייה בלבד. בתנועה מופחתת: בלי תנועת מצלמה.
   העולם הוא stacking context שכולל את המעבדה, ולכן המיזוג של ההולוגרמה עם המעבדה עובד. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import DrHoloHologram from '../DrHoloHologram'
import { useGameFeel, type HoloMood } from '../gameFeel/engine'
import PortalPuddle from './PortalPuddle'
import { LAB, cameraCss, cameraInsidePortal, cameraOpening, cameraRest, cameraSummary, labCover, portalClipPath, portalFocusX, portalPoints } from './labComposition'

const CSS = `
.lab-stage { position: fixed; inset: 0; overflow: hidden; background: #040913; pointer-events: none; }
/* סוף הצלילה: המעבדה מעל הפריסה הרגילה, ונמוגה ממנה */
.lab-stage[data-leaving=reveal] { z-index: 40; animation: lab-reveal var(--lab-reveal-ms) ease-out both; }
@keyframes lab-reveal { to { opacity: 0; } }
.lab-world { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.lab-camera { position: absolute; inset: 0; transform-origin: 0 0; }
.lab-camera > img { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.lab-glow { position: absolute; mix-blend-mode: screen; }
.lab-glow--floor { left: 400px; top: 1120px; width: 1760px; height: 320px; background: radial-gradient(closest-side, var(--lab-tint), transparent 100%); opacity: .42; }
.lab-glow--wall { left: 420px; top: 60px; width: 1720px; height: 1240px; background: radial-gradient(closest-side, var(--lab-tint), transparent 100%); opacity: .3; }
.lab-portal { position: absolute; overflow: hidden; background: #020409; }
.lab-portal__img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.lab-puddle { position: absolute; inset: 0; width: 100%; height: 100%; display: block; transition: opacity .5s linear; }
/* אזור הלחיצה בצורת הפתח: מחוץ למסכה הלחיצה עוברת הלאה. הרים נדלק כסימן שאפשר ללחוץ */
.lab-portal-hit { position: absolute; padding: 0; border: 0; background: transparent; cursor: pointer; pointer-events: auto; outline: none; }
.lab-portal-hit:hover + .lab-rim .lab-rim__base, .lab-portal-hit:focus-visible + .lab-rim .lab-rim__base { opacity: 1; stroke-width: 12; }
.lab-rim { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.lab-rim polygon { fill: none; stroke-linejoin: round; }
.lab-rim__base { stroke: #5AB8FF; stroke-width: 7; opacity: .75; filter: drop-shadow(0 0 12px #5AB8FF); }
.lab-rim__swirl { stroke: #D8F3FF; stroke-width: 11; stroke-dasharray: 340 300; stroke-linecap: round; filter: drop-shadow(0 0 16px #8FD3FF); animation: lab-rim-swirl 34s linear infinite; }
@keyframes lab-rim-swirl { to { stroke-dashoffset: -2560; } }
.lab-holo { position: absolute; }
/* חצי גוף: המעבר של צבעי המותג מכווץ כדי שהמג'נטה ייכנס עד המותן */
.lab-holo .dr-holo__tint { background: linear-gradient(170deg, #2ff3ff 4%, #5AB8FF 24%, #8f86ff 38%, #ff45e6 56%); }
/* פורטל לא יציב: הבהוב קל, לא יותר מפעמיים בשנייה */
.lab-stage[data-portal=open] .lab-portal__wrap { animation: lab-portal-unstable 5.5s steps(1, end) infinite; }
@keyframes lab-portal-unstable { 0%, 100% { opacity: 1; } 18% { opacity: .84; } 22% { opacity: 1; } 47% { opacity: .9; } 53% { opacity: .78; } 58% { opacity: 1; } 81% { opacity: .88; } 86% { opacity: 1; } }
.lab-stage[data-portal=open] .lab-rim__swirl { animation-duration: 15s; stroke: #BFD6E8; }
.lab-stage[data-portal=open] .lab-glow { opacity: .22; }
@media (prefers-reduced-motion: reduce) {
  .lab-rim__swirl, .lab-stage[data-portal=open] .lab-portal__wrap, .lab-stage[data-leaving=reveal] { animation: none; }
}
`

/* הצבע הממוצע של תמונת הפורטל. תמונה שאוסרת קריאה (CORS): נשארים בכחול של המעבדה */
function useAverageColor(src?: string): string {
  const [color, setColor] = useState('rgb(90,184,255)')
  useEffect(() => {
    if (!src) return
    let cancelled = false
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = 1
        c.height = 1
        const g = c.getContext('2d')
        if (!g) return
        g.drawImage(img, 0, 0, 1, 1)
        const [r, gr, b] = g.getImageData(0, 0, 1, 1).data
        if (!cancelled) setColor(`rgb(${r},${gr},${b})`)
      } catch { /* נשארים עם ברירת המחדל */ }
    }
    img.src = src
    return () => { cancelled = true }
  }, [src])
  return color
}

export default function LabStage({ state, portalSrc, mood, human = false, leaving, onDiveEnd, onRevealEnd, onPortalClick, portalLabel }: {
  state: 'opening' | 'closed' | 'open'
  portalSrc?: string
  mood: HoloMood
  human?: boolean
  /* יציאה מהפתיחה: dive = צלילה לפורטל, reveal = דהייה אל הסצנה הראשונה */
  leaving?: 'dive' | 'reveal'
  onDiveEnd?: () => void
  onRevealEnd?: () => void
  onPortalClick?: () => void
  /* השם של הפעולה לקוראי מסך ולמקלדת */
  portalLabel?: string
}) {
  const feel = useGameFeel()
  const ref = useRef<HTMLDivElement | null>(null)
  const [fit, setFit] = useState<{ scale: number; x: number; y: number } | null>(null)
  const tint = useAverageColor(portalSrc)
  const cameraRef = useRef<HTMLDivElement | null>(null)
  const anim = useRef<Animation | null>(null)
  const moving = !feel.reduced && feel.level !== 'gentle'
  const hasFit = !!fit
  /* בסיכום המצלמה מתחילה בתוך הפורטל והוא ממלא את המסך: לחיצה רק אחרי הנסיגה, כדי שלחיצה כפולה על "סיום" לא תוציא מהמסך */
  const [armed, setArmed] = useState(state === 'opening' || !moving)
  useEffect(() => {
    if (armed) return
    const t = window.setTimeout(() => setArmed(true), LAB.camera.pullbackMs)
    return () => window.clearTimeout(t)
  }, [armed])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setFit(labCover(el.clientWidth, el.clientHeight))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /* המצלמה: WAAPI ולא CSS, כי הצלילה יוצאת מהנקודה שבה הקירוב האיטי נמצא עכשיו */
  useEffect(() => {
    const cam = cameraRef.current
    const el = ref.current
    if (!cam || !el || !moving || leaving) return
    const w = el.clientWidth
    const h = el.clientHeight
    const { approachMs, pullbackMs } = LAB.camera
    const fill = 'forwards' as const
    const approach = (to: string) => { anim.current = cam.animate([{ transform: cameraCss(cameraRest) }, { transform: to }], { duration: approachMs, easing: 'linear', fill }) }
    if (state === 'opening') { approach(cameraCss(cameraOpening(w, h))); return () => anim.current?.cancel() }
    const back = cam.animate([{ transform: cameraCss(cameraInsidePortal(w, h)) }, { transform: cameraCss(cameraRest) }], { duration: pullbackMs, easing: 'cubic-bezier(.16,.8,.3,1)', fill })
    anim.current = back
    back.onfinish = () => approach(cameraCss(cameraSummary()))
    return () => { back.onfinish = null; anim.current?.cancel() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFit, moving, state])

  useEffect(() => {
    const cam = cameraRef.current
    const el = ref.current
    if (leaving !== 'dive' || !cam || !el) return
    const from = getComputedStyle(cam).transform
    anim.current?.cancel()
    const dive = cam.animate([{ transform: from === 'none' ? cameraCss(cameraRest) : from }, { transform: cameraCss(cameraInsidePortal(el.clientWidth, el.clientHeight)) }], { duration: LAB.camera.diveMs, easing: 'cubic-bezier(.55,0,.75,.4)', fill: 'forwards' })
    /* הצלילה לא נשמרת ב-anim: ירידת עוצמה באמצע (מדידת FPS) מנקה את אפקט המצלמה, וביטול הצלילה היה תוקע את התלמיד */
    anim.current = null
    dive.onfinish = () => onDiveEnd?.()
    return () => { dive.onfinish = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving])

  /* גל במים: ביציאה מהפורטל בסיכום, וברגע הצלילה אליו */
  const splashKey = leaving === 'dive' ? 2 : state === 'opening' ? 0 : 1
  const holoWidth = LAB.holo.height * 9 / 16
  const box = LAB.portal.box
  const scale = fit?.scale ?? 1
  return (
    <div ref={ref} className="lab-stage" data-lab-stage data-portal={state} data-leaving={leaving} style={{ ['--lab-reveal-ms' as string]: `${LAB.camera.revealMs}ms` }} onAnimationEnd={(e) => { if (e.animationName === 'lab-reveal') onRevealEnd?.() }}>
      <style>{CSS}</style>
      {fit && (
        <div
          className="lab-world"
          style={{
            width: LAB.width,
            height: LAB.height,
            transform: `translate(${fit.x}px, ${fit.y}px) scale(${scale})`,
            ['--lab-tint' as string]: tint,
            /* קווי הסריקה בפיקסלים של המסך, לא של התמונה */
            ['--holo-scan-on' as string]: `${3 / scale}px`,
            ['--holo-scan-all' as string]: `${4 / scale}px`,
          }}
        >
          <div ref={cameraRef} className="lab-camera">
          <img src={LAB.src} alt="" draggable={false} />
          {portalSrc && <span className="lab-glow lab-glow--wall" />}
          {portalSrc && <span className="lab-glow lab-glow--floor" />}
          <div className="lab-portal__wrap" data-lab-portal style={{ position: 'absolute', inset: 0 }}>
            <div className="lab-portal" style={{ left: box.x, top: box.y, width: box.width, height: box.height, clipPath: portalClipPath() }}>
              {portalSrc && <img className="lab-portal__img" src={portalSrc} alt="" draggable={false} style={{ objectPosition: `${portalFocusX(portalSrc) * 100}% 50%` }} />}
              {portalSrc && moving && <PortalPuddle src={portalSrc} width={box.width} height={box.height} screenScale={scale} focusX={portalFocusX(portalSrc)} agitated={state === 'open'} splashKey={splashKey} />}
            </div>
            {onPortalClick && armed && !leaving && (
              <button type="button" className="lab-portal-hit" data-lab-portal-hit aria-label={portalLabel} onClick={onPortalClick} style={{ left: box.x, top: box.y, width: box.width, height: box.height, clipPath: portalClipPath() }} />
            )}
            <svg className="lab-rim" viewBox={`0 0 ${LAB.width} ${LAB.height}`} aria-hidden="true">
              <polygon className="lab-rim__base" points={portalPoints()} />
              <polygon className="lab-rim__swirl" points={portalPoints()} />
            </svg>
          </div>
          <div className="lab-holo" data-lab-holo style={{ left: LAB.holo.centerX - holoWidth / 2, top: LAB.holo.top }}>
            <DrHoloHologram mood={mood} build video human={human} height={`${LAB.holo.height}px`} />
          </div>
          </div>
        </div>
      )}
    </div>
  )
}
