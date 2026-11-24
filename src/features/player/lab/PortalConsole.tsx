/* הקונסולה שלפני הפורטל (לבקשת המשתמש, לפי תמונה שסיפק): בחירת השיעור היא חפץ בחדר ולא ממשק שמונח על התמונה.
   התמונה (public/lab/console.webp, נוצרת ב-scripts/genPortalConsole.ts) היא הגוף של הקונסולה, ומעליה, בדיוק במקומות
   שבתמונה, שלושה דברים חיים:
     · השדה הלבן: פס דק בצבע המקצוע עם שם המקצוע, ומתחתיו שם השיעור (טקסט אמיתי, מתחלף בהחלקה)
     · שני המקשים שבצדדים: השיעור הקודם והשיעור הבא (החצים מצוירים בתמונה; הכפתורים שקופים מעליהם)
     · הכפתור שלמעלה: "שגר אותי!" — נכנס לשיעור שבפורטל, כמו לחיצה על הפורטל עצמו
   כל המידות ביחידות של רוחב הקונסולה (cqw), ולכן היא נראית אותו דבר בכל גודל. הרוחב נקבע מבחוץ (.home4-now).
   הסגנון כאן ולא ב-index.css, כמו שאר הפורטל: זה חלק מהעולם של החדר (זוהר וצבעי ניאון), ולא מהממשק. */
import type { HTMLAttributes, ReactNode } from 'react'
import SwapSlide from '../../../shared/ui/SwapSlide'
import { subjectTagColors } from '../../../shared/lib/subjects'
import { PORTAL_TEXT } from '../gameFeel/text'

/* רוחב חלקי גובה של התמונה, והמקומות של החלקים באחוזים ממנה (הפלט של genPortalConsole.ts) */
export const CONSOLE_ASPECT = 3.1532
const AT = {
  field: { left: 25.02, top: 40.58, width: 49.97, height: 32.3 },
  left: { left: 12.54, top: 42.86, width: 9.85, height: 25.26 },
  right: { left: 77.68, top: 42.65, width: 9.85, height: 25.47 },
  launch: { left: 34.87, top: 7.04, width: 30.14, height: 25.67 },
}
const box = (b: { left: number; top: number; width: number; height: number }) => `left: ${b.left}%; top: ${b.top}%; width: ${b.width}%; height: ${b.height}%;`
/* שם ארוך מזה מוצג בשתי שורות ובאות קטנה יותר */
const LONG_TITLE = 22

const CSS = `
.pcon { position: relative; width: 100%; aspect-ratio: ${CONSOLE_ASPECT}; container-type: inline-size; direction: rtl; font-family: var(--font-display); user-select: none; }
.pcon__art { position: absolute; inset: 0; width: 100%; height: 100%; display: block; pointer-events: none; filter: drop-shadow(0 1.6cqw 1.2cqw rgb(24 12 60 / .5)); }
.pcon button { position: absolute; margin: 0; padding: 0; border: 0; background: none; cursor: pointer; font: inherit; -webkit-tap-highlight-color: transparent; }
.pcon button:focus-visible { outline: 3px solid rgb(255 255 255); outline-offset: 2px; }

/* הכפתור שלמעלה: האותיות עשויות אור, כמו המסגרת הכתומה שסביבן */
.pcon__launch { ${box(AT.launch)} border-radius: 999px; display: flex; align-items: center; justify-content: center; }
.pcon__launch-text { font-size: 4.5cqw; font-weight: 900; line-height: 1; letter-spacing: .02em; white-space: nowrap; color: rgb(255 255 255);
  text-shadow: 0 0 .12em rgb(255 255 255 / .9), 0 0 .38em rgb(255 110 220 / .95), 0 0 .9em rgb(255 110 220 / .6); }
.pcon__launch::after, .pcon__key::after { content: ''; position: absolute; inset: 0; border-radius: inherit; opacity: 0; transition: opacity .15s ease; pointer-events: none; }
.pcon__launch::after { box-shadow: 0 0 2.2cqw .5cqw rgb(255 150 60 / .75), inset 0 0 1.8cqw rgb(255 170 90 / .5); }

/* המקשים שבצדדים */
.pcon__key { border-radius: 22%; }
.pcon__key--prev { ${box(AT.right)} }
.pcon__key--next { ${box(AT.left)} }
.pcon__key::after { box-shadow: 0 0 1.8cqw .4cqw rgb(70 180 255 / .8), inset 0 0 1.6cqw rgb(120 205 255 / .55); }
@media (hover: hover) { .pcon__launch:hover::after, .pcon__key:hover::after { opacity: 1; } }
.pcon__launch:focus-visible::after, .pcon__key:focus-visible::after { opacity: 1; }
.pcon__launch:active, .pcon__key:active { filter: brightness(1.25); }
.pcon__launch:active .pcon__launch-text { transform: translateY(.25cqw); }

/* השדה הלבן: פס המקצוע לאורך הקצה העליון, ומתחתיו שם השיעור */
.pcon__field { position: absolute; ${box(AT.field)} border-radius: 1.5cqw; overflow: hidden; }
.pcon__field .swap-slide { width: 100%; height: 100%; flex-direction: column; align-items: stretch; justify-content: flex-start; gap: 0; }
.pcon__subject { flex: 0 0 auto; height: 3.4cqw; display: flex; align-items: center; justify-content: center; font-size: 2.25cqw; font-weight: 800; line-height: 1; letter-spacing: .03em; white-space: nowrap; }
.pcon__title-box { flex: 1 1 0; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 0 1.6cqw; }
.pcon__title { color: var(--color-ink); font-size: 3.9cqw; font-weight: 800; line-height: 1.12; text-align: center; text-wrap: balance;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.pcon__title[data-long] { font-size: 3cqw; }
.pcon__field[data-plain] .pcon__title { font-size: 4.4cqw; }
.pcon__field[data-plain] .pcon__title[data-long] { font-size: 3.6cqw; }
`

