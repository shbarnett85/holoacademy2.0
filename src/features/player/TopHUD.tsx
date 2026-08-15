import { useSoundSettings } from '../../shared/lib/sound'

/* פס עליון — תואם ויזואלית ל-BottomHUD (אותו רקע/blur/border-glow), בראש המסך.
   מכיל: כפתור עין (שמאל), כותרת הסצנה (מרכז), כפתור השתקה + יציאה (ימין — RTL).
   הפס מחליק כלפי מעלה במצב-עין; כפתור העין נשאר תמיד גלוי (אחרת אי-אפשר לצאת ממצב-עין). */
export default function TopHUD({ title, onExit, hidden = false, hudSlot }: {
  title: string; onExit: () => void; hidden?: boolean
  /* גבישים + תאי חפצים. הם חיים ברצועה **העליונה** ולא בפס תחתון נפרד:
     במצב רוחבי במובייל הגובה הוא המשאב הנדיר, ורצועה שנייה גוזלת ~50px יקרים. */
  hudSlot?: React.ReactNode
}) {
  const { muted, toggleMuted } = useSoundSettings()
  return (
    <>
      {/* הפס עצמו — מחליק כלפי מעלה במצב-עין */}
      <div
        className="fixed top-0 left-0 right-0 flex items-center gap-3 px-4 py-2 holo-hud-top"
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
        {/* התחלה (ימין ב-RTL): כותרת + כפתורי הבקרה. סוף (שמאל): גבישים וחפצים. */}
        <h1
          className="holo-text-glow text-xl font-black truncate"
          /* המקום השמור לכפתורים (יציאה+סאונד, שניהם בצד ימין ב-RTL). הכותרת ממורכזת,
             ולכן הרזרבה נספרת פעמיים — במובייל היא גדלה כדי שהכותרת לא תיגלוש מתחת
             לכפתור הסאונד (ראו --tophud-reserve ב-index.css). */
          style={{ flex: '0 1 auto', minWidth: 0, textShadow: '0 0 14px rgba(0,246,255,0.5)' }}
        >
          {title}
        </h1>

        {hudSlot && <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--hud-slot-gap, 0.5rem)', minWidth: 0 }}>{hudSlot}</div>}

        {/* בקרות — נדחפות אל הקצה הנגדי, במקום שבו ישב כפתור העין שהוסר */}
        <div style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        {/* כפתור השתקה גלובלי — שמאלית לכפתור היציאה (RTL); המצב נשמר ב-localStorage */}
        <button
          onClick={toggleMuted}
          title={muted ? 'הפעל סאונד' : 'השתק סאונד'}
          aria-label={muted ? 'הפעל סאונד' : 'השתק סאונד'}
          aria-pressed={muted}
          className="cursor-pointer rounded-md flex items-center justify-center"
          style={{
            flexShrink: 0,
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
            flexShrink: 0,
            background: 'transparent', border: '1px solid rgba(0,246,255,0.3)', color: 'var(--holo-text)',
          }}
        >
          יציאה
        </button>

        </div>
      </div>
    </>
  )
}
