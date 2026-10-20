/* ──────────────────────────────────────────────────────────────────────────
   coverage — כיסוי הנתונים של העולם החי: מה נכנס ל-v2 ומה הוחרג (ולמה). טהור.
   · unclassifiedSessions / detailAvailableFrom הם החוזה של AnalyticsSource.coverage; השאר — פירוט נוסף לבדיקות ולדוח.
   · סכום בין כיתות: מספרים מצטברים; detailAvailableFrom = המוקדם; catalogEmpty = כל הקטלוגים ריקים.
   ────────────────────────────────────────────────────────────────────────── */
import type { Analysis, AnalysisCoverage } from '../engine.js'

export interface LiveCoverage extends AnalysisCoverage {
  /* סשנים שהושלמו בחלון (ימי הלימוד של האופק) */
  sessionsTotal: number
  /* סשנים שנכנסו לעולם (עם מקצוע ועם רמה והצלחה) */
  sessionsUsed: number
  /* סשנים עם מקצוע אך בלי progress_snapshot שמיש (אין רמה/הצלחה) */
  sessionsWithoutLevel: number
  /* שורות answers שנטענו */
  answersTotal: number
  classesTotal: number
  /* כיתות שלא נכנסו כי אי אפשר לגזור להן שכבה (1–12) */
  classesWithoutGrade: number
  studentsTotal: number
  /* תלמידים החברים ביותר מכיתה אחת (הכיתה העיקרית נקבעת בכלל דטרמיניסטי) */
  studentsInMultipleClasses: number
  /* אין קטלוג מאושר (מושגים / טעויות נפוצות): וקטורי התוכן והטעויות הנפוצות ריקים עד שיתויגו */
  catalogEmpty: boolean
}

export function emptyCoverage(): LiveCoverage {
  return {
    unclassifiedSessions: 0, detailAvailableFrom: null,
    sessionsTotal: 0, sessionsUsed: 0, sessionsWithoutLevel: 0, answersTotal: 0,
    classesTotal: 0, classesWithoutGrade: 0, studentsTotal: 0, studentsInMultipleClasses: 0, catalogEmpty: true,
  }
}

export function sumCoverage(parts: readonly LiveCoverage[]): LiveCoverage {
  const out = emptyCoverage()
  if (parts.length === 0) return out
  out.catalogEmpty = parts.every((p) => p.catalogEmpty)
  for (const p of parts) {
    out.unclassifiedSessions += p.unclassifiedSessions
    out.sessionsTotal += p.sessionsTotal
    out.sessionsUsed += p.sessionsUsed
    out.sessionsWithoutLevel += p.sessionsWithoutLevel
    out.answersTotal += p.answersTotal
    out.classesTotal += p.classesTotal
    out.classesWithoutGrade += p.classesWithoutGrade
    out.studentsTotal += p.studentsTotal
    out.studentsInMultipleClasses += p.studentsInMultipleClasses
    if (p.detailAvailableFrom && (!out.detailAvailableFrom || p.detailAvailableFrom < out.detailAvailableFrom)) out.detailAvailableFrom = p.detailAvailableFrom
  }
  return out
}

/* ניתוח חי = Analysis + הכיסוי המורחב + הכיתה העיקרית של תלמידים בכמה כיתות (למיזוג) */
export interface LiveAnalysis extends Analysis {
  coverage: LiveCoverage
  /* תלמיד → הכיתה העיקרית שלו (רק לתלמידים החברים ביותר מכיתה אחת) */
  primaryClassOf: ReadonlyMap<string, string>
}
