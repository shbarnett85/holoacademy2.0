import { useEffect, useRef } from 'react'

/* ── מעקב אחרי נקודת הכתיבה ────────────────────────────────────────────────
   חלון הטקסט קבוע בגודלו, ולכן נרטיב ארוך גולש מתחתיו. בלי מעקב, ההקלדה
   ממשיכה "מתחת לקו" והצופה רואה טקסט שקפא בזמן שהאנימציה רצה מחוץ לתחום.

   ⚠️ **לא** לגלול לתחתית: ה-Typewriter מרנדר רוח-רפאים של **כל** הטקסט
   (visibility:hidden) כדי לשמור מקום, ולכן scrollHeight מלא כבר בפריים הראשון
   וגלילה לתחתית נועלת את המבט על סוף הטקסט בזמן שהכתיבה קורית למעלה. במקום
   זה עוקבים אחרי **הסמן** ([data-typing-caret]), שנע עם התו האחרון שנכתב.

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

    /* ניתוק רק אם המשתמש גלל **מעל** נקודת הכתיבה; גלילה למטה לא מנתקת */
    const onScroll = () => {
      const caret = el.querySelector<HTMLElement>('[data-typing-caret]')
      if (!caret) return
      const top = caret.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop
      stickRef.current = el.scrollTop >= top - el.clientHeight - STICK_SLACK
    }
    /* שומרים את הסמן בשליש התחתון — מספיק הקשר מעליו, ומרחב לשורה הבאה */
    const follow = () => {
      if (!stickRef.current) return
      const caret = el.querySelector<HTMLElement>('[data-typing-caret]')
      if (!caret) return
      const top = caret.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop
      const target = Math.max(0, Math.min(top - el.clientHeight * 0.66, el.scrollHeight - el.clientHeight))
      if (Math.abs(target - el.scrollTop) < 2) return
      el.scrollTo({ top: target, behavior: smooth ? 'smooth' : 'auto' })
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    /* ה-Typewriter מוסיף תווים לצומת טקסט קיים, ולכן characterData חיוני —
       childList לבדו לא היה מתפוצץ על רוב ההוספות. */
    const mo = new MutationObserver(follow)
    mo.observe(el, { childList: true, subtree: true, characterData: true })
    follow()

    return () => {
      el.removeEventListener('scroll', onScroll)
      mo.disconnect()
    }
  }, [active])

  return ref
}
