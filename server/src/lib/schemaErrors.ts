import { AppError } from '../middleware/errors.js'

/* ── סיווג שגיאות סכמה (קודי Postgres / PostgREST) — מקור יחיד, מיוצא מחדש מ-activeColumn.
   "העמודה / הטבלה חסרה" (לפני מיגרציה) ≠ תקלה זמנית (ניתוק, timeout, 5xx). בבדיקות שמגנות על פרטיות או שמזינות מטמון,
   תקלה זמנית אסור שתיקרא "אין עמודה / אין נתונים": הבקשה נכשלת (503) ולא נשמרת. ── */
const SCHEMA_MISSING_CODES: ReadonlySet<string> = new Set([
  '42703', /* undefined_column */
  '42P01', /* undefined_table */
  'PGRST204', /* עמודה לא נמצאה ב-schema cache */
  'PGRST205', /* טבלה לא נמצאה ב-schema cache */
])

export function isSchemaMissingError(error: { code?: string | null } | null | undefined): boolean {
  return !!error && typeof error.code === 'string' && SCHEMA_MISSING_CODES.has(error.code)
}

/* שגיאת תקלה זמנית בבדיקת סכמה / בטעינה בסיסית — 503 לקליינט (נסו שוב), והפירוט נשמר ב-detail ללוג */
export class ProbeUnavailableError extends AppError {
  constructor(public probe: string, public detail: string) {
    super(503, 'השירות אינו זמין לרגע — נסו שוב בעוד כמה שניות', 'SCHEMA_PROBE_UNAVAILABLE')
    this.name = 'ProbeUnavailableError'
  }
}
