/* ד"ר הולו הוא עותק וירטואלי, ולכן הוא תמיד הולוגרמה. הולוגרמה היא אור: הדמות מוקרנת על הרקע ב-mix-blend-mode: screen, ולכן השחור נעלם והיא שקופה למחצה.
   הדמות החדשה (drHoloClips.ts): חצי גוף, כבר בגוון הולוגרפי, MP4 על שחור + הפריים הראשון כתמונה קבועה. האפקט כולו בקוד (CSS) ולא נצרב בנכס:
   · קווי סריקה בפיקסלים של המסך, פס אור שיורד לאט לאורך הדמות, ריצוד קצר של השקיפות עם הזזה קטנה (כל 7 שניות).
   · גליץ' (כמו בלוגו): שני עותקים, ציאן ומג'נטה, שמתפרצים כל 4.4 שניות כפרוסות אופקיות מוסטות. כשהווידאו מתנגן העותקים הם פריים
     מהווידאו עצמו (מתעדכן 4 פעמים בשנייה), כי התנוחה משתנה לאורך הקטע.
   · הקצה התחתון נמוג לאור, כך שהמותן (שם הנכס נחתך) לא נראה כקו.
   · גיבוי לווידאו: התמונה הקבועה עם ריחוף עדין — כשהווידאו לא נטען, במחשב חלש (FPS) ובעוצמה עדינה. בתנועה מופחתת: התמונה בלי שום תנועה.
     תמונה שלא נטענה — סמל קווי של הדמות באותו אפקט.
   · בשלב קריאת טקסט הריצוד עוצר. הווידאו, הגליץ' ופס האור ממשיכים: הדמות מופיעה רק במסכי המעבדה, ושם תמיד יש טקסט (חריג לכלל 1).
   · 5 גבישים (human): ההולוגרמה מתחממת — גוון כתום-זהוב נכנס ב-2 שניות (linear) והזוהר שמאחוריה מתחלף לחם. לנכס החדש אין גרסה בצבעים טבעיים.
   חשוב: mix-blend-mode ממזג רק בתוך ה-stacking context של האלמנט. לכן לשורש ולהורים אסור ליצור stacking context
   (z-index, transform, opacity, filter, position: fixed), אחרת הרקע של המיזוג ריק והשחור נראה כמלבן. */
import { useEffect, useRef, useState } from 'react'
import DrHoloEmblem from '../../shared/ui/DrHoloEmblem'
import { useGameFeel, whenFpsProbeDone, type HoloMood } from './gameFeel/engine'
import { HOLO_ASPECT, HOLO_CLIP_START_TIMEOUT_MS, holoClipFor, holoStillFor } from './drHoloClips'

/* גודל העותקים של הגליץ' (חצי מהנכס: הם מוצגים לרגע קצר ומוסטים) */
const GLITCH_W = 448
const GLITCH_H = Math.round(GLITCH_W / HOLO_ASPECT)
const GLITCH_FRAME_MS = 250

