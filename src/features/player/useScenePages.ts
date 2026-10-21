import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { paginate } from '../../shared/lib/scenePages'

/* ──────────────────────────────────────────────────────────────────────────
   useScenePages — מחלק את טקסט הסצנה לעמודים לפי **גובה מוצג אמיתי** של תיבת הטקסט.
   תיבת הטקסט לעולם לא גוללת (כלל אורך הטקסט לתלמיד): מה שלא נכנס מתחלק לעמודים בגבולות משפט.
   · המדידה: אלמנט מדידה נסתר בתוך התיבה, באותו רוחב ואותן מחלקות גופן/שורה כמו הטקסט עצמו.
   · הגופן לעולם לא מוקטן — רק מחשבים כמה נכנס בגודל הגופן שנקבע.
   · מחשב מחדש כשהתיבה משנה גודל (חלון/סיבוב טלפון) וכשהגופנים נטענו.
   ────────────────────────────────────────────────────────────────────────── */
const SAFETY_PX = 2 /* סבילות עיגול: לא ממלאים עד הפיקסל האחרון */

interface PagesState { text: string; pages: string[] }

export function useScenePages(text: string, areaRef: RefObject<HTMLElement | null>, enabled = true): string[] {
  const [state, setState] = useState<PagesState>(() => ({ text, pages: [text] }))
  const lastKey = useRef('')

  useLayoutEffect(() => {
    const area = areaRef.current
    if (!area || !enabled || !text.trim()) { lastKey.current = ''; setState({ text, pages: [text] }); return }

    const compute = () => {
      const cs = getComputedStyle(area)
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
      const width = area.clientWidth - padX
      const maxH = area.clientHeight - padY - SAFETY_PX
      if (width <= 0 || maxH <= 0) return /* עדיין לא מצויר */

      /* אלמנט מדידה **בתוך הזרימה** (בלי רוחב מפורש): מקבל בדיוק את רוחב הפסקה האמיתית בשבר הפיקסל.
         רוחב מחושב מ-clientWidth (מעוגל לשלם) היה צר ב-0.2px, ושורה אחת נשברה אחרת — עמוד של 12 שורות
         "נכנס" בתיבה של 11 (נמדד בטאבלט 1024×768). נשאר רק לצורך הדגל width>0. */
      const probe = document.createElement('p')
      probe.className = 'text-lg leading-relaxed'
      probe.setAttribute('aria-hidden', 'true')
      Object.assign(probe.style, { display: 'block', visibility: 'hidden', pointerEvents: 'none', margin: '0', padding: '0', whiteSpace: 'pre-line' })
      area.appendChild(probe)
      const fits = (s: string): boolean => { probe.textContent = s; return probe.offsetHeight <= maxH }
      let result: string[]
      try { result = paginate(text, fits) } finally { probe.remove() }

      const key = `${text}|${width}|${maxH}|${result.join('\u0001')}`
      if (key === lastKey.current) return
      lastKey.current = key
      setState({ text, pages: result })
    }

    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(area)
    let cancelled = false
    void document.fonts?.ready.then(() => { if (!cancelled) compute() })
    return () => { cancelled = true; ro.disconnect() }
  }, [text, areaRef, enabled])

  /* טקסט חדש שעוד לא נמדד — מחזירים אותו שלם (לא עמודים של הטקסט הקודם) */
  return state.text === text ? state.pages : [text]
}
