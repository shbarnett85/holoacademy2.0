import { useSyncExternalStore } from 'react'

/* מנוי לערכה הפעילה. theme.js מפיץ אירוע 'holo-theme' בכל החלפה; ה-hook הזה
   מתרגם אותו לרינדור מחדש — נדרש לכל צבע שנקבע ב-JS ולא ב-CSS (למשל טקסט
   הכפתור עצמו, או פלטות שנבנות במערך כמו COLORS בגרפים). */
function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('holo-theme', onChange)
  return () => window.removeEventListener('holo-theme', onChange)
}

export function useTheme(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (typeof window !== 'undefined' && window.HoloTheme ? window.HoloTheme.isLight() : false),
    () => false,
  )
}
