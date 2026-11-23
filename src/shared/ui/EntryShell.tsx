import { useEffect, useRef, type ReactNode } from 'react'
import Home from '../../features/home'
import BrandLogo from './BrandLogo'

/* הלוגו המלא בראש כל חלון כניסה (החלון לבן). הריפוד שלו הוא השטח הנקי.
   במסך נמוך (index.css, .entry-logo / .entry-panel) הלוגו קטן יותר והריפוד של החלון מצטמצם, כדי שהחלון לא יתארך */
export function EntryLogo() {
  return <div className="entry-logo" data-entry-logo><BrandLogo height="var(--entry-logo-h)" /></div>
}

/* ── קליפת מסכי הכניסה ────────────────────────────────────────────────────────
   כל חלונות הכניסה (מי את/ה?, PIN, מורים ומנהלים, הרשמה, ברוכים הבאים) מוצגים
   כשכבה מעל הדף הראשי — בדיוק כמו חלון "קוד כיתה": הדף הראשי מרונדר
   חי מתחת (מוקפא לאינטראקציה: inert + aria-hidden + pointer-events), ומעליו
   שכבת הכהיה שטוחה (--color-scrim, בלי טשטוש).
   כך המעבר בין שלבי הזרימה מחליף רק את תוכן החלון — הרקע יציב ולא מהבהב
   (ה-showcase של הדף נשמר ב-cache מודול, אז רינדור-מחדש בין routes זהה פיקסלית).
   התנהגות אחידה: Escape וקליק מחוץ לחלון סוגרים (כשמוגדר onClose), פוקוס
   מקלדת כלוא בחלון וחוזר למקומו בסגירה, והדף שמתחת לא נגלל (overflow hidden). */
export default function EntryShell({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null)
  const prevFocus = useRef<HTMLElement | null>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    prevFocus.current = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeRef.current) { closeRef.current(); return }
      if (e.key === 'Tab' && panelRef.current) {
        const f = [...panelRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
          .filter((el) => !el.hasAttribute('disabled'))
        if (!f.length) return
        const first = f[0]
        const last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
        else if (!panelRef.current.contains(document.activeElement)) { e.preventDefault(); first.focus() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      prevFocus.current?.focus?.()
    }
  }, [])

  return (
    <div dir="rtl" style={{ position: 'fixed', inset: 0, overflow: 'hidden', fontFamily: 'var(--font-display)' }}>
      {/* הדף הראשי — חי, מוקפא לאינטראקציה ולפוקוס */}
      <div aria-hidden ref={(el) => { el?.setAttribute('inert', '') }} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 /* stacking context — כולא את ה-z-index הפנימיים של הבית מתחת לשכבה */ }}>
        <Home />
      </div>
      {/* שכבת ההכהיה: שטוחה, מטוקן */}
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 1, background: 'var(--color-scrim)' }} />
      {/* החלון — ממורכז; קליקים בתוכו לא זולגים לשכבת הסגירה */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, pointerEvents: 'none' }}>
        {/* הריפוד בימין ולמטה משאיר מקום לצל הקשיח של החלון (אחרת overflow חותך אותו) */}
        <div ref={panelRef} role="dialog" aria-modal="true" style={{ pointerEvents: 'auto', maxHeight: '94vh', maxWidth: '100%', overflowY: 'auto', borderRadius: 22, padding: '0 8px 8px 0' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