const CSS = `
.dr-holo { position: relative; display: block; height: var(--dr-holo-h, 100%); aspect-ratio: ${HOLO_ASPECT}; pointer-events: none; }
/* הצללה מאחורי הדמות: שלא תתבהר מדי מעל אזור בהיר ברקע */
.dr-holo__shade { position: absolute; inset: -6% -6% -10%; mix-blend-mode: multiply;
  background: radial-gradient(closest-side, rgba(0,0,0,.66), rgba(0,0,0,.42) 58%, transparent 100%); }
.dr-holo__glow { position: absolute; inset: -4% 0 0; mix-blend-mode: screen; transition: opacity 2s linear; }
.dr-holo__glow--cool { background: radial-gradient(ellipse 34% 46% at 50% 46%, rgba(90,184,255,.3), transparent 100%); }
.dr-holo__glow--warm { opacity: 0; background: radial-gradient(ellipse 34% 46% at 50% 46%, rgba(255,196,128,.32), transparent 100%); }
/* הקבוצה כולה ממוזגת עם הרקע. שחור בתוך הקבוצה הוא "אין אור" */
.dr-holo__figure { position: absolute; inset: 0; overflow: hidden; mix-blend-mode: screen; opacity: .95; background: #000;
  /* הקצוות נמוגים; למטה ארוך יותר: ההולוגרמה מתפוגגת לאור לפני שהנכס נחתך במותן */
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 1.5%, #000 98.5%, transparent), linear-gradient(180deg, transparent, #000 1.5%, #000 84%, transparent);
          mask-image: linear-gradient(90deg, transparent, #000 1.5%, #000 98.5%, transparent), linear-gradient(180deg, transparent, #000 1.5%, #000 84%, transparent);
  -webkit-mask-composite: source-in;
          mask-composite: intersect; }
.dr-holo__layers, .dr-holo__layer { position: absolute; inset: 0; background: #000; }
.dr-holo__layer { isolation: isolate; }
.dr-holo__media { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; object-position: center bottom; display: block; transition: opacity .25s ease; filter: brightness(1.06) saturate(1.05); }
.dr-holo__media--hidden { opacity: 0; }
.dr-holo__scan { position: absolute; inset: 0; background: repeating-linear-gradient(0deg, transparent 0 var(--holo-scan-on, 3px), rgba(0,0,0,.4) var(--holo-scan-on, 3px) var(--holo-scan-all, 4px)); }
/* פס אור שיורד לאט. overlay על שחור נשאר שחור, ולכן הפס מאיר רק את הדמות ולא את הרקע שסביבה */
.dr-holo__band { position: absolute; left: 0; right: 0; top: 0; height: 22%; mix-blend-mode: overlay; transform: translateY(-110%);
  background: linear-gradient(180deg, transparent, rgba(190,240,255,.75) 48%, rgba(255,255,255,.9) 52%, transparent);
  animation: dr-holo-band 6.5s linear infinite; }
@keyframes dr-holo-band { 0% { transform: translateY(-110%) } 70%, 100% { transform: translateY(470%) } }
/* 5 גבישים: הגוון מתחמם. מיזוג color שומר על הבהירות של הדמות ומחליף רק גוון ורוויה */
.dr-holo__warm { position: absolute; inset: 0; mix-blend-mode: color; opacity: 0; transition: opacity 2s linear;
  background: linear-gradient(170deg, #ffe6b0, #ffbb66 45%, #ff9a4a); }
.dr-holo--human .dr-holo__warm { opacity: .72; }
.dr-holo--human .dr-holo__glow--cool { opacity: 0; }
.dr-holo--human .dr-holo__glow--warm { opacity: 1; }
.dr-holo--live .dr-holo__figure { animation: dr-holo-flicker 7s steps(1, end) infinite; }
@keyframes dr-holo-flicker { 0%, 96.4%, 100% { opacity: .95; transform: none } 96.5%, 97.6% { opacity: .55; transform: translateX(1.2%) } 97.7%, 98.6% { opacity: .86; transform: translateX(-.8%) } }
/* הגליץ' של הלוגו (.hlg-glitch): שני עותקים, ציאן ומג'נטה, שמתפרצים לרגע קצר בכל מחזור כפרוסות אופקיות מוסטות */
.dr-holo__glitch { position: absolute; inset: 0; opacity: 0; pointer-events: none; will-change: clip-path, transform, opacity; }
.dr-holo__glitch > * { width: 100%; height: 100%; object-fit: contain; object-position: center bottom; display: block; }
/* sepia קודם: hue-rotate לבדו על הכחול של הנכס לא נותן מג'נטה */
.dr-holo__glitch--c { filter: grayscale(1) sepia(1) hue-rotate(140deg) saturate(5) drop-shadow(0 0 2px rgba(0, 230, 255, .9)); animation: dr-holo-glitch-a 4.4s steps(1, end) infinite; }
.dr-holo__glitch--m { filter: grayscale(1) sepia(1) hue-rotate(260deg) saturate(5) drop-shadow(0 0 2px rgba(255, 60, 220, .9)); animation: dr-holo-glitch-b 4.4s steps(1, end) infinite; }
@keyframes dr-holo-glitch-a {
  0%, 88% { opacity: 0; transform: none; clip-path: inset(0 0 100% 0); }
  88.5% { opacity: .9; transform: translateX(-2.4%); clip-path: inset(10% 0 78% 0); }
  90% { opacity: .9; transform: translateX(1.8%); clip-path: inset(36% 0 54% 0); }
  91.5% { opacity: .9; transform: translateX(-1.5%); clip-path: inset(58% 0 30% 0); }
  93%, 100% { opacity: 0; transform: none; clip-path: inset(0 0 100% 0); }
}
@keyframes dr-holo-glitch-b {
  0%, 88.7% { opacity: 0; transform: none; clip-path: inset(100% 0 0 0); }
  89.2% { opacity: .85; transform: translateX(2.1%); clip-path: inset(22% 0 68% 0); }
  90.7% { opacity: .85; transform: translateX(-2.1%); clip-path: inset(46% 0 44% 0); }
  92.2% { opacity: .85; transform: translateX(1.5%); clip-path: inset(4% 0 88% 0); }
  93.5%, 100% { opacity: 0; transform: none; clip-path: inset(100% 0 0 0); }
}
.dr-holo--build .dr-holo__figure { animation: dr-holo-build .9s ease-out both; }
@keyframes dr-holo-build {
  from { clip-path: inset(100% 0 0 0); filter: brightness(2.2); }
  to { clip-path: inset(0 0 0 0); filter: brightness(1); }
}
.dr-holo--float .dr-holo__layers { animation: dr-holo-float 5s ease-in-out infinite; }
@keyframes dr-holo-float { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-.8%) } }
@media (prefers-reduced-motion: reduce) {
  .dr-holo--live .dr-holo__figure, .dr-holo--build .dr-holo__figure, .dr-holo--float .dr-holo__layers { animation: none; }
  .dr-holo__glitch, .dr-holo__band { display: none; }
  .dr-holo__glow, .dr-holo__warm, .dr-holo__media { transition: none; }
}
`

