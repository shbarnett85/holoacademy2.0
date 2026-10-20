/* ──────────────────────────────────────────────────────────────────────────
   טיפוסים משותפים לתשתית ביקורת ה-UX (Playwright + axe). ראו docs/ux-audit.md.
   ────────────────────────────────────────────────────────────────────────── */

/* מי צופה במסך. guest-* = מורה אורח (חשבון הדגמה) עם בורר עדשה; real-* = מורה אמיתי מה-fixture. */
export type Who =
  | 'guest-homeroom'
  | 'guest-subject-math'
  | 'guest-subject-hebrew'
  | 'guest-admin'
  | 'real-homeroom'
  | 'real-subject'
  | 'real-unlinked'
  | 'real-admin'

export const ALL_WHO: readonly Who[] = [
  'guest-homeroom', 'guest-subject-math', 'guest-subject-hebrew', 'guest-admin',
  'real-homeroom', 'real-subject', 'real-unlinked', 'real-admin',
]

export const isGuestWho = (w: Who): boolean => w.startsWith('guest-')
export const isRealWho = (w: Who): boolean => w.startsWith('real-')

/* איתור אלמנט: מחרוזת = CSS / text=… / role=… (תחביר locator של Playwright); או אובייקט */
export type Target =
  | string
  | { text: string; exact?: boolean }
  | { role: string; name?: string; exact?: boolean }

/* צעדי ניווט אחרי טעינת ה-URL. כל צעד click נספר כ"לחיצה" למדד clicks-from-main-tab. */
export type Step =
  | { click: Target; optional?: boolean }
  | { fill: Target; value: string }
  | { waitFor: Target; timeoutMs?: number; optional?: boolean }
  | { wait: number }
  | { press: string }

export type Group = 'results' | 'analytics' | 'admin' | 'existing'

export interface Scenario {
  /* שם ייחודי וקצר (אותיות לטיניות/מספרים/מקפים) — משמש לשם קובץ וסינון --only */
  name: string
  group: Group
  /* מי צופה. מערך = אותו מסך לכל אחד מהם (השם המורחב: <name>.<who>) */
  who: Who | Who[]
  /* כתובת יחסית ל-base. תומך ב-{placeholders} שמתגלים בזמן ריצה (ראו discover.ts):
     {submissionId} {resultsStudentId} {resultsAttentionStudentId} {classId} {studentId} {subject} {subjectName} */
  url: string
  steps?: Step[]
  /* אלמנט שנחשב "המסך מוכן". לא נמצא בזמן → "route/element missing" (לא קריסה) */
  ready?: Target
  /* עמוד פנימי (לא טאב ראשי): נדרש breadcrumb גלוי */
  inner?: boolean
  /* כמה לחיצות מהטאב הראשי של האזור (/results, /analytics) עד המסך. אם חסר — נספרים צעדי ה-click */
  clicksFromMainTab?: number
  note?: string
}

/* ── תוצאות ── */
export interface AxeViolationSummary {
  id: string
  impact: string
  help: string
  helpUrl: string
  nodes: number
  targets: string[]
}
export interface AxeSummary {
  critical: number
  serious: number
  moderate: number
  minor: number
  incomplete: number
  violations: AxeViolationSummary[]
  error?: string
}

export interface ForbiddenHit { word: string; match: string; context: string }

export interface ElementExample { selector: string; text: string; w?: number; h?: number; size?: number; note?: string }

export interface LayoutMetrics {
  innerWidth: number
  innerHeight: number
  scrollHeight: number
  scrollWidth: number
  fitsOneScreen: boolean
  /* כמה פיקסלים התוכן חורג מעבר לגובה החלון (0 אם נכנס) */
  overflowPx: number
  horizontalOverflow: boolean
  /* האלמנטים שמגיעים הכי נמוך (כשיש גלילה) */
  overflowers: ElementExample[]
  /* אזורי גלילה פנימיים (overflow-y: auto/scroll עם תוכן חורג) */
  innerScrollers: { selector: string; overflowPx: number }[]
  /* הגדול מבין חריגת המסמך לחריגת אזור פנימי */
  tallestOverflowPx: number
  smallTargets: { count: number; total: number; inlineExcluded: number; examples: ElementExample[] }
  fonts: { min: number | null; below14: number; below16: number; textElements: number; examples: ElementExample[] }
  hoverOnly: { controls: number; info: number; examples: ElementExample[] }
  /* אלמנטים שלוחצים עליהם (cursor:pointer) בלי תפקיד סמנטי — לא כפתור/קישור */
  clickableNonSemantic: { count: number; examples: ElementExample[] }
  breadcrumb: { present: boolean; via: 'attr' | 'heuristic' | null; text: string | null }
  headings: { h1: number; firstH1: string | null }
}

export type ScreenStatus = 'ok' | 'missing' | 'skipped' | 'error'

export interface ScreenResult {
  id: string
  name: string
  who: Who
  group: Group
  viewport: string
  theme: 'light' | 'dark'
  requestedUrl: string
  finalUrl: string | null
  status: ScreenStatus
  statusDetail: string | null
  inner: boolean
  clicksFromMainTab: number | null
  screenshot: string | null
  axe: AxeSummary | null
  forbidden: ForbiddenHit[]
  layout: LayoutMetrics | null
  consoleErrors: { count: number; samples: string[] }
  /* בקשות שנכשלו (HTTP ≥400 או שגיאת רשת) — כולל /api */
  failedRequests: { count: number; samples: string[] }
  loadMs: number | null
  /* גורמי כישלון קשיחים (axe חמור/קריטי, מילים אסורות, שגיאת הרצה) ו-strict (פריסה/מטרות/גופן…) */
  hardFailures: string[]
  strictFailures: string[]
  note: string | null
  /* כמה פעמים הרצנו (>1 = ניסיון חוזר אחרי ניווט/דף ריק רגעי) */
  attempts: number
}

/* הצהרה על משתני-גילוי של who אחד */
export type Vars = Record<string, string | undefined>

export class SkipError extends Error {
  constructor(message: string) { super(message); this.name = 'SkipError' }
}
export class MissingError extends Error {
  constructor(message: string) { super(message); this.name = 'MissingError' }
}
