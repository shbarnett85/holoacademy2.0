import { useSyncExternalStore } from 'react'

/* ── זיהוי מסך צר (מובייל) ─────────────────────────────────────────────────
   רוב התאמות המובייל בפרויקט נעשות ב-CSS (media query + var עם fallback של
   הדסקטופ, ראו index.css). ה-hook הזה נועד למקרה השונה: כשהמובייל דורש **מבנה
   DOM אחר** ולא רק מידות אחרות — למשל טבלת התלמידים, שבמובייל הופכת לכרטיסים.

   הסף (480px) זהה ל-media query שב-index.css — שינוי חייב להיעשות בשני המקומות.
   useSyncExternalStore נותן ערך עקבי גם ב-SSR/hydration ומונע פער רינדור. */
const QUERY = '(max-width: 480px)'

const mql = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(QUERY) : null)

function subscribe(onChange: () => void): () => void {
  const m = mql()
  if (!m) return () => {}
  /* addEventListener נתמך בכל דפדפן מודרני; addListener הוא fallback ל-Safari ישן */
  if (m.addEventListener) {
    m.addEventListener('change', onChange)
    return () => m.removeEventListener('change', onChange)
  }
  m.addListener(onChange)
  return () => m.removeListener(onChange)
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => mql()?.matches ?? false,
    () => false, /* שרת/סטטי — ברירת מחדל דסקטופ, לא משנה התנהגות קיימת */
  )
}
