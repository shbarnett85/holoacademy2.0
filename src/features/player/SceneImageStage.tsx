import { useEffect, useRef, useState } from 'react'
import { playSound } from '../../shared/lib/sound'
import { feelLevel, KEN_BURNS_SECONDS, prefersReducedMotion, sounds } from './gameFeel/engine'
import { planSceneSwap, sceneSwapMs, type SceneSwapKind } from './sceneSwap'

/* ── תמונת הסצנה והמעבר בין תמונות ──────────────────────────────────────────────
   המעבר הוא סריקה: קו דיו עובר על המלבן בכיוון הקריאה, ומאחוריו נחשפת התמונה החדשה. ד"ר הולו לא זז, כי הוא מקרין את העולם.
   · התמונה היוצאת היא אותו אלמנט שהיה על המסך (key יציב), ולכן הזום האיטי שלה ממשיך בלי קפיצה.
   · כל שלב במעבר יש את התמונה הישנה או החדשה מאחור, ולכן אין פריים שחור.
   · מחכים לפענוח התמונה החדשה לפני שמתחילים (עד IMAGE_WAIT_MS), כדי שהסריקה לא תחשוף מלבן ריק.
   · רק transform ו-opacity: המעבר רץ על ה-GPU, גם כשהמעבד של מחשב בית ספרי עמוס.
     החשיפה עצמה היא מלבן שזז ימינה ותוכנו זז שמאלה באותו קצב (ולא clip-path, שמצויר מחדש בכל פריים).
   · לחיצה על התמונה בזמן המעבר מדלגת לסופו. */

const IMAGE_WAIT_MS = 600

interface Layer { key: number; sceneId: string; src?: string; dim?: boolean }

const CSS = `
.si-layer, .si-clip, .si-unclip, .si-settle, .si-push { position: absolute; inset: 0; }
.si-clip { overflow: hidden; }
.si-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 45%; }
.si-empty { position: absolute; inset: 0; background: var(--color-machine-tint); }
/* אותו כיסוי כמו .holo-stage-scrim, כדי שהתמונה היוצאת לא תשנה גוון לפני הסריקה */
.si-dim { position: absolute; inset: 0; background: color-mix(in srgb, var(--color-machine-bg) 84%, transparent); }
.si-shade { position: absolute; inset: 0; background: var(--color-machine-bg); opacity: 0; }
.si-skip { position: absolute; inset: 0; z-index: 3; cursor: pointer; }

/* סריקה: שלושת החלקים נעים באותו משך ובאותה עקומה, ולכן הקו יושב בדיוק על קצה החשיפה */
.si-run--scan .si-clip { animation: si-clip var(--si-ms) var(--si-ease) both; will-change: transform; }
.si-run--scan .si-unclip { animation: si-unclip var(--si-ms) var(--si-ease) both; will-change: transform; }
.si-run--scan .si-settle { animation: si-settle var(--si-ms) cubic-bezier(.2,.7,.2,1) both; will-change: transform; }
.si-out--scan .si-push { animation: si-push var(--si-ms) var(--si-ease) both; will-change: transform; }
.si-out--scan .si-shade { animation: si-shade var(--si-ms) var(--si-ease) both; }
@keyframes si-clip { from { transform: translate3d(var(--si-from), 0, 0); } to { transform: translate3d(0, 0, 0); } }
@keyframes si-unclip { from { transform: translate3d(calc(var(--si-from) * -1), 0, 0); } to { transform: translate3d(0, 0, 0); } }
@keyframes si-settle { from { transform: scale(1.05); } to { transform: scale(1); } }
@keyframes si-push { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(calc(var(--si-from) * -.05), 0, 0); } }
@keyframes si-shade { from { opacity: 0; } to { opacity: .55; } }

.si-scan { position: absolute; inset: 0; z-index: 2; pointer-events: none; animation: si-clip var(--si-ms) var(--si-ease) both; will-change: transform; }
.si-beam { position: absolute; inset-block: 0; width: 34%; animation: si-beam var(--si-ms) linear both; }
@keyframes si-beam { 0%, 80% { opacity: 1; } 100% { opacity: 0; } }
/* קו הסריקה: קו דיו שטוח על קצה החשיפה, בלי זוהר ובלי שובל */
.si-edge { position: absolute; inset-block: 0; width: 4px; background: var(--color-ink); }
.si-wash { display: none; }
/* קו הסריקה בקצה המוביל: קדימה (משמאל לימין) בצד ימין, חזרה בצד שמאל */
.si-beam--fwd { right: 0; }
.si-beam--fwd .si-edge { right: -2px; }
.si-beam--back { left: 0; }
.si-beam--back .si-edge { left: -2px; }

/* עוצמה מלאה: מסגרת שטוחה מופיעה פעם אחת כשהסריקה מסתיימת */
.si-frame { position: absolute; inset: 0; z-index: 2; pointer-events: none; opacity: 0; border: 5px solid var(--color-machine-deep); border-radius: inherit;
  animation: si-frame calc(var(--si-ms) * .9) ease-out calc(var(--si-ms) * .62) both; }
@keyframes si-frame { 0% { opacity: 0; } 30% { opacity: 1; } 100% { opacity: 0; } }

/* עוצמה עדינה: דהייה בלבד */
.si-run--fade { animation: si-fade var(--si-ms) ease both; will-change: opacity; }
@keyframes si-fade { from { opacity: 0; } to { opacity: 1; } }
`

