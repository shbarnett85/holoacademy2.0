import { Router } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabase.js'
import { AppError } from '../middleware/errors.js'
import {
  buildQuestPrompt,
  buildRetryMessage,
  buildStructureRetryMessage,
  requiredKeyCount,
  buildSkeletonPrompt,
  buildScenePrompt,
  buildClimaxPrompt,
  type QuestGenerationParams,
  type FormOfAddress,
  type QuestSkeleton,
} from '../prompts/questPrompt.js'
import { validateHubStructure, type HubInfo } from '../lib/hubValidation.js'
import { clampLevel, moralDilemmaDepth } from '../../../src/shared/lib/difficultyScaling.js'
import { gradeToLevel } from '../../../src/shared/lib/difficultyCalibration.js'
import { requireStaff, ensureOwner, isDemoGuest, requireCanShare, tryStaff, SHARING_DISABLED_MESSAGE } from '../middleware/staffAuth.js'
import { hasCanShare } from '../lib/activeColumn.js'
import { linkFocusedLesson } from '../lib/focusedLink.js'
import { requireCreator, ensureQuestAccess, readAnonId } from '../lib/creatorAccess.js'
import { verifyTurnstile, checkRateLimit, acquireFlight, releaseFlight, logGeneration, clientIp } from '../lib/genGuard.js'
import { demoVariantSnapshot } from '../lib/demoAnalytics.js'
import jwt from 'jsonwebtoken'
import { hasQuestSubject, hasQuestSubjectId, hasPublicQuests, hasQuestVariants, hasQuestGrade, hasQuestThumb, hasAssignmentDueAt, isSchemaMissingError } from '../lib/activeColumn.js'
import { loadViewer, canAssignToClass } from '../lib/authz.js'
import { loadReviewBasis } from '../lib/results/realResults.js'
import { REVIEW_MIN_COMPLETED } from '../../../src/shared/lib/analyticsConfig.js'
import { subjectByCode, subjectFieldsOfQuest, questSubjectOut } from '../lib/subjects.js'
import { invalidateAllClassAnalyses } from '../lib/analyticsV2/analysisCache.js'
import { subjectName as subjectName_, isSubjectCode } from '../../../src/shared/lib/subjects.js'
import { loadEffectiveProfile } from '../lib/profileCalibration.js'
import { debug, info, warn, error as logError } from '../lib/log.js'
/* המודולים שפוצלו מהקובץ הזה (E4) — סכמות/קריאות-מודל/בטיחות/בדיקת-עובדות/וריאציות */
import { extractJson, validateGameData, repairRawPuzzles, checkAnswerConsistency, healStaleFactCheck, collectOpenWarnings, shuffleAnswerPositions, generateRequestSchema, type GameData } from '../lib/questSchemas.js'
import { callClaude, callHaiku } from '../lib/claudeCalls.js'
import { runInputSafetyCheck, runOutputSafetyCheck, logContentSafety, SAFETY_BLOCK_MESSAGE, SAFETY_TECH_MESSAGE } from '../lib/contentSafety.js'
import { runFactCheck, scopedFactFix, factWarning, factCheckInBackground, type FactCheckMeta } from '../lib/factCheck.js'
import { rephraseForAddress, buildStudentVariant } from '../lib/questVariants.js'
import { enforceSceneFit, analyzeQuest, bandOfGameData, type FitStats } from '../lib/sceneFit.js'
import { fixStudentAddress } from '../lib/studentAddress.js'
import { proposeSceneShortening } from '../lib/sceneShorten.js'
import { rateLimitByUser } from '../middleware/rateLimit.js'
import { weakConceptsFromReview, reviewContextBlock } from '../lib/weakConcepts.js'
import { groundCurriculum } from '../lib/factBrief.js'
import { callGeminiText, callGeminiJSON } from '../lib/gemini.js'
import { engineFor } from '../lib/modelRouter.js'
import { THUMB_COLUMNS, thumbsFor } from '../lib/lessonThumbStore.js'
import { lessonGradeRange } from '../../../src/shared/lib/lessonGrade.js'
import { dueAtFromDay, defaultDueAt } from '../../../src/shared/lib/lessonState.js'
import { ERR_DUE_INVALID, ERR_DUE_PAST } from '../../../src/shared/lib/findingsNarrative.js'

export const questsRouter = Router()


/* ── עמידות שלב 1 (רנדר-מחדש ממוקד, לפני repairRawPuzzles): לחידת-תוכן
   (multipleChoice/trueFalse) חסרת-question אך עם choices תקינים — מבקש מ-haiku **רק את
   ה-question** לפי הנרטיב + התשובות הקיימות (התשובה הנכונה ידועה מ-isCorrect). כך החידה
   **משוחזרת ולא נזרקת** (שומר את הערך הלימודי). מה שלא שוחזר נופל ל-repairRawPuzzles (drop).
   קריאת haiku אחת לכל החידות החסרות. best-effort — כשל לא מפיל את היצירה. */
async function recoverMissingQuestions(raw: unknown, warnings: string[]): Promise<void> {
  const scenes = (raw as { scenes?: unknown })?.scenes
  if (!Array.isArray(scenes)) return
  const jobs: { scene: { title?: string; narrative?: string }; puzzle: Record<string, unknown> }[] = []
  for (const sc of scenes) {
    const scene = sc as { title?: string; narrative?: string; puzzle?: Record<string, unknown> }
    const p = scene.puzzle
    if (!p || typeof p !== 'object') continue
    const q = typeof p.question === 'string' ? p.question.trim() : ''
    if (q) continue
    const choices = p.choices as { text?: string; isCorrect?: boolean }[] | undefined
    if ((p.type === 'multipleChoice' || p.type === 'trueFalse') && Array.isArray(choices) && choices.length >= 2) {
      jobs.push({ scene, puzzle: p })
    }
  }
  if (jobs.length === 0) return
  const blocks = jobs.map((j, n) => {
    const choices = (j.puzzle.choices as { text?: string; isCorrect?: boolean }[]) ?? []
    const correct = choices.find((c) => c.isCorrect)?.text ?? ''
    const opts = choices.map((c) => c.text).filter(Boolean).join(' / ')
    return `### חידה ${n} (type=${j.puzzle.type})\nנרטיב הסצנה: ${(j.scene.narrative ?? '').slice(0, 400)}\nהתשובות: ${opts}\nהתשובה הנכונה: ${correct}`
  }).join('\n\n')
  const instruction = `לכל אחת מהחידות הבאות חסר השדה "question". כתוב שאלה בעברית טבעית ותקנית שמתאימה לתשובות ולנרטיב — כך שהתשובה הנכונה המסומנת אכן תהיה התשובה הנכונה לשאלתך. אל תשנה את התשובות. החזר JSON תקין בלבד במבנה { "questions": ["שאלה לחידה 0", "שאלה לחידה 1", ...] } באורך **${jobs.length} בדיוק** (באותו סדר).\n\n${blocks}`
  try {
    const text = engineFor('recover') === 'gemini' ? await callGeminiText(instruction, 5000, true) : await callHaiku([{ role: 'user', content: instruction }], 1500)
    const parsed = extractJson(text) as { questions?: unknown }
    const qs = Array.isArray(parsed.questions) ? parsed.questions : []
    jobs.forEach((j, n) => {
      const q = typeof qs[n] === 'string' ? (qs[n] as string).trim() : ''
      if (q) { j.puzzle.question = q; warnings.push(`שוחזרה שאלה חסרה בחידה (סצנה "${j.scene.title ?? '?'}")`) }
    })
  } catch (e) {
    logError('[recover-question] שחזור נכשל (יפול ל-repair):', e instanceof Error ? e.message : e)
  }
}






/* GET /api/quests — ספריית ההדמיות של הצוות. מורה רואה רק את שלו; מנהל רואה את בית הספר שלו. */
questsRouter.get('/', requireCreator, async (req, res, next) => {
  try {
    const [pub, subj, subjId, withGrade, withThumb] = await Promise.all([hasPublicQuests(), hasQuestSubject(), hasQuestSubjectId(), hasQuestGrade(), hasQuestThumb()])
    const cols = 'id, title, game_data, status, created_at, difficulty_settings' + (pub ? ', is_public' : '') + (subj ? ', subject' : '') + (subjId ? ', subject_id' : '') + (withGrade ? ', grade_min, grade_max' : '') + (withThumb ? ', ' + THUMB_COLUMNS : '')
    let query = supabaseAdmin
      .from('quests')
      .select(cols)
      .order('created_at', { ascending: false })
    if (req.staff) {
      if (req.staff.role === 'admin' && req.staff.schoolId) {
        /* מנהל רואה את הדמיות בית הספר שלו בלבד (יוצרים ששייכים לאותו בית ספר) — לא את כל המערכת */
        query = supabaseAdmin
          .from('quests')
          .select(cols + ', creator:users!created_by!inner(school_id)')
          .eq('creator.school_id', req.staff.schoolId)
          .order('created_at', { ascending: false })
      } else {
        query = query.eq('created_by', req.staff.userId)
      }
    } else {
      /* מבקר אנונימי — רק השיעורים שנוצרו בדפדפן הזה */
      query = query.eq('anon_id', req.anonId!)
    }
    const { data, error } = await query

    if (error) throw new AppError(500, 'שגיאה בשליפת שיעורים: ' + error.message)

    const rows = (data ?? []) as unknown as { id: string; title: string; created_at: string; status: string; game_data?: { scenes?: unknown[]; reviewOf?: unknown }; is_public?: boolean; subject?: string | null; subject_id?: string | null; difficulty_settings?: unknown; grade_min?: number | null; grade_max?: number | null }[]
    /* תמונות ממוזערות שמורות (נוצרות ברקע לשיעור שעוד אין לו) */
    const thumbs = await thumbsFor(rows)
    const quests = await Promise.all(rows.map(async (q) => ({
      id: q.id,
      title: q.title,
      created_at: q.created_at,
      is_published: q.status === 'published',
      is_public: pub ? q.is_public === true : false,
      is_review: !!q.game_data?.reviewOf,
      sceneCount: q.game_data?.scenes?.length ?? 0,
      /* תמונת השיעור ברשימה — הממוזערת השמורה; אותו כרטיס (LessonCard) כמו ברשימת התלמיד */
      thumbUrl: thumbs.get(q.id) ?? null,
      /* תגית השכבות בכרטיס */
      ...(lessonGradeRange(q) ?? { gradeMin: null, gradeMax: null }),
      /* כלל "אורך טקסט לתלמיד": כמה סצנות ארוכות מדי למסך אחד (לפי fitsScreen המכוילת; למורה בלבד) */
      longSceneCount: q.game_data?.scenes ? analyzeQuest({ scenes: q.game_data.scenes as never }, bandOfGameData(q.game_data as { readingScale?: number })).long : 0,
      /* subject = שם לתצוגה; subjectCode = המזהה היציב; שניהם null = "לא סווג" */
      ...(await questSubjectOut({ subject: subj ? q.subject : undefined, subject_id: subjId ? (q.subject_id ?? null) : undefined })),
    })))

    res.json({ quests, permissions: { canShare: req.staff ? req.staff.canShare !== false : false } })
  } catch (err) {
    next(err)
  }
})

