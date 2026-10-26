/* ──────────────────────────────────────────────────────────────────────────
   ResultsProvider — הממשק של טאב "סיכום שיעור" (נתיב /results). חוזה: src/shared/types/resultsV1.ts.
   · realResultsProvider (realResults.ts): נתוני אמת מה-DB — פעיל לכל המורים.
   · demoResultsProvider (demoResults.ts): מורה אורח, מעולם הדמו בזיכרון.
   הנתיב (routes/results.ts) בוחר: isDemoGuest(req) → הדגמה; אחרת אמיתי. כל ספק גוזר את הצופה בעצמו מהבקשה
   (אמיתי: loadViewer; הדגמה: resolveV2Viewer — עדשת האורח). הרשאות נאכפות בתוך הספק (authz).
   ────────────────────────────────────────────────────────────────────────── */
import type { Request } from 'express'
import type { ClassSubmissionView, LiveView, Overview, StudentSubmissionView, SubmissionList } from '../../../../src/shared/types/resultsV1.js'
import type { ResultsListQuery } from './listView.js'

export type { ResultsListQuery } from './listView.js'

export interface ResultsProvider {
  list(req: Request, q: ResultsListQuery): Promise<SubmissionList>
  classView(req: Request, submissionId: string): Promise<ClassSubmissionView>
  studentView(req: Request, submissionId: string, studentId: string): Promise<StudentSubmissionView>
  /* "תצוגה חיה" של שיעור: אריח לכל תלמיד/ה. הקליינט מרענן (polling) כל LIVE_RULES.refreshMs */
  live(req: Request, submissionId: string): Promise<LiveView>
  /* מנהל/ת: טבלה אחת, שכבה × מקצוע, החודש. בלי פירוק לכיתה/מורה; תאים קטנים מוסתרים. מורים — 403 */
  overview(req: Request): Promise<Overview>
  /* שינוי מועד ההגשה של שליחה (YYYY-MM-DD, יום ישראלי → סוף היום 23:59). מחזיר את המועד החדש */
  setDue(req: Request, submissionId: string, dueDay: string): Promise<{ dueAt: string }>
}
