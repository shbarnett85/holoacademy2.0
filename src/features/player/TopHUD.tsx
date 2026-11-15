import { useSoundSettings } from '../../shared/lib/sound'
import { BOOK_TEXT } from './gameFeel/text'
import type { PageMark } from '../../shared/lib/bookPages'

/* ה-HUD שבראש מסך המשחק: רקע לבן וקו דיו (index.css: .holo-hud-top).
   התחלה (ימין ב-RTL): שם התלמיד/ה ואווטאר באפרסק, וכותרת העמוד. סוף: קריסטלים וחפצים, השתקה ויציאה.
   פס ההתקדמות (כתום) רץ לאורך הקצה התחתון של ה-HUD, ולכן אינו תופס מקום בשורה. */
export default function TopHUD({ title, onExit, hidden = false, hudSlot, studentName, progress, page, pageMarks }: {
  title: string; onExit: () => void; hidden?: boolean
  /* קריסטלים + תאי חפצים. הם חיים ברצועה **העליונה** ולא בפס תחתון נפרד:
     במצב רוחבי במובייל הגובה הוא המשאב הנדיר, ורצועה שנייה גוזלת ~50px יקרים. */
  hudSlot?: React.ReactNode
  /* שם התלמיד/ה (כשיש). בלי שם (מבקר, מקרן, תצוגה מקדימה) התג לא מוצג */
  studentName?: string | null
  /* ההתקדמות בשיעור: העמוד הנוכחי מתוך הכול. בלי ערך הפס לא מוצג */
  progress?: { current: number; total: number } | null
  /* מספר העמוד: המקום של העמוד הנוכחי בספר ("עמוד 3 מתוך 6") */
  page?: { current: number; total: number } | null
  /* פס ההתקדמות מחולק למקטעים: מקטע לכל עמוד בספר (נפתח / נוכחי / עוד לא). בלי ערך: פס רציף */
  pageMarks?: PageMark[]
}) {
  const { muted, toggleMuted } = useSoundSettings()
  const name = (studentName ?? '').trim()
  const pct = progress && progress.total > 0 ? Math.max(0, Math.min(100, Math.round((progress.current / progress.total) * 100))) : null
  return (
    <>
      {/* הפס עצמו — מחליק כלפי מעלה במצב-עין */}
      <div
        className="fixed top-0 left-0 right-0 flex items-center gap-3 px-4 py-2 holo-hud-top"
        style={{
          zIndex: 70,
          transform: hidden ? 'translateY(-110%)' : 'translateY(0)',
          opacity: hidden ? 0 : 1,
          transition: 'transform 0.45s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.45s ease',
          pointerEvents: hidden ? 'none' : 'auto',
        }}
      >
        {name && (
          <span className="holo-hud-name" data-hud-student aria-label={name} title={name}>
            <span className="holo-hud-avatar" aria-hidden="true">{name.charAt(0)}</span>
            <span aria-hidden="true">{name}</span>
          </span>
        )}
        {/* כותרת העמוד, ומתחתיה "עמוד 3 מתוך 6". בטלפון לרוחב (גובה נמוך) התווית עוברת לצד הכותרת, כדי שה-HUD לא יגבה */}
        <div className="holo-hud-title">
          <h1 className="holo-text-glow text-xl font-black truncate">{title}</h1>
          {page && page.total > 0 && page.current > 0 && (
            <span className="holo-hud-page" data-hud-page={page.current}>{BOOK_TEXT.page(page.current, page.total)}</span>
          )}
        </div>

        {/* בקרות — נדחפות אל הקצה הנגדי, במקום שבו ישב כפתור העין שהוסר */}
        <div style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        {/* קריסטלים + מפתחות — צמודים לקצה שמאל, ליד כפתור האודיו */}
        {hudSlot && <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--hud-slot-gap, 0.5rem)', minWidth: 0 }}>{hudSlot}</div>}

        {/* כפתור השתקה גלובלי — שמאלית לכפתור היציאה (RTL); המצב נשמר ב-localStorage */}
        <button
          onClick={toggleMuted}
          title={muted ? 'הפעל סאונד' : 'השתק סאונד'}
          aria-label={muted ? 'הפעל סאונד' : 'השתק סאונד'}
          aria-pressed={muted}
          className="holo-button holo-button--sm holo-hud-btn flex items-center justify-center"
          style={{ width: '2.1rem', height: '2.1rem', fontSize: '1.05rem', padding: 0 }}
        >
          {muted ? '🔇' : '🔊'}
        </button>

        {/* כפתור יציאה — פינה ימנית-עליונה (RTL) */}
        <button
          onClick={onExit}
          className="holo-button holo-button--sm holo-hud-btn text-sm"
          style={{ padding: '.25rem .75rem' }}
        >
          יציאה
        </button>

        </div>
        {/* פס ההתקדמות: מקטע לכל עמוד, לאורך תחתית ה-HUD. עמוד שנפתח מתמלא בכתום, והעמוד הנוכחי גבוה יותר */}
        {pct !== null && (
          <div className={`holo-hud-progress${pageMarks?.length ? ' holo-hud-progress--pages' : ''}`} data-hud-progress={pct} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="ההתקדמות בשיעור"
            aria-valuetext={page && page.current > 0 ? BOOK_TEXT.page(page.current, page.total) : undefined}>
            {pageMarks?.length
              ? pageMarks.map((m, i) => <i key={i} data-page={m} />)
              : <i style={{ width: `${pct}%` }} />}
          </div>
        )}
      </div>
    </>
  )
}
