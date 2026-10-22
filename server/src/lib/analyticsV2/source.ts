/* ──────────────────────────────────────────────────────────────────────────
   source — מקור הנתונים של ספק האנליטיקה (createProvider(source)). הדמו והחי מממשים אותו; הקוד שמרכיב את
   תגובות החוזה (providerCore) זהה לשניהם, כך שהמסכים אינם יודעים מי המקור.
   ────────────────────────────────────────────────────────────────────────── */
import type { SubjectCode } from '../../../../src/shared/lib/subjects.js'
import type { Lens } from '../../../../src/shared/types/analyticsV2.js'
import type { V2Viewer } from './access.js'
import type { Analysis } from './engine.js'

/* כיסוי הנתונים של הניתוח: מה הוחרג ולמה. השדות האופציונליים — ספק חי בלבד (דמו: חסרים) */
export interface SourceCoverage {
  unclassifiedSessions: number
  detailAvailableFrom: string | null
  /* כיתות בהיקף שלא הוגדרה להן שכבה (לא מופיעות), ושמותיהן (למורה בלבד — המנהל אינו מקבל שמות כיתות) */
  ungradedClasses?: number
  ungradedClassNames?: string[]
  /* כיתות שהטעינה שלהן נכשלה / עדיין נמשכת (שאר הכיתות מוצגות) */
  classesNotLoaded?: number
  classesLoading?: number
  /* כיתות שההרכבה נכשלה על הנתונים שלהן (לא תקלת תשתית) */
  classesDataError?: number
  /* משחקים בהדמיות עם מקצוע שהרמה שלהם לא חושבה (אין רמה, או שחושבה לא לפי המקצוע) */
  playsWithoutLevel?: number
  /* אין קטלוג מאושר (מושגים / טעויות נפוצות): טעויות נפוצות ותחומי תוכן אינם פעילים בחשבון. חסר (דמו) = הקטלוג פעיל */
  catalogEmpty?: boolean
}

/* משחקים של קבוצת תלמידים (כיתה / תלמיד/ה) שלא נכללו — לפי הסיבה: הדמיה בלי מקצוע / אין רמה לפי מקצוע */
export interface ScopedGap { unclassified: number; withoutLevel: number }

export interface AnalyticsSource {
  kind: 'demo' | 'live'
  /** ניתוח מוגדר-היקף לצופה: מורה = כיתותיו; מנהל = כל כיתות בית הספר (ממוזג). אסור שיזרוק על נתונים ריקים. */
  analysis(v: V2Viewer, now?: Date): Promise<Analysis>
  /** מזהי כיתות בהיקף הצופה (כולל כיתות בלי נתונים), בסדר יציב */
  classIds(v: V2Viewer, a: Analysis): string[]
  /** מקצועות הכיתה (גם בלי נתונים) — לטאבים ולמנעולים */
  classSubjects(a: Analysis, classId: string): SubjectCode[]
  configParts(v: V2Viewer): { availableLenses: Lens[]; subjects: SubjectCode[]; dataNotice: string | null; curriculumNotice: string | null }
  /** כיסוי נתונים (חי: סשנים שהוחרגו כי להדמיה אין מקצוע; דמו: אפס) */
  coverage(v: V2Viewer, a: Analysis): SourceCoverage
  /** הפער בהיקף קבוצת תלמידים (מסך כיתה / תלמיד/ה). חסר (דמו) = אין פער */
  scopedGap?(v: V2Viewer, a: Analysis, studentIds: readonly string[]): ScopedGap
  /** רישום צפייה ברמת תלמיד (חי בלבד; דמו: אין) */
  logNamed?(v: V2Viewer, studentIds: string[], scope: string): Promise<void>
}
