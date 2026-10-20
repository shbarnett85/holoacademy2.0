/* "ד״ר הולו מציע" — באנר פשוט בראש הרשימה: הצעה ליצור הדמיית חזרה למטלה שהכיתה התקשתה בה.
   מקור: GET /api/analytics/review-suggestions (קיים). כשל / אין הצעות = שום דבר לא מוצג. "לא עכשיו" מסתיר עד סוף הסשן. */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiJson } from '../../shared/lib/api'
import { FONT, Icon, T } from '../teacherUi'
import { card, primaryButton, secondaryButton } from './styles'
import { UI } from './text'

interface Suggestion { assignmentId: string; title: string; className: string; weakCount: number }

const DISMISS_KEY = 'holo_review_sugg_dismissed'
const MAX_SHOWN = 2

function wasDismissed(): boolean {
  try { return sessionStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
}

export default function SuggestionBanner({ openLink }: { openLink: (assignmentId: string) => string }) {
  const [items, setItems] = useState<Suggestion[]>([])
  const [dismissed, setDismissed] = useState(wasDismissed)

  useEffect(() => {
    let cancelled = false
    apiJson<{ suggestions?: Suggestion[] }>('/api/analytics/review-suggestions')
      .then((b) => { if (!cancelled) setItems((b.suggestions ?? []).filter((s) => s.weakCount > 0)) })
      .catch(() => { /* ההצעה היא תוספת — כשל שקט */ })
    return () => { cancelled = true }
  }, [])

  if (dismissed || items.length === 0) return null
  const shown = items.slice(0, MAX_SHOWN)
  return (
    <section aria-label={UI.suggestTitle} data-suggestion-banner
      style={{ ...card, flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '8px 16px', borderInlineStart: `6px solid ${T.violet}` }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: FONT, fontSize: 17, fontWeight: 800, color: T.text }}>
        <span style={{ color: T.violet, display: 'inline-flex' }}><Icon name="info" size={22} /></span>
        {UI.suggestTitle}
      </span>
      <div style={{ flex: '1 1 420px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        {shown.map((s) => (
          <div key={s.assignmentId} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ flex: '0 1 auto', fontFamily: FONT, fontSize: 16, color: T.text, lineHeight: 1.5 }}>
              {UI.suggestText(s.title, s.className, s.weakCount)}
            </span>
            <Link to={openLink(s.assignmentId)} data-tu-press style={primaryButton}>{UI.open}</Link>
          </div>
        ))}
      </div>
      <button type="button" data-tu-press onClick={() => { setDismissed(true); try { sessionStorage.setItem(DISMISS_KEY, '1') } catch { /* אין אחסון — נשאר מוסתר עד הרענון */ } }}
        style={secondaryButton}>{UI.notNow}</button>
    </section>
  )
}
