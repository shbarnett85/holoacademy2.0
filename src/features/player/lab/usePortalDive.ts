import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameFeel } from '../gameFeel/engine'

/* רשת ביטחון לצלילה: האנימציה לא חייבת להסתיים (לשונית מוסתרת), והניווט לא יכול להיתקע */
const DIVE_FALLBACK_MS = 1700
/* ההכנה שלפני הצלילה (טעינת השיעור) לא מעכבת את הכניסה יותר מזה: אחר כך נכנסים, והנגן טוען בעצמו */
const PREPARE_MAX_MS = 9000
/* הכיתוב "טוען" מופיע רק אם ההכנה נמשכת יותר מזה, כדי שלא יהבהב כשהיא מיידית */
const LOADING_SHOW_MS = 160
/* כניסה לשיעור דרך הפורטל: קודם ההכנה (טעינת השיעור, עם הכיתוב "טוען" על המסך), אחר כך צלילה לתוכו, ואז ניווט.
   בלי תנועה (תנועה מופחתת, עוצמה עדינה): ניווט מיד אחרי ההכנה */
export function usePortalDive(): { leaving: 'dive' | undefined; loading: boolean; dive: (to: string, prepare?: () => Promise<unknown>) => void; onDiveEnd: () => void } {
  const navigate = useNavigate()
  const feel = useGameFeel()
  const moving = !feel.reduced && feel.level !== 'gentle'
  const [leaving, setLeaving] = useState<'dive' | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const target = useRef<string | null>(null)
  const go = () => { const to = target.current; target.current = null; if (to) navigate(to) }
  const start = () => {
    if (!moving) { go(); return }
    setLeaving('dive')
    window.setTimeout(go, DIVE_FALLBACK_MS)
  }
  const dive = (to: string, prepare?: () => Promise<unknown>) => {
    if (target.current) return
    target.current = to
    if (!prepare) { start(); return }
    const show = window.setTimeout(() => setLoading(true), LOADING_SHOW_MS)
    const limit = new Promise<void>((resolve) => { window.setTimeout(resolve, PREPARE_MAX_MS) })
    void Promise.race([prepare(), limit]).catch(() => undefined).then(() => { window.clearTimeout(show); setLoading(false); start() })
  }
  return { leaving, loading, dive, onDiveEnd: go }
}
