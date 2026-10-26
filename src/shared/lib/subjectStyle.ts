/* עיצוב קבוע לכל מקצוע — צבע + אייקון, זהה בכל המערכת (עיקרון 11 בעקרונות הממשק למורה).
   מקור הצבעים והסמלים: `subjects.ts` (`SUBJECT_VISUAL`, משותף לקליינט ולשרת) — כאן רק בחירת הווריאנט לפי ערכת הנושא
   הפעילה. צבע לעולם לא נושא משמעות לבד: תמיד מלווה באייקון ובשם המקצוע. */
import { subjectVisual, type SubjectVisualMode } from './subjects'
import { useTheme } from './useTheme'

export interface SubjectStyle { color: string; icon: string; label: string }

/* מסכי מורה: בהיר כברירת מחדל (כמו theme.js); כהה רק למי שבחר מצב כהה */
function activeMode(): SubjectVisualMode {
  if (typeof window === 'undefined' || !window.HoloTheme) return 'light'
  return window.HoloTheme.isLight() ? 'light' : 'dark'
}

/* code = null/לא מוכר → "לא סווג". mode — מפורש (מסכי תלמיד: 'dark'); ללא mode — לפי הערכה הפעילה */
export function subjectStyle(code: string | null | undefined, mode: SubjectVisualMode = activeMode()): SubjectStyle {
  const v = subjectVisual(code, mode)
  return { color: v.color, icon: v.glyph, label: v.label }
}

/* בתוך קומפוננטה: מתעדכן ברינדור מחדש בכל החלפת ערכה */
export function useSubjectStyle(code: string | null | undefined): SubjectStyle {
  const light = useTheme()
  return subjectStyle(code, light ? 'light' : 'dark')
}