/* GET /api/quests/demo — מאתר את הדמיית הדמו (לאונרדו דה וינצ׳י) מהספרייה הציבורית.
   ציבורי (ללא אימות) כדי שכפתור הדמו בעמוד הבית יעבוד לפני התחברות. חייב להירשם
   *לפני* '/:id' אחרת ייתפס כ-id='demo'. */
questsRouter.get('/demo', async (_req, res, next) => {
  try {
    const withOfficial = await hasQuestGrade()
    const { data, error } = await supabaseAdmin
      .from('quests')
      .select(`id, title, is_public${withOfficial ? ', is_official' : ''}`)
      .limit(400)
    if (error) throw new AppError(500, error.message)
    const rows = (data ?? []) as unknown as { id: string; title: string; is_public?: boolean; is_official?: boolean }[]
    const isLeonardo = (t: string) => /לאונרדו|וינצ|vinci|da\s*vinci/i.test(t ?? '')
    /* סדר העדפה: רשמית+ציבורית → ציבורית → כל תואמת (עמידות לפני מיגרציות) */
    const pick = rows.find((r) => r.is_official && r.is_public && isLeonardo(r.title))
      ?? rows.find((r) => r.is_public && isLeonardo(r.title))
      ?? rows.find((r) => isLeonardo(r.title))
    if (!pick) throw new AppError(404, 'שיעור הדמו (לאונרדו דה וינצ׳י) לא נמצא בספרייה הציבורית')
    res.json({ id: pick.id, title: pick.title })
  } catch (err) {
    next(err)
  }
})

/* GET /api/quests/showcase — חלון הראווה לדף הבית, **ללא הזדהות**: ההדמיות
   הרשמיות המשותפות בפורמט קל (בלי game_data מלא) — מבקר קר משחק בקליק אחד.
   cache בזיכרון ל-5 דקות (נטען בכל ביקור בדף הבית, התוכן משתנה לעיתים רחוקות). */
let showcaseCache: { at: number; payload: unknown } | null = null
questsRouter.get('/showcase', async (_req, res, next) => {
  try {
    if (showcaseCache && Date.now() - showcaseCache.at < 5 * 60_000) { res.json(showcaseCache.payload); return }
    if (!(await hasPublicQuests())) { res.json({ quests: [] }); return }
    const withGrade = await hasQuestGrade()
    const withSubject = await hasQuestSubject()
    const withSubjectId = await hasQuestSubjectId()
    const withThumb = await hasQuestThumb()
    const cols = `id, title, game_data, created_at${withSubject ? ', subject' : ''}${withSubjectId ? ', subject_id' : ''}${withGrade ? ', grade_min, grade_max, is_official' : ''}${withThumb ? ', ' + THUMB_COLUMNS : ''}`
    const { data, error } = await supabaseAdmin
      .from('quests')
      .select(cols)
      .eq('is_public', true)
      .order('created_at', { ascending: true })
      .limit(40)
    if (error) throw new AppError(500, error.message)
    interface Row { id: string; title: string; game_data: unknown; subject?: string | null; subject_id?: string | null; grade_min?: number | null; grade_max?: number | null; is_official?: boolean; thumb_url?: string | null; thumb_src?: string | null }
    const rows = (data ?? []) as unknown as Row[]
    const subjectOf = new Map<string, string | null>()
    for (const r of rows) subjectOf.set(r.id, (await questSubjectOut({ subject: withSubject ? r.subject : undefined, subject_id: withSubjectId ? (r.subject_id ?? null) : undefined })).subject)
    /* רשמיות קודם; אם אין עמודת is_official/אין רשמיות — כל הציבוריות */
    const officials = withGrade ? rows.filter((r) => r.is_official) : []
    const pool = officials.length > 0 ? officials : rows
    const showcaseThumbs = await thumbsFor(pool)
    const mapped = pool.map((r) => {
      const gd = r.game_data as { scenes?: { id: string; imageUrl?: string }[]; entrySceneId?: string } | null
      const scenes = gd?.scenes ?? []
      /* התמונה הממוזערת — lib/lessonThumb (הסצנה השנייה, לא מעבדת הפתיחה) */
      return {
        id: r.id,
        title: r.title,
        subject: subjectOf.get(r.id) ?? null,
        gradeMin: r.grade_min ?? null,
        gradeMax: r.grade_max ?? null,
        sceneCount: scenes.length,
        thumbUrl: showcaseThumbs.get(r.id) ?? null,
      }
    }).filter((q) => q.sceneCount > 0)
    /* גיוון מקצועות במדף: קודם החדשה-ביותר מכל מקצוע (כל מורה רואה את המקצוע שלו),
       ואז השאר — כך הקליינט (שחותך 8) מציג את המניפה הרחבה ביותר */
    const bySubject = new Map<string, typeof mapped[number]>()
    for (const q of [...mapped].reverse()) if (!bySubject.has(q.subject ?? '')) bySubject.set(q.subject ?? '', q)
    const firstPerSubject = [...bySubject.values()]
    const rest = mapped.filter((q) => !firstPerSubject.includes(q))
    /* סדר תצוגה מוסדר לבאנר — רץ אחרי מעבר הגיוון (שהופך את הרשימה); מיון יציב:
       מי שלא ברשימה נשאר אחרי המוסדרים, בסדר הגיוון */
    const SHOWCASE_ORDER = ['לאונרדו', 'דוד וג', 'מסע בין כוכבים', 'ציידי ההנחות']
    const orderOf = (t: string) => { const i = SHOWCASE_ORDER.findIndex((k) => t.includes(k)); return i === -1 ? SHOWCASE_ORDER.length : i }
    const payload = { quests: [...firstPerSubject, ...rest].sort((a, b) => orderOf(a.title) - orderOf(b.title)) }
    showcaseCache = { at: Date.now(), payload }
    res.json(payload)
  } catch (err) {
    next(err)
  }
})

/* GET /api/quests/:id — הדמיה בודדת מלאה */
questsRouter.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('quests')
      .select('id, title, game_data, status, created_at, created_by')
      .eq('id', req.params.id)
      .single()

    if (error || !data) throw new AppError(404, 'שיעור לא נמצא')

    /* שיעור של יוצר מוגבל-שיתוף (can_share=false) אינו נגיש לציבור/תלמידים — רק לבעלים,
       למנהל הארגון (אותו בית ספר) ולמנהל-על. מונע עקיפה דרך קישור /play ישיר. */
    const creatorId = (data as { created_by?: string | null }).created_by
    if (creatorId && (await hasCanShare())) {
      const { data: creator } = await supabaseAdmin.from('users').select('can_share, school_id').eq('id', creatorId).maybeSingle()
      const c = creator as { can_share?: boolean; school_id?: string | null } | null
      if (c && c.can_share === false) {
        const staff = await tryStaff(req)
        const sameOrgAdmin = !!staff && (staff.role === 'admin' || staff.role === 'municipal_admin') && !!staff.schoolId && staff.schoolId === c.school_id
        const ok = !!staff && (staff.role === 'super_admin' || staff.userId === creatorId || sameOrgAdmin)
        if (!ok) throw new AppError(403, SHARING_DISABLED_MESSAGE, 'SHARING_DISABLED')
      }
    }
    delete (data as { created_by?: unknown }).created_by

    /* watchdog: fact-check שנתקע על 'pending' (ריסטרט שרת באמצע הריצה ברקע) — ריפוי עצלן
       בקריאה, בלי cron. מסומן done+stale, נשמר best-effort, וה-polling של הקליינט נעצר. */
    if (data.game_data && healStaleFactCheck(data.game_data as GameData)) {
      void supabaseAdmin.from('quests').update({ game_data: data.game_data }).eq('id', data.id)
        .then(({ error: healErr }) => { if (healErr) logError('[fact-check] שמירת ריפוי pending תקוע נכשלה:', healErr.message) })
    }

    /* אם התלמיד מחובר ויש וריאנט אישי — החזר אותו במקום ה-game_data המקורי */
    let gameData = data.game_data
    try {
      const token = req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7) : null
      const secret = process.env.JWT_SECRET
      if (token && secret) {
        const payload = jwt.verify(token, secret) as { userId?: string; role?: string }
        if (payload.role === 'student' && payload.userId && (await hasQuestVariants())) {
          const { data: vRow } = await supabaseAdmin
            .from('quest_variants')
            .select('game_data')
            .eq('quest_id', req.params.id)
            .eq('student_id', payload.userId)
            .maybeSingle()
          if (vRow?.game_data) gameData = vRow.game_data
        }
      }
    } catch { /* JWT שגוי / טבלה חסרה — נפול ל-game_data רגיל */ }

    res.json({ quest: { ...data, game_data: gameData } })
  } catch (err) {
    next(err)
  }
})

/* POST /api/quests/:id/personalize — נשאר לתאימות. לשון רבים אחידה: אין עוד התאמה ממוגדרת, והגוף gender/form/studentId
   מתקבל ומתעלמים ממנו. מחזיר עותק של הבסיס (שכבר בלשון רבים) — אינו נשמר. */
const personalizeSchema = z.object({
  gender: z.enum(['male', 'female']).optional(),
  form: z.enum(['male', 'female', 'plural']).optional(),
  studentId: z.string().uuid().optional(),
})
questsRouter.post('/:id/personalize', requireStaff, requireCanShare, async (req, res, next) => {
  try {
    const parsed = personalizeSchema.safeParse(req.body ?? {})
    if (!parsed.success) throw new AppError(400, 'בקשה לא תקינה')
    const { data: quest, error } = await supabaseAdmin
      .from('quests')
      .select('id, title, game_data, created_by')
      .eq('id', req.params.id)
      .single()
    if (error || !quest?.game_data) throw new AppError(404, 'שיעור לא נמצא')
    await ensureQuestAccess(req, quest as { created_by?: string | null; anon_id?: string | null })

    const form: FormOfAddress = 'plural'

    const variant = await rephraseForAddress(quest.game_data as GameData, form)
    res.json({ quest: { id: quest.id, title: quest.title, game_data: variant }, formOfAddress: form })
  } catch (err) {
    next(err)
  }
})

/* POST /api/quests/:id/variant — יצירת/עדכון וריאציה מותאמת-תלמיד.
   דורש בעלות על ההדמיה. טוען פרופיל+מגדר התלמיד, מתאים ושומר ב-quest_variants.
   עמיד לחוסר הטבלה (hasQuestVariants). */
