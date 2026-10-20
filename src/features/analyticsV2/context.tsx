/* ──────────────────────────────────────────────────────────────────────────
   הקשר משותף למסכי האנליטיקה: התצורה מהשרת, העדשה, וכתובות (הכתובת היא המצב).
   מורה אורח: lens/subject נשמרים בכל קישור פנימי (השרת הוא שגוזר את הצופה; הלקוח רק מבקש תצוגה).
   ────────────────────────────────────────────────────────────────────────── */
import { createContext, useContext } from 'react'
import type { AnalyticsConfig, Lens } from '../../shared/types/analyticsV2'
import type { BreadcrumbItem } from '../teacherUi'
import { L } from './labels'
import type { V2Params } from './v2api'

export interface V2Env {
  cfg: AnalyticsConfig
  lens: Lens
  /** מורה אורח: בורר העדשה זמין */
  guest: boolean
  /** מורה מקצועי אורח: המקצוע שנבחר (או מקצועו של מורה מקצועי אמיתי) */
  subject: string | null
  /** פרמטרים לשאילתות ה-API (אורח בלבד) */
  params: V2Params
  /** כתובת פנימית; lens/subject של האורח נוספים אוטומטית */
  href: (path: string, q?: Record<string, string | null | undefined>) => string
  /** החלפת עדשה/מקצוע (אורח): חוזרים למסך הכניסה כדי להישאר במסך תקף */
  goLens: (lens: Lens, subject?: string) => void
  openBriefing: (scope: 'student' | 'class', id: string) => void
  openFeedback: (studentId: string) => void
}

export const V2Context = createContext<V2Env | null>(null)

export function useV2Env(): V2Env {
  const e = useContext(V2Context)
  if (!e) throw new Error('V2Context חסר')
  return e
}

/* הפריט הראשון בכל נתיב חזרה: אנליטיקה (קישור למסך הכניסה) */
export function useRootCrumb(): BreadcrumbItem {
  const env = useV2Env()
  return { label: L.analytics, to: env.href('/analytics') }
}
