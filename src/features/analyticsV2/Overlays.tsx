/* ──────────────────────────────────────────────────────────────────────────
   שכבות-על במסך מלא: (1) "הכנה לישיבה פדגוגית (תל״א)" — מסמך להדפסה; (2) "משוב אישי לתלמיד/ה — טיוטה למסירה" — מסמך להדפסה
   שהמורה מוסרת או מראה (המערכת לא שולחת אותו לתלמיד/ה).
   מעוצבות בערכת הממשק (טוקנים, כפתורים 44px+, גוף 16px+). הדפסה תמיד בערכה בהירה (נייר), והפירוט החישובי
   שבסעיף "איך חישבנו?" מודפס גם הוא (הפירוטים נפתחים לפני ההדפסה ונסגרים אחריה).
   ────────────────────────────────────────────────────────────────────────── */
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AI_SUMMARY_PANEL_TEXT, AI_SUMMARY_TEXT, V2_CLIENT_TEXT, V2_SHEETS_TEXT } from '../../shared/lib/findingsNarrative'
import type { Briefing, StudentFeedback } from '../../shared/types/analyticsV2'
import { AiSummaryPanel } from '../aiSummary'
import { EmptyState, FONT, HowWeCalc, Icon, RADIUS, T } from '../teacherUi'
import { L } from './labels'
import { briefingHasContent, feedbackHasContent } from './logic'
import { lockPageBehind } from './sheetLock'
import { ActionButton, ErrorBlock, LoadingBlock, Note } from './ui'
import { useV2, type V2Params } from './v2api'

/* שכבת מסך מלא. מודפסת לבדה: ה-portal הוא ילד של body, וכל שאר הילדים מוסתרים בהדפסה. */
function Sheet({ children, onClose, printable, label }: { children: ReactNode; onClose: () => void; printable?: boolean; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  /* onClose הוא לרוב למבדה חדשה בכל רינדור של ההורה. אם הוא היה תלות של האפקט הראשי, כל רינדור-אב (למשל באמצע הקלדה בשדה עריכה
     בתוך השכבה) היה מחזיר את הפוקוס למקום שממנו נפתחה השכבה. לכן נשמר ב-ref, והאפקט הראשי רץ פעם אחת בלבד. */
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })
  useEffect(() => {
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    ref.current?.focus()
    /* שאר העמוד אינו נגיש בזמן שהשכבה פתוחה (מקלדת וקורא מסך נשארים בתוך השכבה), וגם אינו מוצג — כך נשארת כותרת ראשית גלויה אחת (sheetLock.ts) */
    const unlock = lockPageBehind([...document.body.children].filter((el): el is HTMLElement => el instanceof HTMLElement), ref.current)
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') closeRef.current() }
    window.addEventListener('keydown', onKey)
    /* הדפסה תמיד בערכה בהירה (נייר) ועם כל הפירוטים פתוחים — מחזירים את המצב הקודם אחרי */
    let restoreTheme: 'dark' | null = null
    let reopened: HTMLDetailsElement[] = []
    const before = (): void => {
      if (window.HoloTheme && !window.HoloTheme.isLight()) { restoreTheme = 'dark'; window.HoloTheme.set('light') }
      const closed = [...(ref.current?.querySelectorAll<HTMLDetailsElement>('details:not([open])') ?? [])]
      closed.forEach((d) => { d.open = true })
      reopened.push(...closed)
    }
    const after = (): void => {
      if (restoreTheme && window.HoloTheme) { window.HoloTheme.set(restoreTheme); restoreTheme = null }
      reopened.forEach((d) => { d.open = false })
      reopened = []
    }
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('keydown', onKey); window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after)
      unlock()
      returnTo?.focus()
    }
  }, [])
  return createPortal(
    <div ref={ref} id="v2-print-portal" data-teacher-ui dir="rtl" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, overflowY: 'auto', background: T.studioBg, fontFamily: FONT, fontSize: 16, color: T.text, outline: 'none' }}>
      <style>{`
        @media print {
          body > *:not(#v2-print-portal) { display: none !important; }
          #v2-print-portal { position: static !important; overflow: visible !important; background: none !important; }
          .v2-noprint { display: none !important; }
          .v2-paper { box-shadow: none !important; border: none !important; max-width: none !important; margin: 0 !important; padding: 0 !important; }
          .v2-paper h2, .v2-paper li { break-inside: avoid; }
        }
      `}</style>
      <div className="v2-noprint" style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '10px 24px', background: T.studioBg, borderBottom: `1px solid ${T.border}` }}>
        {printable && <ActionButton kind="primary" onClick={() => window.print()}>{L.print}</ActionButton>}
        <ActionButton onClick={onClose}>{L.close}</ActionButton>
      </div>
      {children}
    </div>,
    document.body,
  )
}

