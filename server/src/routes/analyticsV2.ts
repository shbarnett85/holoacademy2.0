/* ──────────────────────────────────────────────────────────────────────────
   /api/analytics-v2 — נקודות הקצה של האנליטיקה החדשה (שלב D). חוזה: src/shared/types/analyticsV2.ts.
   · דגל ANALYTICS_V2: פעיל למורה אורח ולארגונים עם demo_data_enabled בלבד. כל משתמש אחר —
     `config.enabled=false` והלקוח נשאר במסכי האנליטיקה הקיימים; יתר הנקודות מחזירות 403.
   · הספק (הדגמה / אמיתי) נבחר כאן; המסכים אינם יודעים איזה. הרשאות ברמת התוכן נאכפות בספק לפי V2Viewer.
   · במצב לא-פרודקשן כל תגובה מאומתת מול סכמת ה-zod של החוזה (כשל = 500 קולני).
   ────────────────────────────────────────────────────────────────────────── */
import { Router } from 'express'
import type { Request } from 'express'
import { ANALYTICS_CAVEATS } from '../../../src/shared/lib/findingsNarrative.js'
import { isSubjectCode, type SubjectCode } from '../../../src/shared/lib/subjects.js'
import { EP, type Envelope } from '../../../src/shared/types/analyticsV2.js'
import type { V2Viewer } from '../lib/analyticsV2/access.js'
import { demoProvider } from '../lib/analyticsV2/demoProvider.js'
import { resolveV2Viewer } from '../lib/analyticsV2/viewer.js'
import { realProvider, type AnalyticsV2Provider } from '../lib/analyticsV2/provider.js'
import { AppError } from '../middleware/errors.js'
import { requireStaff } from '../middleware/staffAuth.js'

export const analyticsV2Router = Router()
analyticsV2Router.use(requireStaff)

/* kill-switch גלובלי: ANALYTICS_V2=0 (ב-viewer.ts) */
export { resolveV2Viewer }

/* ספק לפי צופה (בהמשך: ספק אמיתי לארגונים אמיתיים). ANALYTICS_V2_PROVIDER=real מכריח ספק אמיתי (בדיקות). */
function providerFor(): AnalyticsV2Provider {
  return process.env.ANALYTICS_V2_PROVIDER === 'real' ? realProvider : demoProvider
}

async function need(req: Request): Promise<V2Viewer> {
  const v = await resolveV2Viewer(req)
  if (!v) throw new AppError(403, 'האנליטיקה החדשה אינה זמינה בחשבון זה')
  return v
}

/* מבני בלבד: שורש הפרויקט והשרת מחזיקים עותקי zod נפרדים (גרסאות משנה שונות) */
interface SchemaLike { safeParse(v: unknown): { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } } }
function validated<T>(schema: SchemaLike, env: Envelope<T>): Envelope<T> {
  if (process.env.NODE_ENV !== 'production' || process.env.ANALYTICS_V2_VALIDATE === '1') {
    const r = schema.safeParse(env)
    if (!r.success) throw new AppError(500, `תגובת אנליטיקה אינה עומדת בחוזה: ${(r.error?.issues ?? []).slice(0, 3).map((i) => `${i.path.map(String).join('.')}: ${i.message}`).join(' | ')}`)
  }
  return env
}

const subjectParam = (raw: string): SubjectCode => {
  if (!isSubjectCode(raw)) throw new AppError(400, 'מקצוע לא מוכר')
  return raw
}

analyticsV2Router.get('/config', async (req, res, next) => {
  try {
    const v = await resolveV2Viewer(req)
    if (!v) {
      res.json({
        dataState: 'ok',
        data: { enabled: false, lens: null, availableLenses: [], subjects: [], classes: [], dataNotice: null, curriculumNotice: null, caveats: ANALYTICS_CAVEATS },
      })
      return
    }
    res.json(validated(EP.config.response, await providerFor().config(v)))
  } catch (e) { next(e) }
})

analyticsV2Router.get('/roster', async (req, res, next) => {
  try { res.json(validated(EP.roster.response, await providerFor().roster(await need(req)))) } catch (e) { next(e) }
})

/* מסך הכניסה "בחרו כיתה": כיתות + עד 3 התרעות (מנהל: מערכים ריקים) */
analyticsV2Router.get('/entry', async (req, res, next) => {
  try { res.json(validated(EP.entry.response, await providerFor().entry(await need(req)))) } catch (e) { next(e) }
})

analyticsV2Router.get('/student/:id', async (req, res, next) => {
  try { res.json(validated(EP.student.response, await providerFor().student(await need(req), req.params.id))) } catch (e) { next(e) }
})

analyticsV2Router.get('/student/:id/feedback', async (req, res, next) => {
  try { res.json(validated(EP.feedback.response, await providerFor().feedback(await need(req), req.params.id))) } catch (e) { next(e) }
})

/* "סקירה" של כיתה — מחנך הכיתה בלבד (מורה מקצועי / מנהל: 403) */
analyticsV2Router.get('/class/:classId/overview', async (req, res, next) => {
  try { res.json(validated(EP.classOverview.response, await providerFor().classOverview(await need(req), req.params.classId))) } catch (e) { next(e) }
})

analyticsV2Router.get('/class/:classId/subject/:subject', async (req, res, next) => {
  try { res.json(validated(EP.classSubject.response, await providerFor().classSubject(await need(req), req.params.classId, subjectParam(req.params.subject)))) } catch (e) { next(e) }
})

analyticsV2Router.get('/admin/overview', async (req, res, next) => {
  try { res.json(validated(EP.admin.response, await providerFor().admin(await need(req)))) } catch (e) { next(e) }
})

analyticsV2Router.get('/briefing/:scope/:id', async (req, res, next) => {
  try {
    const scope = req.params.scope
    if (scope !== 'student' && scope !== 'class') throw new AppError(400, 'היקף לא תקין')
    res.json(validated(EP.briefing.response, await providerFor().briefing(await need(req), scope, req.params.id)))
  } catch (e) { next(e) }
})
