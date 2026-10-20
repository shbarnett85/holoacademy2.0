/* "ביצועים לפי סוג אתגר" — כמה תלמידים הצליחו בכל סוג אתגר, מכל ההדמיות. הסוגים מסודרים מהקשה לקל.
   הועבר מ-LessonsPane כשרשימת השיעורים עברה לטאב "תוצאות". מציג "X מתוך Y הצליחו" (אחוז רק בנוסף), סינון מקצוע בכפתורים. */
import { useEffect, useState } from 'react'
import { apiJson } from '../../shared/lib/api'
import { puzzleTypeLabel } from '../../shared/lib/labels'
import FilterButtons from '../results/FilterButtons'
import { card, panelTitle, soft } from '../results/styles'
import { FONT, ProgressBar, T } from '../teacherUi'

interface TypeRow { type: string; attempts: number; solved: number; failed: number; successRate: number | null; avgDifficulty: number | null }
interface TypesResponse { types: TypeRow[]; subjects: string[] }

export default function ChallengeTypesPanel() {
  const [subject, setSubject] = useState<string | null>(null)
  const [subjects, setSubjects] = useState<string[]>([])
  const [rows, setRows] = useState<TypeRow[] | null>(null)

  useEffect(() => {
    let cancelled = false
    apiJson<TypesResponse>(`/api/analytics/challenge-types${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`)
      .then((b) => { if (cancelled) return; setRows(b.types); if (!subject) setSubjects(b.subjects) })
      .catch(() => { if (!cancelled) setRows([]) })
    return () => { cancelled = true }
  }, [subject])

  if (rows === null) return <p role="status" style={{ margin: 0, fontFamily: FONT, fontSize: 16, color: T.textSoft }}>טוען…</p>
  /* אין נתונים בכלל — לא מציגים פאנל ריק */
  if (rows.length === 0 && !subject) return null

  return (
    <section aria-label="ביצועים לפי סוג אתגר" data-challenge-types style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px' }}>
      <h2 style={panelTitle}>איך הלך לתלמידים בכל סוג אתגר?</h2>
      <p style={{ ...soft, margin: 0 }}>כל שורה היא סוג אתגר, מכל ההדמיות: בכמה מהפעמים שתלמידים ניסו אותו הם הצליחו. הקשה ביותר למעלה.</p>
      {subjects.length > 1 && (
        <FilterButtons label="מקצוע" allLabel="כל המקצועות" options={subjects.map((s) => ({ id: s, label: s }))} value={subject} onChange={setSubject} />
      )}
      {rows.length === 0 ? (
        <p style={{ ...soft, margin: 0 }}>אין עדיין נתונים למקצוע הזה. הם יופיעו כאן כשתלמידים יסיימו הדמיות.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((r) => (
            <li key={r.type} style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <span style={{ flex: '0 0 170px', fontFamily: FONT, fontSize: 16, fontWeight: 700, color: T.text }}>{puzzleTypeLabel(r.type)}</span>
              <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                <ProgressBar done={r.solved} total={r.attempts} label="הצליחו" showPercent />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
