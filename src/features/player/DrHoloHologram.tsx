/* ד"ר הולו הוא עותק וירטואלי, ולכן הוא תמיד הולוגרמה. הולוגרמה היא אור: הדמות מוקרנת על הרקע ב-mix-blend-mode: screen, ולכן השחור נעלם והיא שקופה למחצה.
   גוף מלא, עומד ישירות על הרצפה של הסצנה, עם הילה שטוחה מתחת לרגליים. הגוון, קווי הסריקה והגליץ' בקוד (CSS) ולא נצרבים בנכסים. הגוון הוא אמצע הדרך בין מונוכרום לצבעים אמיתיים: מעבר צבעי המותג (ציאן, כחול, מג'נטה) במיזוג color ובאטימות חלקית, ולכן שחור נשאר שחור.
   · במסכי הפתיחה והסיכום (video): קטע וידאו בלולאה על רקע שחור (drHoloClips.ts). בשאר המסכים: תמונה קבועה.
   · גיבוי לווידאו: התמונה הקבועה עם ריחוף עדין — כשהווידאו לא נטען, במחשב חלש (FPS) ובעוצמה עדינה. בתנועה מופחתת: התמונה בלי שום תנועה.
   · הבעות: רשימה סגורה של תשעה מצבי רוח (shared/lib/holoMoods; public/dr-holo/*.webp, עריכות של אותו בסיס). תמונה שלא נטענה — סמל קווי של הדמות באותו אפקט.
   · בשלב קריאת טקסט הגליץ' עוצר. הווידאו ממשיך: זו נשימה של דמות, לא אפקט.
   · 5 גבישים (human): שתי שכבות של אותו נכס, אחת בגוון ההולוגרמה ואחת בצבעים הטבעיים, ו-crossfade ביניהן. השכבה הטבעית נכנסת מעל ההולוגרמה,
     ולכן כל פיקסל הוא בדיוק (1−t)·הולוגרמה + t·טבעי. לא מנפישים hue-rotate/sepia/saturate: הם עוברים דרך צבעי ביניים (חלוק סגול, פנים צהובות).
   חשוב: mix-blend-mode ממזג רק בתוך ה-stacking context של האלמנט. לכן לשורש ולהורים אסור ליצור stacking context
   (z-index, transform, opacity, filter, position: fixed), אחרת הרקע של המיזוג ריק והשחור נראה כמלבן. */
import { useEffect, useRef, useState } from 'react'
import DrHoloEmblem from '../../shared/ui/DrHoloEmblem'
import { useGameFeel, type HoloMood } from './gameFeel/engine'
import { HOLO_CLIP_START_TIMEOUT_MS, holoClipFor } from './drHoloClips'

const srcOf = (mood: HoloMood): string => `/dr-holo/${mood}.webp`

