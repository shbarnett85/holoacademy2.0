/* "זמן בשקפים" — טבלה קטנה של עובדות: שקף, כמה מילים בו, וכמה שניות עברו עד שהתלמיד/ה עבר/ה הלאה.
   אין כאן שום פרשנות (לא כותבים "לא קרא") — רק המספרים. */
import type { SlideFact } from '../../shared/types/resultsV1'
import { FONT, T, VisuallyHidden } from '../teacherUi'
import { soft } from './styles'
import { UI } from './text'

const th = { fontFamily: FONT, fontSize: 15, fontWeight: 800, color: T.textSoft, textAlign: 'start', padding: '8px 12px', borderBottom: `2px solid ${T.controlBorder}`, whiteSpace: 'nowrap' } as const
const td = { fontFamily: FONT, fontSize: 16, color: T.text, padding: '7px 12px', borderBottom: `1px solid ${T.border}` } as const

export default function SlidesTable({ slides }: { slides: SlideFact[] }) {
  if (slides.length === 0) return <p style={{ ...soft, fontSize: 16 }}>{UI.noSlides}</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h2 style={{ margin: 0, fontFamily: FONT, fontSize: 17, fontWeight: 800, color: T.text }}>{UI.slidesTitle}</h2>
      <p style={{ ...soft, margin: 0 }}>{UI.slidesNote}</p>
      <table data-slides-table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <caption><VisuallyHidden>{UI.slidesTitle}</VisuallyHidden></caption>
        <thead>
          <tr><th scope="col" style={th}>{UI.slide}</th><th scope="col" style={th}>{UI.words}</th><th scope="col" style={th}>{UI.seconds}</th></tr>
        </thead>
        <tbody>
          {slides.map((s) => (
            <tr key={s.order}>
              <th scope="row" style={{ ...td, textAlign: 'start', fontWeight: 600, overflowWrap: 'anywhere' }}>{s.order}. {s.title}</th>
              <td style={td}>{s.words ?? UI.noValue}</td>
              <td style={td}>{s.seconds ?? UI.noValue}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
