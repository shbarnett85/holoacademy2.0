/* ──────────────────────────────────────────────────────────────────────────
   /api/ai-summary — סיכום מילולי של ד״ר הולו. חוזה: src/shared/types/aiSummaryV1.ts (AI_SUMMARY_EP).
   · GET ?scope=&id=[&subject=]   — הסיכום השמור של הצופה (אם יש) + זכאות. **זול**: הרשאה + סבב DB אחד (המטמון); זכאות והתיישנות רק כשהחוזה כבר בזיכרון הבקשה
     (תלמיד/כיתה/מקצוע ב-v2). הגשה אמיתית: אין טעינה כבדה ב-GET — הזכאות נבדקת ב-POST. יומן גישה ב-GET רק כשחוזר טקסט שמור על תלמיד.
   · POST {scope,id[,subject],regenerate?,discardEdit?} — יצירה / כתיבה מחדש. אורח וארגון הדגמה: תבנית בלי LLM ובלי שמירה.
     כתיבה מחדש על סיכום שהמורה ערך דורשת discardEdit:true (אישור מפורש), אחרת 409.
   · PATCH /:summaryId {editedText|null} — עריכת המורה (אישית לצופה); null = חזרה לטקסט המקורי.
   · **החיבור לספקים נעשה בהזרקה** (AiSummaryRouteDeps): authorize (הרשאה לפי חוקים 8/9/10, מחזירה audienceKey ו-demo) ו-load*Facts (חוזה v2/תוצאות לפי היקף).
     ה-deps האמיתיות נבנות ב-lib/aiSummary/deps.ts (createAiSummaryDeps) ומורכבות ב-index.ts; בלי deps (ברירת מחדל) כל הנקודות עונות 503 "לא מחובר".
     הנתיב עצמו אינו מייבא ספק v2/תוצאות.
   · requireStaff; הגבלת קצב: פר-IP נדיב, פר-משתמש 120/דק׳ לקריאה/עריכה, ו-6/דק׳ ליצירה (POST). תקרה יומית וקירור לכתיבה מחדש — בשירות.
   · יומן גישה (data_access_log): תלמיד — ברמת תלמיד, **ממתינים לכתיבה לפני שמחזירים נתונים** (נכשל-סגור למנהל-על); כיתה/הגשה — שורה בלי תלמיד.
   · Cache-Control: private, no-store על כל התגובות (סיכום על ילד לא נשמר במטמון דפדפן/proxy משותף).
   · בסביבה שאינה פרודקשן כל תגובה מאומתת מול סכמת החוזה (500 קולני על חריגה).
   ────────────────────────────────────────────────────────────────────────── */
import { Router } from 'express'
import type { Request } from 'express'
import {
  ERR_SUMMARY_BAD_REQUEST, ERR_SUMMARY_DEMO_EDIT, ERR_SUMMARY_NOT_CONNECTED, ERR_SUMMARY_NOT_FOUND,
} from '../../../src/shared/lib/findingsNarrative.js'
import {
  AI_SUMMARY_EP, EditSummaryRequestSchema, GenerateSummaryRequestSchema, SummaryTargetSchema, type SummaryTarget,
} from '../../../src/shared/types/aiSummaryV1.js'
import type { ClassOverview, ClassSubjectView, StudentOverview } from '../../../src/shared/types/analyticsV2.js'
import type { ClassSubmissionView } from '../../../src/shared/types/resultsV1.js'
import type { ClassDataCounts, Gender, SummarySource } from '../lib/aiSummary/inputs.js'
import { createRealLlm } from '../lib/aiSummary/llm.js'
import { createSummaryService, type SummaryRequest, type SummaryService } from '../lib/aiSummary/service.js'
import { createSupabaseStore } from '../lib/aiSummary/store.js'
import { loadViewer, logAccess } from '../lib/authz.js'
import { info } from '../lib/log.js'
import { AppError } from '../middleware/errors.js'
import { rateLimitByIp, rateLimitByUser } from '../middleware/rateLimit.js'
import { isDemoGuest, requireStaff } from '../middleware/staffAuth.js'

