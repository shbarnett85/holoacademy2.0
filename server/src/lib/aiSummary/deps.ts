/* ──────────────────────────────────────────────────────────────────────────
   deps — החיבור של שירות הסיכום המילולי לספקי האנליטיקה (v2) והתוצאות: ההרשאה וטעינת העובדות של routes/aiSummary.ts (AiSummaryRouteDeps).
   · **אין כאן כללי הרשאה משלנו.** ההכרעה נעשית בדיוק כמו במסכים: student/class/class_subject — דרך הספק של v2 (אותו resolveV2Context, אותו
     provider.student / classOverview / classSubject, שזורקים 404 אחיד מחוץ להיקף ו-403 על מקצוע נעול / סקירה שאינה של המחנך); submission — כמו מסך ההדמיה
     בתוצאות (מנהלים 403, שליחה שאינה גלויה 404 אחיד).
   · **מנהל / מנהל עירוני / מנהל-על: אין סיכום בשום היקף** (חוק 8) — 403 לפני כל טעינת נתונים, יומן או LLM.
   · אורח וארגון הדגמה: demo=true → תבנית דטרמיניסטית בלבד, בלי LLM, בלי שמירה, ובלי קריאת מגדר מה-DB. (ארגון הדגמה ב-submission: העובדות מגיעות מספק התוצאות
     האמיתי — כמו שהמסך מציג לו — אך הסיכום עצמו תבניתי.)
   · קהל הסיכום (audienceKey, חלק ממפתח השמירה האישי): מחנך = 'full'; מורה מקצועי = **המקצועות שהוא רואה בפועל אצל התלמיד** (איחוד ההרשאות על כל כיתות התלמיד —
     בדיוק מה שהתוכן נבנה ממנו), ממוינים ('subj:…'). המפתח נגזר מהרשאה ולא מהנתונים, כך שהוא יציב כשנתוני התלמיד משתנים, ושינוי הרשאה בכל אחת מכיתות התלמיד
     (הוסר מחנכות, או הוסר מקצוע בכיתה שנייה) מחליף מפתח ולא חושף סיכום ישן עם תוכן שהצופה כבר לא רשאי לראות.
   · ה-ctx / התוצאה של הספק נשמרים לבקשה (WeakMap על ה-req): authorize ו-load* באותה בקשה לא טוענים פעמיים.
   · כל התלויות (ספק, הקשר, צופה, תוצאות, מגדר) מוזרקות — בבדיקות אין DB ואין LLM. כל טקסט למשתמש מגיע מ-findingsNarrative.
   ────────────────────────────────────────────────────────────────────────── */
import type { Request } from 'express'
import { ERR_AGGREGATE_ONLY, ERR_NO_ACCESS, ERR_V2_DISABLED } from '../../../../src/shared/lib/findingsNarrative.js'
import type { StudentOverview } from '../../../../src/shared/types/analyticsV2.js'
import type { ClassSubmissionView } from '../../../../src/shared/types/resultsV1.js'
import type { SummaryTarget } from '../../../../src/shared/types/aiSummaryV1.js'
import { AppError } from '../../middleware/errors.js'
import { isDemoGuest } from '../../middleware/staffAuth.js'
import { isHomeroomOf, requireCap, type V2Viewer } from '../analyticsV2/access.js'
import type { AnalyticsV2Provider } from '../analyticsV2/provider.js'
import { resolveV2Context, type V2Context } from '../analyticsV2/viewer.js'
import { isAggregateOnly, isSuper, loadViewer, type Viewer } from '../authz.js'
import { demoResultsProvider } from '../results/demoResults.js'
import { openSubmissionForSummary, type SubmissionSummaryAccess } from '../results/realResults.js'
import type { AiSummaryRouteDeps, ClassFacts, SummaryAuthorization, SummaryCtx, SummaryLoadCtx } from '../../routes/aiSummary.js'
import { classDataCountsOf, type Gender } from './inputs.js'
import { FULL_AUDIENCE, subjectAudience } from './service.js'

