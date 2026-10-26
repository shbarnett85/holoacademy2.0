/* מצב שיעור שנשלח ומועד ההגשה שלו (CLAUDE.md "תאריך יעד ומצב שיעור"): תג מצב (אייקון + מילה), שורת "להגשה עד …", וכפתור
   "שינוי מועד הגשה". המצב מגיע מהשרת (פונקציית lessonState היחידה) — כאן רק תצוגה. הצבע משני: תמיד יש אייקון ומילה. */
import { useEffect, useId, useRef, useState } from 'react'
import { LESSON_DUE_TEXT, LESSON_STATE_TEXT } from '../../shared/lib/findingsNarrative'
import { israelDay } from '../../shared/lib/lessonState'
import { apiFetch } from '../../shared/lib/api'
import type { LessonStateValue } from '../../shared/types/resultsV1'
import { FONT, Icon, MIN_TARGET, T } from '../teacherUi'
import type { IconName } from '../teacherUi'
import { ResultsError } from './resultsApi'

const STATE_META: Record<LessonStateValue, { icon: IconName; color: string }> = {
  active_now: { icon: 'pulse', color: T.accent },
  open: { icon: 'clock', color: T.good },
  ended: { icon: 'ended', color: T.muted },
}

/* תג המצב: אייקון + מילה (הצבע משני). title מסביר במילים מה זה אומר */
export function LessonStateChip({ state }: { state: LessonStateValue }) {
  const m = STATE_META[state]
  const t = LESSON_STATE_TEXT[state]
  return (
    <span data-lesson-state={state} title={t.hint} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 12px 3px 10px', borderRadius: 20,
      border: `1.5px solid ${m.color}`, fontFamily: FONT, fontSize: 16, fontWeight: 700, color: T.text, whiteSpace: 'nowrap', lineHeight: 1.5,
    }}>
      <span style={{ color: m.color, display: 'inline-flex' }}><Icon name={m.icon} size={16} /></span>
      {t.label}
    </span>
  )
}

/* "להגשה עד 8 ביולי 2026" / "ההגשה הסתיימה ב-8 ביולי 2026" / ללא מועד */
function dueLineText(dueAt: string | null | undefined, state: LessonStateValue | undefined): string {
  if (!dueAt) return LESSON_DUE_TEXT.noDue
  return state === 'ended' ? LESSON_DUE_TEXT.endedLine(dueAt) : LESSON_DUE_TEXT.dueLine(dueAt)
}

export function DueLine({ dueAt, state }: { dueAt: string | null | undefined; state: LessonStateValue | undefined }) {
  return (
    <span data-due-line style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FONT, fontSize: 16, color: T.textSoft }}>
      <Icon name="calendar" size={16} />
      {dueLineText(dueAt, state)}
    </span>
  )
}

/* כפתור "שינוי מועד הגשה" + חלונית קטנה עם שדה תאריך. שמירה → PATCH /api/results/submission/:id/due ← onChanged (טעינה מחדש) */
export function DueEditor({ submissionId, dueAt, onChanged }: { submissionId: string; dueAt: string | null | undefined; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [day, setDay] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const fieldId = useId()

  useEffect(() => { if (open) inputRef.current?.focus() }, [open])

  const close = (): void => { setOpen(false); setError(null); btnRef.current?.focus() }
  const openIt = (): void => { setDay(israelDay(dueAt ?? new Date())); setError(null); setSaved(null); setOpen(true) }

  const save = async (): Promise<void> => {
    if (!day || busy) return
    setBusy(true); setError(null)
    try {
      const res = await apiFetch(`/api/results/submission/${encodeURIComponent(submissionId)}/due`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dueDay: day }),
      })
      const body = (await res.json().catch(() => null)) as { data?: { dueAt?: string }; error?: string } | null
      if (!res.ok) throw new ResultsError(res.status, body?.error ?? '')
      setSaved(body?.data?.dueAt ?? null)
      setOpen(false)
      onChanged()
    } catch (e) {
      setError(e instanceof ResultsError && e.message ? e.message : LESSON_DUE_TEXT.saveFailed)
    } finally { setBusy(false) }
  }

  return (
    <span style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      <button ref={btnRef} type="button" data-due-edit aria-haspopup="dialog" aria-expanded={open} onClick={() => (open ? close() : openIt())}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: MIN_TARGET, padding: '0 14px', borderRadius: 10, cursor: 'pointer', fontFamily: FONT, fontSize: 16, fontWeight: 700, color: T.text, background: T.surface, border: `2px solid ${T.controlBorder}` }}>
        <Icon name="calendar" size={16} />
        {LESSON_DUE_TEXT.changeButton}
      </button>
      {saved && !open && <span role="status" style={{ fontFamily: FONT, fontSize: 16, color: T.textSoft }}>{LESSON_DUE_TEXT.saved(saved)}</span>}
      {open && (
        <div role="dialog" aria-label={LESSON_DUE_TEXT.changeButton} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close() } }}
          style={{ position: 'absolute', top: 'calc(100% + 6px)', insetInlineStart: 0, zIndex: 30, width: 'min(340px, 86vw)', display: 'flex', flexDirection: 'column', gap: 10, padding: 14, borderRadius: 12, background: T.studioBg, border: `2px solid ${T.accent}`, boxShadow: '0 10px 30px rgba(0,0,0,.22)' }}>
          <label htmlFor={fieldId} style={{ fontFamily: FONT, fontSize: 16, fontWeight: 800, color: T.text }}>{LESSON_DUE_TEXT.fieldLabel}</label>
          <input id={fieldId} ref={inputRef} type="date" value={day} onChange={(e) => setDay(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void save() }}
            style={{ minHeight: MIN_TARGET, padding: '0 10px', borderRadius: 10, fontFamily: FONT, fontSize: 16, color: T.text, background: T.surface, border: `2px solid ${T.controlBorder}` }} />
          <span style={{ fontFamily: FONT, fontSize: 16, color: T.textSoft, lineHeight: 1.5 }}>{LESSON_DUE_TEXT.fieldHint}</span>
          {error && <span role="alert" style={{ fontFamily: FONT, fontSize: 16, fontWeight: 700, color: T.text, borderInlineStart: `5px solid ${T.bad}`, paddingInlineStart: 8 }}>{error}</span>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" disabled={busy || !day} onClick={() => void save()}
              style={{ minHeight: MIN_TARGET, padding: '0 18px', borderRadius: 10, cursor: busy ? 'wait' : 'pointer', fontFamily: FONT, fontSize: 16, fontWeight: 800, color: T.onAccent, background: 'linear-gradient(120deg,var(--t15),var(--t14))', border: 'none', opacity: !day ? 0.5 : 1 }}>
              {LESSON_DUE_TEXT.save}
            </button>
            <button type="button" onClick={close}
              style={{ minHeight: MIN_TARGET, padding: '0 18px', borderRadius: 10, cursor: 'pointer', fontFamily: FONT, fontSize: 16, fontWeight: 700, color: T.text, background: 'transparent', border: `2px solid ${T.controlBorder}` }}>
              {LESSON_DUE_TEXT.cancel}
            </button>
          </div>
        </div>
      )}
    </span>
  )
}
