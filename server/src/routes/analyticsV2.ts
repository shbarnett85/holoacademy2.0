/* ──────────────────────────────────────────────────────────────────────────
   /api/analytics-v2 — נקודות הקצה של האנליטיקה החדשה. חוזה: src/shared/types/analyticsV2.ts. GET בלבד.
   · הספק נבחר לפי הצופה (viewer.ts → V2Context.provider): מורה אורח וארגון הדגמה → ספק הדגמה; כל מורה/מנהל אחר → ספק חי.
     kill-switch: ANALYTICS_V2=0 (הכול) ו-ANALYTICS_V2_LIVE=0 (רק החי) → config.enabled=false והלקוח נשאר בפאנל הקודם; יתר הנקודות 403.
   · הרשאות: יכולת לפי נקודת קצה (ENDPOINT_CAP — מנהל מול מסכי מורה: 403 לפי תפקיד) לפני הספק, ובתוך הספק פר-כיתה.
     ישות מחוץ להיקף הצופה → 404 אחיד (כמו ישות שאינה קיימת).
   · יומן גישה: כל נקודה שמחזירה תלמידים בשמם כותבת ל-data_access_log (scope = analytics_v2_<נקודה>) **לפני** שהתגובה נשלחת.
     מדיניות כשל כמו בתוצאות (נכשל-סגור למנהל-על, מורה best-effort); ANALYTICS_V2_AUDIT_FAIL_CLOSED=all מרחיב נכשל-סגור לכל התפקידים.
   · הגבלת קצב: פר-IP (נדיבה, לפני האימות) ופר-משתמש (אחרי); /admin/overview כבד יותר ולכן תקרה נפרדת. Cache-Control: private, no-store.
   · במצב לא-פרודקשן כל תגובה מאומתת מול סכמת ה-zod של החוזה (כשל = 500 קולני).
   ────────────────────────────────────────────────────────────────────────── */
import { Router } from 'express'
import type { Request, Response } from 'express'
import { ANALYTICS_CAVEATS, ERR_V2_BAD_SCOPE, ERR_V2_BAD_SUBJECT, ERR_V2_DISABLED } from '../../../src/shared/lib/findingsNarrative.js'
import { isSubjectCode, type SubjectCode } from '../../../src/shared/lib/subjects.js'
import { EP, type EndpointName, type Envelope } from '../../../src/shared/types/analyticsV2.js'
import { logAccessMany } from '../lib/authz.js'
import { requireCap } from '../lib/analyticsV2/access.js'
import { demoProvider } from '../lib/analyticsV2/demoProvider.js'
import { liveProvider } from '../lib/analyticsV2/liveProvider.js'
import { emptyProvider, type AnalyticsV2Provider, type AuditSink, type ProviderOpts } from '../lib/analyticsV2/provider.js'
import { resolveV2Context, resolveV2Viewer, type V2Context } from '../lib/analyticsV2/viewer.js'
import { AppError } from '../middleware/errors.js'
import { rateLimitByIp, rateLimitByUser } from '../middleware/rateLimit.js'
import { requireStaff } from '../middleware/staffAuth.js'

/* תקרות לדקה. מסך כיתה רגיל = כמה בקשות; מעבר בין תלמידים בכיתה של 35 = כ-35 בקשות. /admin/overview מחשב את כל בית הספר.
   perUser: תקרת המשתמש האחד (מורה פעיל מגיע לעשרות בדקה, בעיקר במעבר בין תלמידים). perIp: רצפת הגנה לפני אימות, ולכן משותפת לכל מי שמאחורי אותה כתובת —
   בית ספר שלם מאחורי NAT (עד כ-60 מורים, ~30 בקשות לדקה למורה פעיל בשעת שיא) = ~1,800. מעל זה: הצפה, לא שימוש.
   (אורח מוגבל בנפרד לפי IP בלי לשחוק את המונה הזה — ראו rateLimitByUser.) */
export const ANALYTICS_V2_RATE = { perIp: 1800, perUser: 120, adminPerUser: 20 } as const
/* צפייה באותו תלמיד באותה נקודה נרשמת פעם אחת בחלון הזה (מסכי כיתה נפתחים שוב ושוב) */
export const AUDIT_DEDUP_MS = 10 * 60_000

export const analyticsV2Router = Router()
analyticsV2Router.use(rateLimitByIp('analytics-v2', ANALYTICS_V2_RATE.perIp))
analyticsV2Router.use(requireStaff)
analyticsV2Router.use(rateLimitByUser('analytics-v2', ANALYTICS_V2_RATE.perUser))
analyticsV2Router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next() })
const adminLimit = rateLimitByUser('analytics-v2-admin', ANALYTICS_V2_RATE.adminPerUser)

/* תאימות: טאב "תוצאות" בהדגמה ובדיקות מייבאים מכאן */
export { resolveV2Viewer }

