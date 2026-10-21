/* ──────────────────────────────────────────────────────────────────────────
   שגיאות הקריאה לחוזה analyticsV2: קוד הסטטוס נשמר (V2Error), וההודעה למורה היא עברית פשוטה לפי הסטטוס
   (כמו resultsApi.errorMessage) — לא טקסט טכני מהשרת. טהור, בלי DOM ובלי רשת.
   · 403 ו-503: ההודעה של השרת מוצגת כפי שהיא כשהיא בעברית (למשל "אנחנו מרכזים את התוצאות של הכיתה. נסו שוב בעוד דקה.");
   · כל השאר: הודעה קבועה מ-findingsNarrative (טקסט שרת בפרודקשן יכול להיות טכני).
   ────────────────────────────────────────────────────────────────────────── */
import {
  ERR_V2_BAD_REQUEST, ERR_V2_FORBIDDEN, ERR_V2_GENERIC, ERR_V2_NOT_FOUND, ERR_V2_RATE_LIMIT, ERR_V2_UNAUTHORIZED, ERR_V2_UNAVAILABLE,
} from '../../shared/lib/findingsNarrative'

export class V2Error extends Error {
  /** קוד HTTP; 0 = אין חיבור לשרת */
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'V2Error'
    this.status = status
  }
}

const HEBREW = /[א-ת]/

/** ההודעה למורה לפי סטטוס (message = גוף השגיאה מהשרת, אם היה) */
export function v2ErrorMessage(status: number, message = ''): string {
  const serverText = HEBREW.test(message) ? message : ''
  if (status === 400) return ERR_V2_BAD_REQUEST
  if (status === 401) return ERR_V2_UNAUTHORIZED
  if (status === 403) return serverText || ERR_V2_FORBIDDEN
  if (status === 404) return ERR_V2_NOT_FOUND
  if (status === 429) return ERR_V2_RATE_LIMIT
  if (status === 503) return serverText || ERR_V2_UNAVAILABLE
  return ERR_V2_GENERIC
}

/** האם "נסו שוב" הגיוני: תקלה זמנית / עומס / אין חיבור. הרשאה, "לא נמצא" ובקשה לא תקינה — לא יתקנו את עצמן. */
export function isRetryable(status: number): boolean {
  return !(status === 400 || status === 401 || status === 403 || status === 404)
}

export const toV2Error = (e: unknown): V2Error => (e instanceof V2Error ? e : new V2Error(0, ''))
