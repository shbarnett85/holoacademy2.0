import { useSoundSettings } from '../../shared/lib/sound'

/* פס עליון — תואם ויזואלית ל-BottomHUD (אותו רקע/blur/border-glow), בראש המסך.
   מכיל: כפתור עין (שמאל), כותרת הסצנה (מרכז), כפתור השתקה + יציאה (ימין — RTL).
   הפס מחליק כלפי מעלה במצב-עין; כפתור העין נשאר תמיד גלוי (אחרת אי-אפשר לצאת ממצב-עין). */
export default function TopHUD({ title, onExit, hidden = false, eyeActive, onToggleEye }: {
  title: string; onExit: () => void; hidden?: boolean; eyeActive: boolean; onToggleEye: () => void
}) {
  const { muted, toggleMuted } = useSoundSettings()
  return (
    <>
      {/* כפתור עין — תמיד גלוי, יושב בשורת הפס משמאל (גם כשהפס מוסתר) */}
      <button
        onClick={onToggleEye}
        title={eyeActive ? 'הצג ממשק' : 'הסתר ממשק וצפה בתמונה'}
        aria-label="מצב עין"
        className="fixed cursor-pointer flex items-center justify-center"
        style={{
          top: '0.35rem', left: '0.7rem', zIndex: 71,
          width: '2.2rem', height: '2.2rem', borderRadius: '50%', fontSize: '1.05rem',
          background: 'rgba(0,20,40,0.6)', border: '1px solid rgba(0,246,255,0.35)', backdropFilter: 'blur(4px)',
          opacity: eyeActive ? 0.9 : 0.7, transition: 'opacity 0.3s ease',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = eyeActive ? '0.9' : '0.7')}
      >
        {eyeActive ? '🙈' : '👁️'}
      </button>

      {/* הפס עצמו — מחליק כלפי מעלה במצב-עין */}
      <div
        className="fixed top-0 left-0 right-0 flex items-center justify-center px-4 py-2"
        style={{
          background: 'rgba(10,10,31,0.85)',
          borderBottom: '1px solid rgba(0,246,255,0.25)',
          backdropFilter: 'blur(10px)',
          zIndex: 70,
          transform: hidden ? 'translateY(-110%)' : 'translateY(0)',
          opacity: hidden ? 0 : 1,
          transition: 'transform 0.45s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.45s ease',
          pointerEvents: hidden ? 'none' : 'auto',
        }}
      >
        {/* כותרת הסצנה — ממורכזת */}
        <h1
          className="holo-text-glow text-xl font-black truncate"
          style={{ maxWidth: 'calc(100% - 9rem)', textShadow: '0 0 14px rgba(0,246,255,0.5)' }}
        >
          {title}
        </h1>

        {/* כפתור השתקה גלובלי — שמאלית לכפתור היציאה (RTL); המצב נשמר ב-localStorage */}
        <button
          onClick={toggleMuted}
          title={muted ? 'הפעל סאונד' : 'השתק סאונד'}
          aria-label={muted ? 'הפעל סאונד' : 'השתק סאונד'}
          aria-pressed={muted}
          className="cursor-pointer rounded-md flex items-center justify-center"
          style={{
            position: 'absolute', right: '5rem', top: '50%', transform: 'translateY(-50%)',
            width: '2.1rem', height: '2.1rem', fontSize: '1.05rem',
            background: 'transparent', border: '1px solid rgba(0,246,255,0.3)', color: 'var(--holo-text)',
          }}
        >
          {muted ? '🔇' : '🔊'}
        </button>

        {/* כפתור יציאה — פינה ימנית-עליונה (RTL) */}
        <button
          onClick={onExit}
          className="text-sm cursor-pointer rounded-md px-3 py-1"
          style={{
            position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)',
            background: 'transparent', border: '1px solid rgba(0,246,255,0.3)', color: 'var(--holo-text)',
          }}
        >
          יציאה
        </button>
      </div>
    </>
  )
}
