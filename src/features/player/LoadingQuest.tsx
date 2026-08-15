/* ── מסך "טוען הדמיה" ──────────────────────────────────────────────────────
   מוצג בשני שלבים רצופים, באותו מראה בדיוק כדי שהתפר יהיה בלתי-נראה:
   1. ב-Player, בזמן שליפת ההדמיה מהשרת (לפני ש-GameScreen קיים).
   2. כשכבת-על בתוך GameScreen (z 79 — מתחת לקנבס חור-התולעת ב-80 ולהבזק ב-81),
      עד רגע הפריים הלבן המלא של ההבזק — שם מתבצעת ההחלפה לשקופית הראשונה.
   כך הרצף לעין הוא: טוען → חור תולעת → לבן מלא → הסצנה. */
export default function LoadingQuest({ overlay = false }: { overlay?: boolean }) {
  return (
    <div
      dir="rtl"
      style={{
        position: overlay ? 'fixed' : 'relative',
        inset: overlay ? 0 : undefined,
        minHeight: overlay ? undefined : '100dvh',
        zIndex: overlay ? 79 : undefined,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '1.4rem',
        background: 'radial-gradient(120% 90% at 50% -10%, #0c1430 0%, #070a18 45%, #04060f 100%)',
        fontFamily: 'var(--font-display)',
      }}
    >
      <style>{`
        @keyframes lq-ring { to { transform: rotate(360deg); } }
        @keyframes lq-ring-rev { to { transform: rotate(-360deg); } }
        @keyframes lq-core { 0%,100% { opacity: .55; transform: scale(.92); } 50% { opacity: 1; transform: scale(1.05); } }
        @keyframes lq-dots { 0%,100% { opacity: .25; } 50% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .lq-a { animation: none !important; }
        }
      `}</style>

      {/* פורטל מסתחרר — רמז ויזואלי לחור-התולעת שתכף ייפתח */}
      <div style={{ position: 'relative', width: 96, height: 96 }}>
        <div className="lq-a" style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: '2px solid transparent', borderTopColor: '#2ff3ff', borderRightColor: 'rgba(47,243,255,.35)',
          animation: 'lq-ring 1.3s linear infinite',
        }} />
        <div className="lq-a" style={{
          position: 'absolute', inset: 10, borderRadius: '50%',
          border: '2px solid transparent', borderBottomColor: '#ff45e6', borderLeftColor: 'rgba(255,69,230,.3)',
          animation: 'lq-ring-rev 2.1s linear infinite',
        }} />
        <div className="lq-a" style={{
          position: 'absolute', inset: 26, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(47,243,255,.85), rgba(47,243,255,.15) 60%, transparent 75%)',
          filter: 'blur(2px)',
          animation: 'lq-core 1.8s ease-in-out infinite',
        }} />
      </div>

      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#eaf9ff', textShadow: '0 0 16px rgba(47,243,255,.45)' }}>
          טוען הדמיה
          <span className="lq-a" style={{ animation: 'lq-dots 1.2s ease-in-out infinite' }}>…</span>
        </div>
        <div style={{ marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: '.6rem', letterSpacing: '.24em', textTransform: 'uppercase', color: 'rgba(47,243,255,.35)' }}>
          HOLOACADEMY
        </div>
      </div>
    </div>
  )
}
