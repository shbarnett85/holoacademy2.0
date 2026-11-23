/* "איפה אני?": חלון הסבר קצר למי שהגיע לעמוד הפתיחה ולא מכיר את המקום. שלושה חלקים: הספרייה ההולוגרפית, ד"ר הולו והמערכת.
   נפתח מהכפתור שמעל ד"ר הולו (במקום בועת הדיבור שהייתה שם). Escape, לחיצה מחוץ לחלון או "סגירה" סוגרים אותו. */
import { useEffect, useRef, type ReactNode } from 'react'
import BrandIcon from '../../shared/ui/BrandIcon'
import BrandLogo from '../../shared/ui/BrandLogo'
import { modalBackdrop, panelStudent } from '../../styles/ui'

const PARTS: { id: string; icon: ReactNode; title: string; text: string }[] = [
  {
    id: 'library', icon: <BrandIcon name="compass" size={24} />, title: 'הספרייה ההולוגרפית',
    text: 'בספרייה הזאת כל שיעור הוא ספר, והפורטל שבמרכז פותח אותו. צוללים פנימה וקוראים עמוד אחרי עמוד: סיפור, תמונות ואתגרים.',
  },
  {
    id: 'holo', icon: <BrandIcon name="spark" size={24} />, title: 'ד״ר הולו',
    text: 'ד״ר הולו הוא המדריך של הספרייה. הוא עותק וירטואלי, ולכן הוא תמיד הולוגרמה. הוא פותח כל שיעור, ומסכם אותו איתכם בסוף.',
  },
  {
    id: 'system', icon: <BrandLogo variant="mark" height={26} clear={false} />, title: 'HoloAcademy',
    text: 'מערכת של שיעורים אינטראקטיביים בהדמיה. מורים מתארים את חומר הלימוד, וד״ר הולו יוצר ממנו שיעור עם סיפור ואתגרים. תלמידים נכנסים עם קוד כיתה ואוספים גבישי הבנה, והמורים רואים את ההתקדמות.',
  },
]

export default function WhereAmI({ onClose, onPlay }: { onClose: () => void; onPlay: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      /* הפוקוס נשאר בתוך החלון */
      if (e.key === 'Tab' && panelRef.current) {
        const f = [...panelRef.current.querySelectorAll<HTMLElement>('button')]
        const first = f[0], last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.() }
  }, [onClose])

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 100, padding: 16, ...modalBackdrop }} onClick={onClose}>
      <div
        ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="where-title" data-where-am-i
        className="where-panel" onClick={(e) => e.stopPropagation()} style={{ ...panelStudent, borderRadius: 20 }}
      >
        <h2 id="where-title" className="where-title">איפה אני?</h2>
        <p className="where-lead">ברוכים הבאים לספרייה ההולוגרפית של HoloAcademy.</p>
        <ul className="where-parts">
          {PARTS.map((p) => (
            <li key={p.id} className="where-part" data-where-part={p.id}>
              <span className="where-icon" aria-hidden="true">{p.icon}</span>
              <div>
                <h3 className="where-part-title">{p.title}</h3>
                <p className="where-part-text">{p.text}</p>
              </div>
            </li>
          ))}
        </ul>
        <div className="where-actions">
          <button className="holo-button where-play" onClick={onPlay} data-where-play>
            <BrandIcon name="playGem" size={20} />
            <span>שחקו עכשיו</span>
          </button>
          <button ref={closeRef} className="holo-button" onClick={onClose} data-where-close>סגירה</button>
        </div>
      </div>
    </div>
  )
}
