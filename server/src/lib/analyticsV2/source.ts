/* ──────────────────────────────────────────────────────────────────────────
   source — מקור הנתונים של ספק האנליטיקה (createProvider(source)). הדמו והחי מממשים אותו; הקוד שמרכיב את
   תגובות החוזה (providerCore) זהה לשניהם, כך שהמסכים אינם יודעים מי המקור.
   ────────────────────────────────────────────────────────────────────────── */
import type { SubjectCode } from '../../../../src/shared/lib/subjects.js'
import type { Lens } from '../../../../src/shared/types/analyticsV2.js'
import type { V2Viewer } from './access.js'
import type { Analysis } from './engine.js'

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
  coverage(v: V2Viewer, a: Analysis): { unclassifiedSessions: number; detailAvailableFrom: string | null }
  /** רישום צפייה ברמת תלמיד (חי בלבד; דמו: אין) */
  logNamed?(v: V2Viewer, studentIds: string[], scope: string): Promise<void>
}
