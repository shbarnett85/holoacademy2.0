import type { ReactNode } from 'react'

/* רקע מלא משותף למסכי הפתיחה/כניסה ולעמוד הבית של התלמיד: רקע הממשק, שטוח
   (בלי מעברי צבע, כדורי זוהר או קווי סריקה). RTL. */
export default function HoloBackdrop({ children }: { children: ReactNode }) {
  return (
    <div
      dir="rtl"
      className="relative flex flex-col items-center justify-center min-h-screen overflow-hidden"
      style={{ background: 'var(--page-background)', color: 'var(--color-ink)', fontFamily: 'var(--font-display)' }}
    >

      {children}
    </div>
  )
}
