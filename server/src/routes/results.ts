/* ──────────────────────────────────────────────────────────────────────────
   /api/results — טאב "תוצאות". חוזה: src/shared/types/resultsV1.ts (RESULTS_EP). GET בלבד.
   · הספק נבחר כאן: מורה אורח → ספק ההדגמה; כל השאר → הספק האמיתי. ההרשאות נאכפות בתוך הספק (authz).
   · לא מאחורי ANALYTICS_V2 — פעיל לכל המורים.
   · בסביבה שאינה פרודקשן כל תגובה מאומתת מול סכמת החוזה (500 קולני על חריגה).
   · הגבלת קצב: פר-IP (נדיבה, לפני האימות — בתי ספר חולקים IP) ופר-משתמש מחובר (אחרי האימות). הנקודות כבדות (טעינת כל נתוני הכיתה).
   ────────────────────────────────────────────────────────────────────────── */
import { Router } from 'express'
import type { Request } from 'express'
import { RESULTS_EP, SetDueRequestSchema } from '../../../src/shared/types/resultsV1.js'
import { ERR_DUE_INVALID } from '../../../src/shared/lib/findingsNarrative.js'
import { demoResultsProvider } from '../lib/results/demoResults.js'
import type { ResultsProvider } from '../lib/results/provider.js'
import { realResultsProvider } from '../lib/results/realResults.js'
import { AppError } from '../middleware/errors.js'
import { rateLimitByIp, rateLimitByUser } from '../middleware/rateLimit.js'
import { isDemoGuest, requireStaff } from '../middleware/staffAuth.js'

/* תקרות לדקה. מסך תוצאות רגיל = בקשה אחת למסך; מעבר בין תלמידים בכיתה של 35 = כ-35 בקשות. */
export const RESULTS_RATE = { perIp: 600, perUser: 120 } as const

export const resultsRouter = Router()
resultsRouter.use(rateLimitByIp('results', RESULTS_RATE.perIp))
resultsRouter.use(requireStaff)
resultsRouter.use(rateLimitByUser('results', RESULTS_RATE.perUser))

const providerFor = (req: Request): ResultsProvider => (isDemoGuest(req) ? demoResultsProvider : realResultsProvider)

/* מבני בלבד: שורש הפרויקט והשרת מחזיקים עותקי zod נפרדים (גרסאות משנה שונות) */
interface SchemaLike { safeParse(v: unknown): { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } } }
function validated<T>(schema: SchemaLike, data: T): { data: T } {
  const env = { data }
  if (process.env.NODE_ENV !== 'production' || process.env.RESULTS_VALIDATE === '1') {
    const r = schema.safeParse(env)
    if (!r.success) {
      const detail = (r.error?.issues ?? []).slice(0, 3).map((i) => `${i.path.map(String).join('.')}: ${i.message}`).join(' | ')
      throw new AppError(500, `results response violates contract: ${detail}`)
    }
  }
  return env
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined)

resultsRouter.get('/submissions', async (req, res, next) => {
  try {
    const view = str(req.query.view)
    const list = await providerFor(req).list(req, {
      classId: str(req.query.classId), subject: str(req.query.subject), q: str(req.query.q),
      view: view === 'class' ? 'class' : 'mine', older: str(req.query.older) === '1',
    })
    res.json(validated(RESULTS_EP.list.response, list))
  } catch (e) { next(e) }
})

/* מנהל/ת: טבלה כללית אחת, שכבה × מקצוע (מורים — 403). חייב לבוא לפני /submission/:id */
resultsRouter.get('/overview', async (req, res, next) => {
  try {
    res.json(validated(RESULTS_EP.overview.response, await providerFor(req).overview(req)))
  } catch (e) { next(e) }
})

/* "תצוגה חיה" של שיעור — הקליינט מרענן כל LIVE_RULES.refreshMs */
resultsRouter.get('/submission/:id/live', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'private, no-store')
    res.json(validated(RESULTS_EP.live.response, await providerFor(req).live(req, req.params.id)))
  } catch (e) { next(e) }
})

resultsRouter.get('/submission/:id', async (req, res, next) => {
  try {
    res.json(validated(RESULTS_EP.classView.response, await providerFor(req).classView(req, req.params.id)))
  } catch (e) { next(e) }
})

/* שינוי מועד הגשה — הכתיבה היחידה בנתיב הזה. הגוף מאומת בחוזה (SetDueRequestSchema); מורה אורח נחסם בספק ההדגמה (403) */
resultsRouter.patch('/submission/:id/due', async (req, res, next) => {
  try {
    const parsed = SetDueRequestSchema.safeParse(req.body)
    if (!parsed.success) throw new AppError(400, ERR_DUE_INVALID)
    res.json(validated(RESULTS_EP.setDue.response, await providerFor(req).setDue(req, req.params.id, parsed.data.dueDay)))
  } catch (e) { next(e) }
})

resultsRouter.get('/submission/:id/student/:studentId', async (req, res, next) => {
  try {
    res.json(validated(RESULTS_EP.studentView.response, await providerFor(req).studentView(req, req.params.id, req.params.studentId)))
  } catch (e) { next(e) }
})
