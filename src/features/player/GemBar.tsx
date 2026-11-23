/* פס הגבישים: חמישה שקעים שמתמלאים ברצף, מלמטה למעלה. בלי מונה מספרי לידם (הוסר לבקשת המשתמש): מספר הגבישים השלמים נמצא
   בתווית לקוראי מסך וב-data-gem-counter (לבדיקות).
   המילוי מתחיל כשהגביש המעופף מגיע (GEM_ARRIVED), ולא ברגע התשובה. בתנועה מופחתת הגבישים מתמלאים מיד.
   רשת ביטחון: התקדמות שלא לוותה במעוף מסונכרנת אחרי רגע, כך שהמונה לעולם לא נשאר מאחור. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { GEM_TOTAL, gemFill } from '../../shared/lib/gemModel'
import { Gem } from '../../shared/ui/Gem'
import { gemTier } from '../../shared/lib/gemTier'
import { cfg, GEM_ARRIVED, gemCompleted, prefersReducedMotion } from './gameFeel/engine'
import { HUD_TEXT } from './gameFeel/text'

const EPS = 1e-6

export function GemBar({ value }: { value: number }) {
  const [display, setDisplay] = useState(value)
  const displayRef = useRef(value)
  const targetRef = useRef(value)
  const rafRef = useRef(0)
  const socketRefs = useRef<(HTMLSpanElement | null)[]>([])
  targetRef.current = value

  const paint = useCallback((v: number) => {
    displayRef.current = v
    setDisplay(v)
  }, [])

  const complete = useCallback((k: number) => {
    const socket = socketRefs.current[k]
    gemCompleted(socket)
    if (prefersReducedMotion()) return
    /* רגע ההשלמה: קפיצה קטנה של הקריסטל (בלי זוהר; זוהר יש רק מ-3 קריסטלים, לפי מצב השורה) */
    if (cfg().glow && socket && typeof socket.animate === 'function') {
      socket.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.28)', offset: 0.3 }, { transform: 'scale(1)' }], { duration: 850, easing: 'ease-out' })
    }
  }, [])

  const tweenTo = useCallback((to: number) => {
    const from = displayRef.current
    if (to <= from + EPS) return
    cancelAnimationFrame(rafRef.current)
    const firstNew = Math.floor(from + EPS)
    const lastNew = Math.floor(to + EPS)
    if (prefersReducedMotion()) {
      paint(to)
      for (let k = firstNew; k < lastNew; k++) complete(k)
      return
    }
    const dur = cfg().fillMs
    const t0 = performance.now()
    let whole = firstNew
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur)
      const v = from + (to - from) * (1 - Math.pow(1 - t, 3))
      paint(v)
      const w = Math.floor(v + EPS)
      for (; whole < w; whole++) complete(whole)
      if (t < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
  }, [complete, paint])

  /* ירידה (שיעור מתחיל מחדש) — סנכרון מיידי */
  useEffect(() => {
    if (value < displayRef.current - EPS) {
      cancelAnimationFrame(rafRef.current)
      paint(value)
    }
  }, [value, paint])

  useEffect(() => {
    const onArrive = () => tweenTo(targetRef.current)
    window.addEventListener(GEM_ARRIVED, onArrive)
    return () => window.removeEventListener(GEM_ARRIVED, onArrive)
  }, [tweenTo])

  useEffect(() => {
    if (value <= displayRef.current + EPS) return
    const t = window.setTimeout(() => tweenTo(targetRef.current), 2000)
    return () => window.clearTimeout(t)
  }, [value, tweenTo])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const whole = Math.min(GEM_TOTAL, Math.floor(display + EPS))
  const targetIdx = Math.min(GEM_TOTAL - 1, whole)

  return (
    <div className="flex items-center holo-hud-gems" style={{ gap: 'var(--hud-slot-gap, 0.5rem)' }} data-gem-bar data-gem-counter={whole}>
      <div className="flex items-center" style={{ gap: 3 }} dir="ltr" role="img" aria-label={HUD_TEXT.barLabel(whole)}>
        {Array.from({ length: GEM_TOTAL }).map((_, i) => (
          <span
            key={i}
            ref={(el) => { socketRefs.current[i] = el }}
            {...(i === targetIdx ? { 'data-gem-target': '1' } : {})}
            style={{ display: 'block' }}
          >
            {/* ב-HUD הקריסטלים לא פועמים: בזמן קריאה שום דבר לא זז. מצב השורה (3 ומעלה, 5) נראה בזוהר קבוע */}
            <Gem fill={gemFill(display, i)} size="var(--hud-gem, 1.9rem)" tier={gemTier(whole)} animated={false} />
          </span>
        ))}
      </div>
    </div>
  )
}
