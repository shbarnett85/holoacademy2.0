/* מיקום הגלילה של העמוד. גוף העמוד הוא אזור הגלילה (index.css: כך פס הגלילה בשמאל), ולכן window.scrollY תמיד 0 */
export function pageScrollTop(): number {
  return (typeof document !== 'undefined' ? document.body?.scrollTop ?? 0 : 0) + (typeof window !== 'undefined' ? window.scrollY : 0)
}
