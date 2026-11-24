/* מעבר היציאה מחשבון (לבקשת המשתמש: קצר אך מרשים): המסך נסגר כמו פורטל, מהקצוות אל המרכז, הסימן של המותג קופץ
   למרכז, ואז המסך נפתח שוב מהמרכז החוצה על המסך שאליו יוצאים. זה ההיפוך של ספלאש הפתיחה, שבו המסך נפתח כמו פורטל.
   היציאה עצמה (ניקוי החשבון והניווט) קורית כשהמסך סגור, כך שהחלפת המסכים לא נראית.
   שימוש: leaveWith(() => { logout(); navigate('/') }) מכל מקום (shared/lib/leave); הרכיב עצמו יושב פעם אחת ב-App.
   תנועה מופחתת: בלי מעבר, היציאה מיידית. הסגנון: index.css (.leave*). */
import { useEffect, useState } from 'react'
import BrandLogo from './BrandLogo'
import { setLeaveHandler } from '../lib/leave'

const CLOSE_MS = 480
const HOLD_MS = 340
const OPEN_MS = 560

export default function LeaveTransition() {
  const [phase, setPhase] = useState<'close' | 'hold' | 'open' | null>(null)
  useEffect(() => {
    let timers: number[] = []
    let busy = false
    setLeaveHandler((run) => {
      if (busy) return
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { run(); return }
      busy = true
      setPhase('close')
      timers = [
        window.setTimeout(() => { setPhase('hold'); run() }, CLOSE_MS),
        window.setTimeout(() => setPhase('open'), CLOSE_MS + HOLD_MS),
        window.setTimeout(() => { setPhase(null); busy = false }, CLOSE_MS + HOLD_MS + OPEN_MS),
      ]
    })
    return () => { setLeaveHandler(null); timers.forEach((t) => window.clearTimeout(t)) }
  }, [])
  if (!phase) return null
  return (
    <div className="leave" data-phase={phase} data-leave-transition aria-hidden="true">
      <div className="leave-cover"><span className="leave-ring" /></div>
      <div className="leave-mark"><BrandLogo variant="mark" height={64} clear={false} /></div>
    </div>
  )
}
