/* סיכום שיעור — מה התלמידים עשו בשיעורים ששלחתי. הכתובת קובעת את המסך:
   /results  ·  /results/:submissionId (כל הכיתה)  ·  /results/:submissionId/student/:studentId (לפי תלמיד)
   /results/:submissionId/live (תצוגה חיה)  ·  /results/:submissionId/discuss?e=… (שאלה לדיון, מסך מלא להקרנה).
   שליחה = שיעור × כיתה × תאריך. הנתונים מהחוזה resultsV1 בלבד — לא ידוע כאן אם הספק אמיתי או הדגמה.
   מנהל/ת (ומנהל עירוני; אצל מורה אורח — עדשת "מנהל"): במקום הרשימה — טבלה כללית אחת, שכבה × מקצוע, בלי עמודי שיעור.
   מורה אורח: העדשה (lens / subject) נשמרת במאגר המשותף ומצורפת לכל קריאה ולכל קישור (resultsApi). */
import { useLocation, useParams } from 'react-router-dom'
import { useStaffAuth } from '../../shared/hooks/useStaffAuth'
import Discussion from './Discussion'
import LivePage from './LivePage'
import OverviewScreen from './OverviewScreen'
import ResultsList from './ResultsList'
import { useLens, useLensSync } from './resultsApi'
import SubmissionScreen from './SubmissionScreen'

export default function Results() {
  const { submissionId, studentId } = useParams()
  const { pathname } = useLocation()
  const { role } = useStaffAuth()
  const lens = useLens()
  useLensSync()
  if (!submissionId) {
    const aggregateOnly = role === 'admin' || role === 'municipal_admin' || (lens.isGuest && lens.state?.lens === 'admin')
    return aggregateOnly ? <OverviewScreen /> : <ResultsList />
  }
  if (pathname.endsWith('/live')) return <LivePage key={submissionId} submissionId={submissionId} />
  if (pathname.endsWith('/discuss')) return <Discussion key={submissionId} submissionId={submissionId} />
  return <SubmissionScreen key={submissionId} submissionId={submissionId} studentId={studentId ?? null} />
}