const variantSchema = z.object({ studentId: z.string().uuid() })

questsRouter.post('/:id/variant', requireStaff, requireCanShare, async (req, res, next) => {
  try {
    /* מורה אורח: התלמידים וירטואליים (demo-s1..) — מדמים הכנה מוצלחת עם
       אותו snapshot כמו ה-drill-down, בלי AI ובלי DB (השהיה קצרה לריאליזם) */
    if (isDemoGuest(req)) {
      const sid = typeof (req.body as { studentId?: unknown })?.studentId === 'string' ? (req.body as { studentId: string }).studentId : ''
      const snap = demoVariantSnapshot(sid)
      if (snap) {
        await new Promise((r) => setTimeout(r, 650))
        res.json({ ok: true, profileSnapshot: snap, persisted: false, demo: true })
        return
      }
    }
    const parsed = variantSchema.safeParse(req.body)
    if (!parsed.success) throw new AppError(400, 'studentId נדרש')
    const { studentId } = parsed.data
    const questId = req.params.id

    const { data: quest } = await supabaseAdmin.from('quests').select('*').eq('id', questId).single()
    if (!quest) throw new AppError(404, 'שיעור לא נמצא')
    await ensureOwner(req, (quest as { created_by?: string | null }).created_by ?? null)

    /* ── שלוף כיתת התלמיד (class_members, לא users.class_id). מגדר התלמיד לא נקרא ולא משפיע (לשון רבים אחידה). ── */
    const { data: memberRow } = await supabaseAdmin.from('class_members').select('class_id').eq('user_id', studentId).maybeSingle()
    const classId = (memberRow as { class_id?: string } | null)?.class_id ?? null
    let gradeLabel: string | null = null
    if (classId) {
      const { data: classRow } = await supabaseAdmin.from('classes').select('grade_label').eq('id', classId).maybeSingle()
      gradeLabel = (classRow as Record<string, unknown> | null)?.grade_label as string | null ?? null
    }

    /* רמות: לפי שורת המקצוע של התלמיד (מקצוע חדש = רמת פתיחה), או הגלובלי לשיעור "לא סווג" */
    const questSubjectId = (quest as { subject_id?: string | null }).subject_id ?? null
    const eff = await loadEffectiveProfile(studentId, classId, questSubjectId)
    const textLevel = eff.profile.textLevel
    const perPuzzleLevel: Record<string, number> = { ...eff.profile.perPuzzleLevel }

    const form: FormOfAddress = 'plural'

    /* עומק דילמת מוסר = min(רמת השכבה, רמת הטקסט) על סקאלת 1-20 (לא 60/80) */
    const moralLevel = moralDilemmaDepth(gradeToLevel(gradeLabel) ?? undefined, textLevel)

    /* ── DIAG ── */
    debug('[variant:profile]', {
      studentId, profileSource: eff.source, subjectId: questSubjectId,
      gradeLabel, textLevel, moralLevel,
      perPuzzleLevel_sample: Object.fromEntries(Object.entries(perPuzzleLevel).slice(0, 3)),
      form,
    })
    /* ── /DIAG ── */

    const variantData = await buildStudentVariant(quest.game_data as GameData, textLevel, form, perPuzzleLevel, moralLevel)
    const snapshot = { textLevel, perPuzzleLevel }

    const hasTable = await hasQuestVariants()
    debug('[variant:save]', { hasTable, studentId })
    if (hasTable) {
      const { error } = await supabaseAdmin.from('quest_variants').upsert(
        { quest_id: questId, student_id: studentId, game_data: variantData, profile_snapshot: snapshot, created_at: new Date().toISOString() },
        { onConflict: 'quest_id,student_id' },
      )
      if (error) logError('[variant] שמירה נכשלה:', error.message)
    }

    res.json({ ok: true, variantGameData: variantData, profileSnapshot: snapshot, persisted: hasTable })
  } catch (err) {
    next(err)
  }
})

/* ── POST /api/quests/:id/review-quest — יצירת "הדמיית חזרה" מהמושגים החלשים ──
   לולאת ה-spaced-retrieval: השרת מחשב את המושגים/היעדים שהכיתה נכשלה בהם (מה-events
   המסוכמים), ומייצר הרפתקת-המשך קצרה (4 סצנות) שבוחנת אותם **מזווית חדשה** דרך צינור
   היצירה הרגיל (בטיחות/ולידציה/fact-check — הכל כלול). תמונות ממוחזרות מההדמיה
   המקורית (אפס עלות תמונות). ההדמיה החדשה נושאת reviewOf + objectives של היעדים
   החלשים — כך דיווח השליטה מודד את שיפור החזרה מול המקור.
   הרשאה: אותו כלל כמו מסך התוצאות (loadReviewBasis) — מנהל/עירוני 403; מטלה שאינה קיימת *או שאינה גלויה למורה* 404 אחיד; ובנוסף המורה
   חייב להיות יוצר ההדמיה (ensureOwner). התחומים לחיזוק מחושבים בליבת התוצאות (אותו מקור כמו review.weakCount שבמסך), ורק אחרי
   שלפחות REVIEW_MIN_COMPLETED תלמידים סיימו — כדי שהדמיה חדשה (שאפשר גם לשתף) לא תיבנה על ביצועים של תלמיד/ה בודד/ת. */
const reviewQuestSchema = z.object({ assignmentId: z.string().uuid() })

questsRouter.post('/:id/review-quest', requireStaff, async (req, res, next) => {
  try {
    const parsed = reviewQuestSchema.safeParse(req.body)
    if (!parsed.success) throw new AppError(400, 'assignmentId נדרש')

    const basis = await loadReviewBasis(req, parsed.data.assignmentId, String(req.params.id))
    const asg = { id: parsed.data.assignmentId, class_id: basis.classId }

    const { data: base, error: baseErr } = await supabaseAdmin
      .from('quests')
      .select('id, title, curriculum, art_style, difficulty_settings, game_data, created_by')
      .eq('id', req.params.id)
      .single()
    if (baseErr || !base?.game_data) throw new AppError(404, 'שיעור לא נמצא')
    await ensureOwner(req, base.created_by)

    if (basis.completed < REVIEW_MIN_COMPLETED) {
      throw new AppError(400, `אפשר ליצור שיעור חזרה אחרי ש-${REVIEW_MIN_COMPLETED} תלמידים לפחות סיימו את השיעור — עד אז אין מספיק נתונים`)
    }
    const concepts = weakConceptsFromReview(basis.concepts, base.game_data)
    if (concepts.length === 0) {
      throw new AppError(400, 'אין מושגים חלשים לחיזוק — הכיתה שלטה בחומר או שאין עדיין מספיק נתונים')
    }

    /* יעדי שיעור החזרה = המושגים החלשים (עד 8) */
    const objectives = concepts.slice(0, 8).map((c, i) => ({ id: `obj_${i + 1}`, text: c.text }))

    /* מאגר תמונות למיחזור מהשיעור המקורי */
    const baseGd = base.game_data as { scenes?: { imageUrl?: string }[]; endingGood?: { imageUrl?: string }; endingBad?: { imageUrl?: string } }
    const imagePool = {
      scenes: (baseGd.scenes ?? []).map((s) => s.imageUrl).filter((u): u is string => !!u),
      endingGood: baseGd.endingGood?.imageUrl,
      endingBad: baseGd.endingBad?.imageUrl,
    }

    const reviewTitle = `חזרה: ${base.title}`.slice(0, 120)
    /* שיעור חזרה יורש את מקצוע השיעור המקורי */
    const inheritedSubject = await subjectFieldsOfQuest(base.id)
    const params: QuestGenerationParams = {
      title: reviewTitle,
      subjectName: inheritedSubject.subjectName ?? undefined,
      curriculum: (base.curriculum as string | null) ?? '',
      questLength: 4,
      puzzlePreferences: { types: { multipleChoice: true, trueFalse: true, wordCompletion: true } },
      difficultySettings: (base.difficulty_settings as Record<string, unknown> | null) ?? undefined,
      includeDrHolo: true,
      artStyle: (base.art_style as string | null) ?? undefined,
      questType: 'adventure',
      formOfAddress: 'plural',
      objectives,
      reviewContext: reviewContextBlock(base.title, concepts),
      reviewOf: { questId: base.id, assignmentId: asg.id, baseTitle: base.title },
      imagePool: imagePool.scenes.length > 0 ? imagePool : undefined,
    }

    const stub: Record<string, unknown> = {
      title: reviewTitle,
      curriculum: params.curriculum,
      quest_type: 'adventure',
      quest_length: params.questLength,
      art_style: base.art_style ?? 'digital-painting',
      include_dr_holo: true,
      puzzle_preferences: params.puzzlePreferences ?? {},
      difficulty_settings: params.difficultySettings ?? {},
      game_data: { generating: true },
      status: 'draft',
      created_by: req.staff!.userId,
      ...inheritedSubject.fields,
    }
    const { data: created, error: insErr } = await supabaseAdmin.from('quests').insert(stub).select('id').single()
    if (insErr || !created) throw new AppError(500, 'יצירת שיעור החזרה נכשלה: ' + (insErr?.message ?? ''))

    /* מחזירים מיד — היצירה רצה ברקע (הקליינט עושה polling ל-GET /:id) */
    res.status(201).json({ questId: created.id, title: reviewTitle, weakConcepts: concepts.length })
    void generateQuestInBackground(created.id, params, req.staff!.userId)
  } catch (err) {
    next(err)
  }
})