export default function DrHoloHologram({ mood, build = false, height, className = '', video = false, still = false, human = false }: {
  mood?: HoloMood
  build?: boolean
  /* גובה הדמות (CSS). בלי ערך: ממלאה את גובה ההורה */
  height?: string
  className?: string
  /* מסכי הפתיחה והסיכום בלבד: הקטעים לא נטענים בשאר המסכים */
  video?: boolean
  /* בלי קטע הווידאו: התמונה הקבועה עם הריחוף העדין */
  still?: boolean
  /* 5 גבישים: אחרי שההולוגרמה נבנית היא מתחממת לכתום-זהוב. פרט ויזואלי בלבד, בלי טקסט */
  human?: boolean
}) {
  const feel = useGameFeel()
  const current = mood ?? feel.mood
  /* תמונה שלא נטענה (למשל נכס חסר): סמל קווי באותו אפקט — הדמות לעולם לא נעלמת */
  const [imageFailed, setImageFailed] = useState(false)
  const [clipFailed, setClipFailed] = useState(false)
  const [playingClip, setPlayingClip] = useState<string | null>(null)
  const [built, setBuilt] = useState(false)
  const [armed, setArmed] = useState(false)
  /* בשניות הראשונות של השיעור נמדד קצב הפריימים. הווידאו מתחיל אחרי המדידה; עד אז התמונה הקבועה, שהיא הפריים הראשון שלו */
  const [probeDone, setProbeDone] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const glitchC = useRef<HTMLCanvasElement | null>(null)
  const glitchM = useRef<HTMLCanvasElement | null>(null)

  const animateBuild = build && !built && feel.level !== 'gentle' && !feel.reduced
  /* armed: עוצמת הכיתה נקבעת ב-effect של ההורה, ובמעבר ראשון עוד לא ידועה. לא טוענים וידאו לפני שיודעים */
  const clip = armed && probeDone && video && !still && !clipFailed && feel.level !== 'gentle' && !feel.reduced ? holoClipFor(current) : null
  const fallbackFloat = armed && probeDone && video && !clip && !feel.reduced
  const humanOn = human && (feel.reduced || (armed && !animateBuild))
  const live = !feel.reading && !feel.reduced && !animateBuild
  const effects = !feel.reduced && !animateBuild && feel.level !== 'gentle' && !imageFailed
  const glitch = effects && !humanOn
  const showingVideo = !!clip && playingClip === clip
  const stillSrc = holoStillFor(current)

  /* בפריים הבא: ה-effect של ההורה (שמתחיל את המדידה) רץ אחרי זה של הילד */
  useEffect(() => {
    let cancel = () => {}
    const id = requestAnimationFrame(() => { setArmed(true); cancel = whenFpsProbeDone(() => setProbeDone(true)) })
    return () => { cancelAnimationFrame(id); cancel() }
  }, [])

  /* דפדפן שחוסם ניגון אוטומטי (למשל מצב חיסכון ב-iPad), או וידאו שלא התחיל בזמן: נשארים עם התמונה */
  useEffect(() => {
    if (!clip) return
    const el = videoRef.current
    el?.play()?.catch((e: unknown) => { if ((e as Error)?.name !== 'AbortError') setClipFailed(true) })
    const timer = window.setTimeout(() => { if (el && el.readyState < 3) setClipFailed(true) }, HOLO_CLIP_START_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [clip])

  /* עותקי הגליץ' מהפריים הנוכחי של הווידאו. ציור קטן 4 פעמים בשנייה; העותקים מוצגים רק לרגע בכל מחזור */
  useEffect(() => {
    if (!glitch || !showingVideo) return
    const draw = () => {
      const v = videoRef.current
      const c = glitchC.current
      const m = glitchM.current
      if (!v || !c || !m || v.readyState < 2) return
      c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height)
      const mc = m.getContext('2d')
      if (mc) { mc.clearRect(0, 0, m.width, m.height); mc.drawImage(c, 0, 0) }
    }
    draw()
    const id = window.setInterval(draw, GLITCH_FRAME_MS)
    return () => window.clearInterval(id)
  }, [glitch, showingVideo])

  const glitchCopy = (ref: typeof glitchC) => showingVideo
    ? <canvas ref={ref} width={GLITCH_W} height={GLITCH_H} />
    : <img src={stillSrc} alt="" draggable={false} />

  return (
    <span
      className={`dr-holo ${animateBuild ? 'dr-holo--build' : ''} ${live ? 'dr-holo--live' : ''} ${fallbackFloat ? 'dr-holo--float' : ''} ${humanOn ? 'dr-holo--human' : ''} ${className}`}
      data-dr-holo={current}
      data-holo-media={showingVideo ? 'video' : 'image'}
      style={height ? ({ ['--dr-holo-h' as string]: height }) : undefined}
      aria-hidden="true"
    >
      <style>{CSS}</style>
      <span className="dr-holo__shade" />
      <span className="dr-holo__glow dr-holo__glow--cool" />
      <span className="dr-holo__glow dr-holo__glow--warm" />
      <span className="dr-holo__figure" onAnimationEnd={(e) => { if (e.animationName === 'dr-holo-build') setBuilt(true) }}>
        <span className="dr-holo__layers">
          <span className="dr-holo__layer">
            {imageFailed
              ? <DrHoloEmblem size={96} />
              : <img className={`dr-holo__media ${showingVideo ? 'dr-holo__media--hidden' : ''}`} src={stillSrc} alt="" draggable={false} onError={() => setImageFailed(true)} />}
            {clip && (
              <video
                ref={videoRef}
                className={`dr-holo__media ${showingVideo ? '' : 'dr-holo__media--hidden'}`}
                src={clip}
                muted
                loop
                playsInline
                autoPlay
                preload="auto"
                disablePictureInPicture
                onPlaying={() => setPlayingClip(clip)}
                onError={() => setClipFailed(true)}
              />
            )}
            {effects && <span className="dr-holo__band" />}
            <span className="dr-holo__warm" />
            <span className="dr-holo__scan" />
          </span>
        </span>
        {glitch && (
          <>
            <span className="dr-holo__glitch dr-holo__glitch--c">{glitchCopy(glitchC)}</span>
            <span className="dr-holo__glitch dr-holo__glitch--m">{glitchCopy(glitchM)}</span>
          </>
        )}
      </span>
    </span>
  )
}
