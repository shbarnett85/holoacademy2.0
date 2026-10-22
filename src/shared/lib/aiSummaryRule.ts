/* ──────────────────────────────────────────────────────────────────────────
   aiSummaryRule — מתי מותר לכתוב סיכום מילולי (לקוח + שרת, פונקציה טהורה אחת).
   מינימום נתונים לפי היקף, כדי שלא יסוכם ילד/כיתה על בסיס הדמיה בודדת (חוק 6: N מעל המינימום).
   הטקסטים ("עוד אין מספיק נתונים…" ומה יקרה) חיים ב-findingsNarrative.ts (aiSummaryNotEnough).
   ────────────────────────────────────────────────────────────────────────── */
import type { SummaryEligibility, SummaryScope } from '../types/aiSummaryV1'
import { CLASS_SUMMARY_MIN_COMPLETED, CURRENT_LEVEL_SESSIONS } from './analyticsConfig'
import { aiSummaryNotEnough } from './findingsNarrative'

export const AI_SUMMARY_RULE = {
  /* תלמיד/ה: סך ההדמיות שהושלמו בפאנלים שהצופה רשאי לראות */
  studentMinSessions: CURRENT_LEVEL_SESSIONS,
  /* כיתה / מקצוע בכיתה: תלמידים שיש עליהם נתוני רמה */
  classMinStudentsWithData: 3,
  classSubjectMinStudentsWithData: 3,
  /* הגשה: תלמידים שסיימו */
  submissionMinCompleted: CLASS_SUMMARY_MIN_COMPLETED,
} as const

/* כמה נתונים יש (סשנים / תלמידים עם נתונים / תלמידים שסיימו) — המפעיל מספק רק את מה שרלוונטי להיקף */
export interface SummaryCounts { sessions?: number; students?: number; completed?: number }

/* המינימום וה"כמה יש" לפי היקף */
export function summaryMinimum(scope: SummaryScope): number {
  switch (scope) {
    case 'student': return AI_SUMMARY_RULE.studentMinSessions
    case 'class': return AI_SUMMARY_RULE.classMinStudentsWithData
    case 'class_subject': return AI_SUMMARY_RULE.classSubjectMinStudentsWithData
    case 'submission': return AI_SUMMARY_RULE.submissionMinCompleted
  }
}

function countFor(scope: SummaryScope, n: SummaryCounts): number {
  switch (scope) {
    case 'student': return n.sessions ?? 0
    case 'class':
    case 'class_subject': return n.students ?? 0
    case 'submission': return n.completed ?? 0
  }
}

export function summaryEligibility(scope: SummaryScope, n: SummaryCounts): SummaryEligibility {
  const min = summaryMinimum(scope)
  if (countFor(scope, n) >= min) return { ok: true }
  const { text, whatNext } = aiSummaryNotEnough(scope, min)
  return { ok: false, text, whatNext }
}
