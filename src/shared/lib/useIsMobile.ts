import { useSyncExternalStore } from 'react'

/* ── זיהוי מסך צר (מובייל) ─────────────────────────────────────────────────
   רוב התאמות המובייל בפרויקט נעשות ב-CSS (media query + var עם fallback של
   הדסקטופ, ראו index.css). ה-hook הזה נועד למקרה השונה: כשהמובייל דורש **מבנה
   DOM אחר** ולא רק מידות אחרות — למשל טבלת התלמידים, שבמובייל הופכת לכרטיסים.

   ברירת המחדל (480px) זהה ל-media query שב-index.css — שינוי שם חייב להיעשות
   בשני המקומות. אפשר להעביר סף אחר כשהרכיב נשבר מוקדם יותר: טבלת התלמידים,
   למשל, מתחילה לחתוך שמות כבר ברוחב טאבלט ולכן עוברת לכרטיסים ב-900px.
   useSyncExternalStore נותן ערך עקבי גם ב-SSR/hydration ומונע פער רינדור. */
export const MOBILE_MAX = 480

/* מטמון פר-שאילתה — MediaQueryList יציב נדרש כדי ש-getSnapshot לא יחזיר ערך
   חדש בכל רינדור (מה שהיה גורם ללולאת רינדור אינסופית). */
const cache = new Map<number, MediaQueryList | null>()

function mql(maxWidth: number): MediaQueryList | null {
  if (!cache.has(maxWidth)) {
    cache.set(
      maxWidth,
      typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(`(max-width: ${maxWidth}px)`) : null,
    )
  }
  return cache.get(maxWidth) ?? null
}

export function useIsMobile(maxWidth: number = MOBILE_MAX): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const m = mql(maxWidth)
      if (!m) return () => {}
      /* addEventListener נתמך בכל דפדפן מודרני; addListener הוא fallback ל-Safari ישן */
      if (m.addEventListener) {
        m.addEventListener('change', onChange)
        return () => m.removeEventListener('change', onChange)
      }
      m.addListener(onChange)
      return () => m.removeListener(onChange)
    },
    () => mql(maxWidth)?.matches ?? false,
    () => false, /* שרת/סטטי — ברירת מחדל דסקטופ, לא משנה התנהגות קיימת */
  )
}