const CSS = `
.dr-holo { position: relative; display: block; height: var(--dr-holo-h, 100%); aspect-ratio: 9 / 16; pointer-events: none; }
/* הצללה מאחורי הדמות: שלא תתבהר מדי מעל אזור בהיר בתמונה */
.dr-holo__shade { position: absolute; inset: -8% -22% -2%; mix-blend-mode: multiply;
  background: radial-gradient(closest-side, rgba(0,0,0,.74), rgba(0,0,0,.5) 58%, transparent 100%); }
.dr-holo__glow { position: absolute; inset: 0; mix-blend-mode: screen; transition: opacity 2s linear; }
.dr-holo__glow--cool { background: radial-gradient(ellipse 40% 50% at 50% 50%, rgba(90,184,255,.26), transparent 100%); }
.dr-holo__glow--warm { opacity: 0; background: radial-gradient(ellipse 40% 50% at 50% 50%, rgba(255,196,128,.28), transparent 100%); }
/* הילה שטוחה על הרצפה, מתחת לרגליים: בלי אובייקט ובלי אלומה */
.dr-holo__halo { position: absolute; left: 6%; right: 6%; bottom: -1.5%; height: 7%; mix-blend-mode: screen; }
.dr-holo__halo::before, .dr-holo__halo::after { content: ''; position: absolute; inset: 0; transition: opacity 2s linear; }
.dr-holo__halo::before { background: radial-gradient(ellipse 50% 50% at 50% 50%, rgba(90,184,255,.8), rgba(90,184,255,.28) 52%, transparent 100%); }
.dr-holo__halo::after { opacity: 0; background: radial-gradient(ellipse 50% 50% at 50% 50%, rgba(255,196,128,.8), rgba(255,196,128,.28) 52%, transparent 100%); }
/* הקבוצה כולה ממוזגת עם הרקע. שחור בתוך הקבוצה הוא "אין אור" */
.dr-holo__figure { position: absolute; inset: 0; overflow: hidden; mix-blend-mode: screen; opacity: .94; background: #000;
  /* הקצוות נמוגים: בקנה מידה לא שלם, קצה חלקי של שכבת הגוון נראה כקו חיוור סביב הדמות. שם הנכס שחור ממילא */
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 2%, #000 98%, transparent), linear-gradient(180deg, transparent, #000 1.2%, #000 99.5%, transparent);
          mask-image: linear-gradient(90deg, transparent, #000 2%, #000 98%, transparent), linear-gradient(180deg, transparent, #000 1.2%, #000 99.5%, transparent);
  -webkit-mask-composite: source-in;
          mask-composite: intersect; }
.dr-holo__layers, .dr-holo__layer { position: absolute; inset: 0; background: #000; }
.dr-holo__layer { isolation: isolate; }
.dr-holo__media { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; object-position: center bottom; display: block; transition: opacity .25s ease; }
.dr-holo__media--hidden { opacity: 0; }
/* שכבת ההולוגרמה: מיזוג color שומר על הבהירות של הנכס ומחליף רק גוון ורוויה. המעבר נפרס על כל הגוף. במעבדה רואים חצי גוף, ולכן שם הוא מכווץ (LabStage) */
.dr-holo__layer--holo .dr-holo__media { filter: saturate(.85) brightness(1.14); }
.dr-holo__tint { position: absolute; inset: 0; background: linear-gradient(170deg, #2ff3ff 4%, #5AB8FF 40%, #8f86ff 68%, #ff45e6 100%); mix-blend-mode: color; opacity: .55; }
.dr-holo__scan { position: absolute; inset: 0; background: repeating-linear-gradient(0deg, transparent 0 var(--holo-scan-on, 3px), rgba(0,0,0,.42) var(--holo-scan-on, 3px) var(--holo-scan-all, 4px)); }
/* השכבה הטבעית נכנסת מעל, וההולוגרמה נשארת מתחתיה: אין ירידת בהירות באמצע המעבר */
.dr-holo__layer--human { opacity: 0; transition: opacity 2s linear; }
.dr-holo__layer--human .dr-holo__media { filter: brightness(1.06); }
.dr-holo--human .dr-holo__layer--human { opacity: 1; }
.dr-holo--human .dr-holo__glow--cool, .dr-holo--human .dr-holo__halo::before { opacity: 0; }
.dr-holo--human .dr-holo__glow--warm, .dr-holo--human .dr-holo__halo::after { opacity: 1; }
.dr-holo--live .dr-holo__figure { animation: dr-holo-flicker 7s steps(1, end) infinite; }
@keyframes dr-holo-flicker { 0%, 96.4%, 100% { opacity: .94; transform: none } 96.5%, 97.6% { opacity: .55; transform: translateX(1.5%) } 97.7%, 98.6% { opacity: .86; transform: translateX(-1%) } }
/* הגליץ' של הלוגו (.hlg-glitch): שני עותקים, ציאן ומג'נטה, שמתפרצים לרגע קצר בכל מחזור כפרוסות אופקיות מוסטות. הפרוסות בפלג הגוף העליון, כי במעבדה רואים רק אותו */
.dr-holo__glitch { position: absolute; inset: 0; opacity: 0; pointer-events: none; will-change: clip-path, transform, opacity; }
.dr-holo__glitch img { width: 100%; height: 100%; object-fit: contain; object-position: center bottom; display: block; }
/* sepia קודם: הנכס בצבעים טבעיים, ולכן hue-rotate לבדו לא נותן ציאן ומג'נטה */
.dr-holo__glitch--c { filter: grayscale(1) sepia(1) hue-rotate(140deg) saturate(5) drop-shadow(0 0 2px rgba(0, 230, 255, .9)); animation: dr-holo-glitch-a 4.4s steps(1, end) infinite; }
.dr-holo__glitch--m { filter: grayscale(1) sepia(1) hue-rotate(260deg) saturate(5) drop-shadow(0 0 2px rgba(255, 60, 220, .9)); animation: dr-holo-glitch-b 4.4s steps(1, end) infinite; }
@keyframes dr-holo-glitch-a {
  0%, 88% { opacity: 0; transform: none; clip-path: inset(0 0 100% 0); }
  88.5% { opacity: .9; transform: translateX(-3%); clip-path: inset(8% 0 80% 0); }
  90% { opacity: .9; transform: translateX(2.2%); clip-path: inset(26% 0 64% 0); }
  91.5% { opacity: .9; transform: translateX(-1.8%); clip-path: inset(40% 0 50% 0); }
  93%, 100% { opacity: 0; transform: none; clip-path: inset(0 0 100% 0); }
}
@keyframes dr-holo-glitch-b {
  0%, 88.7% { opacity: 0; transform: none; clip-path: inset(100% 0 0 0); }
  89.2% { opacity: .85; transform: translateX(2.6%); clip-path: inset(18% 0 72% 0); }
  90.7% { opacity: .85; transform: translateX(-2.6%); clip-path: inset(34% 0 56% 0); }
  92.2% { opacity: .85; transform: translateX(1.8%); clip-path: inset(4% 0 88% 0); }
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
  .dr-holo__glitch { display: none; }
  .dr-holo__glow, .dr-holo__halo::before, .dr-holo__halo::after, .dr-holo__layer--human, .dr-holo__media { transition: none; }
}
`

