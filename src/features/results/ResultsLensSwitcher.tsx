/* בורר העדשה של מורה האורח במסכי התוצאות (חריץ lensSwitcher של ScreenShell): מחנך/ת | מורה מקצועי/ת | מנהל/ת (+ מקצוע).
   מוצג רק לאורח — מורה אחר לא רואה אותו. הערך מגיע מהכתובת (או מהבחירה השמורה), והחלפה מחזירה לרשימה (goLens). */
import { GuestLensSwitcher } from '../teacherUi'
import { useLens } from './resultsApi'

export default function ResultsLensSwitcher() {
  const { isGuest, state, goLens } = useLens()
  if (!isGuest) return null
  return <GuestLensSwitcher value={state ?? undefined} onChange={goLens} />
}