/* תקרות לדקה. perIp הוא רצפת הגנה לפני אימות, משותפת לכל מי שמאחורי אותה כתובת (בית ספר שלם מאחורי NAT) — ראו ANALYTICS_V2_RATE.
   האורח מוגבל בנפרד לפי IP (rateLimitByUser) בלי לשחוק את המונה הזה */
export const SUMMARY_RATE = { perIp: 1200, readPerUser: 120, generatePerUser: 6 } as const

/* תוצאת ההרשאה (מוכרעת בחוץ, ע"י ספק v2/תוצאות): האם הצופה בהדגמה, ו"קהל" הסיכום — חלק ממפתח השמירה.
   audienceKey: 'full' (מחנך / מנהל-על) או 'subj:<קודי מקצוע ממוינים>' (מורה מקצועי). */
export interface SummaryAuthorization {
  demo: boolean
  audienceKey: string
  /* true כשהחוזה כבר נטען בבקשה הזו (אחרי הרשאה) או בלי DB (הדגמה): מותר לחשב ב-GET זכאות והתיישנות. הגשה אמיתית: false (הטעינה כבדה) */
  cheap?: boolean
}

/* הקשר שהנתיב מעביר ל-callbacks: הבקשה, היעד המאומת (zod), ותוצאת ההרשאה (אחרי authorize) */
export interface SummaryCtx { req: Request; target: SummaryTarget }
export interface SummaryLoadCtx extends SummaryCtx {
  authz: SummaryAuthorization
  /* טעינה "קלה": בלי קריאות DB נוספות (למשל מגדר) — לחישוב חותמת הנתונים בלבד */
  lite?: boolean
}

export interface StudentFacts { overview: StudentOverview; /* users.gender, או null כשלא הוגדר */ gender: Gender }
/* סקירת כיתה + כמה תלמידים יש עליהם נתוני רמה (בסך הכול ולפי מקצוע) — גודל המדגם של סיכום הכיתה */
export interface ClassFacts { overview: ClassOverview; withData: ClassDataCounts }

export interface AiSummaryRouteDeps {
  /* זורק AppError(403/404) כשאין גישה (חוקים 8/9/10: מנהל לא מקבל סיכום תלמיד/הגשה; סיכום כיתה למחנך בלבד; מורה מקצועי — מקצועו).
     נקרא לפני כל טעינת נתונים / יומן / LLM. */
  authorize(ctx: SummaryCtx): Promise<SummaryAuthorization>
  /* טוענים את חוזה הנתונים של ההיקף (נקראים רק אחרי authorize, ורק כשצריך): */
  loadStudentFacts(ctx: SummaryLoadCtx): Promise<StudentFacts>
  loadClassFacts(ctx: SummaryLoadCtx): Promise<ClassFacts>
  loadSubmissionFacts(ctx: SummaryLoadCtx): Promise<ClassSubmissionView>
  /* אופציונלי (שלב ג׳): מקצוע בכיתה. חסר → class_subject עונה 503 "לא מחובר" */
  loadClassSubjectFacts?(ctx: SummaryLoadCtx): Promise<ClassSubjectView>
  /* יומן גישה. ברירת מחדל: data_access_log דרך authz (שורה ברמת תלמיד / שורה בלי תלמיד). חייב להתממש כ-await ולהיכשל סגור למנהל-על */
  logAccess?(ctx: SummaryLoadCtx): Promise<void>
}

const notConnected = async (): Promise<never> => { throw new AppError(503, ERR_SUMMARY_NOT_CONNECTED) }
export const NOT_CONNECTED_DEPS: AiSummaryRouteDeps = { authorize: notConnected, loadStudentFacts: notConnected, loadClassFacts: notConnected, loadSubmissionFacts: notConnected }

/* מדיניות כשל היומן ברמת תלמיד: כמו בנתיבי v2 — נכשל-סגור למנהל-על, מורה best-effort; ANALYTICS_V2_AUDIT_FAIL_CLOSED=all מרחיב לכל התפקידים */
const auditPolicy = (): 'all' | undefined => (process.env.ANALYTICS_V2_AUDIT_FAIL_CLOSED === 'all' ? 'all' : undefined)

