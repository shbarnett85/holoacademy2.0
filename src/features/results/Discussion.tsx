/* שאלה לדיון בכיתה — מסך מלא להקרנה על הלוח. בלי שמות תלמידים בשום מקום: השאלה, התשובה שרבים בחרו בה (וכמה בחרו), והשאלה לדיון.
   הטקסט גדול (לקריאה מרחוק), כפתור "חזרה" גדול בפינה, ו-Escape חוזר לתוצאות. הנתונים מאותו מסך שיעור (ClassSubmissionView.commonErrors),
   כך שרענון הדף לא מאבד את השאלה. */
import { useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { DISCUSSION_PROMPT } from '../../shared/lib/findingsNarrative'
import type { ClassSubmissionView } from '../../shared/types/resultsV1'
import { FONT, Icon, MIN_TARGET, RADIUS, T } from '../teacherUi'
import { useLens, useResultsData } from './resultsApi'
import { secondaryButton } from './styles'
import { UI } from './text'

const enc = encodeURIComponent

export default function Discussion({ submissionId }: { submissionId: string }) {
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const errorId = sp.get('e')
  const { scope, apiQs, link } = useLens()
  const q = useResultsData<ClassSubmissionView>('classView', `/api/results/submission/${enc(submissionId)}${apiQs}`, scope)
  const back = link(`/results/${enc(submissionId)}`, { tab: 'actions' })
  const err = q.data?.commonErrors.find((e) => e.id === errorId) ?? null
  const count = err?.studentIds?.length ?? err?.studentsCount ?? 0

  useEffect(() => {
    document.title = `${UI.discussionButton} · HoloAcademy`
    const html = document.documentElement.style.overflow
    const body = document.body.style.overflow
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') void navigate(back) }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); document.documentElement.style.overflow = html; document.body.style.overflow = body }
  }, [navigate, back])

  const label = { margin: '0 0 6px', fontFamily: FONT, fontSize: 24, fontWeight: 700, color: T.textSoft } as const
  return (
    <div dir="rtl" data-discussion role="dialog" aria-label={UI.discussionButton}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, overflowY: 'auto', boxSizing: 'border-box', padding: '20px 56px 40px', display: 'flex', flexDirection: 'column', background: T.studioBg, color: T.text, fontFamily: FONT }}>
      <div style={{ flex: '0 0 auto' }}>
        <Link to={back} data-tu-press data-discuss-close style={{ ...secondaryButton, minHeight: MIN_TARGET + 8, fontSize: 20, textDecoration: 'none' }}>
          <Icon name="chevLeft" size={22} />
          {UI.discussClose}
        </Link>
      </div>
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 36, width: '100%', maxWidth: 1200, marginInline: 'auto', padding: '24px 0' }}>
        {q.error ? (
          <p role="alert" style={{ margin: 0, fontSize: 28, lineHeight: 1.5 }}>{UI.discussNotFound}</p>
        ) : !q.data ? (
          <p role="status" style={{ margin: 0, fontSize: 28 }}>{UI.loading}</p>
        ) : !err ? (
          <p role="alert" style={{ margin: 0, fontSize: 28, lineHeight: 1.5 }}>{UI.discussNotFound}</p>
        ) : (
          <>
            <section>
              <p style={label}>{UI.discussQuestionLabel}</p>
              <h1 data-discuss-question style={{ margin: 0, fontSize: 48, fontWeight: 800, lineHeight: 1.35 }}>{err.question}</h1>
            </section>
            <section>
              <p style={label}>{UI.discussCommonLabel}</p>
              <div data-discuss-answer style={{ display: 'inline-block', maxWidth: '100%', padding: '14px 28px', borderRadius: RADIUS.lg, border: `3px solid ${T.warn}`, background: T.surface, fontSize: 48, fontWeight: 800, lineHeight: 1.35, overflowWrap: 'anywhere' }}>
                ״{err.wrongText}״
              </div>
              <p style={{ margin: '10px 0 0', fontSize: 26, color: T.textSoft }}>{UI.discussCount(count)}</p>
            </section>
            <p data-discuss-prompt style={{ margin: 0, fontSize: 44, fontWeight: 800, lineHeight: 1.45, color: T.accentStrong }}>{DISCUSSION_PROMPT}</p>
          </>
        )}
      </main>
    </div>
  )
}
