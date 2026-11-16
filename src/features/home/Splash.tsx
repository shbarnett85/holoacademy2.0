import { useEffect, useRef, useState } from 'react'
import { GemDefs, GemIcon } from '../../shared/ui/Gem'

type Phase = 'in' | 'open' | 'out'

/* הזמנים: הגביש והשם נבנים (עד ~1.9 שניות), רגע של עמידה, ואז המסך נפתח כמו פורטל */
const OPEN_AT_MS = 2500
const IRIS_MS = 780
const REDUCED_HOLD_MS = 1300
const REDUCED_FADE_MS = 320

/* הצורה של הגביש (אותה צורה כמו ב-Gem.tsx), לצל הקשיח שמאחוריו */
const GEM_OUTLINE = 'M66 40 L134 40 L170 82 L118 160 L82 160 L30 82 Z'

/* נצנוצים שנזרקים מהגביש כשהוא נוחת: כיוון, מרחק, גודל, צבע (מהטוקנים) וצורה. קבועים, כדי שהרגע ייראה אותו דבר בכל כניסה */
const SPARK_COLORS = ['var(--color-holo)', 'var(--color-human)', 'var(--color-surface)', 'var(--color-machine)', 'var(--subject-math)', 'var(--color-human-soft)']
const SPARKS = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2 + (i % 2 ? 0.22 : -0.1)
  const dist = 170 + ((i * 53) % 130)
  return {
    dx: Math.round(Math.cos(angle) * dist), dy: Math.round(Math.sin(angle) * dist * 0.85),
    size: 14 + ((i * 7) % 15), rot: (i % 2 ? 1 : -1) * (140 + i * 20),
    color: SPARK_COLORS[i % SPARK_COLORS.length], round: i % 3 === 0,
  }
})

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/* ספלאש פתיחה, פעם אחת לכל לשונית (App.tsx). הגביש של המשחק קופץ למקומו עם נצנוצים, האותיות של HOLO נוחתות אחת אחת,
   ואז המסך נפתח כמו פורטל: עיגול שגדל מהגביש וחושף את העמוד שמתחת (שכבר מרונדר).
   onDone נקרא פעם אחת, בסיום או בלחיצה. הכול ב-CSS (index.css, .splash…): בלי canvas ובלי לולאת ציור, ולכן קל גם למחשב חלש.
   תנועה מופחתת: הסימן מוצג בלי תנועה, ואז המסך נמוג. */
export default function Splash({ onDone }: { onDone: () => void }) {
  /* onDone נקרא פעם אחת בלבד — בין אם מהטיימר, מקליק או ממגע (במגע נורים שניים) */
  const doneRef = useRef(false)
  const [phase, setPhase] = useState<Phase>('in')

  useEffect(() => {
    const reduced = reducedMotion()
    const finish = () => { if (!doneRef.current) { doneRef.current = true; onDone() } }
    const openAt = reduced ? REDUCED_HOLD_MS : OPEN_AT_MS
    const timers = [
      window.setTimeout(() => setPhase('open'), openAt),
      window.setTimeout(finish, openAt + (reduced ? REDUCED_FADE_MS : IRIS_MS)),
    ]
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [onDone])

  /* לחיצה/מגע בכל מקום על הספלאש מדלגים ישר לסיום. חשוב לא רק ל-UX (למי שממהר) —
     זו גם ה"מחווית משתמש" הראשונה בכניסה קרה לדף (למשל קישור ישיר ל-/play/leonardo,
     בלי קליק קודם על שום דבר). בלי מחווה אמיתית על העמוד, מדיניות הדפדפן חוסמת אודיו
     לחלוטין — האנימציות האוטומטיות שרצות מיד אח"כ (חור-תולעת, כניסת הפאנל)
     מנסות להשמיע צליל *לפני* שהייתה הזדמנות למחווה, וה-Web Audio API משתיק אותן
     בשקט (לא ניתן לעקוף בקוד — זו מדיניות דפדפן, לא תקלה). הדילוג-בנגיעה כאן נותן
     סיכוי מוקדם וטבעי למחווה כזו לפני שהמשחק בכלל עולה.
     במגע נורים גם onTouchStart וגם onClick — doneRef מבטיח ש-onDone נקרא פעם אחת. */
  function skip() {
    if (doneRef.current) return
    doneRef.current = true
    onDone()
  }

  return (
    <div className="splash" data-splash data-phase={phase} onClick={skip} onTouchStart={skip}>
      <GemDefs />
      <div className="splash-disc" aria-hidden="true" />
      <div className="splash-ring" aria-hidden="true" />
      <div className="splash-body">
        <div className="splash-gem" aria-hidden="true">
          <svg className="splash-gem-shadow" viewBox="24 34 152 132"><path d={GEM_OUTLINE} /></svg>
          <GemIcon size={168} />
          {SPARKS.map((p, i) => (
            <span key={i} className="splash-spark" style={{
              ['--dx' as string]: `${p.dx}px`, ['--dy' as string]: `${p.dy}px`, ['--s' as string]: `${p.size}px`,
              ['--rot' as string]: `${p.rot}deg`, ['--c' as string]: p.color, ['--rad' as string]: p.round ? '50%' : '2px',
            }} />
          ))}
        </div>
        <h1 className="splash-word" aria-label="HoloAcademy" style={{ margin: 0 }}>
          {'HOLO'.split('').map((ch, i) => <span key={i} aria-hidden="true" style={{ ['--i' as string]: i }}>{ch}</span>)}
        </h1>
        <div className="splash-sub" aria-hidden="true">ACADEMY</div>
        <p className="splash-tag">ממד חדש של למידה</p>
      </div>
      <div className="splash-skip" aria-hidden="true">לחיצה בכל מקום כדי להמשיך</div>
    </div>
  )
}
