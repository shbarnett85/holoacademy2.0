/* ──────────────────────────────────────────────────────────────────────────
   ResultsProvider — הממשק של טאב "תוצאות". חוזה: src/shared/types/resultsV1.ts.
   · realResultsProvider (realResults.ts): נתוני אמת מה-DB — פעיל לכל המורים.
   · demoResultsProvider (demoResults.ts): מורה אורח, מעולם הדמו בזיכרון.
   הנתיב (routes/results.ts) בוחר: isDemoGuest(req) → הדגמה; אחרת אמיתי. כל ספק גוזר את הצופה בעצמו מהבקשה
   (אמיתי: loadViewer; הדגמה: resolveV2Viewer — עדשת האורח). הרשאות נאכפות בתוך הספק (authz).
   ────────────────────────────────────────────────────────────────────────── */
import type { Request } from 'express'
import type { ClassSubmissionView, StudentSubmissionView, SubmissionList } from '../../../../src/shared/types/resultsV1.js'

export interface ResultsListQuery { classId?: string; subject?: string; q?: string }

export interface ResultsProvider {
  list(req: Request, q: ResultsListQuery): Promise<SubmissionList>
  classView(req: Request, submissionId: string): Promise<ClassSubmissionView>
  studentView(req: Request, submissionId: string, studentId: string): Promise<StudentSubmissionView>
  /* שינוי מועד ההגשה של שליחה (YYYY-MM-DD, יום ישראלי → סוף היום 23:59). מחזיר את המועד החדש */
  setDue(req: Request, submissionId: string, dueDay: string): Promise<{ dueAt: string }>
}
