import { useLayoutEffect, useRef } from 'react'
import { useSoundSettings } from '../../shared/lib/sound'
import BrandIcon from '../../shared/ui/BrandIcon'
import { BOOK_TEXT } from './gameFeel/text'
import type { PageMark } from '../../shared/lib/bookPages'

/* ה-HUD שבראש מסך המשחק, באותה שפה של הסרגל העליון של המורה (StudioTopBar): פס ברקע "המכונה" (סגול) עם קו דיו,
   אריח לבן עם סמל הספר, כותרת בדיו, שם ואווטאר באפרסק, וכפתורים בתכלת (index.css: .holo-hud-top).
   התחלה (ימין ב-RTL): הסמל, שם התלמיד/ה וכותרת העמוד. סוף: קריסטלים וחפצים, השתקה ויציאה.
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
  /* הגובה של הפס נמדד ונחשף כ---hud-h: הדף והתמונה שמתחתיו מתחילים בדיוק בקצה התחתון שלו */
  const barRef = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    const el = barRef.current
    if (!el) return
    const root = document.documentElement
    const set = () => root.style.setProperty('--hud-h', `${el.offsetHeight}px`)
    set()
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(set)
    ro?.observe(el)
    return () => { ro?.disconnect(); root.style.removeProperty('--hud-h') }
  }, [])
  const name = (studentName ?? '').trim()
  const pct = progress && progress.total > 0 ? Math.max(0, Math.min(100, Math.round((progress.current / progress.total) * 100))) : null
  return (
    <>
      {/* הפס עצמו — מחליק כלפי מעלה במצב-עין */}
      <div
        ref={barRef}
        className="fixed top-0 left-0 right-0 flex items-center gap-3 px-4 py-2 holo-hud-top"
        style={{
          zIndex: 70,
          transform: hidden ? 'translateY(-110%)' : 'translateY(0)',
          opacity: hidden ? 0 : 1,
          transition: 'transform 0.45s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.45s ease',
          pointerEvents: hidden ? 'none' : 'auto',
        }}
      >
        {/* כמו הלוגו בסרגל של המורה: אריח לבן עם קו דיו. כאן סמל של ספר פתוח (כל שיעור הוא ספר) */}
        <span className="holo-hud-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 6.5C10.2 5.2 7.6 4.6 4 4.8V18c3.6-.2 6.2.4 8 1.7 1.8-1.3 4.4-1.9 8-1.7V4.8c-3.6-.2-6.2.4-8 1.7Z" /><path d="M12 6.5v13.2" /></svg>
        </span>
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
          style={{ width: '2.1rem', height: '2.1rem', padding: 0 }}
        >
          <BrandIcon name={muted ? 'speakerOff' : 'speaker'} size={18} />
        </button>

        {/* כפתור יציאה — פינה ימנית-עליונה (RTL) */}
        <button
          onClick={onExit}
          className="holo-button holo-button--sm holo-hud-btn holo-hud-exit text-sm"
          style={{ height: '2.1rem', padding: '0 .75rem' }}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
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
