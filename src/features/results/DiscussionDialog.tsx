/* שאלה לדיון בכיתה — חלון מעל מסך השיעור (לבקשת המשתמש: אין בו מספיק טקסט שמצדיק מסך נפרד). אפשר להקרין אותו על הלוח:
   הטקסט גדול, ואין בו שמות תלמידים, רק כמה בחרו בתשובה.
   מה יש בו: השאלה מהשיעור, התשובה שרבים בחרו, ושלוש שאלות לדיון. השאלות נכתבות לפי התוכן של השאלה הזאת
   (POST /api/results/submission/:id/discussion; בשרת: lib/results/discussion.ts), ולא שאלה כללית אחת שחוזרת בכל טעות.
   בזמן הכתיבה מוצגת שורת מצב; כשהבקשה נכשלת מוצגות שאלות הגיבוי (findingsNarrative.discussionFallback), עם הערה.
   "שאלות אחרות" מבקש שלוש שאלות חדשות. Escape, "סגירה" ולחיצה מחוץ לחלון סוגרים, והפוקוס חוזר לכפתור שפתח. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '../../shared/lib/api'
import { discussionFallback } from '../../shared/lib/findingsNarrative'
import type { CommonErrorRow, DiscussionQuestions } from '../../shared/types/resultsV1'
import { modalBackdrop } from '../../styles/ui'
import { BTN, FONT, MIN_TARGET, RADIUS, T } from '../teacherUi'
import { secondaryButton } from './styles'
import { UI } from './text'

const enc = encodeURIComponent

export default function DiscussionDialog({ submissionId, error, apiQs, onClose }: {
  submissionId: string
  error: CommonErrorRow
  /* העדשה של מורה אורח ("?lens=…"), או מחרוזת ריקה */
  apiQs: string
  onClose: () => void
}) {
  const [state, setState] = useState<{ loading: boolean; data: DiscussionQuestions | null }>({ loading: true, data: null })
  const closeRef = useRef<HTMLButtonElement>(null)
  const count = error.studentIds?.length ?? error.studentsCount
  const question = error.question ?? error.description
  const wrong = error.wrongText ?? ''

  /* הבקשה עצמה. בטעינה הראשונה המצב כבר "טוען"; "שאלות אחרות" מסמן טעינה ואז קורא לה */
  const request = useCallback((fresh: boolean, alive: () => boolean) => {
    void (async () => {
      let data: DiscussionQuestions | null = null
      try {
        const res = await apiFetch(`/api/results/submission/${enc(submissionId)}/discussion${apiQs}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ errorId: error.id, fresh }) })
        const body = (await res.json().catch(() => null)) as { data?: DiscussionQuestions } | null
        if (res.ok && body?.data?.questions?.length) data = body.data
      } catch { /* שאלות הגיבוי */ }
      if (alive()) setState((s) => ({ loading: false, data: data ?? s.data ?? { questions: discussionFallback({ question, wrongText: wrong }), source: 'template' } }))
    })()
  }, [submissionId, apiQs, error.id, question, wrong])

  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    request(false, () => mounted.current)
    return () => { mounted.current = false }
  }, [request])
  const more = (): void => { setState((s) => ({ loading: true, data: s.data })); request(true, () => mounted.current) }

  /* Escape סוגר; הפוקוס נכנס לחלון וחוזר בסגירה לכפתור שפתח אותו */
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); opener?.focus?.() }
  }, [onClose])

  const label = { margin: '0 0 4px', fontFamily: FONT, fontSize: 16, fontWeight: 700, color: T.textSoft } as const
  return (
    <div style={{ ...modalBackdrop, position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center', padding: 16, boxSizing: 'border-box' }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div dir="rtl" data-discussion role="dialog" aria-modal="true" aria-labelledby="discussion-title"
        style={{ boxSizing: 'border-box', width: 'min(860px, calc(100vw - 32px))', maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto', padding: '18px 26px 22px', borderRadius: RADIUS.lg, background: T.surface, border: T.line, boxShadow: T.shadow, color: T.text, fontFamily: FONT, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h2 id="discussion-title" style={{ margin: 0, fontSize: 20, fontWeight: 800, color: T.accent }}>{UI.discussionButton}</h2>
          <button ref={closeRef} type="button" data-tu-press data-discuss-close className={BTN} onClick={onClose} style={{ ...secondaryButton, minHeight: MIN_TARGET }}>{UI.discussClose}</button>
        </div>

        <section>
          <p style={label}>{UI.discussQuestionLabel}</p>
          <p data-discuss-question style={{ margin: 0, fontSize: 28, fontWeight: 800, lineHeight: 1.35 }}>{question}</p>
        </section>

        {wrong && (
          <section style={{ display: 'flex', alignItems: 'center', gap: '6px 14px', flexWrap: 'wrap' }}>
            <p style={{ ...label, margin: 0, flexBasis: '100%' }}>{UI.discussCommonLabel}</p>
            <span data-discuss-answer style={{ display: 'inline-block', maxWidth: '100%', padding: '6px 18px', borderRadius: RADIUS.md, border: `2px solid ${T.controlBorder}`, background: T.findingFill, color: T.findingText, fontSize: 26, fontWeight: 800, lineHeight: 1.35 }}>
              ״{wrong}״
            </span>
            <span style={{ fontSize: 18, color: T.textSoft }}>{UI.discussCount(count)}</span>
          </section>
        )}

        <section aria-live="polite" aria-busy={state.loading}>
          <p style={label}>{UI.discussPromptsLabel}</p>
          {state.data && (
            <ol data-discuss-prompts data-discuss-source={state.data.source} style={{ margin: 0, paddingInlineStart: 34, listStyle: 'decimal', display: 'flex', flexDirection: 'column', gap: 10, opacity: state.loading ? 0.5 : 1 }}>
              {state.data.questions.map((q) => (
                <li key={q} style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.45, color: T.accentStrong }}>{q}</li>
              ))}
            </ol>
          )}
          {state.loading && <p role="status" data-discuss-writing style={{ margin: state.data ? '10px 0 0' : 0, fontSize: 18, color: T.textSoft }}>{UI.discussWriting}</p>}
        </section>

        {state.data && !state.loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px 16px', flexWrap: 'wrap' }}>
            <p data-discuss-note style={{ margin: 0, flex: '1 1 320px', fontSize: 16, lineHeight: 1.5, color: T.textSoft }}>{state.data.source === 'ai' ? UI.discussAiNote : UI.discussTemplateNote}</p>
            <button type="button" data-tu-press data-discuss-more className={BTN} onClick={more} style={{ ...secondaryButton, minHeight: MIN_TARGET }}>{UI.discussMore}</button>
          </div>
        )}
      </div>
    </div>
  )
}
