import { useSyncExternalStore } from 'react'

/* ── האזנה ל-media query מתוך React ────────────────────────────────────────
   רוב התאמות המובייל בפרויקט נעשות ב-CSS (media query + var עם fallback של
   הדסקטופ, ראו index.css). ה-hooks כאן נועדו למקרה השונה: כשהמובייל דורש
   **מבנה DOM אחר** ולא רק מידות אחרות — טבלת התלמידים שהופכת לכרטיסים,
   או שער הסיבוב שמחליף את המשחק כולו.

   useSyncExternalStore נותן ערך עקבי גם ב-SSR/hydration ומונע פער רינדור. */

/* מטמון פר-שאילתה — MediaQueryList יציב נדרש כדי ש-getSnapshot לא יחזיר ערך
   חדש בכל רינדור (מה שהיה גורם ללולאת רינדור אינסופית). */
const cache = new Map<string, MediaQueryList | null>()

function mql(query: string): MediaQueryList | null {
  if (!cache.has(query)) {
    cache.set(query, typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query) : null)
  }
  return cache.get(query) ?? null
}

/* ה-subscribe נשמר פר-שאילתה כדי שלא ייווצר מנוי חדש בכל רינדור. */
const subs = new Map<string, (onChange: () => void) => () => void>()

function subscriberFor(query: string) {
  let sub = subs.get(query)
  if (!sub) {
    sub = (onChange: () => void) => {
      const m = mql(query)
      const offs: (() => void)[] = []
      if (m) {
        /* addEventListener נתמך בכל דפדפן מודרני; addListener הוא fallback ל-Safari ישן */
        if (m.addEventListener) {
          m.addEventListener('change', onChange)
          offs.push(() => m.removeEventListener('change', onChange))
        } else {
          m.addListener(onChange)
          offs.push(() => m.removeListener(onChange))
        }
      }
      /* חגורה ושליים: ה-MediaQueryList אמור לירות 'change' בסיבוב, אבל בפועל יש
         סביבות שבהן ה-matches מתעדכן בלי שהאירוע נורה (נמדד) — ואז ה-UI קופא על
         המצב הקודם. resize + orientationchange מבטיחים עדכון בכל מקרה; הקריאה
         עצמה זולה (getSnapshot משווה בוליאני, ולכן אין רינדור מיותר). */
      if (typeof window !== 'undefined') {
        window.addEventListener('resize', onChange)
        window.addEventListener('orientationchange', onChange)
        offs.push(() => window.removeEventListener('resize', onChange))
        offs.push(() => window.removeEventListener('orientationchange', onChange))
      }
      return () => offs.forEach((off) => off())
    }
    subs.set(query, sub)
  }
  return sub
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    subscriberFor(query),
    () => mql(query)?.matches ?? false,
    () => false, /* שרת/סטטי — ברירת מחדל דסקטופ, לא משנה התנהגות קיימת */
  )
}

/* ── מסך צר ─────────────────────────────────────────────────────────────────
   ברירת המחדל (480px) זהה ל-media query שב-index.css — שינוי שם חייב להיעשות
   בשני המקומות. אפשר להעביר סף אחר כשהרכיב נשבר מוקדם יותר: טבלת התלמידים,
   למשל, מתחילה לחתוך שמות כבר ברוחב טאבלט ולכן עוברת לכרטיסים ב-900px. */
export const MOBILE_MAX = 480

export function useIsMobile(maxWidth: number = MOBILE_MAX): boolean {
  return useMediaQuery(`(max-width: ${maxWidth}px)`)
}

/* ── שער הסיבוב (מסך המשחק בלבד) ───────────────────────────────────────────
   נכון כאשר זה **טלפון במצב לאורך**. שני התנאים נדרשים:
   · orientation: portrait — המשתמש מחזיק לאורך.
   · max-width 540px — מסנן טאבלטים (768px+ לאורך) וחלונות דסקטופ צרים, ששם
     המשחק שמיש לגמרי ואין סיבה לחסום.
   תמונות הסצנות הן 1280×720 (16:9) — בדיוק יחס טלפון ברוחב, ולכן ברוחב הן
   ממלאות את המסך בלי חיתוך כלל, ולאורך היו מאבדות ~74% מרוחב התמונה. */
export const PHONE_PORTRAIT = '(orientation: portrait) and (max-width: 540px)'

export function useIsPhonePortrait(): boolean {
  return useMediaQuery(PHONE_PORTRAIT)
}