/* כל מה שהחיבור צריך מבחוץ. providerFor חובה (הבחירה היחידה בין ספק הדגמה / חי / ריק נמצאת ב-routes/analyticsV2.ts); השאר — ברירות מחדל אמיתיות */
export interface SummaryCollaborators {
  providerFor(ctx: V2Context): AnalyticsV2Provider
  resolveContext(req: Request): Promise<V2Context | null>
  loadViewer(req: Request): Promise<Viewer>
  isDemoGuest(req: Request): boolean
  /* מסך הדמיה של מורה אורח (עולם ההדגמה בזיכרון; כולל הרשאה לפי העדשה) */
  guestClassView(req: Request, submissionId: string): Promise<ClassSubmissionView>
  /* מסך הדמיה של מורה אמיתי: ההרשאה מיד, הטעינה הכבדה ב-classView() */
  openSubmission(req: Request, submissionId: string): Promise<SubmissionSummaryAccess>
  /* users.gender של תלמיד אמיתי (null כשלא הוגדר / העמודה חסרה) */
  studentGender(studentId: string): Promise<Gender>
}

/* מגדר התלמיד לא נקרא יותר (לשון רבים אחידה — CLAUDE.md "פנייה לתלמיד"; העמודה users.gender deprecated).
   תמיד null = ניסוח ניטרלי בסיכום. החתימה נשארת כדי לא לשבור את החוזה והבדיקות. */
export async function readStudentGender(_studentId: string): Promise<Gender> { // eslint-disable-line @typescript-eslint/no-unused-vars
  return null
}

/* קהל הסיכום של תלמיד: מחנך (access='full') → full; מורה מקצועי → קבוצת המקצועות הגלויים לו בפועל אצל התלמיד (פאנלים גלויים).
   הפאנלים נגזרים מאיחוד ההרשאות על כל כיתות התלמיד, כמו העובדות — לכן המפתח תואם לתוכן גם לתלמיד שרשום בכמה כיתות.
   (viewer נשאר בחתימה לתאימות; ההכרעה היא מהתגובה שכבר עברה את בדיקות ההרשאה) */
export function audienceOfStudent(_viewer: V2Viewer, overview: Pick<StudentOverview, 'access' | 'panels'>): string {
  if (overview.access === 'full') return FULL_AUDIENCE
  return subjectAudience(overview.panels.filter((p) => p.access === 'visible').map((p) => p.subject.code))
}

const memos = new WeakMap<object, Map<string, Promise<unknown>>>()
function memo<T>(req: Request, key: string, make: () => Promise<T>): Promise<T> {
  let m = memos.get(req)
  if (!m) { m = new Map(); memos.set(req, m) }
  let p = m.get(key) as Promise<T> | undefined
  if (!p) { p = make(); m.set(key, p) }
  return p
}

