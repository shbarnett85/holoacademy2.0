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
import { defaultProfileForGrade, gradeToLevel } from '../../../src/shared/lib/difficultyCalibration.js'
import { requireStaff, ensureOwner } from '../middleware/staffAuth.js'
import jwt from 'jsonwebtoken'
import { hasQuestSubject, hasUserGender, hasPublicQuests, hasQuestVariants, hasDifficultyProfileV2 } from '../lib/activeColumn.js'
import { debug, info, warn, error as logError } from '../lib/log.js'
/* המודולים שפוצלו מהקובץ הזה (E4) — סכמות/קריאות-מודל/בטיחות/בדיקת-עובדות/וריאציות */
import { extractJson, validateGameData, repairRawPuzzles, checkAnswerConsistency, healStaleFactCheck, generateRequestSchema, type GameData } from '../lib/questSchemas.js'
import { callClaude, callHaiku } from '../lib/claudeCalls.js'
import { runInputSafetyCheck, runOutputSafetyCheck, logContentSafety, SAFETY_BLOCK_MESSAGE } from '../lib/contentSafety.js'
import { runFactCheck, scopedFactFix, factWarning, factCheckInBackground, type FactCheckMeta } from '../lib/factCheck.js'
import { rephraseForAddress, buildStudentVariant, applyNiqqudToGameData } from '../lib/questVariants.js'
import { computeWeakConcepts, reviewContextBlock } from '../lib/weakConcepts.js'

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
    const text = await callHaiku([{ role: 'user', content: instruction }], 1500)
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






/* GET /api/quests — ספריית ההדמיות של הצוות. מורה רואה רק את שלו; מנהל רואה הכול. */
questsRouter.get('/', requireStaff, async (req, res, next) => {
  try {
    const [pub, subj] = await Promise.all([hasPublicQuests(), hasQuestSubject()])
    const cols = 'id, title, game_data, status, created_at' + (pub ? ', is_public' : '') + (subj ? ', subject' : '')
    let query = supabaseAdmin
      .from('quests')
      .select(cols)
      .order('created_at', { ascending: false })
    if (req.staff!.role !== 'admin') query = query.eq('created_by', req.staff!.userId)
    const { data, error } = await query

    if (error) throw new AppError(500, 'שגיאה בשליפת הדמיות: ' + error.message)

    const quests = ((data ?? []) as unknown as { id: string; title: string; created_at: string; status: string; game_data?: { scenes?: unknown[]; reviewOf?: unknown }; is_public?: boolean; subject?: string | null }[]).map((q) => ({
      id: q.id,
      title: q.title,
      created_at: q.created_at,
      is_published: q.status === 'published',
      is_public: pub ? q.is_public === true : false,
      is_review: !!q.game_data?.reviewOf,
      sceneCount: q.game_data?.scenes?.length ?? 0,
      subject: subj ? (q.subject ?? null) : null,
    }))

    res.json({ quests })
  } catch (err) {
    next(err)
  }
})

/* GET /api/quests/demo — מאתר את הדמיית הדמו (לאונרדו דה וינצ׳י) מהספרייה הציבורית.
   ציבורי (ללא אימות) כדי שכפתור הדמו בעמוד הבית יעבוד לפני התחברות. חייב להירשם
   *לפני* '/:id' אחרת ייתפס כ-id='demo'. */
questsRouter.get('/demo', async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('quests')
      .select('id, title, is_public')
      .limit(400)
    if (error) throw new AppError(500, error.message)
    const rows = (data ?? []) as { id: string; title: string; is_public?: boolean }[]
    const isLeonardo = (t: string) => /לאונרדו|וינצ|vinci|da\s*vinci/i.test(t ?? '')
    /* מעדיפים הדמיה ציבורית; נופלים לכל הדמיה תואמת אם עמודת is_public חסרה/לא מסומנת */
    const pick = rows.find((r) => r.is_public && isLeonardo(r.title)) ?? rows.find((r) => isLeonardo(r.title))
    if (!pick) throw new AppError(404, 'הדמיית הדמו (לאונרדו דה וינצ׳י) לא נמצאה בספרייה הציבורית')
    res.json({ id: pick.id, title: pick.title })
  } catch (err) {
    next(err)
  }
})

