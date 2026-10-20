/* ──────────────────────────────────────────────────────────────────────────
   access — כללי ההרשאה של האנליטיקה החדשה לפי עדשה (חוק 12 — מודול הרשאות מרכזי, פונקציות טהורות).
   · מחנך: כל מקצועות תלמידי כיתתו, כולל התרעות חוצות-מקצועות.
   · מורה מקצועי: רק תלמידי הכיתות שהוא מלמד, ורק המקצוע שלו. שאר המקצועות — אפור (שם בלבד).
   · מנהל: אגרגטים בלבד. אין שם/מזהה תלמיד בשום תגובה, תא < MIN_CELL_SIZE מוסתר, אין דירוג מורים.
   ה-V2Viewer נגזר בשרת (מורה אורח: מבורר העדשה; ארגון הדגמה: מהתפקיד האמיתי) ולעולם לא מהלקוח ישירות.
   ────────────────────────────────────────────────────────────────────────── */
import type { SubjectCode } from '../../../../src/shared/lib/subjects.js'
import type { Lens } from '../../../../src/shared/types/analyticsV2.js'
import { ERR_AGGREGATE_ONLY } from '../../../../src/shared/lib/findingsNarrative.js'
import { MIN_CELL_SIZE } from '../authz.js'
import { AppError } from '../../middleware/errors.js'

export interface V2Viewer {
  lens: Lens
  /* האם נגזר מבורר העדשה (מורה אורח) */
  guest: boolean
  homeroomClassId: string | null
  teachingClassIds: string[]
  subjectCodes: SubjectCode[]
}

export const canSeeStudentLevel = (v: V2Viewer): boolean => v.lens !== 'admin'

export function canViewStudent(v: V2Viewer, studentClassId: string): boolean {
  if (v.lens === 'admin') return false
  if (v.lens === 'homeroom') return v.homeroomClassId === studentClassId
  return v.teachingClassIds.includes(studentClassId)
}

/* האם המקצוע של התלמיד גלוי לצופה (אחרת: אפור) */
export function canViewSubject(v: V2Viewer, subject: SubjectCode): boolean {
  if (v.lens === 'admin') return false
  if (v.lens === 'homeroom') return true
  return v.subjectCodes.includes(subject)
}

export function canViewClassSubject(v: V2Viewer, classId: string, subject: SubjectCode): boolean {
  if (v.lens === 'admin') return false
  if (v.lens === 'homeroom') return v.homeroomClassId === classId
  return v.teachingClassIds.includes(classId) && v.subjectCodes.includes(subject)
}

export const canSeeCrossSubject = (v: V2Viewer): boolean => v.lens === 'homeroom'

/* "סקירה" של כיתה (כל המקצועות זה לצד זה) — מחנך הכיתה בלבד. מורה מקצועי ומנהל: אין גישה. */
export const canViewClassOverview = (v: V2Viewer, classId: string): boolean => v.lens === 'homeroom' && v.homeroomClassId === classId

/* תא אגרגט מוצג רק אם ≥ MIN_CELL_SIZE תלמידים */
export const cellVisible = (n: number): boolean => n >= MIN_CELL_SIZE

export function requireNotAdmin(v: V2Viewer): void {
  if (v.lens === 'admin') throw new AppError(403, ERR_AGGREGATE_ONLY)
}

/* פרסונות ההדגמה: מורה מקצועי אורח בוחר מקצוע; מלמד בכל הכיתות שיש בהן את המקצוע */
export const DEMO_SUBJECT_PERSONAS: SubjectCode[] = ['math', 'hebrew', 'history', 'science', 'english', 'bible']
export const DEMO_HOMEROOM_CLASS = 'c-v2'