/* ברירת המחדל ליומן: ברמת תלמיד לתלמיד (ממתינים לכתיבה; נכשל-סגור לפי המדיניות), שורה בלי תלמיד לכיתה/הגשה. הדגמה — לא נרשם (אין DB) */
async function defaultLogAccess({ req, target, authz }: SummaryLoadCtx): Promise<void> {
  if (authz.demo) return
  const viewer = await loadViewer(req)
  if (target.scope === 'student') {
    const failClosed = auditPolicy()
    await logAccess(viewer, { studentId: target.id, scope: 'ai_summary_student', endpoint: 'ai-summary' }, { studentLevel: true, ...(failClosed ? { failClosed } : {}) })
    return
  }
  await logAccess(viewer, { studentId: null, scope: target.scope === 'submission' ? 'ai_summary_submission' : 'ai_summary_class', endpoint: 'ai-summary' })
}

/* מבני בלבד: שורש הפרויקט והשרת מחזיקים עותקי zod נפרדים (גרסאות משנה שונות) */
interface SchemaLike { safeParse(v: unknown): { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } } }
function validated<T>(schema: SchemaLike, data: T): T {
  if (process.env.NODE_ENV !== 'production' || process.env.AI_SUMMARY_VALIDATE === '1') {
    const r = schema.safeParse(data)
    if (!r.success) {
      const detail = (r.error?.issues ?? []).slice(0, 3).map((i) => `${i.path.map(String).join('.')}: ${i.message}`).join(' | ')
      throw new AppError(500, `ai-summary response violates contract: ${detail}`)
    }
  }
  return data
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined)
const SUMMARY_ID = /^[0-9a-f][0-9a-f-]{7,63}$/i

function parseTarget(q: Request['query']): SummaryTarget {
  const scope = str(q.scope)
  const subject = str(q.subject)
  /* subject משמש גם את בורר העדשה של האורח; כיעד הוא רלוונטי רק ל-class_subject */
  const r = SummaryTargetSchema.safeParse({ scope, id: str(q.id), ...(scope === 'class_subject' && subject ? { subject } : {}) })
  if (!r.success) throw new AppError(400, ERR_SUMMARY_BAD_REQUEST)
  return r.data
}