export default function DrHoloHologram({ mood, build = false, height, className = '', video = false, human = false }: {
  mood?: HoloMood
  build?: boolean
  /* גובה הדמות (CSS). בלי ערך: ממלאה את גובה ההורה */
  height?: string
  className?: string
  /* מסכי הפתיחה והסיכום בלבד: הקטעים לא נטענים בשאר המסכים */
  video?: boolean
  /* 5 גבישים: אחרי שההולוגרמה נבנית היא עוברת במעבר רך לגוונים טבעיים. פרט ויזואלי בלבד, בלי טקסט */
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
  const [humanDone, setHumanDone] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const humanVideoRef = useRef<HTMLVideoElement | null>(null)

  const animateBuild = build && !built && feel.level !== 'gentle' && !feel.reduced
  /* armed: עוצמת הכיתה נקבעת ב-effect של ההורה, ובמעבר ראשון עוד לא ידועה. לא טוענים וידאו לפני שיודעים */
  const clip = armed && video && !clipFailed && feel.level !== 'gentle' && !feel.reduced ? holoClipFor(current) : null
  const fallbackFloat = armed && video && !clip && !feel.reduced
  const humanOn = human && (feel.reduced || (armed && !animateBuild))
  const live = !feel.reading && !feel.reduced && !animateBuild && !humanOn
  /* בסוף המעבר שכבת ההולוגרמה כבר מוסתרת לגמרי, ולכן מורידים אותה (וידאו אחד פחות לפענח) */
  const holoLayerGone = humanOn && (feel.reduced || humanDone)

  useEffect(() => {
    const id = requestAnimationFrame(() => setArmed(true))
    return () => cancelAnimationFrame(id)
  }, [])

  /* דפדפן שחוסם ניגון אוטומטי (למשל מצב חיסכון ב-iPad), או וידאו שלא התחיל בזמן: נשארים עם התמונה */
  useEffect(() => {
    if (!clip) return
    const el = videoRef.current ?? humanVideoRef.current
    el?.play()?.catch((e: unknown) => { if ((e as Error)?.name !== 'AbortError') setClipFailed(true) })
    const timer = window.setTimeout(() => { if (el && el.readyState < 3) setClipFailed(true) }, HOLO_CLIP_START_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [clip])

  const showingVideo = !!clip && playingClip === clip
  const media = (kind: 'holo' | 'human') => (
    <>
      {imageFailed
        ? <DrHoloEmblem size={96} />
        : <img className={`dr-holo__media ${showingVideo ? 'dr-holo__media--hidden' : ''}`} src={srcOf(current)} alt="" draggable={false} onError={() => setImageFailed(true)} />}
      {clip && (
        <video
          ref={kind === 'holo' ? videoRef : humanVideoRef}
          className={`dr-holo__media ${showingVideo ? '' : 'dr-holo__media--hidden'}`}
          src={clip}
          muted
          loop
          playsInline
          autoPlay
          preload="auto"
          disablePictureInPicture
          onPlaying={(e) => {
            setPlayingClip(clip)
            /* שתי השכבות באותו פריים, כדי שבמעבר לא תיראה דמות כפולה */
            const main = videoRef.current
            if (kind === 'human' && main) e.currentTarget.currentTime = main.currentTime
          }}
          onError={() => setClipFailed(true)}
        />
      )}
    </>
  )
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
      <span className="dr-holo__halo" />
      <span className="dr-holo__figure" onAnimationEnd={(e) => { if (e.animationName === 'dr-holo-build') setBuilt(true) }}>
        <span className="dr-holo__layers">
          {!holoLayerGone && (
            <span className="dr-holo__layer dr-holo__layer--holo">
              {media('holo')}
              <span className="dr-holo__tint" />
              <span className="dr-holo__scan" />
            </span>
          )}
          {human && (
            <span className="dr-holo__layer dr-holo__layer--human" onTransitionEnd={(e) => { if (e.target === e.currentTarget && e.propertyName === 'opacity') setHumanDone(true) }}>
              {media('human')}
            </span>
          )}
        </span>
        {/* לא תלוי ב-reading: הדמות מופיעה רק במסכי המעבדה, ושם תמיד יש טקסט לקריאה. חריג לכלל 1, כמו הווידאו */}
        {!feel.reduced && !animateBuild && !humanOn && feel.level !== 'gentle' && !imageFailed && (
          <>
            <span className="dr-holo__glitch dr-holo__glitch--c"><img src={srcOf(current)} alt="" draggable={false} /></span>
            <span className="dr-holo__glitch dr-holo__glitch--m"><img src={srcOf(current)} alt="" draggable={false} /></span>
          </>
        )}
      </span>
    </span>
  )
}