/* ספק לפי הצופה. ANALYTICS_V2_PROVIDER=empty (או real, השם הישן) מכריח ספק ריק — לבדיקות */
export function providerFor(ctx: V2Context): AnalyticsV2Provider {
  const forced = process.env.ANALYTICS_V2_PROVIDER
  if (forced === 'empty' || forced === 'real') return emptyProvider
  return ctx.provider === 'live' ? liveProvider : demoProvider
}

async function need(req: Request): Promise<V2Context> {
  const ctx = await resolveV2Context(req)
  if (!ctx) throw new AppError(403, ERR_V2_DISABLED)
  return ctx
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
  if (!isSubjectCode(raw)) throw new AppError(400, ERR_V2_BAD_SUBJECT)
  return raw
}

/* ── יומן גישה: הספק מדווח מי נחשף; הנתיב כותב לפני התגובה. אורח וארגון הדגמה: אין DB, אין רישום ── */
const auditPolicy = (): 'all' | undefined => (process.env.ANALYTICS_V2_AUDIT_FAIL_CLOSED === 'all' ? 'all' : undefined)
function createAudit(): AuditSink & { ids: Set<string> } {
  const ids = new Set<string>()
  return { ids, expose(studentIds) { for (const id of studentIds) ids.add(id) } }
}
async function writeAudit(ctx: V2Context, ep: EndpointName, ids: Set<string>): Promise<void> {
  if (ctx.provider !== 'live' || !ctx.authz || ids.size === 0) return
  await logAccessMany(
    ctx.authz,
    [...ids].map((studentId) => ({ studentId, scope: `analytics_v2_${ep}`, endpoint: `GET ${EP[ep].path}` })),
    { studentLevel: true, failClosed: auditPolicy(), dedupMs: AUDIT_DEDUP_MS },
  )
}

/* נקודת קצה אחת: הקשר → יכולת → ספק → אימות חוזה → יומן (ממתינים) → תגובה */
async function serve<T>(req: Request, res: Response, ep: EndpointName, call: (p: AnalyticsV2Provider, ctx: V2Context, opts: ProviderOpts) => Promise<Envelope<T>>): Promise<void> {
  const ctx = await need(req)
  requireCap(ctx.viewer, ep)
  const audit = createAudit()
  const body = validated(EP[ep].response, await call(providerFor(ctx), ctx, { audit }))
  await writeAudit(ctx, ep, audit.ids)
  res.json(body)
}

analyticsV2Router.get('/config', async (req, res, next) => {
  try {
    const ctx = await resolveV2Context(req)
    if (!ctx) {
      res.json({
        dataState: 'ok',
        data: { enabled: false, lens: null, availableLenses: [], subjects: [], classes: [], dataNotice: null, curriculumNotice: null, caveats: ANALYTICS_CAVEATS },
      })
      return
    }
    res.json(validated(EP.config.response, await providerFor(ctx).config(ctx.viewer)))
  } catch (e) { next(e) }
})

analyticsV2Router.get('/roster', async (req, res, next) => {
  try { await serve(req, res, 'roster', (p, c, o) => p.roster(c.viewer, o)) } catch (e) { next(e) }
})

/* מסך הכניסה "בחרו כיתה": כיתות + עד 3 התרעות (מנהל: מערכים ריקים) */
analyticsV2Router.get('/entry', async (req, res, next) => {
  try { await serve(req, res, 'entry', (p, c, o) => p.entry(c.viewer, o)) } catch (e) { next(e) }
})

analyticsV2Router.get('/student/:id', async (req, res, next) => {
  try { await serve(req, res, 'student', (p, c, o) => p.student(c.viewer, req.params.id, o)) } catch (e) { next(e) }
})

analyticsV2Router.get('/student/:id/feedback', async (req, res, next) => {
  try { await serve(req, res, 'feedback', (p, c, o) => p.feedback(c.viewer, req.params.id, o)) } catch (e) { next(e) }
})

/* "סקירה" של כיתה — מחנך הכיתה בלבד (מחוץ להיקף: 404; מורה מקצועי בכיתה שלו: 403; מנהל: 403) */
analyticsV2Router.get('/class/:classId/overview', async (req, res, next) => {
  try { await serve(req, res, 'classOverview', (p, c, o) => p.classOverview(c.viewer, req.params.classId, o)) } catch (e) { next(e) }
})

analyticsV2Router.get('/class/:classId/subject/:subject', async (req, res, next) => {
  try { await serve(req, res, 'classSubject', (p, c, o) => p.classSubject(c.viewer, req.params.classId, subjectParam(req.params.subject), o)) } catch (e) { next(e) }
})

analyticsV2Router.get('/admin/overview', adminLimit, async (req, res, next) => {
  try { await serve(req, res, 'admin', (p, c) => p.admin(c.viewer)) } catch (e) { next(e) }
})

analyticsV2Router.get('/briefing/:scope/:id', async (req, res, next) => {
  try {
    const scope = req.params.scope
    if (scope !== 'student' && scope !== 'class') throw new AppError(400, ERR_V2_BAD_SCOPE)
    await serve(req, res, 'briefing', (p, c, o) => p.briefing(c.viewer, scope, req.params.id, o))
  } catch (e) { next(e) }
})