export function createAiSummaryDeps(given: Pick<SummaryCollaborators, 'providerFor'> & Partial<SummaryCollaborators>): AiSummaryRouteDeps {
  const c: SummaryCollaborators = {
    resolveContext: (req) => resolveV2Context(req),
    loadViewer,
    isDemoGuest,
    guestClassView: (req, id) => demoResultsProvider.classView(req, id),
    openSubmission: openSubmissionForSummary,
    studentGender: readStudentGender,
    ...given,
  }

  /* הקשר v2 של הבקשה. null (kill-switch / מנהל-על) → 403 כמו כל נקודת v2 */
  const v2 = (req: Request): Promise<V2Context> => memo(req, 'ctx', async () => {
    const ctx = await c.resolveContext(req)
    if (!ctx) throw new AppError(403, ERR_V2_DISABLED)
    return ctx
  })

  /* תוצאת הספק לפי היקף — מוחזרת מ-authorize (הרשאה = זורקת כמו המסך) ונקראת שוב מ-load* בלי טעינה נוספת */
  const studentOf = (req: Request, ctx: V2Context, id: string) =>
    memo(req, `student|${id}`, () => c.providerFor(ctx).student(ctx.viewer, id))
  const classOf = (req: Request, ctx: V2Context, id: string) =>
    memo(req, `class|${id}`, () => c.providerFor(ctx).classOverview(ctx.viewer, id))
  const classSubjectOf = (req: Request, ctx: V2Context, id: string, subject: NonNullable<SummaryTarget['subject']>) =>
    memo(req, `class_subject|${id}|${subject}`, () => c.providerFor(ctx).classSubject(ctx.viewer, id, subject))

  /* שליחה: אורח — מסך ההדגמה (כולל הרשאת העדשה); אחרת — מנהלים 403, מנהל-על 403, וההרשאה האמיתית של התוצאות (403 / 404 אחיד) */
  const submissionOf = (req: Request, target: SummaryTarget): Promise<{ demo: boolean; classView(): Promise<ClassSubmissionView> }> =>
    memo(req, `submission|${target.id}`, async () => {
      if (c.isDemoGuest(req)) {
        const view = await c.guestClassView(req, target.id)
        return { demo: true, classView: async () => view }
      }
      const viewer = await c.loadViewer(req)
      if (isAggregateOnly(viewer)) throw new AppError(403, ERR_AGGREGATE_ONLY)
      if (isSuper(viewer)) throw new AppError(403, ERR_NO_ACCESS)
      const access = await c.openSubmission(req, target.id)
      return { demo: viewer.seesSynthetic, classView: () => access.classView() }
    })

  return {
    async authorize({ req, target }: SummaryCtx): Promise<SummaryAuthorization> {
      switch (target.scope) {
        case 'student': {
          const ctx = await v2(req)
          requireCap(ctx.viewer, 'student')
          const env = await studentOf(req, ctx, target.id)
          return { demo: ctx.provider === 'demo', audienceKey: audienceOfStudent(ctx.viewer, env.data), cheap: true }
        }
        case 'class': {
          const ctx = await v2(req)
          requireCap(ctx.viewer, 'classOverview')
          await classOf(req, ctx, target.id)
          /* רק מחנך הכיתה עובר את classOverview, ולכן הקהל תמיד מלא */
          return { demo: ctx.provider === 'demo', audienceKey: FULL_AUDIENCE, cheap: true }
        }
        case 'class_subject': {
          const ctx = await v2(req)
          requireCap(ctx.viewer, 'classSubject')
          const subject = target.subject as NonNullable<SummaryTarget['subject']>
          await classSubjectOf(req, ctx, target.id, subject)
          return { demo: ctx.provider === 'demo', audienceKey: isHomeroomOf(ctx.viewer, target.id) ? FULL_AUDIENCE : subjectAudience([subject]), cheap: true }
        }
        case 'submission': {
          const s = await submissionOf(req, target)
          /* תוכן ההגשה זהה לכל מי שרואה אותה (המסך המלא של השליחה) — הקהל קבוע. הטעינה כבדה (classView) חוץ ממסך ההדגמה של האורח בזיכרון, ולכן GET לא טוען אותה */
          return { demo: s.demo, audienceKey: FULL_AUDIENCE, cheap: c.isDemoGuest(req) }
        }
      }
    },

    async loadStudentFacts({ req, target, authz, lite }: SummaryLoadCtx) {
      const ctx = await v2(req)
      const env = await studentOf(req, ctx, target.id)
      /* הדגמה: אין DB — המגדר לא נקרא. טעינה קלה (חותמת נתונים ב-GET): המגדר אינו חלק מהחותמת ולכן לא נקרא. אמיתי: רק אחרי שההרשאה אושרה */
      const gender = authz.demo || lite ? null : await c.studentGender(target.id)
      return { overview: env.data, gender }
    },

    async loadClassFacts({ req, target }: SummaryLoadCtx): Promise<ClassFacts> {
      const ctx = await v2(req)
      const overview = (await classOf(req, ctx, target.id)).data
      /* גודל המדגם: תלמידים שיש עליהם נתוני רמה (לא כל תלמידי הכיתה). ב-ClassOverview אין שדה כזה, ולכן סופרים ממסכי המקצוע של אותה כיתה
         (אותו ניתוח במטמון, אותה הרשאה — מחנך הכיתה רואה את כל המקצועות). מקצוע ללא רמה אינו נספר; מקצוע שנסגר/נעלם בדרך נספר כ-0 */
      const views = []
      for (const row of overview.rows) {
        if (row.level === null) continue
        try { views.push((await classSubjectOf(req, ctx, target.id, row.subject.code as NonNullable<SummaryTarget['subject']>)).data) } catch (e) {
          if (!(e instanceof AppError) || (e.status !== 403 && e.status !== 404)) throw e
        }
      }
      return { overview, withData: classDataCountsOf(views) }
    },

    async loadClassSubjectFacts({ req, target }: SummaryLoadCtx) {
      const ctx = await v2(req)
      return (await classSubjectOf(req, ctx, target.id, target.subject as NonNullable<SummaryTarget['subject']>)).data
    },

    async loadSubmissionFacts({ req, target }: SummaryLoadCtx) {
      return (await submissionOf(req, target)).classView()
    },
  }
}
