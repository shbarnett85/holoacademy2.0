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
  /* השלמות ראשונות בהדמיה עם מקצוע שהרמה שלהן לא חושבה לפי מקצוע: ל-progress_snapshot אין subject_id, או שהוא שונה ממקצוע ההדמיה.
     רמה כזו נגזרה מהפרופיל הגלובלי ולא מפרופיל המקצוע, ולכן אינה נכנסת לסדרת הרמה של המקצוע (FX1a). */
  sessionsWithoutSubjectLevel: number
  /* השלמות חוזרות של אותה הדמיה (לא הראשונה לאותו תלמיד/ה): אינן נכנסות לסדרות — שינון אינו שינוי ביכולת */
  repeatSessions: number
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
  /* שמות הכיתות שלא נכנסו כי אי אפשר לגזור להן שכבה — להודעה "לכיתה X לא הוגדרה שכבה" (שם כיתה אינו פרט על תלמיד) */
  classesWithoutGradeNames: string[]
  /* ── אופציונלי ── */
  /* כיתות בהיקף הצופה שהטעינה שלהן נכשלה / עדיין נמשכת. נקבע ע"י המקור החי אחרי הטעינה (לא ע"י ההרכבה), רק כשיש כאלה */
  classesNotLoaded?: number
  classesLoading?: number
  /* כיתות שההרכבה / המנוע נכשלו על הנתונים שלהן (לא יעבור בניסיון חוזר) — מובחן מ-classesNotLoaded (תקלת תשתית חולפת) */
  classesDataError?: number
  /* מזהי המשחקים שהוחרגו כי להדמיה אין מקצוע. כשכל החלקים מספקים אותם, המיזוג סופר משחקים **ייחודיים** (תלמיד בכמה כיתות נשלף בכל אחת מהן) */
  unclassifiedSessionIds?: string[]
  /* כמו unclassifiedSessionIds, עבור sessionsWithoutSubjectLevel: ספירה ייחודית במיזוג בין כיתות */
  sessionsWithoutSubjectLevelIds?: string[]
}

export function emptyCoverage(): LiveCoverage {
  return {
    unclassifiedSessions: 0, detailAvailableFrom: null,
    sessionsTotal: 0, sessionsUsed: 0, sessionsWithoutLevel: 0, sessionsWithoutSubjectLevel: 0, repeatSessions: 0, answersTotal: 0,
    classesTotal: 0, classesWithoutGrade: 0, classesWithoutGradeNames: [], studentsTotal: 0, studentsInMultipleClasses: 0, catalogEmpty: true,
  }
}

export function sumCoverage(parts: readonly LiveCoverage[]): LiveCoverage {
  const out = emptyCoverage()
  if (parts.length === 0) return out
  out.catalogEmpty = parts.every((p) => p.catalogEmpty)
  if (parts.every((p) => p.unclassifiedSessionIds)) out.unclassifiedSessionIds = [...new Set(parts.flatMap((p) => p.unclassifiedSessionIds!))]
  if (parts.every((p) => p.sessionsWithoutSubjectLevelIds)) out.sessionsWithoutSubjectLevelIds = [...new Set(parts.flatMap((p) => p.sessionsWithoutSubjectLevelIds!))]
  for (const p of parts) {
    out.unclassifiedSessions += p.unclassifiedSessions
    out.classesNotLoaded = (out.classesNotLoaded ?? 0) + (p.classesNotLoaded ?? 0)
    out.classesLoading = (out.classesLoading ?? 0) + (p.classesLoading ?? 0)
    out.classesDataError = (out.classesDataError ?? 0) + (p.classesDataError ?? 0)
    out.sessionsTotal += p.sessionsTotal
    out.sessionsUsed += p.sessionsUsed
    out.sessionsWithoutLevel += p.sessionsWithoutLevel
    out.sessionsWithoutSubjectLevel += p.sessionsWithoutSubjectLevel
    out.repeatSessions += p.repeatSessions
    out.classesWithoutGradeNames.push(...p.classesWithoutGradeNames)
    out.answersTotal += p.answersTotal
    out.classesTotal += p.classesTotal
    out.classesWithoutGrade += p.classesWithoutGrade
    out.studentsTotal += p.studentsTotal
    out.studentsInMultipleClasses += p.studentsInMultipleClasses
    if (p.detailAvailableFrom && (!out.detailAvailableFrom || p.detailAvailableFrom < out.detailAvailableFrom)) out.detailAvailableFrom = p.detailAvailableFrom
  }
  /* ספירה ייחודית לפי מזהה משחק (אם סופקו): אותו משחק של תלמיד בשתי כיתות נספר פעם אחת */
  if (out.unclassifiedSessionIds) out.unclassifiedSessions = out.unclassifiedSessionIds.length
  if (out.sessionsWithoutSubjectLevelIds) out.sessionsWithoutSubjectLevel = out.sessionsWithoutSubjectLevelIds.length
  out.classesWithoutGradeNames = [...new Set(out.classesWithoutGradeNames)]
  /* שדות אופציונליים שנשארו אפס אינם מצטרפים לתוצאה */
  if (!out.classesNotLoaded) delete out.classesNotLoaded
  if (!out.classesLoading) delete out.classesLoading
  if (!out.classesDataError) delete out.classesDataError
  return out
}

/* ניתוח חי = Analysis + הכיסוי המורחב + הכיתה העיקרית של תלמידים בכמה כיתות (למיזוג) */
export interface LiveAnalysis extends Analysis {
  coverage: LiveCoverage
  /* תלמיד → הכיתה העיקרית שלו (רק לתלמידים החברים ביותר מכיתה אחת) */
  primaryClassOf: ReadonlyMap<string, string>
}
