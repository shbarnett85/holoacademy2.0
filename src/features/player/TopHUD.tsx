/* פס עליון — תואם ויזואלית ל-BottomHUD (אותו רקע/blur/border-glow), בראש המסך.
   מכיל את כותרת הסצנה (ממורכזת) וכפתור יציאה בפינה הימנית-עליונה (RTL).
   נעלם/חוזר במצב-עין כמו ה-BottomHUD (כאן: החלקה כלפי מעלה). */
export default function TopHUD({ title, onExit, hidden = false }: { title: string; onExit: () => void; hidden?: boolean }) {
  return (
    <div
      className="fixed top-0 left-0 right-0 flex items-center justify-center px-4 py-2"
      style={{
        background: 'rgba(10,10,31,0.85)',
        borderBottom: '1px solid rgba(0,246,255,0.25)',
        backdropFilter: 'blur(10px)',
        zIndex: 40,
        transform: hidden ? 'translateY(-110%)' : 'translateY(0)',
        opacity: hidden ? 0 : 1,
        transition: 'transform 0.45s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.45s ease',
        pointerEvents: hidden ? 'none' : 'auto',
      }}
    >
      {/* כותרת הסצנה — ממורכזת */}
      <h1
        className="holo-text-glow text-xl font-black truncate"
        style={{ maxWidth: 'calc(100% - 7rem)', textShadow: '0 0 14px rgba(0,246,255,0.5)' }}
      >
        {title}
      </h1>

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
  )
}
