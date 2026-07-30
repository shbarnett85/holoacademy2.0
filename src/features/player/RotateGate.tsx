import { useState } from 'react'

/* ── שער הסיבוב — "סובב את המכשיר לרוחב" ───────────────────────────────────
   מוצג במקום מסך המשחק כשמדובר בטלפון במצב לאורך (ראו useIsPhonePortrait).

   למה overlay ולא נעילת אוריינטציה: `screen.orientation.lock()` דורש fullscreen
   ואינו נתמך ב-Safari iOS כלל — כלומר לא עובד באייפון, שהוא חלק גדול מהמכשירים
   בכיתה. הדרך היחידה שעובדת בכל מקום היא לבקש מהמשתמש לסובב.

   ההסתרה אוטומטית: matchMedia מתעדכן מעצמו בסיבוב, ולכן הרכיב פשוט מפסיק
   להיות מרונדר — בלי האזנה ידנית ל-orientationchange ובלי רענון.

   היקף: **מסך המשחק בלבד**. דף הבית/התחברות/פאנל המורה נשארים שמישים לאורך. */

/* fullscreen מרוויח את הגובה שתופסת שורת הכתובת — קריטי כשהגובה ברוחב הוא
   ~375px. דורש מחווה של המשתמש, ולכן מוצע ככפתור. Safari iOS אינו תומך
   ב-requestFullscreen על אלמנט רגיל, ולכן הכפתור מוצג רק אם ה-API קיים. */
const canFullscreen = () =>
  typeof document !== 'undefined' &&
  !!document.documentElement.requestFullscreen &&
  !document.fullscreenElement

export default function RotateGate() {
  const [fsAsked, setFsAsked] = useState(false)

  async function goFullscreen() {
    try {
      await document.documentElement.requestFullscreen()
    } catch {
      /* נדחה/לא נתמך — לא מפריע, ההנחיה לסיבוב עומדת בפני עצמה */
    }
    setFsAsked(true)
  }

  return (
    <div
      dir="rtl"
      role="alertdialog"
      aria-label="נדרש מצב רוחבי"
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '1.6rem', padding: '2rem 1.5rem',
        /* safe-area — במצב לאורך ה-notch למעלה והסרגל למטה */
        paddingTop: 'calc(2rem + env(safe-area-inset-top))',
        paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))',
        background: 'radial-gradient(circle at 50% 35%, #131a3a 0%, #070b1c 55%, #04060f 100%)',
        textAlign: 'center', fontFamily: 'var(--font-display)',
      }}
    >
      <style>{`
        @keyframes rg-tilt {
          0%, 18%   { transform: rotate(0deg); }
          42%, 68%  { transform: rotate(-90deg); }
          92%, 100% { transform: rotate(-90deg); }
        }
        @keyframes rg-glow {
          0%, 100% { opacity: .35; transform: scale(1); }
          50%      { opacity: .75; transform: scale(1.08); }
        }
        .rg-phone { animation: rg-tilt 3.4s cubic-bezier(.6,0,.3,1) infinite; transform-origin: 50% 50%; }
        .rg-halo  { animation: rg-glow 3.4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .rg-phone { animation: none; transform: rotate(-90deg); }
          .rg-halo  { animation: none; }
        }
      `}</style>

      {/* אייקון הטלפון המסתובב + הילה */}
      <div style={{ position: 'relative', width: 132, height: 132, display: 'grid', placeItems: 'center' }}>
        <div
          className="rg-halo"
          style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(47,243,255,.5), rgba(242,65,218,.18) 55%, transparent 72%)',
            filter: 'blur(10px)', pointerEvents: 'none',
          }}
        />
        <svg className="rg-phone" width="72" height="112" viewBox="0 0 72 112" fill="none" aria-hidden="true">
          <rect x="2.5" y="2.5" width="67" height="107" rx="11"
            stroke="#2ff3ff" strokeWidth="3" fill="rgba(4,12,26,.85)" />
          <rect x="10" y="13" width="52" height="80" rx="4" fill="rgba(47,243,255,.10)" />
          <circle cx="36" cy="101" r="4.5" fill="#f241da" />
          <rect x="26" y="7" width="20" height="3" rx="1.5" fill="rgba(47,243,255,.5)" />
        </svg>
      </div>

      <div>
        <h1 style={{
          margin: 0, fontSize: 'clamp(1.35rem, 6.5vw, 1.85rem)', fontWeight: 900, lineHeight: 1.25,
          color: '#eaf9ff', textShadow: '0 0 22px rgba(47,243,255,.45)',
        }}>
          סובבו את המכשיר לרוחב
        </h1>
        <p style={{
          margin: '.7rem 0 0', fontSize: 'clamp(.9rem, 3.8vw, 1.05rem)', fontWeight: 400,
          color: 'rgba(180,220,255,.72)', lineHeight: 1.6, maxWidth: '22rem',
        }}>
          ההדמיה בנויה למסך רחב — כך התמונות ממלאות את המסך והאתגרים נוחים למשחק.
        </p>
      </div>

      {canFullscreen() && !fsAsked && (
        <button
          onClick={goFullscreen}
          style={{
            minHeight: 44, padding: '.7rem 1.4rem', borderRadius: 12, cursor: 'pointer',
            fontFamily: 'var(--font-display)', fontSize: '.95rem', fontWeight: 700,
            color: '#7ef6ff', background: 'rgba(47,243,255,.08)',
            border: '1px solid rgba(47,243,255,.4)', boxShadow: '0 0 18px rgba(47,243,255,.18)',
          }}
        >
          ⛶ מסך מלא
        </button>
      )}

      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: '.62rem', letterSpacing: '.2em',
        textTransform: 'uppercase', color: 'rgba(47,243,255,.3)',
      }}>
        HoloAcademy
      </div>
    </div>
  )
}
