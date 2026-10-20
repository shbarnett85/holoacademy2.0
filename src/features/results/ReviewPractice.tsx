/* "תרגול חזרה" — לולאת החזרה הקיימת (spaced retrieval): מוצג רק כשיש תחומים שהכיתה התקשתה בהם (review.weakCount > 0).
   כפתור אחד → השרת בונה ברקע הדמיית חזרה קצרה (POST /api/quests/:id/review-quest), כאן עוקבים אחריה עד שהיא מוכנה,
   ואז פותחים אותה לעריכה והקצאה ידנית (לא נשלחת לתלמידים אוטומטית). */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../shared/lib/api'
import { FONT, Icon, RADIUS, T } from '../teacherUi'
import { primaryButton, secondaryButton, soft } from './styles'
import { UI } from './text'

type Phase = { name: 'idle' } | { name: 'working' } | { name: 'ready'; reviewId: string; title: string } | { name: 'error'; message: string }

const POLL_MS = 4000
/* בערך 12 דקות — מעבר לזה מפסיקים לחכות ואומרים את זה במילים */
const MAX_POLLS = 180

export default function ReviewPractice({ questId, submissionId, weakCount }: { questId: string; submissionId: string; weakCount: number }) {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>({ name: 'idle' })
  const timer = useRef<number | null>(null)
  const stop = (): void => { if (timer.current !== null) { window.clearInterval(timer.current); timer.current = null } }
  useEffect(() => stop, [])

  async function create(): Promise<void> {
    stop()
    setPhase({ name: 'working' })
    try {
      const res = await apiFetch(`/api/quests/${encodeURIComponent(questId)}/review-quest`, { method: 'POST', body: JSON.stringify({ assignmentId: submissionId }) })
      const body = (await res.json().catch(() => null)) as { questId?: string; title?: string } | null
      /* הודעות השרת טכניות ("assignmentId נדרש"…) — למורה מציגים תמיד משפט פשוט אחד */
      if (!res.ok || !body?.questId) throw new Error(UI.reviewFailed)
      const reviewId = body.questId
      const title = body.title ?? ''
      let polls = 0
      timer.current = window.setInterval(async () => {
        polls++
        try {
          const r = await apiFetch(`/api/quests/${encodeURIComponent(reviewId)}`)
          const b = (await r.json()) as { quest?: { game_data?: { genError?: string; scenes?: unknown[] } } }
          const gd = b?.quest?.game_data
          if (gd?.genError) { stop(); setPhase({ name: 'error', message: UI.reviewFailed }) }
          else if (Array.isArray(gd?.scenes) && gd.scenes.length > 0) { stop(); setPhase({ name: 'ready', reviewId, title }) }
          else if (polls >= MAX_POLLS) { stop(); setPhase({ name: 'error', message: UI.reviewSlow }) }
        } catch { /* ננסה שוב בסבב הבא */ }
      }, POLL_MS)
    } catch {
      setPhase({ name: 'error', message: UI.reviewFailed })
    }
  }

  return (
    <div data-review-practice style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 style={{ margin: 0, fontFamily: FONT, fontSize: 17, fontWeight: 800, color: T.text }}>{UI.reviewTitle}</h2>
      <div style={{ padding: '14px 16px', borderRadius: RADIUS.md, border: `1.5px solid ${T.border}`, background: T.surface, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
        <p style={{ margin: 0, fontFamily: FONT, fontSize: 17, lineHeight: 1.6, color: T.text }}>{UI.reviewIntro(weakCount)}</p>
        {phase.name === 'idle' && <button type="button" data-tu-press onClick={create} style={primaryButton}>{UI.reviewCreate}</button>}
        {phase.name === 'working' && (
          <p role="status" style={{ ...soft, margin: 0, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: T.accent, display: 'inline-flex' }}><Icon name="half" size={20} /></span>
            {UI.reviewWorking}
          </p>
        )}
        {phase.name === 'ready' && (
          <>
            <p role="status" style={{ margin: 0, fontFamily: FONT, fontSize: 16, fontWeight: 700, color: T.text, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: T.good, display: 'inline-flex' }}><Icon name="check" size={20} strokeWidth={2.6} /></span>
              {UI.reviewReady(phase.title)}
            </p>
            <button type="button" data-tu-press onClick={() => navigate(`/creator/quest/${encodeURIComponent(phase.reviewId)}`)} style={primaryButton}>{UI.reviewOpen}</button>
          </>
        )}
        {phase.name === 'error' && (
          <>
            <p role="alert" style={{ margin: 0, fontFamily: FONT, fontSize: 16, fontWeight: 700, color: T.text, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: T.warn, display: 'inline-flex' }}><Icon name="alert" size={20} /></span>
              {phase.message}
            </p>
            <button type="button" data-tu-press onClick={create} style={secondaryButton}>{UI.retry}</button>
          </>
        )}
      </div>
    </div>
  )
}
