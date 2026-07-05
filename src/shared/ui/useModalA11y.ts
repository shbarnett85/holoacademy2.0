import { useEffect } from 'react'

/* נגישות מודאלים משותפת: Escape סוגר את המודאל.
   משלים את הקונבנציה הקיימת (קליק על הרקע סוגר) בנתיב מקלדת.
   ה-role="dialog"/aria-modal מוחלים על ה-element עצמו אצל הקורא. */
export function useEscToClose(onClose: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, enabled])
}
