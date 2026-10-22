/* "טעויות נפוצות" — רק כשיש תגיות. משפט סיכום אחד, ואז לכל טעות: שם, הסבר קצר, כמה תלמידים בחרו בה ("5 מתוך 14"),
   וכפתור שפותח את ההדמיה הממוקדת. כשעוד אין הדמיה כזאת הכפתור מעומעם עם מנעול, והסיבה כתובה לידו כל הזמן —
   לא רק אחרי לחיצה (עיקרון 10: חסום = אפור + מנעול + הסבר גלוי). שם הטאב כבר אומר "טעויות נפוצות", לכן אין כותרת שחוזרת עליו. */
import { useId } from 'react'
import { useNavigate } from 'react-router-dom'
import { studentsCountText } from '../../shared/lib/findingsNarrative'
import type { CommonErrorRow } from '../../shared/types/resultsV1'
import { FONT, Icon, RADIUS, T } from '../teacherUi'
import { primaryButton, secondaryButton, soft } from './styles'
import { UI } from './text'

/* כפתור שאינו פעיל: מעומעם, מקווקו, עם מנעול. aria-disabled (ולא disabled) כדי שייקרא ויתקשר להסבר שלידו */
const lockedButton = { ...secondaryButton, cursor: 'not-allowed', color: T.textSoft, background: 'transparent', border: `2px dashed ${T.controlBorder}` } as const

function ErrorCard({ e }: { e: CommonErrorRow }) {
  const navigate = useNavigate()
  const reasonId = useId()
  return (
    <li data-common-error-card={e.id} style={{ listStyle: 'none', padding: '10px 16px', borderRadius: RADIUS.md, border: `1.5px solid ${T.border}`, background: T.surface, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontFamily: FONT, fontSize: 17, fontWeight: 800, color: T.text, lineHeight: 1.4 }}>
        <span style={{ color: T.warn, display: 'inline-flex' }}><Icon name="alert" size={20} /></span>
        {e.title}
      </h3>
      {e.description && <p style={{ ...soft, margin: 0, lineHeight: 1.5 }}>{e.description}</p>}
      <p style={{ margin: 0, fontFamily: FONT, fontSize: 16, fontWeight: 700, color: T.text }}>{UI.errorCount(studentsCountText(e.studentsCount, e.studentsExposed))}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px 12px', flexWrap: 'wrap', marginTop: 2 }}>
        {e.linkedQuest ? (
          <>
            <button type="button" data-tu-press style={primaryButton}
              onClick={() => { if (e.linkedQuest) navigate(`/creator/quest/${encodeURIComponent(e.linkedQuest.questId)}`) }}>
              {UI.focusedOpen}
            </button>
            <span style={soft}>{UI.focusedExists(e.linkedQuest.title)}</span>
          </>
        ) : (
          <>
            <button type="button" aria-disabled="true" aria-describedby={reasonId} style={lockedButton}>
              <Icon name="lock" size={18} />
              {UI.focusedQuest}
            </button>
            <span id={reasonId} style={soft}>{UI.focusedNone}</span>
          </>
        )}
      </div>
    </li>
  )
}

export default function CommonErrors({ errors }: { errors: CommonErrorRow[] }) {
  return (
    <div data-common-errors style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 style={{ margin: 0, fontFamily: FONT, fontSize: 17, fontWeight: 800, color: T.text, lineHeight: 1.5 }}>
        {UI.commonErrorsSummary(errors.length)}
      </h2>
      <ul style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {errors.map((e) => <ErrorCard key={e.id} e={e} />)}
      </ul>
    </div>
  )
}