/* POST /api/quests/:id/share — שיתוף השיעור לספרייה הציבורית (היוצר בלבד, ללא אישור מראש) */
questsRouter.post('/:id/share', requireStaff, requireCanShare, async (req, res, next) => {
  try {
    if (!(await hasPublicQuests())) throw new AppError(503, 'הספרייה הציבורית עדיין לא זמינה (נדרשת מיגרציה)')
    const { data: quest, error } = await supabaseAdmin
      .from('quests')
      .select('id, created_by, original_author_id, game_data')
      .eq('id', req.params.id)
      .single()
    if (error || !quest) throw new AppError(404, 'שיעור לא נמצא')
    await ensureQuestAccess(req, quest as { created_by?: string | null; anon_id?: string | null })

    /* שער איכות (תיקון 3): תוכן פגום לא נכנס לספרייה שכל המורים מעתיקים ממנה.
       סתירת תשובה/הסבר חיה (כולל כזו שנוצרה בעריכת מורה) — חסימה קשיחה עד תיקון;
       אזהרות פתוחות (fact-check/יצירה/עקביות) — שיתוף רק אחרי אישור מפורש של המורה. */
    const gd = quest.game_data as GameData | null
    if (gd?.scenes) {
      const blocking = checkAnswerConsistency(gd).blocking
      if (blocking.length > 0) {
        throw new AppError(422, `לא ניתן לשתף — נמצאה סתירה בין התשובה המסומנת להסבר (תלמיד ייכשל על תשובה נכונה). תקנו בעמוד העריכה ונסו שוב:\n${blocking.join('\n')}`)
      }
      const open = collectOpenWarnings(gd)
      if (open.length > 0 && req.body?.acknowledgeWarnings !== true) {
        res.status(409).json({
          error: 'לשיעור יש אזהרות פתוחות — יש לעבור עליהן ולאשר לפני השיתוף.',
          warnings: open,
          needsAck: true,
        })
        return
      }
    }

    const patch: Record<string, unknown> = {
      is_public: true,
      published_at: new Date().toISOString(),
      original_author_id: (quest as { original_author_id?: string | null }).original_author_id ?? quest.created_by,
    }
    const { error: upErr } = await supabaseAdmin.from('quests').update(patch).eq('id', quest.id)
    if (upErr) throw new AppError(500, 'שגיאה בשיתוף: ' + upErr.message)
    res.json({ ok: true, is_public: true })
  } catch (err) {
    next(err)
  }
})

/* POST /api/quests/:id/unshare — הסרת ההדמיה מהספרייה הציבורית (היוצר בלבד) */
questsRouter.post('/:id/unshare', requireStaff, async (req, res, next) => {
  try {
    if (!(await hasPublicQuests())) throw new AppError(503, 'הספרייה הציבורית עדיין לא זמינה')
    const { data: quest, error } = await supabaseAdmin.from('quests').select('id, created_by, anon_id').eq('id', req.params.id).single()
    if (error || !quest) throw new AppError(404, 'שיעור לא נמצא')
    await ensureQuestAccess(req, quest as { created_by?: string | null; anon_id?: string | null })
    const { error: upErr } = await supabaseAdmin.from('quests').update({ is_public: false }).eq('id', quest.id)
    if (upErr) throw new AppError(500, 'שגיאה בהסרה: ' + upErr.message)
    res.json({ ok: true, is_public: false })
  } catch (err) {
    next(err)
  }
})

/* POST /api/quests/:id/assign — הקצאת הדמיה לכיתות (יוצר ההדמיה)
   body: { classIds: string[] } — מזהי כיתות UUID; כיתה שכבר מוקצית לה ההדמיה מדולגת (אין כפילות).
   הרשאה לכל כיתה: המורה חייב להיות משויך אליה (כל קישור), או מנהל/עירוני של בית הספר שלה, או מנהל-על (authz.canAssignToClass).
   מדיניות: **הכול או כלום** — אם לפחות כיתה אחת אינה קיימת או שאין למבקש גישה אליה, כל הבקשה נדחית ב-403 (הודעה אחת לשני המקרים,
   כדי שלא לחשוף אילו כיתות קיימות) ושום הקצאה לא נוצרת.
   assignments.user_id = השולח (המשתמש המחובר), נפרד מ-quests.created_by — כך מסך התוצאות מבדיל בין "מי שלח" ל"מי יצר". */
const MAX_ASSIGN_CLASSES = 100
/* dueDay (YYYY-MM-DD, יום ישראלי) → סוף היום 23:59; חסר → ברירת המחדל (שבוע מהיום). יום שכבר עבר — נדחה (400) */
const ASSIGN_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const ASSIGN_DENIED_MESSAGE = 'אין לך הרשאה להקצות לאחת הכיתות שנבחרו'
questsRouter.post('/:id/assign', requireStaff, requireCanShare, async (req, res, next) => {
  try {
    const rawIds = (req.body as { classIds?: unknown } | undefined)?.classIds
    if (!Array.isArray(rawIds) || rawIds.length === 0 || !rawIds.every((id) => typeof id === 'string')) throw new AppError(400, 'חסר classIds')
    const classIds = [...new Set(rawIds as string[])]

    /* מועד הגשה: dueDay מהשדה בטופס השליחה, או ברירת מחדל. הפונקציות ב-shared/lib/lessonState (מקור יחיד גם לקליינט) */
    const rawDue = (req.body as { dueDay?: unknown } | undefined)?.dueDay
    let dueAt: Date
    if (rawDue === undefined || rawDue === null || rawDue === '') dueAt = defaultDueAt(new Date())
    else {
      const parsedDue = typeof rawDue === 'string' ? dueAtFromDay(rawDue) : null
      if (!parsedDue) throw new AppError(400, ERR_DUE_INVALID)
      if (parsedDue.getTime() < Date.now()) throw new AppError(400, ERR_DUE_PAST)
      dueAt = parsedDue
    }

    /* מורה אורח: הכיתה וירטואלית (demo-class-1) — אין שורות DB בדמו */
    if (isDemoGuest(req) && classIds.every((id) => id.startsWith('demo-'))) {
      res.status(201).json({ assignments: [], demo: true })
      return
    }
    if (classIds.length > MAX_ASSIGN_CLASSES) throw new AppError(400, 'יותר מדי כיתות בבקשה אחת')
    if (!classIds.every((id) => ASSIGN_UUID_RE.test(id))) throw new AppError(400, 'מזהה כיתה לא תקין')

    const { data: quest, error } = await supabaseAdmin.from('quests').select('id, created_by, anon_id').eq('id', req.params.id).single()
    if (error || !quest) throw new AppError(404, 'שיעור לא נמצא')
    await ensureQuestAccess(req, quest as { created_by?: string | null; anon_id?: string | null })

    /* הרשאה פר-כיתה (לפני כל כתיבה): כיתה לא קיימת או בלי גישה — דוחים את הכול */
    const viewer = await loadViewer(req)
    const { data: classRows, error: classErr } = await supabaseAdmin.from('classes').select('id, school_id').in('id', classIds)
    if (classErr) throw new AppError(500, 'שגיאה בבדיקת הכיתות: ' + classErr.message)
    const classById = new Map((classRows ?? []).map((c: { id: string; school_id: string | null }) => [c.id, c]))
    if (classIds.some((id) => { const c = classById.get(id); return !c || !canAssignToClass(viewer, c) })) {
      throw new AppError(403, ASSIGN_DENIED_MESSAGE)
    }

    /* סינון כיתות שכבר מוקצות — מניעת כפילויות ללא unique constraint */
    const { data: existing } = await supabaseAdmin
      .from('assignments').select('class_id').eq('quest_id', quest.id).in('class_id', classIds)
    const existingIds = new Set((existing ?? []).map((r: { class_id: string }) => r.class_id))
    const fresh = classIds.filter((id: string) => !existingIds.has(id))

    const inserted: { id: string; class_id: string }[] = []
    if (fresh.length > 0) {
      /* user_id = השולח. מנהל-על מזוהה לפי אימייל וייתכן שאין לו שורה ב-users (FK) — אצלו נשאר ריק. סביבה בלי העמודה — מכניסים בלעדיה */
      const sender = req.staff!.role === 'super_admin' ? {} : { user_id: req.staff!.userId }
      const due = (await hasAssignmentDueAt()) ? { due_at: dueAt.toISOString() } : {}
      const rows = fresh.map((classId: string) => ({ quest_id: quest.id, class_id: classId, ...sender, ...due }))
      let ins = await supabaseAdmin.from('assignments').insert(rows).select('id, class_id')
      if (ins.error && isSchemaMissingError(ins.error)) {
        ins = await supabaseAdmin.from('assignments').insert(fresh.map((classId: string) => ({ quest_id: quest.id, class_id: classId, ...due }))).select('id, class_id')
      }
      if (ins.error) throw new AppError(500, 'שגיאה ביצירת הקצאות: ' + ins.error.message)
      if (ins.data) inserted.push(...ins.data)
    }

    res.status(201).json({ assignments: inserted, dueAt: dueAt.toISOString() })
  } catch (err) {
    next(err)
  }
})

