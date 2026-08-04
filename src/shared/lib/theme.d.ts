/* טיפוסים ל-API הגלובלי של מצב-הבהיר. המימוש חי ב-public/theme.js, שנטען
   כסקריפט רגיל ב-<head> לפני React (כדי שהערכה תחול לפני הצביעה הראשונה). */
export {}

declare global {
  interface Window {
    HoloTheme: {
      isLight(): boolean
      /** שומר ב-localStorage, מחיל על <html> ומפיץ אירוע 'holo-theme' */
      set(mode: 'light' | 'dark'): void
      toggle(): void
      /** 'var(--t1)' → הערך המחושב בפועל (נדרש ל-canvas ולחישובי JS) */
      resolve(value: string): string
    }
    /** טריפלט RGB ('47,243,255') + אלפא → צבע מותאם-ערכה, לשימוש ב-template strings */
    HoloTint(rgb: string, alpha: number): string
  }
}
