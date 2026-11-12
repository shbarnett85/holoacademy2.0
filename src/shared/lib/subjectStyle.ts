/* עיצוב קבוע לכל מקצוע — צבע + אייקון, זהה בכל המערכת (עיקרון 11 בעקרונות הממשק למורה).
   מקור הסמלים: `subjects.ts` (`SUBJECT_VISUAL`); מקור הצבעים: `src/styles/tokens.css` (`--subject-<code>`).
   יש פלטה אחת לכל המסכים. צבע לעולם לא נושא משמעות לבד: תמיד מלווה בשם המקצוע. */
import { subjectVisual, type SubjectVisualMode } from './subjects'

export interface SubjectStyle { color: string; icon: string; label: string }

/* code = null/לא מוכר → "לא סווג". הפרמטר mode נשאר לתאימות ואינו משפיע */
export function subjectStyle(code: string | null | undefined, mode?: SubjectVisualMode): SubjectStyle {
  void mode
  const v = subjectVisual(code)
  return { color: v.color, icon: v.glyph, label: v.label }
}

/* בתוך קומפוננטה (נשאר כ-hook לתאימות עם הקריאות הקיימות) */
export function useSubjectStyle(code: string | null | undefined): SubjectStyle {
  return subjectStyle(code)
}
