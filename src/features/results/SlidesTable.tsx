/* "זמן בשקפים" — טבלה קטנה של עובדות: שקף, כמה מילים בו, וכמה שניות עברו עד שהתלמיד/ה עבר/ה הלאה.
   אין כאן שום פרשנות (לא כותבים "לא קרא") — רק המספרים. שם הטאב כבר אומר "זמן בשקפים", לכן הכותרת מוסתרת חזותית (נשארת לקוראי מסך)
   והמשפט שמסביר מה בטבלה הוא הפותח. עמודות המספרים צרות וצמודות לשם השקף, כדי שהעין לא תצטרך לחצות את כל המסך. */
import type { SlideFact } from '../../shared/types/resultsV1'
import { FONT, T, VisuallyHidden } from '../teacherUi'
import { soft } from './styles'
import { UI } from './text'

const th = { fontFamily: FONT, fontSize: 16, fontWeight: 800, color: T.textSoft, textAlign: 'start', padding: '6px 12px', borderBottom: `2px solid ${T.controlBorder}`, whiteSpace: 'nowrap' } as const
const td = { fontFamily: FONT, fontSize: 16, color: T.text, padding: '5px 12px', borderBottom: `1px solid ${T.border}` } as const
const numCol = { width: 110 } as const

export default function SlidesTable({ slides }: { slides: SlideFact[] }) {
  if (slides.length === 0) return <p style={soft}>{UI.noSlides}</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <h2 style={{ margin: 0 }}><VisuallyHidden>{UI.slidesTitle}</VisuallyHidden></h2>
      <p style={{ ...soft, margin: 0, lineHeight: 1.5 }}>{UI.slidesNote}</p>
      <table data-slides-table style={{ alignSelf: 'flex-start', minWidth: 460, maxWidth: '100%', borderCollapse: 'collapse' }}>
        <caption><VisuallyHidden>{UI.slidesTitle}</VisuallyHidden></caption>
        <thead>
          <tr><th scope="col" style={th}>{UI.slide}</th><th scope="col" style={{ ...th, ...numCol }}>{UI.words}</th><th scope="col" style={{ ...th, ...numCol }}>{UI.seconds}</th></tr>
        </thead>
        <tbody>
          {slides.map((s) => (
            <tr key={s.order}>
              <th scope="row" style={{ ...td, textAlign: 'start', fontWeight: 600, overflowWrap: 'anywhere' }}>{s.order}. {s.title}</th>
              <td style={{ ...td, ...numCol }}>{s.words ?? UI.noValue}</td>
              <td style={{ ...td, ...numCol }}>{s.seconds ?? UI.noValue}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