export default function PortalConsole({ title, subjectCode, swapKey, dir, onPrev, onNext, onLaunch, launchLabel, fieldProps, titleProps, prevProps, nextProps, children }: {
  title: string
  /* בלי ערך (undefined): בלי פס מקצוע. null: "לא סווג" */
  subjectCode?: string | null
  /* כשהמפתח מתחלף (שיעור אחר) השם מתחלף בהחלקה */
  swapKey: string
  dir?: 1 | -1
  /* בלי ערך: אין שיעורים לדפדף ביניהם, והמקשים שבתמונה אינם לחיצים */
  onPrev?: () => void
  onNext?: () => void
  onLaunch: () => void
  /* השם של הכפתור לקוראי מסך (למשל עם שם השיעור); על המסך תמיד "שגר אותי!" */
  launchLabel?: string
  fieldProps?: HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, string | undefined>
  titleProps?: Record<`data-${string}`, string | undefined>
  prevProps?: Record<`data-${string}`, string | undefined>
  nextProps?: Record<`data-${string}`, string | undefined>
  /* תוכן נוסף בתוך השדה (למשל טקסט לקוראי מסך) */
  children?: ReactNode
}) {
  const subject = subjectCode === undefined ? null : subjectTagColors(subjectCode)
  return (
    <div className="pcon" data-portal-console>
      <style>{CSS}</style>
      <img className="pcon__art" src="/lab/console.webp" alt="" draggable={false} />
      <button type="button" className="pcon__launch" onClick={onLaunch} aria-label={launchLabel} data-portal-launch>
        <span className="pcon__launch-text">{PORTAL_TEXT.launch}</span>
      </button>
      {onPrev && <button type="button" className="pcon__key pcon__key--prev" onClick={onPrev} aria-label={PORTAL_TEXT.prev} {...prevProps} />}
      <div className="pcon__field" aria-live="polite" data-plain={subject ? undefined : ''} {...fieldProps}>
        <SwapSlide swapKey={swapKey} dir={dir}>
          {subject && <span className="pcon__subject" data-subject-tag={subject.code} style={{ background: subject.bg, color: subject.fg }}>{subject.label}</span>}
          <span className="pcon__title-box">
            <span className="pcon__title" data-long={title.length > LONG_TITLE ? '' : undefined} {...titleProps}>{title}</span>
          </span>
        </SwapSlide>
        {children}
      </div>
      {onNext && <button type="button" className="pcon__key pcon__key--next" onClick={onNext} aria-label={PORTAL_TEXT.next} {...nextProps} />}
    </div>
  )
}
