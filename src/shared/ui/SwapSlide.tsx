/* תוכן שמתחלף בהחלקה ולא בחיתוך: כשהמפתח משתנה, התוכן היוצא מחליק ונמוג, ואז הנכנס מחליק פנימה מהצד השני.
   אותה שפה כמו הדפדוף בין עמודים בשיעור (יציאה קצרה ואז כניסה). dir: 1 קדימה, -1 אחורה.
   הסגנון ב-index.css (.swap-slide). בתנועה מופחתת ההחלפה מיידית. */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

export const SWAP_OUT_MS = 110
export const SWAP_IN_MS = 160

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function SwapSlide({ swapKey, dir = 1, children, className }: {
  /* כשהמפתח משתנה התוכן מתחלף במעבר; שינוי בתוכן באותו מפתח מוצג מיד */
  swapKey: string
  dir?: 1 | -1
  children: ReactNode
  className?: string
}) {
  /* מה שמוצג בפועל: בזמן היציאה זה עדיין התוכן הקודם */
  const [shown, setShown] = useState<{ key: string; node: ReactNode }>({ key: swapKey, node: children })
  const [entering, setEntering] = useState(false)
  const latest = useRef({ key: swapKey, node: children })
  useEffect(() => { latest.current = { key: swapKey, node: children } })

  const leaving = shown.key !== swapKey
  useEffect(() => {
    if (!leaving) return
    const out = reducedMotion() ? 0 : SWAP_OUT_MS
    const t1 = window.setTimeout(() => { setShown(latest.current); setEntering(out > 0) }, out)
    const t2 = window.setTimeout(() => setEntering(false), out + SWAP_IN_MS)
    return () => { window.clearTimeout(t1); window.clearTimeout(t2) }
  }, [leaving, swapKey])

  return (
    <span className={`swap-slide${className ? ` ${className}` : ''}`} data-phase={leaving ? 'out' : entering ? 'in' : undefined} style={{ '--swap-dir': dir } as CSSProperties}>
      {leaving ? shown.node : children}
    </span>
  )
}