const heDate = (iso: string): string => new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })

const EMPTY_SECTION: Record<string, string> = V2_SHEETS_TEXT.briefing.emptySection

/* תדריך לישיבה פדגוגית + בסיס ראייתי לתל״א — מסמך אחד להדפסה */
export function BriefingOverlay({ scope, id, params, notice, onClose }: { scope: 'student' | 'class'; id: string; params: V2Params; notice: string | null; onClose: () => void }) {
  const { data, dataState, loading, error, reload } = useV2<Briefing>(`/briefing/${scope}/${id}`, params)
  /* אין עדיין על מה לבסס תדריך: לא פותחים מסמך ריק (כותרת וסעיפים בלי תוכן) אלא מסבירים מה קורה ומה יקרה */
  const empty = !!data && (dataState === 'insufficient' || !briefingHasContent(data))
  return (
    <Sheet onClose={onClose} printable={!empty} label={L.briefing}>
      <article className="v2-paper" style={{ maxWidth: 840, margin: '24px auto 60px', padding: '32px 44px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: RADIUS.sm, color: T.text, lineHeight: 1.7 }}>
        {loading && !data && <LoadingBlock />}
        {error && <ErrorBlock error={error} onRetry={reload} />}
        {empty && <EmptyState title={V2_CLIENT_TEXT.briefingEmpty.title} whatNext={V2_CLIENT_TEXT.briefingEmpty.whatNext} ctaLabel={L.close} onCta={onClose} />}
        {data && !empty && (
          <>
            <header style={{ borderBottom: `2px solid ${T.accent}`, paddingBottom: 12, marginBottom: 18 }}>
              <div style={{ fontSize: 16, color: T.textSoft }}>HoloAcademy · {L.briefing}</div>
              <h1 style={{ fontSize: 28, fontWeight: 800, margin: '6px 0 2px', lineHeight: 1.35, color: T.text }}>{data.title}</h1>
              <div style={{ fontSize: 16, color: T.textSoft }}>{data.subtitle} · הופק בתאריך {heDate(data.generatedAt)}</div>
              {/* מה זה המסמך ומה זה תל״א — בכותרת המסמך עצמו (מודפס איתו) */}
              <div data-briefing-intro style={{ fontSize: 16, color: T.textSoft }}>{V2_SHEETS_TEXT.briefing[scope]}</div>
              {notice && <Note style={{ marginTop: 6 }}>{notice}</Note>}
            </header>
            {data.sections.map((s) => {
              const items = s.items.length === 0
                ? <p style={{ margin: 0, fontSize: 16, color: T.textSoft }}>{EMPTY_SECTION[s.id] ?? V2_SHEETS_TEXT.briefing.emptySection.fallback}</p>
                : (
                  <ul style={{ margin: 0, paddingInlineStart: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {s.items.map((it, i) => (
                      <li key={i} style={{ fontSize: 16, lineHeight: 1.7, color: T.text }}>
                        {it.text}
                        {it.evidence.length > 0 && <div style={{ fontSize: 16, color: T.textSoft }}>{it.evidence.join(' · ')}</div>}
                      </li>
                    ))}
                  </ul>
                )
              return s.id === 'how_we_calculated' ? (
                /* הפירוט החישובי — רק מאחורי "איך חישבנו?" (נפתח אוטומטית בהדפסה) */
                <section key={s.id} style={{ marginBottom: 20 }}><HowWeCalc label={s.title}>{items}</HowWeCalc></section>
              ) : (
                <section key={s.id} style={{ marginBottom: 20 }}>
                  <h2 style={{ fontSize: 19, fontWeight: 800, margin: '0 0 8px', color: T.accentStrong }}>{s.title}</h2>
                  {items}
                </section>
              )
            })}
            <footer style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Note>{data.caveats.trend}</Note>
              <Note>{data.caveats.ageNorm}</Note>
            </footer>
          </>
        )}
      </article>
    </Sheet>
  )
}

/* הסיכום המילולי של ד״ר הולו על תלמיד/ה או כיתה (?sum=student:<id>|class:<id>). השרת מחליט הרשאות (מחנך/ת: הכול; מורה מקצועי: רק מקצועו; כיתה: מחנך/ת בלבד);
   השם בכותרת ובייצוא מגיע מרשימת הכיתות של המסך — לא מהבינה המלאכותית, שאינה מקבלת שמות. */
export function SummaryOverlay({ scope, id, params, name, subjectOnly, onClose }: { scope: 'student' | 'class'; id: string; params: V2Params; name: string; subjectOnly: boolean; onClose: () => void }) {
  const heading = AI_SUMMARY_TEXT.headingByScope[scope]
  return (
    <Sheet onClose={onClose} label={heading}>
      <article data-ai-overlay className="v2-paper" style={{ maxWidth: 840, margin: '24px auto 60px', padding: '28px 40px 32px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: RADIUS.sm, color: T.text }}>
        <header style={{ borderBottom: `2px solid ${T.accent}`, paddingBottom: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 16, color: T.textSoft }}>{AI_SUMMARY_PANEL_TEXT.doc.brand}</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: '6px 0 2px', lineHeight: 1.35, color: T.text }}>{heading}</h1>
          {name && <div style={{ fontSize: 19, fontWeight: 700, color: T.text }}>{name}</div>}
        </header>
        <AiSummaryPanel key={`${scope}:${id}`} target={{ scope, id }} params={params} exportName={name} showHeading={false} plain
          note={subjectOnly ? AI_SUMMARY_PANEL_TEXT.subjectOnly : null} />
      </article>
    </Sheet>
  )
}

const KIND_ICON: Record<'growth' | 'streak' | 'next_step', 'growth' | 'streak' | 'step'> = { growth: 'growth', streak: 'streak', next_step: 'step' }
const KIND_LABEL = V2_SHEETS_TEXT.feedback.kind

/* תוכן המשוב: כותרת ופריטים (צמיחה · התמדה · הצעד הבא). אייקון של הערכה + מילה לכל פריט — בלי אימוג'י */
export function FeedbackItems({ data }: { data: StudentFeedback }) {
  return (
    <>
      <h1 style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.5, margin: '0 0 16px', color: T.text }}>{data.headline}</h1>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {data.items.map((it, i) => (
          <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 14px', borderRadius: 16, border: `1px solid ${T.border}`, background: T.surfaceSoft }}>
            <span aria-hidden="true" style={{ color: T.accent, display: 'inline-flex', marginTop: 2 }}><Icon name={KIND_ICON[it.kind]} size={26} /></span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.textSoft, marginBottom: 2 }}>{it.subject.nameHe} · {KIND_LABEL[it.kind]}</div>
              <div style={{ fontSize: 17, lineHeight: 1.7, color: T.text }}>{it.text}</div>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}

/* משוב אישי לתלמיד/ה — טיוטה למסירה: מסמך להדפסה (או להצגה על המסך) שהמורה מוסרת. המערכת לא שולחת אותו לתלמיד/ה, ולכן הכותרת והפתיח אומרים זאת.
   מכוון צמיחה; בלי השוואה לחברים ובלי תוויות. הפתיח כאן הוא טקסט לקוח (V2_SHEETS_TEXT) ולא ה-intro של השרת. */
export function FeedbackOverlay({ studentId, params, onClose }: { studentId: string; params: V2Params; onClose: () => void }) {
  const { data, loading, error, reload } = useV2<StudentFeedback>(`/student/${studentId}/feedback`, params)
  const empty = !!data && !feedbackHasContent(data)
  return (
    <Sheet onClose={onClose} printable={!!data && !empty} label={V2_SHEETS_TEXT.feedback.title}>
      <div style={{ maxWidth: 460, margin: '24px auto 60px', padding: '0 16px' }}>
        <div className="v2-noprint" style={{ textAlign: 'center', margin: '0 0 12px' }}>
          <p data-feedback-title style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.5, color: T.text, margin: '0 0 4px' }}>{V2_SHEETS_TEXT.feedback.title}</p>
          <p style={{ fontSize: 16, lineHeight: 1.6, color: T.textSoft, margin: 0 }}>{V2_SHEETS_TEXT.feedback.intro}</p>
        </div>
        <div style={{ border: `2px solid ${T.accent}`, borderRadius: 24, padding: 22, background: T.surface }}>
          {loading && !data && <LoadingBlock />}
          {error && <ErrorBlock error={error} onRetry={reload} />}
          {empty && <EmptyState title={V2_CLIENT_TEXT.feedbackEmpty.title} whatNext={V2_CLIENT_TEXT.feedbackEmpty.whatNext} ctaLabel={L.close} onCta={onClose} />}
          {data && !empty && (
            <FeedbackItems data={data} />
          )}
        </div>
      </div>
    </Sheet>
  )
}