/* GET /api/quests/:id — הדמיה בודדת מלאה */
questsRouter.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('quests')
      .select('id, title, game_data, status, created_at')
      .eq('id', req.params.id)
      .single()

    if (error || !data) throw new AppError(404, 'הדמיה לא נמצאה')

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

/* POST /api/quests/:id/personalize — וריאציה אישית ממוגדרת (פנייה זכר/נקבה/רבים).
   מחזיר game_data משוכתב לצורת הפנייה — אינו נשמר (שכבת המשחק/הקצאה תבחר אותו). */
const personalizeSchema = z.object({
  gender: z.enum(['male', 'female']).optional(),
  form: z.enum(['male', 'female', 'plural']).optional(),
  studentId: z.string().uuid().optional(),
})
questsRouter.post('/:id/personalize', requireStaff, async (req, res, next) => {
  try {
    const parsed = personalizeSchema.safeParse(req.body ?? {})
    if (!parsed.success) throw new AppError(400, 'בקשה לא תקינה')
    const { data: quest, error } = await supabaseAdmin
      .from('quests')
      .select('id, title, game_data, created_by')
      .eq('id', req.params.id)
      .single()
    if (error || !quest?.game_data) throw new AppError(404, 'הדמיה לא נמצאה')
    ensureOwner(req, quest.created_by)

    /* קביעת צורת הפנייה: form מפורש > gender מפורש > מגדר התלמיד (studentId) > plural */
    let form: FormOfAddress = parsed.data.form ?? parsed.data.gender ?? 'plural'
    if (!parsed.data.form && !parsed.data.gender && parsed.data.studentId && (await hasUserGender())) {
      const { data: stu } = await supabaseAdmin.from('users').select('gender').eq('id', parsed.data.studentId).maybeSingle()
      const g = (stu as { gender?: string | null } | null)?.gender
      if (g === 'male' || g === 'female') form = g
    }

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

questsRouter.post('/:id/variant', requireStaff, async (req, res, next) => {
  try {
    const parsed = variantSchema.safeParse(req.body)
    if (!parsed.success) throw new AppError(400, 'studentId נדרש')
    const { studentId } = parsed.data
    const questId = req.params.id

    const { data: quest } = await supabaseAdmin.from('quests').select('game_data, created_by').eq('id', questId).single()
    if (!quest) throw new AppError(404, 'הדמיה לא נמצאה')
    ensureOwner(req, (quest as { created_by?: string | null }).created_by ?? null)

    /* ── שלוף פרופיל + מגדר + שכבת כיתה במקביל ── */
    const [v2, hasGender] = await Promise.all([hasDifficultyProfileV2(), hasUserGender()])
    const profileCols = v2 ? 'text_level, per_puzzle_level' : 'id'
    const userCols = hasGender ? 'gender' : 'id'

    /* התלמיד משויך לכיתה דרך class_members (לא users.class_id) */
    const [{ data: profileRow }, { data: userRow }, { data: memberRow }] = await Promise.all([
      supabaseAdmin.from('difficulty_profiles').select(profileCols).eq('user_id', studentId).maybeSingle(),
      supabaseAdmin.from('users').select(userCols).eq('id', studentId).maybeSingle(),
      supabaseAdmin.from('class_members').select('class_id').eq('user_id', studentId).maybeSingle(),
    ])

    /* grade_label לברירת מחדל מבוססת-שכבה */
    const ur = userRow as Record<string, unknown> | null
    const classId = (memberRow as { class_id?: string } | null)?.class_id ?? null
    let gradeLabel: string | null = null
    if (classId) {
      const { data: classRow } = await supabaseAdmin.from('classes').select('grade_label').eq('id', classId).maybeSingle()
      gradeLabel = (classRow as Record<string, unknown> | null)?.grade_label as string | null ?? null
    }

    const pr = profileRow as Record<string, unknown> | null
    const fallback = defaultProfileForGrade(gradeLabel)
    const textLevel = typeof pr?.text_level === 'number' ? pr.text_level : fallback.textLevel
    const perPuzzleLevel: Record<string, number> = v2 && pr?.per_puzzle_level && typeof pr.per_puzzle_level === 'object'
      ? pr.per_puzzle_level as Record<string, number>
      : { ...fallback.perPuzzleLevel }

    const gender = (ur?.gender === 'male' || ur?.gender === 'female') ? ur.gender as 'male' | 'female' : null
    const form: FormOfAddress = gender ?? 'plural'

    /* עומק דילמת מוסר = min(רמת השכבה, רמת הטקסט) על סקאלת 1-20 (לא 60/80) */
    const moralLevel = moralDilemmaDepth(gradeToLevel(gradeLabel) ?? undefined, textLevel)

    /* ── DIAG ── */
    debug('[variant:profile]', {
      studentId, v2,
      hasProfileRow: pr !== null,
      gradeLabel, textLevel, moralLevel,
      perPuzzleLevel_sample: Object.fromEntries(Object.entries(perPuzzleLevel).slice(0, 3)),
      gender, form,
    })
    /* ── /DIAG ── */

    const variantData = await buildStudentVariant(quest.game_data as GameData, textLevel, form, perPuzzleLevel, moralLevel)
    const snapshot = { textLevel, perPuzzleLevel, gender }

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
   החלשים — כך דיווח השליטה מודד את שיפור החזרה מול המקור. */
const reviewQuestSchema = z.object({ assignmentId: z.string().uuid() })

questsRouter.post('/:id/review-quest', requireStaff, async (req, res, next) => {
  try {
    const parsed = reviewQuestSchema.safeParse(req.body)
    if (!parsed.success) throw new AppError(400, 'assignmentId נדרש')

    const { data: asg, error: asgErr } = await supabaseAdmin
      .from('assignments')
      .select('id, quest_id, class_id')
      .eq('id', parsed.data.assignmentId)
      .single()
    if (asgErr || !asg) throw new AppError(404, 'מטלה לא נמצאה')
    if (asg.quest_id !== req.params.id) throw new AppError(400, 'המטלה אינה שייכת להדמיה זו')

    const { data: base, error: baseErr } = await supabaseAdmin
      .from('quests')
      .select('id, title, curriculum, art_style, difficulty_settings, game_data, created_by')
      .eq('id', req.params.id)
      .single()
    if (baseErr || !base?.game_data) throw new AppError(404, 'הדמיה לא נמצאה')
    ensureOwner(req, base.created_by)

    const concepts = await computeWeakConcepts(base.id, asg.class_id, base.game_data)
    if (concepts.length === 0) {
      throw new AppError(400, 'אין מושגים חלשים לחיזוק — הכיתה שלטה בחומר או שאין עדיין מספיק נתונים')
    }

    /* יעדי הדמיית החזרה = המושגים החלשים (עד 8) */
    const objectives = concepts.slice(0, 8).map((c, i) => ({ id: `obj_${i + 1}`, text: c.text }))

    /* מאגר תמונות למיחזור מההדמיה המקורית */
    const baseGd = base.game_data as { scenes?: { imageUrl?: string }[]; endingGood?: { imageUrl?: string }; endingBad?: { imageUrl?: string } }
    const imagePool = {
      scenes: (baseGd.scenes ?? []).map((s) => s.imageUrl).filter((u): u is string => !!u),
      endingGood: baseGd.endingGood?.imageUrl,
      endingBad: baseGd.endingBad?.imageUrl,
    }

    const reviewTitle = `חזרה: ${base.title}`.slice(0, 120)
    const params: QuestGenerationParams = {
      title: reviewTitle,
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
    }
    const { data: created, error: insErr } = await supabaseAdmin.from('quests').insert(stub).select('id').single()
    if (insErr || !created) throw new AppError(500, 'יצירת הדמיית החזרה נכשלה: ' + (insErr?.message ?? ''))

    /* מחזירים מיד — היצירה רצה ברקע (הקליינט עושה polling ל-GET /:id) */
    res.status(201).json({ questId: created.id, title: reviewTitle, weakConcepts: concepts.length })
    void generateQuestInBackground(created.id, params, req.staff!.userId)
  } catch (err) {
    next(err)
  }
})

/* POST /api/quests/:id/share — שיתוף ההדמיה לספרייה הציבורית (היוצר בלבד, ללא אישור מראש) */
questsRouter.post('/:id/share', requireStaff, async (req, res, next) => {
  try {
    if (!(await hasPublicQuests())) throw new AppError(503, 'הספרייה הציבורית עדיין לא זמינה (נדרשת מיגרציה)')
    const { data: quest, error } = await supabaseAdmin
      .from('quests')
      .select('id, created_by, original_author_id')
      .eq('id', req.params.id)
      .single()
    if (error || !quest) throw new AppError(404, 'הדמיה לא נמצאה')
    ensureOwner(req, quest.created_by)
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
    const { data: quest, error } = await supabaseAdmin.from('quests').select('id, created_by').eq('id', req.params.id).single()
    if (error || !quest) throw new AppError(404, 'הדמיה לא נמצאה')
    ensureOwner(req, quest.created_by)
    const { error: upErr } = await supabaseAdmin.from('quests').update({ is_public: false }).eq('id', quest.id)
    if (upErr) throw new AppError(500, 'שגיאה בהסרה: ' + upErr.message)
    res.json({ ok: true, is_public: false })
  } catch (err) {
    next(err)
  }
})

/* POST /api/quests/:id/assign — הקצאת הדמיה לכיתות (יוצר ההדמיה)
   body: { classIds: string[] } — מזהי כיתות UUID; upsert כדי לא לשכפל */
questsRouter.post('/:id/assign', requireStaff, async (req, res, next) => {
  try {
    const { classIds } = req.body as { classIds?: string[] }
    if (!Array.isArray(classIds) || classIds.length === 0) throw new AppError(400, 'חסר classIds')

    const { data: quest, error } = await supabaseAdmin.from('quests').select('id, created_by').eq('id', req.params.id).single()
    if (error || !quest) throw new AppError(404, 'הדמיה לא נמצאה')
    ensureOwner(req, quest.created_by)

    /* סינון כיתות שכבר מוקצות — מניעת כפילויות ללא unique constraint */
    const { data: existing } = await supabaseAdmin
      .from('assignments').select('class_id').eq('quest_id', quest.id).in('class_id', classIds)
    const existingIds = new Set((existing ?? []).map((r: { class_id: string }) => r.class_id))
    const newRows = classIds.filter((id: string) => !existingIds.has(id))
      .map((classId: string) => ({ quest_id: quest.id, class_id: classId }))

    const inserted: { id: string; class_id: string }[] = []
    if (newRows.length > 0) {
      const { data, error: insErr } = await supabaseAdmin
        .from('assignments').insert(newRows).select('id, class_id')
      if (insErr) throw new AppError(500, 'שגיאה ביצירת הקצאות: ' + insErr.message)
      if (data) inserted.push(...data)
    }

    res.status(201).json({ assignments: inserted })
  } catch (err) {
    next(err)
  }
})

/* DELETE /api/quests/:id — מחיקת הדמיה (בעל ההדמיה או מנהל) */
questsRouter.delete('/:id', requireStaff, async (req, res, next) => {
  try {
    const { data: quest, error } = await supabaseAdmin
      .from('quests')
      .select('id, created_by')
      .eq('id', req.params.id)
      .single()
    if (error || !quest) throw new AppError(404, 'הדמיה לא נמצאה')
    ensureOwner(req, quest.created_by)

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

/* PATCH /api/quests/:id/scene — עדכון חלקי של שדות סצנה בתוך game_data
   body: { sceneId, narrative?, imagePrompt?, puzzle? } */
questsRouter.patch('/:id/scene', requireStaff, async (req, res, next) => {
  try {
    const parsed = patchSceneSchema.safeParse(req.body)
    if (!parsed.success) {
      throw new AppError(400, 'בקשה לא תקינה: ' + parsed.error.message)
    }
    const { sceneId, narrative, imagePrompt, drHoloExpression, drHoloDialog, title, puzzle } = parsed.data

    const { data: quest, error } = await supabaseAdmin
      .from('quests')
      .select('id, game_data, created_by')
      .eq('id', req.params.id)
      .single()

    if (error || !quest?.game_data) throw new AppError(404, 'הדמיה לא נמצאה')
    ensureOwner(req, quest.created_by)

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
questsRouter.patch('/:id/restore', requireStaff, async (req, res, next) => {
  try {
    const gameData = req.body?.gameData
    if (!gameData || !Array.isArray(gameData.scenes)) {
      throw new AppError(400, 'gameData לא תקין')
    }
    const { data: quest, error } = await supabaseAdmin
      .from('quests')
      .select('id, created_by')
      .eq('id', req.params.id)
      .single()
    if (error || !quest) throw new AppError(404, 'הדמיה לא נמצאה')
    ensureOwner(req, quest.created_by)

    const { error: updateError } = await supabaseAdmin.from('quests').update({ game_data: gameData }).eq('id', quest.id)
    if (updateError) throw new AppError(500, 'שגיאה בשחזור: ' + updateError.message)

    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

/* PATCH /api/quests/:id — עריכת שדות ברמת ההדמיה (כרגע: title בלבד) */
questsRouter.patch('/:id', requireStaff, async (req, res, next) => {
  try {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : undefined
    if (title !== undefined && title.length === 0) throw new AppError(400, 'שם ההדמיה לא יכול להיות ריק')

    const { data: quest, error } = await supabaseAdmin
      .from('quests')
      .select('id, created_by')
      .eq('id', req.params.id)
      .single()
    if (error || !quest) throw new AppError(404, 'הדמיה לא נמצאה')
    ensureOwner(req, quest.created_by)

    const patch: Record<string, unknown> = {}
    if (title !== undefined) patch.title = title
    if (Object.keys(patch).length === 0) throw new AppError(400, 'אין שדות לעדכון')

    const { error: updateError } = await supabaseAdmin.from('quests').update(patch).eq('id', quest.id)
    if (updateError) throw new AppError(500, 'שגיאה בשמירה: ' + updateError.message)

    res.json({ ok: true, title })
  } catch (err) {
    next(err)
  }
})

/* POST /api/quests/:id/refine — "בצע שיפורים": מריץ על-פי-דרישה את בדיקת העובדות/התקניות
   (runFactCheck, Haiku) ומחיל את התיקונים שזוהו (scopedFactFix) — אותם תיקונים המופיעים
   ב"אזהרות מבנה". שומר את ה-game_data המעודכן ומחזיר אותו + מספר הסצנות שתוקנו + אזהרות
   שנותרו (אם נשארו). דורש בעלות. */
questsRouter.post('/:id/refine', requireStaff, async (req, res, next) => {
  try {
    const { data: quest, error } = await supabaseAdmin
      .from('quests')
      .select('id, game_data, created_by')
      .eq('id', req.params.id)
      .single()
    if (error || !quest?.game_data) throw new AppError(404, 'הדמיה לא נמצאה')
    ensureOwner(req, quest.created_by)

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
interface GenMeta { warnings?: string[]; hub?: HubInfo | null }

/* ── מקבול יצירה לינארית: שלד סדרתי קצר → מילוי סצנות במקביל → שיא+סיומים אחרון ──
   רק להדמיות לינאריות (ללא מפתחות/Hub). מחזיר GameData מורכב ומאומת; כל כשל זורק
   ונופל לנתיב הסדרתי. הרווח: זמן הסצנה האיטית במקום סכום כל הסצנות. */
async function generateLinearParallel(params: QuestGenerationParams): Promise<GameData> {
  const sx = (from: number) => ((Date.now() - from) / 1000).toFixed(1)

  /* 1. שלד — קריאה קצרה סדרתית */
  const tSk = Date.now()
  const skel = extractJson(await callClaude([{ role: 'user', content: buildSkeletonPrompt(params) }])) as QuestSkeleton
  if (!skel || !Array.isArray(skel.scenes) || skel.scenes.length < 2) throw new Error('שלד לא תקין')
  const ids = skel.scenes.map((s) => s.id)
  if (new Set(ids).size !== ids.length || ids.some((id) => !id)) throw new Error('שלד: מזהי סצנות כפולים/חסרים')
  info(`[gen][מקבול] שלד: ${sx(tSk)}ש׳ · ${skel.scenes.length} סצנות`)

  const lastIdx = skel.scenes.length - 1

  /* 2. מילוי פתיחה+ביניים במקביל (כל הסצנות חוץ מהשיא) */
  const tFill = Date.now()
  const filled = await Promise.all(
    skel.scenes.slice(0, lastIdx).map(async (s, i) => {
      const scene = extractJson(await callClaude([{ role: 'user', content: buildScenePrompt(params, skel, i) }])) as Record<string, unknown>
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
  const cx = extractJson(await callClaude([{ role: 'user', content: buildClimaxPrompt(params, skel, summaries) }])) as Record<string, any>
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
  const expectedKeys = requiredKeyCount(params)
  const { system: genSystem, user: prompt } = buildQuestPrompt(params)
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
        gameData = await generateLinearParallel(params)
        producedParallel = true
        info(`[gen] ✓ נתיב מקבול לינארי`)
      } catch (e) {
        warn('[gen] מקבול נכשל → נתיב סדרתי:', e instanceof Error ? e.message : e)
      }
    }

    if (!producedParallel) {
    /* ── נתיב סדרתי (Hub / fallback): קריאה אחת + ולידציה + retry ── */
    const tMain = Date.now()
    const firstText = await callClaude([{ role: 'user', content: prompt }], genSystem)
    info(`[gen] קריאה ראשית (sonnet): ${secs(tMain)} שניות · פלט ${firstText.length} תווים`)

    let raw: unknown
    try {
      raw = extractJson(firstText)
    } catch {
      throw new AppError(502, 'Claude החזיר JSON לא תקין')
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
      const retryText = await callClaude([
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

    if (!gameData) throw new AppError(502, 'יצירת ההדמיה נכשלה')

    /* שכבת בטיחות — בדיקת פלט (רשת ביטחון, חוסמת *לפני* השמירה/החשיפה למורה בשורה
       למטה — לא ברקע כמו fact-check; תוכן חסום אסור שהמורה יראה אפילו לרגע) */
    const outputSafety = await runOutputSafetyCheck(gameData)
    if (outputSafety.blocked) {
      void logContentSafety({
        teacherId, questId, stage: 'output',
        category: outputSafety.category, title: params.title, excerpt: outputSafety.excerpt,
      })
      throw new AppError(422, SAFETY_BLOCK_MESSAGE)
    }

    /* הזרקת רמת הקושי לכל אתגר — לחישוב פרמטרי תצוגה בקליינט (פאזל/חיפוש מילים) */
    const level = clampLevel(params.difficultySettings?.puzzleDifficulty as number | undefined)
    for (const sc of gameData.scenes) if (sc.puzzle) sc.puzzle.difficulty = level
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

    /* ניקוד מלא ומדויק (Dicta) לרמות נמוכות (≤6) — קוראים מתחילים. מחליף את ניקוד המודל. */
    if (level <= 6) {
      const t0 = Date.now()
      const n = await applyNiqqudToGameData(gameData)
      info(`[gen] ניקוד Dicta על ${n} מקטעים: ${secs(t0)} שניות`)
    }

    /* מטא ליצירה — הקליינט קורא בעת ה-polling. בדיקת עובדות תרוץ ברקע (pending). */
    ;(gameData as unknown as { factCheck?: FactCheckMeta }).factCheck = { status: 'pending', startedAt: new Date().toISOString() }
    ;(gameData as unknown as { genMeta?: GenMeta }).genMeta = { warnings, hub: hubInfo ?? null }

    /* עדכון השורה (שכבר נוצרה כ-stub) עם ה-game_data המוכן */
    const { error } = await supabaseAdmin.from('quests').update({ game_data: gameData }).eq('id', questId)
    if (error) throw new AppError(500, 'שגיאה בשמירת ההדמיה: ' + error.message)

    info(`[gen] ━━ ההדמיה מוכנה: ${secs(tStart)} שניות · retries=${retryCount} ━━`)

    /* שכבה 2: בדיקת עובדות + תיקון ממוקד + ולידציית ניסוח — ברקע (best-effort, לא חוסם) */
    void factCheckInBackground(questId, gameData, warnings, level, params.formOfAddress ?? 'plural')
  } catch (err) {
    const msg = err instanceof AppError ? err.message : err instanceof Error ? err.message : 'יצירת ההדמיה נכשלה'
    logError('[gen] יצירה ברקע נכשלה:', msg)
    await supabaseAdmin.from('quests')
      .update({ game_data: { genError: msg } })
      .eq('id', questId)
      .then(({ error }) => { if (error) logError('[gen] שמירת genError נכשלה:', error.message) })
  }
}

/* POST /api/quests/generate — רושם הדמיה "בעיצומה של יצירה" ומחזיר מיד; היצירה רצה
   ברקע (מנתק את היצירה הארוכה מ-timeout של ה-proxy). הקליינט עושה polling ל-GET /:id. */
questsRouter.post('/generate', requireStaff, async (req, res, next) => {
  try {
    const parsed = generateRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      throw new AppError(400, 'בקשה לא תקינה: ' + parsed.error.message)
    }
    /* יעדי למידה: המורה שולח טקסט חופשי; השרת מקצה מזהים יציבים (obj_1..) לתיוג האתגרים */
    const objectives = (parsed.data.objectives ?? [])
      .map((t) => t.trim())
      .filter(Boolean)
      .map((text, i) => ({ id: `obj_${i + 1}`, text }))
    const params: QuestGenerationParams = { ...parsed.data, objectives: objectives.length > 0 ? objectives : undefined }

    /* שכבת בטיחות — בדיקת קלט (חוסמת, לפני יצירת ה-stub וקריאת Sonnet) */
    const inputSafety = await runInputSafetyCheck(params.title, params.curriculum)
    if (inputSafety.blocked) {
      void logContentSafety({ teacherId: req.staff!.userId, stage: 'input', category: inputSafety.category, title: params.title })
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
      created_by: req.staff!.userId,
    }
    if (parsed.data.subject && (await hasQuestSubject())) stub.subject = parsed.data.subject

    const { data: quest, error } = await supabaseAdmin.from('quests').insert(stub).select().single()
    if (error || !quest) throw new AppError(500, 'שגיאה ביצירת ההדמיה: ' + (error?.message ?? ''))

    /* מחזירים מיד — היצירה ממשיכה ברקע */
    res.status(201).json({ quest, generating: true })
    void generateQuestInBackground(quest.id, params, req.staff!.userId)
  } catch (err) {
    next(err)
  }
})
