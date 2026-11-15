/* הבמה הקבועה של מסכי הפתיחה והסיכום. בכל שיעור משתנים רק מה שרואים בפורטל ומצב הרוח של ד"ר הולו.
   הרקע לפי המסך (labComposition.stageFor): בפתיחה "ספריית השרתים" הבהירה, וידאו בלולאה מעל תמונה קבועה
   (בעוצמה עדינה, בתנועה מופחתת ובמחשב חלש: התמונה בלבד); בסיכום המעבדה הכהה.
   הכול יושב בעולם אחד בקואורדינטות של תמונת המעבדה, עם טרנספורמציה אחת, ולכן נשאר מיושר בכל גודל מסך.
   · הפורטל: מסכה לפי הצורה, והתמונה של השיעור כהולוגרמה כחלחלה עם ריצוד עדין (PortalHologram), טבעת אור תכלת וזוהר סביבה,
     והשתקפות ברצפה. בסיפור שנסגר הצבע עובר מתכלת לכתום-זהוב (PORTAL_GOLD_MS) אחרי שהמצלמה נסוגה.
     בלי תנועה (עוצמה עדינה, תנועה מופחתת) או בלי WebGL: אותו מראה, קבוע, ב-CSS (גוון, קווי סריקה, שפה זוהרת), בלי השתקפות התמונה.
   · state=open (הסיפור נשאר פתוח): הפורטל לא יציב — מהבהב קלות, והריצוד חזק יותר.
   · הפורטל לחיץ (onPortalClick): בפתיחה כמו "המשך", בסיפור פתוח ניסיון נוסף, בסיפור שנסגר חזרה לספרייה (המסך הראשי של מי שמשחק).
   · התאורה מגיבה לפורטל: זוהר בצבע הממוצע של התמונה, על הרצפה ועל הקירות הקרובים.
   · מצלמה: טרנספורמציה אחת על כל הקומפוזיציה (.lab-camera). פתיחה: קירוב איטי, ובסיום צלילה לפורטל (leaving=dive) עד שתמונתו ממלאת את המסך.
     סיכום: מתחילים בתוך הפורטל, נסוגים, ואז קירוב איטי אל ד"ר הולו. בעוצמה עדינה: דהייה בלבד. בתנועה מופחתת: בלי תנועת מצלמה.
   העולם הוא stacking context שכולל את המעבדה, ולכן המיזוג של ההולוגרמה עם המעבדה עובד. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import DrHoloHologram from '../DrHoloHologram'
import { HOLO_ASPECT } from '../drHoloClips'
import { useGameFeel, type HoloMood } from '../gameFeel/engine'
import { BOOK_TEXT } from '../gameFeel/text'
import PortalHologram, { PORTAL_GOLD_MS } from './PortalHologram'
import { cameraCss, cameraInsidePortal, cameraOpening, cameraRest, cameraSummary, hologramGeometry, labCover, portalClipPath, portalPoints, stageFor, type StageComposition } from './labComposition'

const CSS = `
.lab-stage { position: fixed; inset: 0; overflow: hidden; background: #040913; pointer-events: none; }
/* סוף הצלילה: המעבדה מעל הפריסה הרגילה, ונמוגה ממנה */
.lab-stage[data-leaving=reveal] { z-index: 40; animation: lab-reveal var(--lab-reveal-ms) ease-out both; }
@keyframes lab-reveal { to { opacity: 0; } }
.lab-world { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.lab-camera { position: absolute; inset: 0; transform-origin: 0 0; }
.lab-camera > img, .lab-camera > video { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
/* הווידאו נכנס מעל התמונה רק כשהוא מתנגן, כדי שלא ייראה פריים ריק */
.lab-camera > video { object-fit: fill; opacity: 0; transition: opacity .4s linear; }
.lab-camera > video[data-playing] { opacity: 1; }
.lab-glow { position: absolute; mix-blend-mode: screen; }
.lab-glow--floor { left: 400px; top: 1120px; width: 1760px; height: 320px; background: radial-gradient(closest-side, var(--lab-tint), transparent 100%); opacity: .42; }
.lab-glow--wall { left: 420px; top: 60px; width: 1720px; height: 1240px; background: radial-gradient(closest-side, var(--lab-tint), transparent 100%); opacity: .3; }
.lab-portal { position: absolute; overflow: hidden; background: #020409; }
.lab-portal__img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.lab-hologram { position: absolute; display: block; mix-blend-mode: screen; pointer-events: none; transition: opacity .5s linear; }
/* המראה ההולוגרפי הקבוע (בלי תנועה / בלי WebGL): גוון בצבע הפורטל, קווי סריקה ושפה זוהרת מעל התמונה. כשההולוגרמה החיה מוכנה, הם נמוגים */
.lab-portal > * { transition: opacity .5s linear; }
.lab-portal[data-holo-live] > * { opacity: 0; }
.lab-portal__light { position: absolute; inset: 0; mix-blend-mode: screen; }
.lab-portal__scan { position: absolute; inset: 0; background: repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0 2px, rgba(0,0,0,.14) 2px 3px); }
/* זוהר הפורטל (תמיד, גם בלי תנועה): הילה סביב הטבעת, טבעת אור, ואור על הבמה ועל הרצפה. משולב ב-screen עם הרקע.
   הדהייה בין התכלת לזהב היא על כל שכבה ולא על הקבוצה: שקיפות על הקבוצה הייתה מבודדת את המיזוג מהרקע באמצע המעבר */
.lab-pglow { --pg: 99 207 255; --pg-core: 234 251 255; position: absolute; inset: 0; pointer-events: none; }
.lab-pglow--gold { --pg: 255 153 46; --pg-core: 255 240 214; }
.lab-pglow > * { position: absolute; mix-blend-mode: screen; transition: opacity ${PORTAL_GOLD_MS}ms ease-in-out; }
.lab-pglow--gold > *, .lab-stage[data-portal-gold] .lab-pglow--cyan > * { opacity: 0; }
.lab-stage[data-portal-gold] .lab-pglow--gold > * { opacity: 1; }
.lab-pglow__halo { border-radius: 50%; background: radial-gradient(circle closest-side, rgb(var(--pg) / 0) 56%, rgb(var(--pg) / .62) 67.4%, rgb(var(--pg) / .22) 80%, rgb(var(--pg) / 0) 100%); }
.lab-pglow__steps { background: radial-gradient(ellipse closest-side, rgb(var(--pg) / .45), rgb(var(--pg) / 0)); }
.lab-pglow__floor { background: radial-gradient(ellipse closest-side, rgb(var(--pg) / .4), rgb(var(--pg) / .14) 60%, rgb(var(--pg) / 0)); }
.lab-pglow__ring { inset: 0; width: 100%; height: 100%; overflow: visible; }
.lab-pglow__ring circle { fill: none; }
.lab-portal .lab-pglow > .lab-portal__tint { inset: 0; mix-blend-mode: color; background: rgb(var(--pg) / .66); }
.lab-portal .lab-pglow > .lab-portal__light { inset: 0; }
/* אזור הלחיצה בצורת הפתח: מחוץ למסכה הלחיצה עוברת הלאה. הרים נדלק כסימן שאפשר ללחוץ */
.lab-portal-hit { position: absolute; padding: 0; border: 0; background: transparent; cursor: pointer; pointer-events: auto; outline: none; }
.lab-portal-hit:hover + .lab-rim .lab-rim__base, .lab-portal-hit:focus-visible + .lab-rim .lab-rim__base { opacity: 1; stroke-width: 12; }
.lab-rim { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.lab-rim polygon { fill: none; stroke-linejoin: round; }
.lab-rim__base { stroke: #5AB8FF; stroke-width: 7; opacity: .75; filter: drop-shadow(0 0 12px #5AB8FF); }
.lab-rim__swirl { stroke: #D8F3FF; stroke-width: 11; stroke-dasharray: 340 300; stroke-linecap: round; filter: drop-shadow(0 0 16px #8FD3FF); animation: lab-rim-swirl 34s linear infinite; }
@keyframes lab-rim-swirl { to { stroke-dashoffset: -2560; } }
.lab-holo { position: absolute; }
/* רקע בהיר (ספריית השרתים): בלי שכבות הזוהר של המעבדה הכהה. הטבעת כבר חלק מהרקע, ולכן קו הטבעת מופיע רק כסימן שאפשר ללחוץ */
.lab-stage[data-lab-tone=light] { background: var(--color-machine-bg); }
.lab-stage[data-lab-tone=light] .lab-glow, .lab-stage[data-lab-tone=light] .lab-rim__swirl { display: none; }
.lab-stage[data-lab-tone=light] .lab-portal { background: transparent; }
.lab-stage[data-lab-tone=light] .lab-rim__base { stroke: var(--color-surface); stroke-width: 5; opacity: 0; filter: none; }
.lab-stage[data-lab-tone=light] .lab-portal-hit:hover + .lab-rim .lab-rim__base, .lab-stage[data-lab-tone=light] .lab-portal-hit:focus-visible + .lab-rim .lab-rim__base { opacity: 1; stroke-width: 7; }
/* תווית השם של ד"ר הולו: במרחב המסך (לא זזה עם המצלמה), מתחת לדמות. לבנה עם קו דיו, כמו שאר משטחי התלמיד */
.lab-nameplate { position: absolute; bottom: clamp(.5rem, 3.2vh, 1.4rem); transform: translateX(-50%); z-index: 2; display: flex; flex-direction: column; align-items: center; gap: .05rem;
  padding: .28rem .9rem .32rem; border: var(--border-student); border-radius: 12px; background: var(--color-surface); color: var(--color-ink); box-shadow: var(--shadow-button);
  font-family: var(--font-display); line-height: 1.2; white-space: nowrap; text-align: center; transition: opacity .25s ease; }
.lab-nameplate b { font-size: .8rem; font-weight: 800; }
.lab-nameplate span { font-size: .62rem; font-weight: 600; }
.lab-nameplate[data-hidden] { opacity: 0; }
/* פורטל לא יציב: הבהוב קל, לא יותר מפעמיים בשנייה. על כל שכבה בנפרד ולא על העוטף, כי שקיפות על העוטף הייתה מבודדת את המיזוג (screen) מהרקע */
.lab-stage[data-portal=open] :is(.lab-portal, .lab-hologram, .lab-pglow--cyan > *) { animation: lab-portal-unstable 5.5s steps(1, end) infinite; }
@keyframes lab-portal-unstable { 0%, 100% { opacity: 1; } 18% { opacity: .84; } 22% { opacity: 1; } 47% { opacity: .9; } 53% { opacity: .78; } 58% { opacity: 1; } 81% { opacity: .88; } 86% { opacity: 1; } }
.lab-stage[data-portal=open] .lab-rim__swirl { animation-duration: 15s; stroke: #BFD6E8; }
.lab-stage[data-portal=open] .lab-glow { opacity: .22; }
@media (prefers-reduced-motion: reduce) {
  .lab-rim__swirl, .lab-stage[data-portal=open] :is(.lab-portal, .lab-hologram, .lab-pglow--cyan > *), .lab-stage[data-leaving=reveal] { animation: none; }
}
`

/* זוהר הפורטל בצבע אחד (תכלת או כתום-זהוב). בסיפור שנסגר שתי הקבוצות קיימות, והמעבר ביניהן הוא דהייה */
function PortalGlow({ comp, tone }: { comp: StageComposition; tone: 'cyan' | 'gold' }) {
  const h = comp.hologram
  if (!h) return null
  const stageTop = comp.portal.box.y + comp.portal.box.height
  const halo = h.r / 0.674
  const stop = (y: number) => `${((y - h.cy + halo) / (halo * 2)) * 100}%`
  return (
    <div className={`lab-pglow lab-pglow--${tone}`} data-lab-pglow={tone} aria-hidden="true">
      <span className="lab-pglow__halo" style={{ left: h.cx - halo, top: h.cy - halo, width: halo * 2, height: halo * 2,
        maskImage: `linear-gradient(to bottom, #000 ${stop(stageTop)}, transparent ${stop(h.stageFront)})` }} />
      <span className="lab-pglow__steps" style={{ left: h.cx - h.r * 1.45, top: stageTop - 26, width: h.r * 2.9, height: h.stageFront - stageTop + 40 }} />
      <span className="lab-pglow__floor" style={{ left: h.cx - h.r * 1.7, top: h.stageFront - 10, width: h.r * 3.4, height: h.r * 1.1 }} />
      <svg className="lab-pglow__ring" viewBox={`0 0 ${comp.width} ${comp.height}`}>
        <defs><clipPath id={`lab-pglow-clip-${tone}`}><rect x="0" y="0" width={comp.width} height={stageTop + 1} /></clipPath></defs>
        <g clipPath={`url(#lab-pglow-clip-${tone})`}>
          <circle cx={h.cx} cy={h.cy} r={h.r} strokeWidth={28} style={{ stroke: 'rgb(var(--pg) / .2)' }} />
          <circle cx={h.cx} cy={h.cy} r={h.r} strokeWidth={11} style={{ stroke: 'rgb(var(--pg) / .55)' }} />
          <circle cx={h.cx} cy={h.cy} r={h.r} strokeWidth={4} style={{ stroke: 'rgb(var(--pg-core) / 1)' }} />
        </g>
      </svg>
    </div>
  )
}

/* המראה ההולוגרפי הקבוע בתוך הפורטל (גוון ואור בשפה), בצבע אחד */
function PortalStaticLook({ comp, tone }: { comp: StageComposition; tone: 'cyan' | 'gold' }) {
  const h = comp.hologram
  if (!h) return null
  const { box } = comp.portal
  const at = `${h.cx - box.x}px ${h.cy - box.y}px`
  return (
    <div className={`lab-pglow lab-pglow--${tone}`}>
      <span className="lab-portal__tint" />
      <span className="lab-portal__light" style={{ background: `radial-gradient(circle ${h.r}px at ${at}, rgb(var(--pg) / .1) 50%, rgb(var(--pg) / .32) 86%, rgb(var(--pg-core) / .75) 100%)` }} />
    </div>
  )
}

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
  const comp = stageFor(state)
  const [videoPlaying, setVideoPlaying] = useState(false)
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
    const t = window.setTimeout(() => setArmed(true), comp.camera.pullbackMs)
    return () => window.clearTimeout(t)
  }, [armed, comp.camera.pullbackMs])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setFit(labCover(el.clientWidth, el.clientHeight, comp))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [comp])

  /* המצלמה: WAAPI ולא CSS, כי הצלילה יוצאת מהנקודה שבה הקירוב האיטי נמצא עכשיו */
  useEffect(() => {
    const cam = cameraRef.current
    const el = ref.current
    if (!cam || !el || !moving || leaving) return
    const w = el.clientWidth
    const h = el.clientHeight
    const { approachMs, pullbackMs } = comp.camera
    const fill = 'forwards' as const
    const approach = (to: string) => { anim.current = cam.animate([{ transform: cameraCss(cameraRest) }, { transform: to }], { duration: approachMs, easing: 'linear', fill }) }
    if (state === 'opening') { approach(cameraCss(cameraOpening(w, h, comp))); return () => anim.current?.cancel() }
    const back = cam.animate([{ transform: cameraCss(cameraInsidePortal(w, h, comp)) }, { transform: cameraCss(cameraRest) }], { duration: pullbackMs, easing: 'cubic-bezier(.16,.8,.3,1)', fill })
    anim.current = back
    back.onfinish = () => approach(cameraCss(cameraSummary(comp)))
    return () => { back.onfinish = null; anim.current?.cancel() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFit, moving, state])

  useEffect(() => {
    const cam = cameraRef.current
    const el = ref.current
    if (leaving !== 'dive' || !cam || !el) return
    const from = getComputedStyle(cam).transform
    anim.current?.cancel()
    const dive = cam.animate([{ transform: from === 'none' ? cameraCss(cameraRest) : from }, { transform: cameraCss(cameraInsidePortal(el.clientWidth, el.clientHeight, comp)) }], { duration: comp.camera.diveMs, easing: 'cubic-bezier(.55,0,.75,.4)', fill: 'forwards' })
    /* הצלילה לא נשמרת ב-anim: ירידת עוצמה באמצע (מדידת FPS) מנקה את אפקט המצלמה, וביטול הצלילה היה תוקע את התלמיד */
    anim.current = null
    dive.onfinish = () => onDiveEnd?.()
    return () => { dive.onfinish = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving])

  /* גל אור בהולוגרמה: ביציאה מהפורטל בסיכום, וברגע הצלילה אליו */
  const splashKey = leaving === 'dive' ? 2 : state === 'opening' ? 0 : 1
  const holoWidth = comp.holo.height * HOLO_ASPECT
  const box = comp.portal.box
  const scale = fit?.scale ?? 1
  const liveBg = !!comp.video && moving
  const geo = useMemo(() => hologramGeometry(comp), [comp])
  const [holoLive, setHoloLive] = useState(false)
  /* סיפור שנסגר: הפורטל עובר לכתום-זהוב אחרי שהמצלמה נסוגה ממנו */
  const gold = state === 'closed' && armed
  return (
    <div ref={ref} className="lab-stage" data-lab-stage data-lab-tone={comp.tone} data-portal={state} data-portal-gold={gold ? '' : undefined} data-leaving={leaving} style={{ ['--lab-reveal-ms' as string]: `${comp.camera.revealMs}ms` }} onAnimationEnd={(e) => { if (e.animationName === 'lab-reveal') onRevealEnd?.() }}>
      <style>{CSS}</style>
      {fit && (
        <div
          className="lab-world"
          style={{
            width: comp.width,
            height: comp.height,
            transform: `translate(${fit.x}px, ${fit.y}px) scale(${scale})`,
            ['--lab-tint' as string]: tint,
            /* קווי הסריקה בפיקסלים של המסך, לא של התמונה */
            ['--holo-scan-on' as string]: `${3 / scale}px`,
            ['--holo-scan-all' as string]: `${4 / scale}px`,
          }}
        >
          <div ref={cameraRef} className="lab-camera">
          <img src={comp.src} alt="" draggable={false} />
          {liveBg && (
            <video src={comp.video} poster={comp.src} muted loop playsInline autoPlay preload="auto" disablePictureInPicture data-lab-video
              data-playing={videoPlaying ? '' : undefined} onPlaying={() => setVideoPlaying(true)} onError={() => setVideoPlaying(false)} />
          )}
          {portalSrc && <span className="lab-glow lab-glow--wall" />}
          {portalSrc && <span className="lab-glow lab-glow--floor" />}
          <div className="lab-portal__wrap" data-lab-portal style={{ position: 'absolute', inset: 0 }}>
            {geo && <PortalGlow comp={comp} tone="cyan" />}
            {geo && state === 'closed' && <PortalGlow comp={comp} tone="gold" />}
            <div className="lab-portal" data-holo-live={holoLive && portalSrc ? '' : undefined} style={{ left: box.x, top: box.y, width: box.width, height: box.height, clipPath: portalClipPath(comp) }}>
              {portalSrc && <img className="lab-portal__img" src={portalSrc} alt="" draggable={false} />}
              {portalSrc && geo && <PortalStaticLook comp={comp} tone="cyan" />}
              {portalSrc && geo && state === 'closed' && <PortalStaticLook comp={comp} tone="gold" />}
              {portalSrc && geo && <span className="lab-portal__scan" />}
            </div>
            {portalSrc && moving && geo && (
              <PortalHologram src={portalSrc} geo={geo} screenScale={scale} agitated={state === 'open'} splashKey={splashKey} gold={gold} onReady={setHoloLive} />
            )}
            {onPortalClick && armed && !leaving && (
              <button type="button" className="lab-portal-hit" data-lab-portal-hit aria-label={portalLabel} onClick={onPortalClick} style={{ left: box.x, top: box.y, width: box.width, height: box.height, clipPath: portalClipPath(comp) }} />
            )}
            <svg className="lab-rim" viewBox={`0 0 ${comp.width} ${comp.height}`} aria-hidden="true">
              <polygon className="lab-rim__base" points={portalPoints(comp)} />
              <polygon className="lab-rim__swirl" points={portalPoints(comp)} />
            </svg>
          </div>
          <div className="lab-holo" data-lab-holo style={{ left: comp.holo.centerX - holoWidth / 2, top: comp.holo.top }}>
            {/* האנימציה מתנגנת גם מעל רקע וידאו: הנכס החדש קטן (896×706, H.264) ושני הסרטונים יחד נשארים מעל סף הקצב */}
            <DrHoloHologram mood={mood} build video human={human} height={`${comp.holo.height}px`} />
          </div>
          </div>
        </div>
      )}
      {/* "דוקטור הולו" ומתחתיו "המדריך שלכם". מוסתרת בזמן הצלילה לפורטל, ובסיכום עד שהמצלמה נסוגה ממנו */}
      {fit && (
        <div className="lab-nameplate" data-lab-nameplate data-hidden={leaving || !armed ? '' : undefined} style={{ left: fit.x + comp.holo.centerX * scale }}>
          <b>{BOOK_TEXT.holoName}</b>
          <span>{BOOK_TEXT.holoRole}</span>
        </div>
      )}
    </div>
  )
}