export function registerAiSummaryRoutes(deps: AiSummaryRouteDeps = NOT_CONNECTED_DEPS, opts: { service?: SummaryService } = {}): Router {
  const router = Router()
  let lazyService: SummaryService | null = null
  const service = (): SummaryService => opts.service ?? (lazyService ??= createSummaryService({ llm: createRealLlm(), store: createSupabaseStore(), log: info }))
  const doLogAccess = deps.logAccess ?? defaultLogAccess

  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next() })
  router.use(rateLimitByIp('ai-summary', SUMMARY_RATE.perIp))
  router.use(requireStaff)
  router.use(rateLimitByUser('ai-summary', SUMMARY_RATE.readPerUser))
  const generateLimit = rateLimitByUser('ai-summary-generate', SUMMARY_RATE.generatePerUser)
  router.use((req, res, next) => (req.method === 'POST' ? generateLimit(req, res, next) : next()))

  /* טעינת מקור הנתונים לפי ההיקף — מהחוזה שהספק המוזרק מחזיר */
  async function loadSource(ctx: SummaryLoadCtx): Promise<SummarySource> {
    switch (ctx.target.scope) {
      case 'student': { const f = await deps.loadStudentFacts(ctx); return { scope: 'student', overview: f.overview, gender: f.gender } }
      case 'class': { const f = await deps.loadClassFacts(ctx); return { scope: 'class', overview: f.overview, withData: f.withData } }
      case 'class_subject':
        if (!deps.loadClassSubjectFacts) throw new AppError(503, ERR_SUMMARY_NOT_CONNECTED)
        return { scope: 'class_subject', view: await deps.loadClassSubjectFacts(ctx) }
      case 'submission': return { scope: 'submission', view: await deps.loadSubmissionFacts(ctx) }
    }
  }

  /* הרשאה + הקשר לשירות. אורח הוא תמיד הדגמה, בלי קשר למה שה-deps החזיר.
     היומן נכתב כאן (לפני כל טעינה/LLM) רק כשביקשו — POST/PATCH. ב-GET הוא נכתב אחרי שהתברר שחוזר טקסט שמור על תלמיד (ראו למטה) */
  async function context(req: Request, target: SummaryTarget, o: { log: boolean }): Promise<{ sreq: SummaryRequest; lctx: SummaryLoadCtx }> {
    const authz = await deps.authorize({ req, target })
    const demo = authz.demo || isDemoGuest(req)
    const lctx: SummaryLoadCtx = { req, target, authz: { ...authz, demo } }
    if (o.log) await doLogAccess(lctx)
    return {
      lctx,
      sreq: {
        viewer: { userId: (req.staff as { userId: string }).userId, demo }, target, audienceKey: authz.audienceKey,
        load: (opts) => loadSource(opts?.lite ? { ...lctx, lite: true } : lctx),
        cheapLoad: authz.cheap === true,
      },
    }
  }

  router.get('/', async (req, res, next) => {
    try {
      const target = parseTarget(req.query)
      const { sreq, lctx } = await context(req, target, { log: false })
      const state = await service().get(sreq)
      /* יומן: רק כשחוזר טקסט שמור על תלמיד (נתון ברמת תלמיד). כניסה ללשונית בלי סיכום שמור אינה נרשמת. ממתינים לכתיבה לפני שמחזירים (נכשל-סגור לפי המדיניות) */
      if (state.data.summary !== null && target.scope === 'student') await doLogAccess(lctx)
      res.json(validated(AI_SUMMARY_EP.get.response, state))
    } catch (e) { next(e) }
  })

  router.post('/', async (req, res, next) => {
    try {
      const parsed = GenerateSummaryRequestSchema.safeParse(req.body)
      if (!parsed.success) throw new AppError(400, ERR_SUMMARY_BAD_REQUEST)
      const { scope, id, subject, regenerate, discardEdit } = parsed.data
      const target: SummaryTarget = subject ? { scope, id, subject } : { scope, id }
      const { sreq } = await context(req, target, { log: true })
      res.json(validated(AI_SUMMARY_EP.create.response, await service().generate(sreq, { regenerate: regenerate === true, discardEdit: discardEdit === true })))
    } catch (e) { next(e) }
  })

  router.patch('/:summaryId', async (req, res, next) => {
    try {
      if (isDemoGuest(req)) throw new AppError(403, ERR_SUMMARY_DEMO_EDIT)
      const body = EditSummaryRequestSchema.safeParse(req.body)
      if (!body.success) throw new AppError(400, ERR_SUMMARY_BAD_REQUEST)
      const summaryId = String(req.params.summaryId)
      if (!SUMMARY_ID.test(summaryId)) throw new AppError(404, ERR_SUMMARY_NOT_FOUND)
      const userId = (req.staff as { userId: string }).userId
      /* הסיכום חייב להיות של הצופה, וההרשאה לישות נבדקת מחדש (ייתכן שהשיוך בוטל מאז) ושהקהל לא השתנה */
      const found = await service().describe(summaryId, userId)
      if (!found) throw new AppError(404, ERR_SUMMARY_NOT_FOUND)
      const authz = await deps.authorize({ req, target: found.target })
      if (authz.demo || authz.audienceKey !== found.audienceKey) throw new AppError(404, ERR_SUMMARY_NOT_FOUND)
      await doLogAccess({ req, target: found.target, authz })
      const lctx: SummaryLoadCtx = { req, target: found.target, authz }
      const sreq: SummaryRequest = {
        viewer: { userId, demo: false }, target: found.target, audienceKey: authz.audienceKey,
        load: (opts) => loadSource(opts?.lite ? { ...lctx, lite: true } : lctx), cheapLoad: authz.cheap === true,
      }
      res.json(validated(AI_SUMMARY_EP.edit.response, await service().edit({ viewer: { userId, demo: false }, summaryId, audienceKey: authz.audienceKey, editedText: body.data.editedText, req: sreq })))
    } catch (e) { next(e) }
  })

  return router
}
