import { useEffect, useRef } from 'react'

/* ── מעקב אחרי נקודת הכתיבה ────────────────────────────────────────────────
   חלון הטקסט קבוע בגודלו, ולכן נרטיב ארוך גולש מתחתיו. בלי מעקב, ההקלדה
   ממשיכה "מתחת לקו" והצופה רואה טקסט שקפא בזמן שהאנימציה רצה מחוץ לתחום.
   ה-hook נצמד לתחתית בזמן שהטקסט גדל, כך שהשורה הנכתבת תמיד במוקד.

   שני כללים שמונעים ממנו להיות מעצבן:
   · נצמד רק כשהמשתמש כבר בתחתית (STICK_SLACK). אם הוא גלל למעלה כדי לחזור
     ולקרוא — לא חוטפים לו את המסך.
   · מפסיק לחלוטין כש-`active` כבוי (סיום ההקלדה), כדי שהגלילה תישאר שלו. */
const STICK_SLACK = 48 /* px — עד כמה רחוק מהתחתית עדיין נחשב "צמוד" */

export function useTypingScroll(active: boolean) {
  const ref = useRef<HTMLDivElement | null>(null)
  /* מתחילים צמודים; המשתמש יכול לנתק ע"י גלילה למעלה */
  const stickRef = useRef(true)

  useEffect(() => {
    const el = ref.current
    if (!el || !active) return

    stickRef.current = true
    const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    const onScroll = () => {
      const gap = el.scrollHeight - el.scrollTop - el.clientHeight
      stickRef.current = gap <= STICK_SLACK
    }
    const toBottom = () => {
      if (!stickRef.current) return
      el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    /* ה-Typewriter מוסיף תווים לצומת טקסט קיים, ולכן characterData חיוני —
       childList לבדו לא היה מתפוצץ על רוב ההוספות. */
    const mo = new MutationObserver(toBottom)
    mo.observe(el, { childList: true, subtree: true, characterData: true })
    toBottom()

    return () => {
      el.removeEventListener('scroll', onScroll)
      mo.disconnect()
    }
  }, [active])

  return ref
}
