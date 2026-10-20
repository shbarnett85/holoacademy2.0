/* מעטפת מסך מורה: רקע האולפן + הסרגל העליון המשותף + <h1> = השאלה שהמסך עונה עליה (עיקרון 1)
   + נתיב חזרה עם שמות (עיקרון 4) + אזור תוכן. מתוכנן ל-1366×768: הסרגל העליון משותף, לכן כל השאר צפוף ומהודק. */
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import StudioTopBar from '../creator/StudioTopBar'
import type { TabId } from '../creator/StudioTopBar'
import Breadcrumb from './Breadcrumb'
import type { BreadcrumbItem } from './Breadcrumb'
import { CONTENT_MAX_WIDTH, GUTTER, H1, T } from './tokens'

interface ScreenShellProps {
  /** הטאב הראשי המסומן בסרגל העליון */
  active: TabId
  /** השאלה שהמסך עונה עליה, בעברית פשוטה — נעשית <h1> וגם כותרת הלשונית */
  title: string
  /** נתיב חזרה: הפריט האחרון הוא העמוד הנוכחי */
  breadcrumb?: BreadcrumbItem[]
  /** חריץ לבורר עדשות (מורה אורח בלבד); מוצג בקצה השורה של הכותרת */
  lensSwitcher?: ReactNode
  /** תוספת ליד הכותרת, למשל תג "נתוני הדגמה" */
  titleAside?: ReactNode
  children: ReactNode
}

export default function ScreenShell({ active, title, breadcrumb, lensSwitcher, titleAside, children }: ScreenShellProps) {
  /* כותרת הלשונית = השאלה (ועוזרת לקורא מסך); מוחזרת בפירוק כדי לא להשאיר כותרת תקועה במסכים אחרים */
  useEffect(() => {
    const prev = document.title
    document.title = `${title} · HoloAcademy`
    return () => { document.title = prev }
  }, [title])

  return (
    <div dir="rtl" data-teacher-ui
      style={{ position: 'relative', minHeight: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-display)', fontSize: 16, color: T.text, background: T.studioBg }}>
      <a href="#tu-main" className="tu-skip" onClick={(e) => { e.preventDefault(); document.getElementById('tu-main')?.focus() }}>דלג לתוכן</a>
      <div aria-hidden="true" style={{ position: 'absolute', left: -120, top: -80, width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle, var(--t83), transparent 70%)', filter: 'blur(20px)', pointerEvents: 'none' }} />
      <div aria-hidden="true" style={{ position: 'absolute', right: -120, bottom: -120, width: 460, height: 460, borderRadius: '50%', background: 'radial-gradient(circle, var(--t84), transparent 70%)', filter: 'blur(20px)', pointerEvents: 'none' }} />
      <StudioTopBar active={active} />
      <main id="tu-main" tabIndex={-1} data-studio-content className="holo-tab-enter"
        style={{ position: 'relative', zIndex: 2, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12, padding: `4px ${GUTTER}px ${GUTTER}px`, width: '100%', maxWidth: CONTENT_MAX_WIDTH, marginInline: 'auto', boxSizing: 'border-box', outline: 'none' }}>
        <header style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: H1, fontWeight: 800, lineHeight: 1.3, color: T.text }}>{title}</h1>
            {titleAside}
            <div style={{ flex: 1 }} />
            {lensSwitcher}
          </div>
          {breadcrumb && breadcrumb.length > 0 && <Breadcrumb items={breadcrumb} />}
        </header>
        {children}
      </main>
    </div>
  )
}
