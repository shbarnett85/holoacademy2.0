/* "טעויות נפוצות בהדמיה הזאת" — רק כשיש תגיות. לכל טעות: שם, הסבר קצר, כמה תלמידים בחרו בה ("5 מתוך 14"),
   וכפתור "צור הדמיה ממוקדת": אם כבר מקושרת הדמיה — פותח אותה; אם לא — אומר במילים שעדיין אין. */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { studentsCountText } from '../../shared/lib/findingsNarrative'
import type { CommonErrorRow } from '../../shared/types/resultsV1'
import { FONT, Icon, RADIUS, T } from '../teacherUi'
import { primaryButton, soft } from './styles'
import { UI } from './text'

function ErrorCard({ e }: { e: CommonErrorRow }) {
  const navigate = useNavigate()
  const [noLink, setNoLink] = useState(false)
  return (
    <li data-common-error-card={e.id} style={{ listStyle: 'none', padding: '12px 16px', borderRadius: RADIUS.md, border: `1.5px solid ${T.border}`, background: T.surface, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontFamily: FONT, fontSize: 17, fontWeight: 800, color: T.text, lineHeight: 1.4 }}>
        <span style={{ color: T.warn, display: 'inline-flex' }}><Icon name="alert" size={20} /></span>
        {e.title}
      </h3>
      {e.description && <p style={{ ...soft, margin: 0, fontSize: 16 }}>{e.description}</p>}
      <p style={{ margin: 0, fontFamily: FONT, fontSize: 16, fontWeight: 700, color: T.text }}>{UI.errorCount(studentsCountText(e.studentsCount, e.studentsExposed))}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 2 }}>
        <button type="button" data-tu-press style={primaryButton}
          onClick={() => { if (e.linkedQuest) navigate(`/creator/quest/${encodeURIComponent(e.linkedQuest.questId)}`); else setNoLink(true) }}>
          {UI.focusedQuest}
        </button>
        {e.linkedQuest && <span style={{ ...soft, fontSize: 16 }}>{UI.focusedExists(e.linkedQuest.title)}</span>}
        {noLink && !e.linkedQuest && <span role="status" style={{ ...soft, fontSize: 16, color: T.text, fontWeight: 600 }}>{UI.focusedNone}</span>}
      </div>
    </li>
  )
}

export default function CommonErrors({ errors }: { errors: CommonErrorRow[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 style={{ margin: 0, fontFamily: FONT, fontSize: 17, fontWeight: 800, color: T.text }}>{UI.commonErrorsTitle}</h2>
      <ul style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {errors.map((e) => <ErrorCard key={e.id} e={e} />)}
      </ul>
    </div>
  )
}
