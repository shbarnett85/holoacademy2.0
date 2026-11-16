import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameFeel } from '../gameFeel/engine'

/* רשת ביטחון לצלילה: האנימציה לא חייבת להסתיים (לשונית מוסתרת), והניווט לא יכול להיתקע */
const DIVE_FALLBACK_MS = 1700
/* כניסה לשיעור דרך הפורטל: צלילה לתוכו ואז ניווט. בלי תנועה (תנועה מופחתת, עוצמה עדינה): ניווט מיד */
export function usePortalDive(): { leaving: 'dive' | undefined; dive: (to: string) => void; onDiveEnd: () => void } {
  const navigate = useNavigate()
  const feel = useGameFeel()
  const moving = !feel.reduced && feel.level !== 'gentle'
  const [leaving, setLeaving] = useState<'dive' | undefined>(undefined)
  const target = useRef<string | null>(null)
  const go = () => { const to = target.current; target.current = null; if (to) navigate(to) }
  const dive = (to: string) => {
    if (target.current) return
    target.current = to
    if (!moving) { go(); return }
    setLeaving('dive')
    window.setTimeout(go, DIVE_FALLBACK_MS)
  }
  return { leaving, dive, onDiveEnd: go }
}
