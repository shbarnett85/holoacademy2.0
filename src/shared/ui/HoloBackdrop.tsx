import type { ReactNode } from 'react'

/* רקע מלא משותף למסכי הפתיחה/כניסה (Claude Design): גרדיאנט עומק רדיאלי,
   רשת עדינה, שתי כדורי זוהר (cyan/magenta) ו-scanlines. RTL. כל הצבעים מ-tokens. */
export default function HoloBackdrop({ children }: { children: ReactNode }) {
  return (
    <div
      dir="rtl"
      className="relative flex flex-col items-center justify-center min-h-screen overflow-hidden"
      style={{ background: 'var(--holo-bg-deep)', fontFamily: 'var(--font-display)' }}
    >
      {/* כדורי זוהר */}
      <div className="absolute pointer-events-none" style={{ left: -140, top: -100, width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(47,243,255,.10), transparent 70%)', filter: 'blur(30px)' }} />
      <div className="absolute pointer-events-none" style={{ right: -140, bottom: -100, width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,69,230,.10), transparent 70%)', filter: 'blur(30px)' }} />
      {/* scanlines עדינים */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0) 0 2px, rgba(0,0,0,.13) 2px 3px)', opacity: 0.4 }} />

      {children}
    </div>
  )
}
