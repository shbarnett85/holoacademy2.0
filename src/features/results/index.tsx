/* תוצאות — מה התלמידים עשו בהדמיות ששלחתי. הכתובת קובעת את המסך:
   /results  ·  /results/:submissionId (כל הכיתה)  ·  /results/:submissionId/student/:studentId (לפי תלמיד).
   שליחה = הדמיה × כיתה × תאריך. הנתונים מהחוזה resultsV1 בלבד — לא ידוע כאן אם הספק אמיתי או הדגמה.
   מורה אורח: העדשה (lens / subject) נשמרת במאגר המשותף ומצורפת לכל קריאה ולכל קישור (resultsApi). */
import { useParams } from 'react-router-dom'
import ResultsList from './ResultsList'
import { useLensSync } from './resultsApi'
import SubmissionScreen from './SubmissionScreen'

export default function Results() {
  const { submissionId, studentId } = useParams()
  useLensSync()
  if (!submissionId) return <ResultsList />
  return <SubmissionScreen key={submissionId} submissionId={submissionId} studentId={studentId ?? null} />
}
