import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { Briefing, StudentFeedback } from '../../shared/types/analyticsV2'
import { Button, ErrorBox, Loading } from './ui'
import { C } from './tokens'
import { useV2, type V2Params } from './v2api'

/* שכבת מסך מלא. מודפסת לבדה: ה-portal הוא ילד של body, וכל שאר הילדים מוסתרים בהדפסה. */
function Sheet({ children, onClose, printable, label }: { children: React.ReactNode; onClose: () => void; printable?: boolean; label: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    /* הדפסה תמיד בערכה בהירה (נייר) — מחזירים את הערכה הקודמת אחרי */
    let restore: 'light' | 'dark' | null = null
    const before = (): void => { if (window.HoloTheme && !window.HoloTheme.isLight()) { restore = 'dark'; window.HoloTheme.set('light') } }
    const after = (): void => { if (restore && window.HoloTheme) { window.HoloTheme.set(restore); restore = null } }
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after) }
  }, [onClose])
  return createPortal(
    <div id="v2-print-portal" dir="rtl" role="dialog" aria-modal="true" aria-label={label}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, overflowY: 'auto', background: 'var(--t-studio-bg)', fontFamily: 'var(--font-display)' }}>
      <style>{`
        @media print {
          body > *:not(#v2-print-portal) { display: none !important; }
          #v2-print-portal { position: static !important; overflow: visible !important; background: none !important; }
          .v2-noprint { display: none !important; }
          .v2-paper { box-shadow: none !important; border: none !important; max-width: none !important; margin: 0 !important; padding: 0 !important; }
          .v2-paper h3, .v2-paper li { break-inside: avoid; }
        }
      `}</style>
      <div className="v2-noprint" style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '12px 24px', background: 'var(--t-studio-bg)', borderBottom: `1px solid ${C.border}` }}>
        {printable && <Button kind="solid" onClick={() => window.print()}>🖨 הדפסה / שמירה כ-PDF</Button>}
        <Button onClick={onClose}>סגירה</Button>
      </div>
      {children}
    </div>,
    document.body,
  )
}

const heDate = (iso: string): string => new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })

/* תדריך לישיבה פדגוגית + בסיס ראייתי לתל״א — מסמך אחד להדפסה */
export function BriefingOverlay({ scope, id, params, notice, onClose }: { scope: 'student' | 'class'; id: string; params: V2Params; notice: string | null; onClose: () => void }) {
  const { data, loading, error } = useV2<Briefing>(`/briefing/${scope}/${id}`, params)
  return (
    <Sheet onClose={onClose} printable label="תדריך לישיבה פדגוגית">
      <article className="v2-paper" style={{ maxWidth: 820, margin: '24px auto 60px', padding: '36px 44px', background: 'var(--t75)', border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, boxShadow: '0 20px 60px -30px var(--t246)' }}>
        {loading && !data && <Loading />}
        {error && <ErrorBox message={error} />}
        {data && (
          <>
            <header style={{ borderBottom: `2px solid ${C.accent}`, paddingBottom: 12, marginBottom: 18 }}>
              <div style={{ fontSize: 11, letterSpacing: '.14em', color: C.muted }}>HOLOACADEMY · תדריך לישיבה פדגוגית ובסיס ראייתי לתל״א</div>
              <h1 style={{ fontSize: 26, margin: '6px 0 2px', color: C.text }}>{data.title}</h1>
              <div style={{ fontSize: 13.5, color: C.textSoft }}>{data.subtitle} · הופק בתאריך {heDate(data.generatedAt)}</div>
              {notice && <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>{notice}</div>}
            </header>
            {data.sections.map((s) => (
              <section key={s.id} style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 15.5, margin: '0 0 8px', color: C.accentBright }}>{s.title}</h3>
                {s.items.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 13, color: C.muted }}>{s.id === 'strengths' ? 'לא זוהתה חוזקה חריגה בנתונים הקיימים.' : s.id === 'difficulties' ? 'לא זוהו קשיים חריגים בנתונים הקיימים.' : 'אין פריטים.'}</p>
                ) : (
                  <ul style={{ margin: 0, paddingInlineStart: 20, display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {s.items.map((it, i) => (
                      <li key={i} style={{ fontSize: 13.5, lineHeight: 1.8, color: C.text }}>
                        {it.text}
                        {it.evidence.length > 0 && <div style={{ fontSize: 11.5, color: C.muted }}>{it.evidence.join(' · ')}</div>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
            <footer style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, fontSize: 11.5, color: C.muted, lineHeight: 1.7 }}>
              <p style={{ margin: '0 0 4px' }}>{data.caveats.trend}</p>
              <p style={{ margin: 0 }}>{data.caveats.ageNorm}</p>
            </footer>
          </>
        )}
      </article>
    </Sheet>
  )
}

const KIND_ICON: Record<'growth' | 'streak' | 'next_step', string> = { growth: '🌱', streak: '🔥', next_step: '🎯' }
const KIND_LABEL: Record<'growth' | 'streak' | 'next_step', string> = { growth: 'צמיחה', streak: 'התמדה', next_step: 'הצעד הבא' }

/* משוב לתלמיד/ה: מה שהתלמיד רואה. מכוון צמיחה; בלי השוואה לחברים ובלי תוויות. */
export function FeedbackOverlay({ studentId, params, onClose }: { studentId: string; params: V2Params; onClose: () => void }) {
  const { data, loading, error } = useV2<StudentFeedback>(`/student/${studentId}/feedback`, params)
  return (
    <Sheet onClose={onClose} label="תצוגת תלמיד/ה">
      <div style={{ maxWidth: 440, margin: '28px auto 60px', padding: '0 16px' }}>
        <div className="v2-noprint" style={{ textAlign: 'center', fontSize: 12, color: C.muted, marginBottom: 10 }}>תצוגה לדוגמה — כך נראה המסך לתלמיד/ה (המורה/ה אינו/ה רואה כאן נתוני השוואה)</div>
        <div style={{ border: `1px solid ${C.accent}`, borderRadius: 24, padding: 22, background: 'var(--t75)', boxShadow: '0 0 40px -12px var(--t21)' }}>
          {loading && !data && <Loading />}
          {error && <ErrorBox message={error} />}
          {data && (
            <>
              <h2 style={{ fontSize: 22, lineHeight: 1.5, margin: '0 0 16px', color: C.accentBright }}>{data.headline}</h2>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {data.items.map((it, i) => (
                  <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 14px', borderRadius: 16, border: `1px solid ${C.border}`, background: C.surface }}>
                    <span aria-hidden style={{ fontSize: 26 }}>{KIND_ICON[it.kind]}</span>
                    <div>
                      <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 2 }}>{it.subject.nameHe} · {KIND_LABEL[it.kind]}</div>
                      <div style={{ fontSize: 15.5, lineHeight: 1.7, color: C.text }}>{it.text}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </Sheet>
  )
}
