/* ──────────────────────────────────────────────────────────────────────────
   /api/analytics-v2 — נקודות הקצה של האנליטיקה החדשה (שלב D). חוזה: src/shared/types/analyticsV2.ts.
   · דגל ANALYTICS_V2: פעיל למורה אורח ולארגונים עם demo_data_enabled בלבד. כל משתמש אחר —
     `config.enabled=false` והלקוח נשאר במסכי האנליטיקה הקיימים; יתר הנקודות מחזירות 403.
   · הספק (הדגמה / אמיתי) נבחר כאן; המסכים אינם יודעים איזה. הרשאות ברמת התוכן נאכפות בספק לפי V2Viewer.
   · במצב לא-פרודקשן כל תגובה מאומתת מול סכמת ה-zod של החוזה (כשל = 500 קולני).
   ────────────────────────────────────────────────────────────────────────── */
import { Router } from 'express'
import type { Request } from 'express'
import { CAVEAT_AGE_NORM, CAVEAT_CROSS_SUBJECT, CAVEAT_TREND } from '../../../src/shared/lib/findingsNarrative.js'
import { isSubjectCode, type SubjectCode } from '../../../src/shared/lib/subjects.js'
import { EP, QuerySchema, type Envelope } from '../../../src/shared/types/analyticsV2.js'
import { loadViewer } from '../lib/authz.js'
import { DEMO_HOMEROOM_CLASS, DEMO_SUBJECT_PERSONAS, type V2Viewer } from '../lib/analyticsV2/access.js'
import { demoProvider, demoViewerClasses } from '../lib/analyticsV2/demoProvider.js'
import { realProvider, type AnalyticsV2Provider } from '../lib/analyticsV2/provider.js'
import { subjectById } from '../lib/subjects.js'
import { AppError } from '../middleware/errors.js'
import { isDemoGuest, requireStaff } from '../middleware/staffAuth.js'

export const analyticsV2Router = Router()
analyticsV2Router.use(requireStaff)

/* kill-switch גלובלי: ANALYTICS_V2=0 */
const flagOn = (): boolean => process.env.ANALYTICS_V2 !== '0'

/* גזירת הצופה: מורה אורח — מבורר העדשה; ארגון הדגמה — מהתפקיד האמיתי; אחרת null (הדגל כבוי) */
export async function resolveV2Viewer(req: Request): Promise<V2Viewer | null> {
  if (!flagOn()) return null
  const q = QuerySchema.safeParse(req.query)
  const query = q.success ? q.data : {}

  if (isDemoGuest(req)) {
    const lens = query.lens ?? 'homeroom'
    if (lens === 'admin') return { lens, guest: true, homeroomClassId: null, teachingClassIds: [], subjectCodes: [] }
    if (lens === 'homeroom') return { lens, guest: true, homeroomClassId: DEMO_HOMEROOM_CLASS, teachingClassIds: [], subjectCodes: [] }
    const subject: SubjectCode = query.subject && DEMO_SUBJECT_PERSONAS.includes(query.subject as SubjectCode) ? (query.subject as SubjectCode) : 'math'
    return { lens, guest: true, homeroomClassId: null, teachingClassIds: demoViewerClasses([subject]), subjectCodes: [subject] }
  }

  const viewer = await loadViewer(req)
  if (!viewer.seesSynthetic) return null
  if (viewer.role === 'admin' || viewer.role === 'municipal_admin') return { lens: 'admin', guest: false, homeroomClassId: null, teachingClassIds: [], subjectCodes: [] }
  if (viewer.role !== 'teacher') return null
  const homeroom = [...viewer.grants.values()].some((g) => g.homeroom)
  if (homeroom) return { lens: 'homeroom', guest: false, homeroomClassId: DEMO_HOMEROOM_CLASS, teachingClassIds: [], subjectCodes: [] }
  const codes: SubjectCode[] = []
  for (const g of viewer.grants.values()) for (const sid of g.subjectIds) {
    const row = await subjectById(sid)
    if (row && isSubjectCode(row.code) && !codes.includes(row.code)) codes.push(row.code)
  }
  const subjectCodes = codes.length ? codes : ['math' as SubjectCode]
  return { lens: 'subject_teacher', guest: false, homeroomClassId: null, teachingClassIds: demoViewerClasses(subjectCodes), subjectCodes }
}

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
        data: { enabled: false, lens: null, availableLenses: [], subjects: [], classes: [], dataNotice: null, curriculumNotice: null, caveats: { ageNorm: CAVEAT_AGE_NORM, crossSubject: CAVEAT_CROSS_SUBJECT, trend: CAVEAT_TREND } },
      })
      return
    }
    res.json(validated(EP.config.response, await providerFor().config(v)))
  } catch (e) { next(e) }
})

analyticsV2Router.get('/roster', async (req, res, next) => {
  try { res.json(validated(EP.roster.response, await providerFor().roster(await need(req)))) } catch (e) { next(e) }
})

analyticsV2Router.get('/student/:id', async (req, res, next) => {
  try { res.json(validated(EP.student.response, await providerFor().student(await need(req), req.params.id))) } catch (e) { next(e) }
})

analyticsV2Router.get('/student/:id/feedback', async (req, res, next) => {
  try { res.json(validated(EP.feedback.response, await providerFor().feedback(await need(req), req.params.id))) } catch (e) { next(e) }
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
