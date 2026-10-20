/* מילוי גובה המסך: האזור מקבל את כל הגובה שנשאר מתחת לכותרת, כך שרשימות ארוכות גוללות בתוך האזור שלהן
   ולא את כל העמוד (מחשב נייד 1366×768). במסך צר (< WIDE_MIN) העמוד עצמו גולל והאזור גדל לפי התוכן. */
import { useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import type { RefObject } from 'react'
import { useState } from 'react'
import { GUTTER } from '../teacherUi'

/* רוחב חלון מינימלי לפריסה של שתי עמודות בגובה קבוע (מתחתיו — עמודה אחת והעמוד גולל; בשתי עמודות צרות מדי הטאבים נדחסים) */
export const WIDE_MIN = 1200

const query = `(min-width: ${WIDE_MIN}px)`
function subscribe(cb: () => void): () => void {
  const mq = window.matchMedia(query)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
/* true כשהחלון רחב מספיק לשתי עמודות בגובה קבוע */
export function useWideScreen(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => true)
}

export function useFillHeight<E extends HTMLElement>(minHeight = 380): { ref: RefObject<E | null>; height: number | undefined } {
  const ref = useRef<E>(null)
  const [height, setHeight] = useState<number | undefined>(undefined)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = (): void => {
      if (window.innerWidth < WIDE_MIN) { setHeight((p) => (p === undefined ? p : undefined)); return }
      const top = el.getBoundingClientRect().top + window.scrollY
      const next = Math.max(minHeight, Math.floor(window.innerHeight - top - GUTTER))
      setHeight((p) => (p === next ? p : next))
    }
    measure()
    window.addEventListener('resize', measure)
    /* תוכן שמעל האזור (באנר, נתיב שמתקפל לשתי שורות) משנה את המיקום שלו — מודדים מחדש */
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    if (ro && el.parentElement) ro.observe(el.parentElement)
    return () => { window.removeEventListener('resize', measure); ro?.disconnect() }
  }, [minHeight])

  return { ref, height }
}