/* DELETE /api/quests/:id — מחיקת הדמיה (בעל ההדמיה או מנהל) */
questsRouter.delete('/:id', requireCreator, async (req, res, next) => {
  try {
    const { data: quest, error } = await supabaseAdmin
      .from('quests')
      .select('id, created_by, anon_id')
      .eq('id', req.params.id)
      .single()
    if (error || !quest) throw new AppError(404, 'שיעור לא נמצא')
    await ensureQuestAccess(req, quest as { created_by?: string | null; anon_id?: string | null })

    const { error: delError } = await supabaseAdmin.from('quests').delete().eq('id', quest.id)
    if (delError) throw new AppError(500, 'שגיאה במחיקה: ' + delError.message)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

/* ── עריכת סצנה בודדת — עדכון חלקי של game_data ── */

/* עריכת חידה — כל השדות הספציפיים-לסוג נתמכים (לא רק multipleChoice/trueFalse) כדי
   שלמורה תמיד תהיה דרך לערוך כל סוג אתגר: wordSearch (words), memory (pairs),
   wordCompletion (sentence/answer/answers/wordBank), sequenceOrder (items/correctOrder/
   orderType), hangman (answer/maxWrong), moralDilemma (situation/moralChoices), finalQuiz
   (questions[]). */
const patchPuzzleSchema = z.object({
  question: z.string().optional(),
  choices: z
    .array(z.object({ id: z.string(), text: z.string(), isCorrect: z.boolean() }))
    .optional(),
  explanationCorrect: z.string().optional(),
  explanationIncorrect: z.string().optional(),
  words: z.array(z.string().min(1)).optional(),
  pairs: z.array(z.object({ a: z.string().min(1), b: z.string().min(1) })).optional(),
  sentence: z.string().optional(),
  answer: z.string().optional(),
  answers: z.array(z.string().min(1)).optional(),
  wordBank: z.array(z.string().min(1)).optional(),
  items: z.array(z.object({ id: z.string().min(1), text: z.string().min(1), imagePrompt: z.string().optional() })).optional(),
  correctOrder: z.array(z.string().min(1)).optional(),
  orderType: z.enum(['chronological', 'logical', 'hierarchical']).optional(),
  maxWrong: z.number().int().min(3).max(10).optional(),
  situation: z.string().optional(),
  moralChoices: z.array(z.object({ text: z.string().min(1), consequence: z.string().min(1) })).optional(),
  objectiveId: z.string().nullable().optional(),
  questions: z
    .array(
      z.object({
        question: z.string().min(1),
        options: z.array(z.string().min(1)).min(2),
        correctIndex: z.number().int().min(0),
        explanationCorrect: z.string().optional(),
        explanationIncorrect: z.string().optional(),
        objectiveId: z.string().optional(),
      }),
    )
    .optional(),
})

const patchSceneSchema = z.object({
  sceneId: z.string(),
  narrative: z.string().optional(),
  imagePrompt: z.string().optional(),
  drHoloExpression: z.string().optional(),
  drHoloDialog: z.string().optional(),
  title: z.string().optional(),
  puzzle: patchPuzzleSchema.optional(),
})

/* סצנה גנרית בתוך game_data — לעריכה בלבד */
interface EditableScene {
  id: string
  title?: string
  narrative?: string
  imagePrompt?: string
  drHoloExpression?: string
  drHoloDialog?: string
  puzzle?: {
    question?: string
    choices?: { id: string; text: string; isCorrect: boolean }[]
    explanationCorrect?: string
    explanationIncorrect?: string
    words?: string[]
    pairs?: { a: string; b: string }[]
    sentence?: string
    answer?: string
    answers?: string[]
    wordBank?: string[]
    items?: { id: string; text: string; imagePrompt?: string }[]
    correctOrder?: string[]
    orderType?: 'chronological' | 'logical' | 'hierarchical'
    maxWrong?: number
    situation?: string
    moralChoices?: { text: string; consequence: string }[]
    objectiveId?: string | null
    questions?: { question: string; options: string[]; correctIndex: number; explanationCorrect?: string; explanationIncorrect?: string; objectiveId?: string }[]
  }
}

interface EditableEnding {
  title?: string
  narrative?: string
  drHoloDialog?: string
  imagePrompt?: string
  imageUrl?: string
  drHoloExpression?: string
}

/* POST /api/quests/:id/scene/:sceneId/shorten — הצעת קיצור לסצנה ארוכה מדי למסך אחד (כלל "אורך טקסט לתלמיד").
   body (אופציונלי): { narrative?, drHoloDialog? } — הטקסט הנוכחי בעורך (שטרם נשמר). לא שומר: מחזיר לפני/אחרי + בדיקות. */
const shortenBodySchema = z.object({ narrative: z.string().max(4000).optional(), drHoloDialog: z.string().max(2000).optional() })
questsRouter.post('/:id/scene/:sceneId/shorten', requireCreator, rateLimitByUser('scene-shorten', 12), async (req, res, next) => {
  try {
    const body = shortenBodySchema.safeParse(req.body ?? {})
    if (!body.success) throw new AppError(400, 'בקשה לא תקינה')
    const { data: quest, error } = await supabaseAdmin.from('quests').select('id, game_data, created_by, anon_id').eq('id', req.params.id).single()
    if (error || !quest?.game_data) throw new AppError(404, 'שיעור לא נמצא')
    ensureQuestAccess(req, quest as { created_by?: string | null; anon_id?: string | null })
    const gd = quest.game_data as GameData & { readingScale?: number }
    const scene = gd.scenes?.find((s) => s.id === req.params.sceneId)
    if (!scene) throw new AppError(404, 'סצנה לא נמצאה')
    const probe = { ...scene, ...(body.data.narrative !== undefined ? { narrative: body.data.narrative } : {}), ...(body.data.drHoloDialog !== undefined ? { drHoloDialog: body.data.drHoloDialog } : {}) }
    res.json(await proposeSceneShortening(probe, { level: gd.readingScale ?? 10 }))
  } catch (err) {
    next(err)
  }
})

/* PATCH /api/quests/:id/scene — עדכון חלקי של שדות סצנה בתוך game_data
   body: { sceneId, narrative?, imagePrompt?, puzzle? } */
questsRouter.patch('/:id/scene', requireCreator, async (req, res, next) => {
  try {
    const parsed = patchSceneSchema.safeParse(req.body)
    if (!parsed.success) {
      throw new AppError(400, 'בקשה לא תקינה: ' + parsed.error.message)
    }
    const { sceneId, narrative, imagePrompt, drHoloExpression, drHoloDialog, title, puzzle } = parsed.data

    const { data: quest, error } = await supabaseAdmin
      .from('quests')
      .select('id, game_data, created_by, anon_id')
      .eq('id', req.params.id)
      .single()

    if (error || !quest?.game_data) throw new AppError(404, 'שיעור לא נמצא')
    await ensureQuestAccess(req, quest as { created_by?: string | null; anon_id?: string | null })

    const gameData = quest.game_data as { scenes: EditableScene[]; endingGood?: EditableEnding; endingBad?: EditableEnding }

    /* עדכון סצנת סיום (endingGood / endingBad) — sceneId סינתטי */
    if (sceneId === '__endingGood__' || sceneId === '__endingBad__') {
      const ending = sceneId === '__endingGood__' ? gameData.endingGood : gameData.endingBad
      if (!ending) throw new AppError(404, 'סצנת הסיום לא נמצאה')
      if (title !== undefined) ending.title = title
      if (narrative !== undefined) ending.narrative = narrative
      if (drHoloDialog !== undefined) ending.drHoloDialog = drHoloDialog
      if (imagePrompt !== undefined) ending.imagePrompt = imagePrompt
      if (drHoloExpression !== undefined) ending.drHoloExpression = drHoloExpression
      const { error: updateError } = await supabaseAdmin.from('quests').update({ game_data: gameData }).eq('id', quest.id)
      if (updateError) throw new AppError(500, 'שגיאה בשמירה: ' + updateError.message)
      return res.json({ scene: { id: sceneId, ...ending } })
    }

    const scene = gameData.scenes.find((s) => s.id === sceneId)
    if (!scene) throw new AppError(404, 'סצנה לא נמצאה')

    /* עדכון רק של השדות שנשלחו (partial update) */
    if (title !== undefined) scene.title = title
    if (narrative !== undefined) scene.narrative = narrative
    if (imagePrompt !== undefined) scene.imagePrompt = imagePrompt
    if (drHoloExpression !== undefined) scene.drHoloExpression = drHoloExpression
    if (drHoloDialog !== undefined) scene.drHoloDialog = drHoloDialog
    if (puzzle !== undefined) {
      if (!scene.puzzle) throw new AppError(400, 'לסצנה זו אין חידה לעריכה')
      if (puzzle.question !== undefined) scene.puzzle.question = puzzle.question
      if (puzzle.choices !== undefined) scene.puzzle.choices = puzzle.choices
      if (puzzle.explanationCorrect !== undefined)
        scene.puzzle.explanationCorrect = puzzle.explanationCorrect
      if (puzzle.explanationIncorrect !== undefined)
        scene.puzzle.explanationIncorrect = puzzle.explanationIncorrect
      /* שדות ספציפיים-לסוג — כך שלכל סוג אתגר (לא רק multipleChoice/trueFalse) יש דרך עריכה */
      if (puzzle.words !== undefined) scene.puzzle.words = puzzle.words
      if (puzzle.pairs !== undefined) scene.puzzle.pairs = puzzle.pairs
      if (puzzle.sentence !== undefined) scene.puzzle.sentence = puzzle.sentence
      if (puzzle.answer !== undefined) scene.puzzle.answer = puzzle.answer
      if (puzzle.answers !== undefined) scene.puzzle.answers = puzzle.answers
      if (puzzle.wordBank !== undefined) scene.puzzle.wordBank = puzzle.wordBank
      if (puzzle.items !== undefined) scene.puzzle.items = puzzle.items
      if (puzzle.correctOrder !== undefined) scene.puzzle.correctOrder = puzzle.correctOrder
      if (puzzle.orderType !== undefined) scene.puzzle.orderType = puzzle.orderType
      if (puzzle.maxWrong !== undefined) scene.puzzle.maxWrong = puzzle.maxWrong
      if (puzzle.situation !== undefined) scene.puzzle.situation = puzzle.situation
      if (puzzle.moralChoices !== undefined) scene.puzzle.moralChoices = puzzle.moralChoices
      if (puzzle.questions !== undefined) scene.puzzle.questions = puzzle.questions
      if (puzzle.objectiveId !== undefined) scene.puzzle.objectiveId = puzzle.objectiveId ?? undefined
    }

    const { error: updateError } = await supabaseAdmin
      .from('quests')
      .update({ game_data: gameData })
      .eq('id', quest.id)
    if (updateError) throw new AppError(500, 'שגיאה בשמירה: ' + updateError.message)

    res.json({ scene })
  } catch (err) {
    next(err)
  }
})

/* PATCH /api/quests/:id/restore — "בטל שינויים": משחזר את ה-game_data המלא לסנאפשוט
   שנשמר בקליינט בטעינת דף העריכה (לפני כל עריכת סצנה/תמונה בסשן הנוכחי). כל שינוי
   בעמוד הזה (שמירת סצנה, יצירת-תמונה-מחדש) כבר נשמר מיידית ל-DB ברגע שנעשה — אין
   "טיוטה לא-שמורה" ברמת העמוד — ולכן שחזור אמיתי דורש כתיבה חוזרת לשרת, לא רק
   איפוס state מקומי. מקבל את ה-game_data המלא כמות-שהוא (בלי ולידציית סכמה מחדש)
   כדי לשמר שדות-מטא שהוזרקו בזמן ריצה (factCheck/genMeta/readingScale) בלי לאבד אותם. */
questsRouter.patch('/:id/restore', requireCreator, async (req, res, next) => {
  try {
    const gameData = req.body?.gameData
    if (!gameData || !Array.isArray(gameData.scenes)) {
      throw new AppError(400, 'gameData לא תקין')
    }
    const { data: quest, error } = await supabaseAdmin
      .from('quests')
      .select('id, created_by, anon_id')
      .eq('id', req.params.id)
      .single()
    if (error || !quest) throw new AppError(404, 'שיעור לא נמצא')
    await ensureQuestAccess(req, quest as { created_by?: string | null; anon_id?: string | null })

    const { error: updateError } = await supabaseAdmin.from('quests').update({ game_data: gameData }).eq('id', quest.id)
    if (updateError) throw new AppError(500, 'שגיאה בשחזור: ' + updateError.message)

    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

/* PATCH /api/quests/:id — עריכת שדות ברמת ההדמיה: title ו/או subjectCode (שיוך מהיר מהספרייה) */
questsRouter.patch('/:id', requireCreator, async (req, res, next) => {
  try {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : undefined
    if (title !== undefined && title.length === 0) throw new AppError(400, 'שם השיעור לא יכול להיות ריק')
    const subjectCode = typeof req.body?.subjectCode === 'string' ? req.body.subjectCode : undefined
    if (subjectCode !== undefined && !isSubjectCode(subjectCode)) throw new AppError(400, 'מקצוע לא מוכר')

    const { data: quest, error } = await supabaseAdmin
      .from('quests')
      .select('id, created_by, anon_id')
      .eq('id', req.params.id)
      .single()
    if (error || !quest) throw new AppError(404, 'שיעור לא נמצא')
    await ensureQuestAccess(req, quest as { created_by?: string | null; anon_id?: string | null })

    const patch: Record<string, unknown> = {}
    if (title !== undefined) patch.title = title
    let subjectOut: { subject: string | null; subjectCode: string | null } | undefined
    if (subjectCode !== undefined) {
      const row = await subjectByCode(subjectCode)
      if (await hasQuestSubject()) patch.subject = row?.nameHe ?? subjectName_(subjectCode)
      if (row && (await hasQuestSubjectId())) patch.subject_id = row.id
      else if (!row && (await hasQuestSubjectId())) throw new AppError(503, 'טבלת המקצועות טרם הוגדרה')
      subjectOut = { subject: row?.nameHe ?? subjectName_(subjectCode), subjectCode }
    }
    if (Object.keys(patch).length === 0) throw new AppError(400, 'אין שדות לעדכון')

    const { error: updateError } = await supabaseAdmin.from('quests').update(patch).eq('id', quest.id)
    if (updateError) throw new AppError(500, 'שגיאה בשמירה: ' + updateError.message)
    /* שיוך מקצוע משנה אילו משחקים נספרים באנליטיקה — מבטלים את מטמון ניתוחי הכיתות כדי שהמורה תראה את השינוי בכניסה הבאה */
    if (subjectOut) invalidateAllClassAnalyses()

    res.json({ ok: true, title, ...(subjectOut ?? {}) })
  } catch (err) {
    next(err)
  }
})

/* POST /api/quests/:id/refine — "בצע שיפורים": מריץ על-פי-דרישה את בדיקת העובדות/התקניות
   (runFactCheck, Haiku) ומחיל את התיקונים שזוהו (scopedFactFix) — אותם תיקונים המופיעים
   ב"אזהרות מבנה". שומר את ה-game_data המעודכן ומחזיר אותו + מספר הסצנות שתוקנו + אזהרות
   שנותרו (אם נשארו). דורש בעלות. */
questsRouter.post('/:id/refine', requireCreator, async (req, res, next) => {
  try {
    const { data: quest, error } = await supabaseAdmin
      .from('quests')
      .select('id, game_data, created_by, anon_id')
      .eq('id', req.params.id)
      .single()
    if (error || !quest?.game_data) throw new AppError(404, 'שיעור לא נמצא')
    await ensureQuestAccess(req, quest as { created_by?: string | null; anon_id?: string | null })

    const gameData = quest.game_data as GameData
    const fc = await runFactCheck(gameData)
    let correctedSceneIds: string[] = []
    let warnings: string[] = []
    if (fc.ok && fc.errors.length > 0) {
      const fix = await scopedFactFix(gameData, fc.errors)
      correctedSceneIds = fix.corrected
      /* אזהרות שנותרו: סצנות שלא תוקנו (כולל תיקון ששוחזר) + בדיקה חוזרת על מה שתוקן */
      const unfixed = fc.errors.filter((e) => !e.sceneId || !fix.corrected.includes(e.sceneId))
      warnings = unfixed.map(factWarning)
      if (fix.corrected.length > 0) {
        const recheck = await runFactCheck(gameData, fix.corrected)
        if (recheck.ok) warnings = [...warnings, ...recheck.errors.map(factWarning)]
      }
      const meta = gameData as unknown as { factCheck?: FactCheckMeta }
      meta.factCheck = { status: 'done', warnings, correctedSceneIds }
      const { error: upErr } = await supabaseAdmin.from('quests').update({ game_data: gameData }).eq('id', quest.id)
      if (upErr) throw new AppError(500, 'שגיאה בשמירה: ' + upErr.message)
    }
    res.json({ gameData, correctedSceneIds, warnings })
  } catch (err) {
    next(err)
  }
})

/* מטא יצירה שנשמר בתוך game_data בזמן/בסיום היצירה — הקליינט עושה polling וקורא אותו.
   generating=true בזמן היצירה; genError=הודעה אם נכשלה; genMeta=warnings/hub בסיום. */
interface GenMeta { warnings?: string[]; hub?: HubInfo | null; fit?: FitStats | null; address?: { found: number; fixed: number; remaining: number; keptCharacterSpeech: number } | null }

/* ניתוב היצירה הראשית: Gemini (CONTENT_GEMINI) או Sonnet (callClaude, ברירת מחדל).
   ל-Gemini מקפלים שיחת-retry רב-הודעתית להודעת-user אחת (systemInstruction נפרד),
   תקציב פלט גדול (JSON ארוך + thinking של 2.5). הפלט עובר את **אותה ולידציית schema**. */
async function genModelCall(messages: { role: 'user' | 'assistant'; content: string }[], system?: string): Promise<string> {
  if (engineFor('generation') !== 'gemini') return callClaude(messages, system)
  const folded = messages.map((m) => (m.role === 'assistant' ? `\n[הפלט הקודם שהחזרת]:\n${m.content}` : m.content)).join('\n\n')
  return callGeminiJSON(system ?? '', folded, 40000)
}

/* ── מקבול יצירה לינארית: שלד סדרתי קצר → מילוי סצנות במקביל → שיא+סיומים אחרון ──
   רק להדמיות לינאריות (ללא מפתחות/Hub). מחזיר GameData מורכב ומאומת; כל כשל זורק
   ונופל לנתיב הסדרתי. הרווח: זמן הסצנה האיטית במקום סכום כל הסצנות. */
async function generateLinearParallel(params: QuestGenerationParams): Promise<GameData> {
  const sx = (from: number) => ((Date.now() - from) / 1000).toFixed(1)

  /* 1. שלד — קריאה קצרה סדרתית */
  const tSk = Date.now()
  const skel = extractJson(await genModelCall([{ role: 'user', content: buildSkeletonPrompt(params) }])) as QuestSkeleton
  if (!skel || !Array.isArray(skel.scenes) || skel.scenes.length < 2) throw new Error('שלד לא תקין')
  const ids = skel.scenes.map((s) => s.id)
  if (new Set(ids).size !== ids.length || ids.some((id) => !id)) throw new Error('שלד: מזהי סצנות כפולים/חסרים')
  info(`[gen][מקבול] שלד: ${sx(tSk)}ש׳ · ${skel.scenes.length} סצנות`)

  const lastIdx = skel.scenes.length - 1

  /* 2. מילוי פתיחה+ביניים במקביל (כל הסצנות חוץ מהשיא) */
  const tFill = Date.now()
  const filled = await Promise.all(
    skel.scenes.slice(0, lastIdx).map(async (s, i) => {
      const scene = extractJson(await genModelCall([{ role: 'user', content: buildScenePrompt(params, skel, i) }])) as Record<string, unknown>
      if (!scene || typeof scene !== 'object' || !scene.title) throw new Error(`סצנה ${s.id} לא נכתבה`)
      scene.id = s.id
      scene.nextSceneId = skel.scenes[i + 1].id /* נעילת השרשור לשלד */
      delete scene.choices /* לינארי — בלי בחירות */
      return scene
    }),
  )
  info(`[gen][מקבול] מילוי ${filled.length} סצנות במקביל: ${sx(tFill)}ש׳`)

  /* 3. שיא + סיומים — אחרון, עם הנרטיבים שנכתבו (למבחן סיכום אינטגרטיבי) */
  const tCl = Date.now()
  const summaries = filled.map((s) => ({ id: String(s.id), title: String(s.title ?? ''), narrative: String(s.narrative ?? '') }))
  const cx = extractJson(await genModelCall([{ role: 'user', content: buildClimaxPrompt(params, skel, summaries) }])) as Record<string, any>
  if (!cx?.climax?.id && !cx?.climax?.title) throw new Error('שיא לא נכתב')
  cx.climax.id = skel.scenes[lastIdx].id
  cx.climax.nextSceneId = null
  delete cx.climax.choices
  info(`[gen][מקבול] שיא+סיומים: ${sx(tCl)}ש׳`)

  /* 4. הרכבה לפי סדר השלד */
  const assembled = {
    scenes: [...filled, cx.climax],
    entrySceneId: skel.scenes[0].id,
    isHistorical: !!skel.isHistorical,
    endingGood: cx.endingGood,
    endingBad: cx.endingBad,
  }

  /* 5. ולידציה — כשל → fallback לסדרתי */
  repairRawPuzzles(assembled) /* עמידות: תקן חידות חסרות-question לפני הולידציה */
  const v = validateGameData(assembled, 0)
  if (!v.ok) throw new Error('ולידציית ההרכבה נכשלה: ' + v.reason)
  if (params.includeDrHolo && (!v.data.endingGood || !v.data.endingBad)) throw new Error('חסרות סצנות סיום בהרכבה')
  return v.data
}

/* ── יצירת ההדמיה ברקע ──
   רצה אחרי שה-route כבר החזיר את ה-id (מנתק את היצירה הארוכה ~130-170ש׳ מ-timeout
   של ה-proxy בפרודקשן). בסיום מעדכן את game_data בשורה; בכשל כותב genError. */
async function generateQuestInBackground(questId: string, params: QuestGenerationParams, teacherId?: string): Promise<void> {
  /* עיגון עובדתי (best-effort, כבוי כברירת מחדל — GROUNDING=1 + GEMINI_API_KEY). מזריק
     עובדות מאומתות לתוכנית הלימוד לפני בניית הפרומפט. כשל/כבוי → params ללא שינוי. */
  const gparams = await groundCurriculum(params)
  const expectedKeys = requiredKeyCount(gparams)
  const { system: genSystem, user: prompt } = buildQuestPrompt(gparams)
  const tStart = Date.now()
  const secs = (from: number) => ((Date.now() - from) / 1000).toFixed(1)
  let retryCount = 0
  info(`[gen] התחלה (רקע) · אורך פרומפט ${prompt.length}+${genSystem.length} תווים · ${params.questLength} סצנות · מפתחות צפויים ${expectedKeys}`)

  try {
    let gameData: GameData | null = null
    let warnings: string[] = []
    let hubInfo: HubInfo | undefined

    /* נתיב מקבול לינארי (ללא מפתחות/Hub) — שלד קצר → סצנות במקביל. fallback בטוח לסדרתי.
       **כבוי כברירת מחדל** (PARALLEL_GEN=1 להפעלה): אבחון הראה שלקווסטים קצרים (~4 סצנות)
       הוא איטי יותר מהקריאה המונוליטית — תקורת הקריאה-לכל-סצנה (עיבוד הכללים מחדש בכל
       סצנה) + מונוליט השיא+סיומים עולים על רווח המקביליות. נשמר לאופטימיזציה עתידית
       (פרומפטים רזים per-סצנה / קווסטים ארוכים שבהם זמן-הסצנה-האיטית « הסכום). */
    let producedParallel = false
    if (expectedKeys === 0 && process.env.PARALLEL_GEN === '1') {
      try {
        gameData = await generateLinearParallel(gparams)
        producedParallel = true
        info(`[gen] ✓ נתיב מקבול לינארי`)
      } catch (e) {
        warn('[gen] מקבול נכשל → נתיב סדרתי:', e instanceof Error ? e.message : e)
      }
    }

    if (!producedParallel) {
    /* ── נתיב סדרתי (Hub / fallback): קריאה אחת + ולידציה + retry ── */
    const tMain = Date.now()
    const firstText = await genModelCall([{ role: 'user', content: prompt }], genSystem)
    info(`[gen] קריאה ראשית (${engineFor('generation')}): ${secs(tMain)} שניות · פלט ${firstText.length} תווים`)

    let raw: unknown
    try {
      raw = extractJson(firstText)
    } catch {
      /* פלט לא-parseable (JSON קטוע/שבור) — מגיע לו retry אחד בדיוק כמו כשל ולידציה,
         לא כשל סופי: קווסט ארוך נקטע לפעמים באמצע. ה-retry ממשיך את השיחה. */
      retryCount++
      warn('[gen] הפלט הראשון אינו JSON תקין — retry אחד')
      const tRetry = Date.now()
      const retryText = await genModelCall([
        { role: 'user', content: prompt },
        { role: 'assistant', content: firstText.slice(-4000) },
        { role: 'user', content: 'הפלט שהחזרת אינו JSON תקין (שבור או קטוע). החזר עכשיו את ה-JSON המלא והתקין של השיעור, מההתחלה ועד הסוף, ללא שום טקסט נוסף.' },
      ], genSystem)
      info(`[gen] retry-parse (sonnet): ${secs(tRetry)} שניות · פלט ${retryText.length} תווים`)
      try {
        raw = extractJson(retryText)
      } catch {
        throw new AppError(502, 'Claude החזיר JSON לא תקין (גם אחרי ניסיון חוזר)')
      }
    }

    /* ולידציה מלאה לניסיון: סכמה + מפתחות + מבנה Hub. מחזירה הודעת retry אם נכשל */
    function fullValidate(candidate: unknown): {
      data?: GameData
      retryMessage?: string
      fatal?: string
      hub?: HubInfo
      structureErrors?: string[]
      consistencyErrors?: string[]
    } {
      /* עמידות: תקן חידות חסרות-question לפני הולידציה הקשיחה (שלא תיפול כל ההדמיה) */
      for (const w of repairRawPuzzles(candidate)) { if (!warnings.includes(w)) warnings.push(w) }
      const result = validateGameData(candidate, expectedKeys)
      if (!result.ok) {
        return {
          retryMessage:
            result.reason === 'key count mismatch'
              ? buildRetryMessage(expectedKeys, result.actualKeys ?? 0)
              : `ה-JSON שהחזרת אינו תואם לסכמה הנדרשת: ${result.reason}. תקן והחזר JSON תקין בלבד.`,
          fatal: 'יצירת הקווסט נכשלה: ' + result.reason,
        }
      }
      /* סצנות סיום — חובה כשד"ר הולו פעיל */
      if (params.includeDrHolo && (!result.data.endingGood || !result.data.endingBad)) {
        return {
          retryMessage:
            'חסרים שדות "endingGood" ו/או "endingBad" ברמה העליונה של ה-JSON. הוסף את שתי סצנות הסיום במעבדה (title, narrative, drHoloDialog) כמתואר בהנחיות, והחזר את ה-JSON המלא המתוקן בלבד.',
          fatal: 'חסרות סצנות סיום (endingGood/endingBad)',
        }
      }
      /* עקביות תשובות (דטרמיניסטי): אזהרות רכות (MC/מבחן) נצברות ל-warnings; חסימות
         (נכון/לא-נכון עם תשובה הפוכה מההסבר) → retry ממוקד, ואם נכשל שוב → אזהרה בולטת. */
      const consistency = checkAnswerConsistency(result.data)
      for (const w of consistency.warnings) { if (!warnings.includes(w)) warnings.push(w) }
      const consistencyErrors = consistency.blocking.length ? consistency.blocking : undefined
      const consistencyRetry = consistencyErrors
        ? `בחידות נכון/לא-נכון התשובה המסומנת (isCorrect) סותרת את מה שההסבר קובע. תקן כך שהסימון יתאים להסבר — שנה **אך ורק** את ה-isCorrect או את ניסוח ההיגד/ההסבר כדי שיהיו עקביים, בלי לגעת בשום שדה אחר:\n${consistencyErrors.map((e) => '- ' + e).join('\n')}\nהחזר את ה-JSON המלא המתוקן בלבד.`
        : undefined

      /* ולידציית מבנה Hub — רק כשנדרשים מפתחות */
      if (expectedKeys > 0) {
        const hubResult = validateHubStructure(result.data, expectedKeys)
        if (!hubResult.ok) {
          return {
            data: result.data,
            retryMessage: buildStructureRetryMessage(expectedKeys, hubResult.errors),
            structureErrors: hubResult.errors,
            hub: hubResult.hub,
          }
        }
        if (consistencyErrors) return { data: result.data, retryMessage: consistencyRetry, consistencyErrors, hub: hubResult.hub }
        return { data: result.data, hub: hubResult.hub }
      }
      if (consistencyErrors) return { data: result.data, retryMessage: consistencyRetry, consistencyErrors }
      return { data: result.data }
    }

    await recoverMissingQuestions(raw, warnings) /* רנדר-מחדש ממוקד לחידות-תוכן חסרות-question (לפני drop) */
    const first = fullValidate(raw)
    if (first.data && !first.retryMessage) {
      gameData = first.data
      hubInfo = first.hub
    } else {
      /* retry אחד עם הודעת תיקון מדויקת */
      retryCount++
      const tRetry = Date.now()
      info(`[gen] ולידציה נכשלה בניסיון 1 (${first.fatal ?? first.structureErrors?.join('; ') ?? 'מבנה'}) → retry`)
      const retryText = await genModelCall([
        { role: 'user', content: prompt },
        { role: 'assistant', content: firstText },
        { role: 'user', content: first.retryMessage! },
      ], genSystem)
      info(`[gen] retry (sonnet): ${secs(tRetry)} שניות`)

      let retryRaw: unknown
      try {
        retryRaw = extractJson(retryText)
      } catch {
        throw new AppError(502, 'Claude החזיר JSON לא תקין גם לאחר ניסיון תיקון')
      }

      await recoverMissingQuestions(retryRaw, warnings)
      const second = fullValidate(retryRaw)
      /* אוסף אזהרות רכות מ-structure/consistency שנותרו אחרי ה-retry (best-effort — לא מפילים) */
      const softWarnings = (v: ReturnType<typeof fullValidate>): string[] => [
        ...(v.structureErrors ?? []).map((e) => `מבנה הקווסט אינו תקין במלואו: ${e}`),
        ...(v.consistencyErrors ?? []).map((e) => `⚠ בדיקת תשובות: ${e}`),
      ]
      if (second.data && !second.retryMessage) {
        gameData = second.data
        hubInfo = second.hub
      } else if (second.data) {
        /* סכמה תקינה אבל נותרו בעיות מבנה/עקביות — מחזירים את הגרסה עם אזהרות בולטות למורה */
        gameData = second.data
        hubInfo = second.hub
        warnings = [...warnings, ...softWarnings(second)]
      } else if (first.data) {
        /* ה-retry החמיר (סכמה שבורה) — חוזרים לגרסה הראשונה עם אזהרותיה */
        gameData = first.data
        hubInfo = first.hub
        warnings = [...warnings, ...softWarnings(first)]
      } else {
        throw new AppError(502, second.fatal ?? 'יצירת הקווסט נכשלה לאחר ניסיון תיקון')
      }
    }
    } /* ── סוף הנתיב הסדרתי ── */

    if (!gameData) throw new AppError(502, 'יצירת השיעור נכשלה')

    /* כלל "פנייה לתלמיד" (CLAUDE.md): בדיקה דטרמיניסטית להפרות (אתה/את, ציווי ביחיד, לוכסן מגדרי…) ובקשת תיקון אחת.
       **לפני** קיצור האורך ובדיקת הבטיחות — הטקסט הסופי הוא שנבדק; העובדות/הדקדוק הרקעיים רצים עליו אחרי. best-effort. */
    let addressStats: { found: number; fixed: number; remaining: number; keptCharacterSpeech: number } | null = null
    try {
      const a = await fixStudentAddress(gameData)
      addressStats = { found: a.found, fixed: a.fixed, remaining: a.remaining.length, keptCharacterSpeech: a.kept.length }
      if (a.found > 0) info(`[gen] פנייה לתלמיד: נמצאו ${a.found} מקטעים, תוקנו ${a.fixed}, נותרו ${a.remaining.length}, דמות-לדמות ${a.kept.length}`)
      if (a.remaining.length > 0) warnings.push(`${a.remaining.length} מקטעי טקסט עדיין אינם בלשון רבים (${[...new Set(a.remaining.map((r) => r.sceneId))].slice(0, 4).join(', ')}) — כדאי לעבור עליהם בעורך`)
    } catch (err) {
      logError('[gen] בדיקת הפנייה לתלמיד נכשלה:', err instanceof Error ? err.message : err)
    }

    /* כלל "אורך טקסט לתלמיד" (CLAUDE.md): סצנה שחורגת מגובה המסך — קיצור (בקשה אחת, עם העובדות שהאתגר נשען עליהן),
       אחרת פיצול (סצנה ליניארית בלבד), אחרת סימון (התצוגה תחלק לעמודים). **לפני** בדיקת הבטיחות — כדי שהטקסט הסופי
       הוא שנבדק; בדיקות העובדות/הדקדוק הרקעיות רצות עליו אחרי. best-effort: כשל לא מפיל את היצירה. */
    let fitStats: FitStats | null = null
    try {
      fitStats = await enforceSceneFit(gameData, { level: clampLevel(params.difficultySettings?.puzzleDifficulty as number | undefined), form: params.formOfAddress ?? 'plural' })
    } catch (err) {
      logError('[gen] בדיקת אורך הטקסט נכשלה:', err instanceof Error ? err.message : err)
    }
    if (fitStats && fitStats.flagged > 0) {
      warnings.push(`${fitStats.flagged} סצנות ארוכות מדי למסך אחד של התלמיד — הן יוצגו בכמה עמודים עם "המשך". אפשר לקצר אותן בעורך הסצנה.`)
    }

    /* שכבת בטיחות — בדיקת פלט (רשת ביטחון, חוסמת *לפני* השמירה/החשיפה למורה בשורה
       למטה — לא ברקע כמו fact-check; תוכן חסום אסור שהמורה יראה אפילו לרגע) */
    const outputSafety = await runOutputSafetyCheck(gameData)
    if (outputSafety.blocked) {
      if (outputSafety.technical) throw new AppError(503, SAFETY_TECH_MESSAGE) /* fail-closed טכני — לא חסימת-תוכן */
      void logContentSafety({
        teacherId, questId, stage: 'output',
        category: outputSafety.category, title: params.title, excerpt: outputSafety.excerpt,
      })
      throw new AppError(422, SAFETY_BLOCK_MESSAGE)
    }

    /* הזרקת רמת הקושי לכל אתגר — לחישוב פרמטרי תצוגה בקליינט (פאזל/חיפוש מילים) */
    const level = clampLevel(params.difficultySettings?.puzzleDifficulty as number | undefined)
    for (const sc of gameData.scenes) if (sc.puzzle) sc.puzzle.difficulty = level
    /* ערבוב מיקומי התשובות — מנטרל את הטיית "הנכונה ראשונה" של המודל */
    shuffleAnswerPositions(gameData)
    /* רמת קריאה (1-20) ברמת ה-game_data — קובעת קצב אפקט ההקלדה בקליינט */
    ;(gameData as unknown as { readingScale?: number }).readingScale = level

    /* יעדי למידה — נשמרים ב-game_data (מקור האמת למיפוי סצנה→יעד באנליטיקה).
       בדיקת כיסוי רכה: יעד שאף אתגר לא מתויג בו → אזהרה למורה, לא כשל. */
    if (params.objectives && params.objectives.length > 0) {
      ;(gameData as unknown as { objectives?: typeof params.objectives }).objectives = params.objectives
      const covered = new Set<string>()
      for (const sc of gameData.scenes) {
        if (sc.puzzle?.objectiveId) covered.add(sc.puzzle.objectiveId)
        for (const q of sc.puzzle?.questions ?? []) if (q.objectiveId) covered.add(q.objectiveId)
      }
      const uncovered = params.objectives.filter((o) => !covered.has(o.id))
      if (uncovered.length > 0) {
        warnings.push(`יעדי למידה שלא נבחנים באף אתגר: ${uncovered.map((o) => `"${o.text}"`).join(', ')} — מומלץ לערוך אתגר ולתייג אותו ביעד`)
      }
    }

    /* הדמיית חזרה — סימון המקור + מיחזור תמונות מההדמיה המקורית (אפס עלות תמונות;
       אותו נושא, אז התמונות רלוונטיות. המורה יכול לרענן תמונה בודדת אם ירצה). */
    if (params.reviewOf) {
      ;(gameData as unknown as { reviewOf?: typeof params.reviewOf }).reviewOf = params.reviewOf
    }
    if (params.imagePool && params.imagePool.scenes.length > 0) {
      const pool = params.imagePool.scenes
      gameData.scenes.forEach((sc, i) => { if (!sc.imageUrl) sc.imageUrl = pool[i % pool.length] })
      if (gameData.endingGood && !gameData.endingGood.imageUrl && params.imagePool.endingGood) gameData.endingGood.imageUrl = params.imagePool.endingGood
      if (gameData.endingBad && !gameData.endingBad.imageUrl && params.imagePool.endingBad) gameData.endingBad.imageUrl = params.imagePool.endingBad
    }

    /* ניקוד Dicta (רמות ≤6) הועבר לשרשרת הרקע (factCheckInBackground) — חוסך את זמן
       ה-Dicta מ-time-to-teacher, וגם מתקן סדר: הניקוד רץ עכשיו *אחרי* שכתובי הניסוח
       הרקעיים (enforceNarrativePhrasing) במקום לפניהם, כך שהשכתוב לא מוחק אותו. */

    /* מטא ליצירה — הקליינט קורא בעת ה-polling. בדיקת עובדות תרוץ ברקע (pending). */
    ;(gameData as unknown as { factCheck?: FactCheckMeta }).factCheck = { status: 'pending', startedAt: new Date().toISOString() }
    ;(gameData as unknown as { genMeta?: GenMeta }).genMeta = { warnings, hub: hubInfo ?? null, fit: fitStats, address: addressStats }

    /* עדכון השורה (שכבר נוצרה כ-stub) עם ה-game_data המוכן */
    const { error } = await supabaseAdmin.from('quests').update({ game_data: gameData }).eq('id', questId)
    if (error) throw new AppError(500, 'שגיאה בשמירת השיעור: ' + error.message)

    info(`[gen] ━━ השיעור מוכן: ${secs(tStart)} שניות · retries=${retryCount} ━━`)

    /* שכבה 2: בדיקת עובדות + תיקון ממוקד + ולידציית ניסוח — ברקע (best-effort, לא חוסם) */
    void factCheckInBackground(questId, gameData, warnings, level, params.formOfAddress ?? 'plural', gparams.factBrief)
  } catch (err) {
    const msg = err instanceof AppError ? err.message : err instanceof Error ? err.message : 'יצירת השיעור נכשלה'
    logError('[gen] יצירה ברקע נכשלה:', msg)
    await supabaseAdmin.from('quests')
      .update({ game_data: { genError: msg } })
      .eq('id', questId)
      .then(({ error }) => { if (error) logError('[gen] שמירת genError נכשלה:', error.message) })
  }
}

/* POST /api/quests/generate — רושם שיעור "בעיצומו של יצירה" ומחזיר מיד; היצירה רצה
   ברקע (מנתק את היצירה הארוכה מ-timeout של ה-proxy). הקליינט עושה polling ל-GET /:id. */
questsRouter.post('/generate', requireCreator, async (req, res, next) => {
  /* מפתח הזהות לשומרים: מורה לפי userId, מבקר לפי עוגיית anon */
  const actorKey = req.staff?.userId ?? req.anonId!
  let flightHeld = false
  try {
    const parsed = generateRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      throw new AppError(400, 'בקשה לא תקינה: ' + parsed.error.message)
    }
    /* ── שומרי-בוטים: אימות אנושי בלתי-נראה + קצב + יצירה-אחת-בכל-רגע.
       שקוף לחלוטין למשתמש רגיל — אין שום שלב גלוי לפני יצירה. ── */
    const ip = clientIp(req)
    await verifyTurnstile((req.body as { turnstileToken?: string }).turnstileToken, ip)
    checkRateLimit(actorKey + '|' + ip)
    acquireFlight(actorKey)
    flightHeld = true
    /* יעדי למידה: המורה שולח טקסט חופשי; השרת מקצה מזהים יציבים (obj_1..) לתיוג האתגרים */
    const objectives = (parsed.data.objectives ?? [])
      .map((t) => t.trim())
      .filter(Boolean)
      .map((text, i) => ({ id: `obj_${i + 1}`, text }))
    /* מקצוע (חובה): קוד → שורה בטבלת subjects. לפני המיגרציה: שם מהרשימה המשותפת בלבד. */
    const subjectRow = await subjectByCode(parsed.data.subjectCode)
    const subjectName = subjectRow?.nameHe ?? subjectName_(parsed.data.subjectCode)
    const params: QuestGenerationParams = { ...parsed.data, subjectName, objectives: objectives.length > 0 ? objectives : undefined }

    /* שכבת בטיחות — בדיקת קלט (חוסמת, לפני יצירת ה-stub וקריאת Sonnet) */
    const inputSafety = await runInputSafetyCheck(params.title, params.curriculum)
    if (inputSafety.blocked) {
      if (inputSafety.technical) throw new AppError(503, SAFETY_TECH_MESSAGE) /* fail-closed טכני — לא חסימת-תוכן */
      void logContentSafety({ teacherId: req.staff?.userId, stage: 'input', category: inputSafety.category, title: params.title })
      throw new AppError(422, SAFETY_BLOCK_MESSAGE)
    }

    const stub: Record<string, unknown> = {
      title: params.title,
      curriculum: params.curriculum,
      quest_type: params.questType ?? 'adventure',
      quest_length: params.questLength,
      art_style: params.artStyle ?? 'digital-painting',
      include_dr_holo: params.includeDrHolo ?? true,
      puzzle_preferences: params.puzzlePreferences ?? {},
      difficulty_settings: params.difficultySettings ?? {},
      game_data: { generating: true },
      status: 'draft',
      created_by: req.staff?.userId ?? null,
      anon_id: req.staff ? null : req.anonId,
    }
    if (await hasQuestSubject()) stub.subject = subjectName
    if (subjectRow && (await hasQuestSubjectId())) stub.subject_id = subjectRow.id

    const { data: quest, error } = await supabaseAdmin.from('quests').insert(stub).select().single()
    if (error || !quest) throw new AppError(500, 'שגיאה ביצירת השיעור: ' + (error?.message ?? ''))

    /* שיעור ממוקד: קישור לתפיסה השגויה (best-effort; מורה אורח לא כותב ל-DB האמיתי של התגיות) */
    if (parsed.data.focusedMisconceptionId && req.staff && !isDemoGuest(req)) {
      void linkFocusedLesson(parsed.data.focusedMisconceptionId, quest.id, req.staff.userId)
    }

    /* ניטור עלויות — כל יצירה נרשמת (אנונימי/צוות/אורח-דמו) */
    void logGeneration({
      actorType: req.staff ? (isDemoGuest(req) ? 'guest' : 'staff') : 'anon',
      actorId: actorKey,
      ip,
      questId: quest.id,
    })

    /* מחזירים מיד — היצירה ממשיכה ברקע; נעילת היצירה-הבודדת משוחררת בסיומה */
    res.status(201).json({ quest, generating: true })
    void generateQuestInBackground(quest.id, params, req.staff?.userId ?? 'anon')
      .finally(() => releaseFlight(actorKey))
    flightHeld = false
  } catch (err) {
    if (flightHeld) releaseFlight(actorKey)
    next(err)
  }
})

/* ── POST /api/quests/claim-anon — העברת הדמיות אנונימיות לחשבון אחרי הרשמה ──
   נקרא ע"י הקליינט מיד אחרי התחברות/הרשמה. הזיהוי מהעוגייה (httpOnly) —
   אי-אפשר "לתבוע" הדמיות של דפדפן אחר. */
questsRouter.post('/claim-anon', requireStaff, async (req, res, next) => {
  try {
    const anonId = readAnonId(req)
    if (!anonId) { res.json({ claimed: 0 }); return }
    const { data, error } = await supabaseAdmin
      .from('quests')
      .update({ created_by: req.staff!.userId, anon_id: null })
      .eq('anon_id', anonId)
      .select('id')
    if (error) throw new AppError(500, 'העברת השיעורים נכשלה: ' + error.message)
    const claimed = data?.length ?? 0
    if (claimed > 0) void logGeneration({ event: 'claim', actorType: 'anon', actorId: anonId, costAgorot: 0 })
    res.json({ claimed })
  } catch (err) {
    next(err)
  }
})
