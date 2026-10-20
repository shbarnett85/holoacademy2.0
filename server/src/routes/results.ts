/* ──────────────────────────────────────────────────────────────────────────
   /api/results — טאב "תוצאות". חוזה: src/shared/types/resultsV1.ts (RESULTS_EP). GET בלבד.
   · הספק נבחר כאן: מורה אורח → ספק ההדגמה; כל השאר → הספק האמיתי. ההרשאות נאכפות בתוך הספק (authz).
   · לא מאחורי ANALYTICS_V2 — פעיל לכל המורים.
   · בסביבה שאינה פרודקשן כל תגובה מאומתת מול סכמת החוזה (500 קולני על חריגה).
   ────────────────────────────────────────────────────────────────────────── */
import { Router } from 'express'
import type { Request } from 'express'
import { RESULTS_EP } from '../../../src/shared/types/resultsV1.js'
import { demoResultsProvider } from '../lib/results/demoResults.js'
import type { ResultsProvider } from '../lib/results/provider.js'
import { realResultsProvider } from '../lib/results/realResults.js'
import { AppError } from '../middleware/errors.js'
import { isDemoGuest, requireStaff } from '../middleware/staffAuth.js'

export const resultsRouter = Router()
resultsRouter.use(requireStaff)

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
    const list = await providerFor(req).list(req, { classId: str(req.query.classId), subject: str(req.query.subject), q: str(req.query.q) })
    res.json(validated(RESULTS_EP.list.response, list))
  } catch (e) { next(e) }
})

resultsRouter.get('/submission/:id', async (req, res, next) => {
  try {
    res.json(validated(RESULTS_EP.classView.response, await providerFor(req).classView(req, req.params.id)))
  } catch (e) { next(e) }
})

resultsRouter.get('/submission/:id/student/:studentId', async (req, res, next) => {
  try {
    res.json(validated(RESULTS_EP.studentView.response, await providerFor(req).studentView(req, req.params.id, req.params.studentId)))
  } catch (e) { next(e) }
})