/* הזום האיטי: הכיוון מתחלף בין סצנות */
const kenBurns = (sceneId: string): string | undefined => prefersReducedMotion()
  ? undefined
  : `holo-kenburns ${KEN_BURNS_SECONDS}s ease-in-out infinite ${sceneId.charCodeAt(sceneId.length - 1) % 2 === 1 ? 'alternate-reverse' : 'alternate'}`

function waitForImage(src: string | undefined): Promise<void> {
  if (!src) return Promise.resolve()
  const img = new Image()
  img.src = src
  const decoded = img.decode ? img.decode().catch(() => undefined) : Promise.resolve()
  return Promise.race([decoded, new Promise<void>((r) => window.setTimeout(r, IMAGE_WAIT_MS))]).then(() => undefined)
}

export default function SceneImageStage({ sceneId, src, trigger, dir, wormhole, dimmed, fromLab = false, onComplete }: {
  sceneId: string
  src?: string
  /* עולה בכל מעבר (engine.transitionKey) */
  trigger: number
  dir: 'forward' | 'back'
  /* חור-התולעת מכסה את כל המסך ומדווח על סיומו בעצמו: מתחתיו מחליפים בלי אנימציה */
  wormhole: boolean
  /* האתגר עדיין פתוח על התמונה: התמונה היוצאת שומרת על ההכהיה, כדי שלא תבהיק לרגע לפני הסריקה */
  dimmed: boolean
  /* המעבר הזה הוא היציאה מהמעבדה (צלילה לפורטל): צליל הפורטל המקורי, ולא צליל הדפדוף */
  fromLab?: boolean
  onComplete: () => void
}) {
  const keys = useRef(1)
  const [current, setCurrent] = useState<Layer>({ key: 0, sceneId, src })
  const [run, setRun] = useState<{ layer: Layer; kind: SceneSwapKind; ms: number } | null>(null)
  const [outDim, setOutDim] = useState(false)
  const finishRef = useRef<() => void>(() => {})
  const onCompleteRef = useRef(onComplete)
  useEffect(() => { onCompleteRef.current = onComplete })
  /* ההכהיה של הרנדר הקודם: בסצנה החדשה האתגר כבר לא על המסך */
  const dimmedRef = useRef(dimmed)
  const wasDimmed = useRef(false)
  useEffect(() => { wasDimmed.current = dimmedRef.current; dimmedRef.current = dimmed }, [dimmed])
  const dirRef = useRef(dir)
  const fromLabRef = useRef(fromLab)
  useEffect(() => { dirRef.current = dir; fromLabRef.current = fromLab })
  const pageSound = () => { if (fromLabRef.current) playSound('portal'); else sounds.page(dirRef.current) }
  const currentRef = useRef(current)
  useEffect(() => { currentRef.current = current }, [current])

  useEffect(() => {
    if (currentRef.current.sceneId === sceneId && currentRef.current.src === src) {
      /* בלי שינוי תמונה ובלי כיסוי: אין מה להנפיש, אבל המעבר עדיין צריך להסתיים */
      if (!wormhole && trigger > 1) { const t = window.setTimeout(() => onCompleteRef.current(), 0); return () => window.clearTimeout(t) }
      return
    }
    const newPage = currentRef.current.sceneId !== sceneId
    const next: Layer = { key: keys.current++, sceneId, src }
    const kind = planSceneSwap({ wormhole, reduced: prefersReducedMotion(), level: feelLevel(), sameImage: currentRef.current.src === src })
    if (kind === 'cut') {
      setCurrent(next)
      setRun(null)
      if (wormhole) return
      /* צליל הדפדוף מתנגן בכל מעבר עמוד, גם כשהתמונה לא התחלפה (ולא כשרק התמונה של אותו עמוד התחלפה) */
      if (newPage) pageSound()
      const t = window.setTimeout(() => onCompleteRef.current(), 0)
      return () => window.clearTimeout(t)
    }

    let cancelled = false
    const timers: number[] = []
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      timers.forEach((t) => window.clearTimeout(t))
      setCurrent(next)
      setRun(null)
      onCompleteRef.current()
    }
    finishRef.current = finish
    void waitForImage(src).then(() => {
      if (cancelled) return
      const ms = sceneSwapMs(feelLevel())
      if (newPage) pageSound()
      setOutDim(wasDimmed.current || dimmedRef.current)
      setRun({ layer: next, kind, ms })
      timers.push(window.setTimeout(finish, ms + 40))
    })
    return () => { cancelled = true; timers.forEach((t) => window.clearTimeout(t)) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger, sceneId])

  /* קדימה: הסריקה עוברת משמאל לימין (לבקשת המשתמש; הדף בצד ימין, והסריקה מגיעה אליו). חזרה לעמוד קודם: מימין לשמאל */
  const fromLeft = dir === 'forward'
  const scan = run?.kind === 'scan'
  const vars = run ? ({ ['--si-ms' as string]: `${run.ms}ms`, ['--si-ease' as string]: 'cubic-bezier(.62,.02,.24,1)', ['--si-from' as string]: fromLeft ? '-100%' : '100%' }) : undefined
  /* אותו עץ לתמונה נכנסת ולתמונה שעל המסך: בסוף המעבר הנכנסת הופכת לנוכחית בלי להיבנות מחדש, והזום שלה לא קופץ */
  const layer = (l: Layer, cls: string, dim: boolean) => (
    <div key={l.key} className={`si-layer ${cls}`}>
      <div className="si-clip"><div className="si-unclip"><div className="si-settle"><div className="si-push">
        {l.src
          ? <img className="si-img" src={l.src} alt="" style={{ animation: kenBurns(l.sceneId) }} />
          : <div className="si-empty" />}
        {dim && <div className="si-dim" />}
      </div></div></div></div>
      <div className="si-shade" />
    </div>
  )

  return (
    <div className="holo-image-fill" style={vars} data-scene-image={current.sceneId} data-scene-swap={run?.kind ?? 'idle'}>
      <style>{CSS}</style>
      {layer(current, scan ? 'si-out--scan' : '', !!run && outDim)}
      {run && layer(run.layer, scan ? 'si-run--scan' : 'si-run--fade', false)}
      {scan && (
        <div className="si-scan" aria-hidden>
          <div className={`si-beam ${fromLeft ? 'si-beam--fwd' : 'si-beam--back'}`}><div className="si-wash" /><div className="si-edge" /></div>
        </div>
      )}
      {scan && feelLevel() === 'full' && <div className="si-frame" aria-hidden />}
      {run && <div className="si-skip" style={{ pointerEvents: 'auto' }} aria-hidden onPointerDown={() => finishRef.current()} />}
    </div>
  )
}
