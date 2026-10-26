import { Router } from 'express'
import type { Request } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabase.js'
import { AppError } from '../middleware/errors.js'
import { requireStudent } from '../middleware/studentAuth.js'
import { warn } from '../lib/log.js'
import { questSubjectOut } from '../lib/subjects.js'
import { recalibrateProfile, ensureSubjectLevels } from '../lib/profileCalibration.js'
import { hasSessionCrystals, hasProgressSnapshots, hasQuestSubject, hasQuestVariants, hasQuestSubjectId, hasSubjectLevels, hasAssignmentDueAt } from '../lib/activeColumn.js'
import { lessonThumbUrl } from '../lib/lessonThumb.js'
import { lessonState, isLate } from '../../../src/shared/lib/lessonState.js'
import { perTypeFromChallenges } from '../../../src/shared/lib/difficultyCalibration.js'
import { parseAnswers, parseMoral, parseGateEvents, toGateEventRow, writeAnswerTelemetry } from '../lib/answerWriter.js'

/* כל המסלולים דורשים תלמיד מחובר; תלמיד יכול לכתוב/לקרוא רק את ה-session שלו. */
export const sessionsRouter = Router()
sessionsRouter.use(requireStudent)

/* GET /api/sessions/assigned — הדמיות המוקצות לכיתת התלמיד */
sessionsRouter.get('/assigned', async (req, res, next) => {
  try {
    const classId = req.student!.classId
    if (!classId) return res.json({ quests: [] })

    const withDue = await hasAssignmentDueAt()
    const { data: asgData, error: asgErr } = await supabaseAdmin
      .from('assignments')
      .select(withDue ? 'quest_id, created_at, due_at' : 'quest_id, created_at')
      .eq('class_id', classId)
    if (asgErr) throw new AppError(500, asgErr.message)

    type AsgRow = { quest_id: string; created_at: string; due_at?: string | null }
    const asgRows = (asgData ?? []) as unknown as AsgRow[]
    const questIds = [...new Set(asgRows.map((r) => r.quest_id))]
    if (questIds.length === 0) { res.json({ quests: [] }); return }

    /* מיפוי quest_id → ההקצאה האחרונה (מועד השליחה ומועד ההגשה שלה) */
    const latestAsg = new Map<string, AsgRow>()
    for (const r of asgRows) { const cur = latestAsg.get(r.quest_id); if (!cur || r.created_at > cur.created_at) latestAsg.set(r.quest_id, r) }
    const assignedAtMap = new Map([...latestAsg].map(([id, r]) => [id, r.created_at]))

    const [questResult, sessionResult] = await Promise.all([
      supabaseAdmin.from('quests').select('id, title, game_data, art_style, created_by').in('id', questIds),
      supabaseAdmin.from('sessions')
        .select('quest_id, completed_at, crystals, total_score, max_score')
        .eq('user_id', req.student!.userId)
        .in('quest_id', questIds),
    ])

    if (questResult.error) throw new AppError(500, questResult.error.message)

    type Scene = { id: string; imageUrl?: string }
    type GameData = { scenes?: Scene[]; entrySceneId?: string; reviewOf?: unknown }
    type QuestRow = { id: string; title: string; game_data: GameData; art_style?: string; created_by?: string | null }

    /* שמות מורים לפי created_by */
    const teacherIds = [...new Set((questResult.data ?? []).map((q: QuestRow) => q.created_by).filter(Boolean))] as string[]
    const teacherMap = new Map<string, string>()
    if (teacherIds.length > 0) {
      const { data: teachers } = await supabaseAdmin.from('users').select('id, name').in('id', teacherIds)
      for (const t of (teachers ?? []) as { id: string; name: string }[]) teacherMap.set(t.id, t.name)
    }

    /* subject — שאילתה נפרדת, דיפנסיבית */
    const subjectMap = new Map<string, string>()
    const subjectCodeMap = new Map<string, string>()
    if (await hasQuestSubject()) {
      const withId = await hasQuestSubjectId()
      const { data: subjectRows } = await supabaseAdmin.from('quests').select(withId ? 'id, subject, subject_id' : 'id, subject').in('id', questIds)
      for (const r of (subjectRows ?? []) as unknown as { id: string; subject?: string | null; subject_id?: string | null }[]) {
        const out = await questSubjectOut({ subject: withId ? undefined : r.subject, subject_id: withId ? (r.subject_id ?? null) : undefined })
        if (out.subject) subjectMap.set(r.id, out.subject)
        if (out.subjectCode) subjectCodeMap.set(r.id, out.subjectCode)
      }
    }

    /* מיפוי quest_id → מצב session הטוב ביותר */
    type SessionRow = { quest_id: string; completed_at: string | null; crystals?: number | null; total_score?: number | null; max_score?: number | null }
    const sessionsByQuest = new Map<string, SessionRow[]>()
    for (const s of (sessionResult.data ?? []) as SessionRow[]) {
      const arr = sessionsByQuest.get(s.quest_id) ?? []
      arr.push(s)
      sessionsByQuest.set(s.quest_id, arr)
    }

    const dueAtOf = (questId: string): string | null => latestAsg.get(questId)?.due_at ?? null
    const quests = (questResult.data ?? []).map((q: QuestRow) => {
      const gd = q.game_data as GameData
      const entryScene = gd?.scenes?.find((s) => s.id === gd.entrySceneId) ?? gd?.scenes?.[0]

      const sessions = sessionsByQuest.get(q.id) ?? []
      const completedSession = sessions
        .filter((s) => s.completed_at)
        .sort((a, b) => (b.crystals ?? 0) - (a.crystals ?? 0))[0] ?? null
      /* "באיחור" = ההשלמה הראשונה של התלמיד הייתה אחרי מועד ההגשה (isLate — פונקציה אחת) */
      const firstDone = sessions.filter((s) => s.completed_at).sort((a, b) => String(a.completed_at).localeCompare(String(b.completed_at)))[0] ?? null
      const sessionStatus = completedSession ? 'completed'
        : sessions.length > 0 ? 'in_progress'
        : null

      return {
        id: q.id,
        title: q.title,
        sceneCount: gd?.scenes?.length ?? 0,
        isReview: !!gd?.reviewOf,
        artStyle: q.art_style,
        subject: subjectMap.get(q.id) ?? null,
        subjectCode: subjectCodeMap.get(q.id) ?? null,
        teacherName: q.created_by ? (teacherMap.get(q.created_by) ?? null) : null,
        assignedAt: assignedAtMap.get(q.id) ?? null,
        entryImageUrl: entryScene?.imageUrl ?? null,
        thumbUrl: lessonThumbUrl(gd),
        /* מועד ההגשה של ההקצאה האחרונה + מצב השיעור מפונקציית המצב היחידה (open/ended; אין "פעיל עכשיו" ברשימת התלמיד) */
        dueAt: dueAtOf(q.id),
        state: lessonState({ now: Date.now(), dueAt: dueAtOf(q.id) }),
        late: isLate(firstDone?.completed_at, dueAtOf(q.id)),
        sessionStatus,
        crystals: completedSession?.crystals ?? null,
        maxScore: completedSession?.max_score ?? null,
      }
    })

    res.json({ quests })
  } catch (err) { next(err) }
})

/* ה-event types התקפים (תואם enum public.event_type ב-DB) */
const EVENT_TYPES = [
  'scene_enter', 'scene_exit', 'choice_made', 'puzzle_attempt',
  'puzzle_solved', 'puzzle_failed', 'item_collected', 'item_used',
  'item_used_wrong', 'session_completed',
] as const

/* ודא שה-session שייך לתלמיד המחובר */
async function loadOwnSession(req: Request, sessionId: string) {
  const { data, error } = await supabaseAdmin
    .from('sessions')
    .select('id, user_id, quest_id, completed_at')
    .eq('id', sessionId)
    .single()
  if (error || !data) throw new AppError(404, 'session לא נמצא')
  if (data.user_id !== req.student!.userId) throw new AppError(403, 'אין גישה ל-session זה')
  return data as { id: string; user_id: string; quest_id: string; completed_at: string | null }
}

/* ספירת אתגרים בהדמיה — לקביעת max_score */
function countChallenges(gameData: unknown): number {
  const scenes = (gameData as { scenes?: { puzzle?: unknown }[] } | null)?.scenes
  if (!Array.isArray(scenes)) return 0
  return scenes.filter((s) => s.puzzle).length
}

/* טעינת וריאציה מותאמת-תלמיד (אם קיימת וטבלת quest_variants קיימת) */
async function loadVariantGameData(questId: string, userId: string): Promise<unknown> {
  if (!(await hasQuestVariants())) return null
  const { data } = await supabaseAdmin
    .from('quest_variants').select('game_data').eq('quest_id', questId).eq('student_id', userId).maybeSingle()
  return (data as { game_data?: unknown } | null)?.game_data ?? null
}

/* ── POST /api/sessions/start — יצירה או resume של session פתוח ── */
const startSchema = z.object({ questId: z.string().uuid(), assignmentId: z.string().uuid().optional() })

sessionsRouter.post('/start', async (req, res, next) => {
  try {
    const parsed = startSchema.safeParse(req.body)
    if (!parsed.success) throw new AppError(400, 'בקשה לא תקינה')
    const { questId, assignmentId } = parsed.data
    const userId = req.student!.userId
    const withCrystals = await hasSessionCrystals()

    /* resume — session פתוח (ללא completed_at) לאותו תלמיד+הדמיה */
    const { data: open } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('quest_id', questId)
      .is('completed_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (open) {
      const o = open as unknown as Record<string, unknown>
      const variantGameData = await loadVariantGameData(questId, userId)
      res.json({
        sessionId: o.id, resumed: true,
        currentSceneId: o.current_scene_id ?? null,
        inventory: o.inventory ?? [],
        visitedScenes: o.visited_scenes ?? [],
        crystals: withCrystals ? (o.crystals ?? 0) : 0,
        variantGameData,
      })
      return
    }

    /* max_score לפי מספר האתגרים בהדמיה */
    const { data: quest } = await supabaseAdmin.from('quests').select((await hasQuestSubjectId()) ? 'game_data, subject_id' : 'game_data').eq('id', questId).single()
    const maxScore = countChallenges((quest as { game_data?: unknown } | null)?.game_data)
    /* מקצוע חדש לתלמיד = פרופיל חדש ברמת הפתיחה (trigger='seed' ביומן הרמות) — לא מועתק מהגלובלי */
    const startSubjectId = (quest as { subject_id?: string | null } | null)?.subject_id ?? null
    if (startSubjectId && (await hasSubjectLevels())) {
      try { await ensureSubjectLevels(userId, req.student!.classId ?? null, startSubjectId) } catch { /* best-effort */ }
    }

    const payload: Record<string, unknown> = {
      user_id: userId, quest_id: questId, started_at: new Date().toISOString(),
      max_score: maxScore, total_score: 0, visited_scenes: [], inventory: [],
    }
    if (assignmentId) payload.assignment_id = assignmentId
    if (withCrystals) payload.crystals = 0

    const { data: created, error } = await supabaseAdmin.from('sessions').insert(payload).select('id').single()
    if (error || !created) throw new AppError(500, 'יצירת session נכשלה: ' + (error?.message ?? ''))
    const variantGameData = await loadVariantGameData(questId, userId)
    res.status(201).json({ sessionId: created.id, resumed: false, currentSceneId: null, inventory: [], visitedScenes: [], crystals: 0, variantGameData })
  } catch (err) {
    next(err)
  }
})

/* ── POST /api/sessions/:id/event — כתיבת event(ים), בודד או באצווה ── */
const eventSchema = z.object({
  type: z.enum(EVENT_TYPES),
  sceneId: z.string().optional().nullable(),
  payload: z.record(z.string(), z.unknown()).optional(),
})
const eventBodySchema = z.union([
  z.object({ events: z.array(eventSchema).min(1).max(200) }),
  eventSchema, /* גם event בודד נתמך */
])

sessionsRouter.post('/:id/event', async (req, res, next) => {
  try {
    const session = await loadOwnSession(req, req.params.id)
    const parsed = eventBodySchema.safeParse(req.body)
    if (!parsed.success) throw new AppError(400, 'בקשת event לא תקינה: ' + parsed.error.message)
    const events = 'events' in parsed.data ? parsed.data.events : [parsed.data]

    const rows = events.map((e) => ({
      session_id: session.id,
      user_id: session.user_id,
      quest_id: session.quest_id,
      type: e.type,
      scene_id: e.sceneId ?? null,
      payload: e.payload ?? {},
    }))
    const { error } = await supabaseAdmin.from('events').insert(rows)
    if (error) throw new AppError(500, 'כתיבת events נכשלה: ' + error.message)
    res.json({ ok: true, count: rows.length })
  } catch (err) {
    next(err)
  }
})

/* ── PATCH /api/sessions/:id/progress — שמירת מצב ביניים (resume) ── */
const progressSchema = z.object({
  currentSceneId: z.string().optional(),
  inventory: z.array(z.unknown()).optional(),
  visitedScenes: z.array(z.unknown()).optional(),
  crystals: z.number().int().min(0).optional(),
})

sessionsRouter.patch('/:id/progress', async (req, res, next) => {
  try {
    const session = await loadOwnSession(req, req.params.id)
    const parsed = progressSchema.safeParse(req.body)
    if (!parsed.success) throw new AppError(400, 'בקשה לא תקינה')
    const patch: Record<string, unknown> = {}
    if (parsed.data.currentSceneId !== undefined) patch.current_scene_id = parsed.data.currentSceneId
    if (parsed.data.inventory !== undefined) patch.inventory = parsed.data.inventory
    if (parsed.data.visitedScenes !== undefined) patch.visited_scenes = parsed.data.visitedScenes
    if (parsed.data.crystals !== undefined && (await hasSessionCrystals())) patch.crystals = parsed.data.crystals
    if (Object.keys(patch).length === 0) { res.json({ ok: true }); return }
    const { error } = await supabaseAdmin.from('sessions').update(patch).eq('id', session.id)
    if (error) throw new AppError(500, 'שמירת ההתקדמות נכשלה: ' + error.message)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

/* ── GET /api/sessions/:id — שליפת snapshot ל-resume ── */
sessionsRouter.get('/:id', async (req, res, next) => {
  try {
    await loadOwnSession(req, req.params.id)
    const withCrystals = await hasSessionCrystals()
    const { data, error } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('id', req.params.id)
      .single()
    if (error || !data) throw new AppError(404, 'session לא נמצא')
    const s = data as unknown as Record<string, unknown>
    res.json({
      session: {
        id: s.id, questId: s.quest_id,
        currentSceneId: s.current_scene_id ?? null,
        inventory: s.inventory ?? [],
        visitedScenes: s.visited_scenes ?? [],
        crystals: withCrystals ? (s.crystals ?? 0) : 0,
        totalScore: s.total_score ?? 0, maxScore: s.max_score ?? 0,
        startedAt: s.started_at, completedAt: s.completed_at ?? null,
      },
    })
  } catch (err) {
    next(err)
  }
})

/* ── POST /api/sessions/:id/complete — שליחה מרוכזת אחת בסיום ──
   מקבל סיכום אנליטיקה תמציתי (לא לוג גולמי): summary + רשומת אתגר תמציתית לכל אתגר
   + זמני שהייה בסצנות. כותב events מסוכמים (idempotent), מסיים את ה-session,
   ומריץ update_difficulty_profile (שצורכת אחוז הצלחה + זמן שהייה מטבלת events). */
const challengeSchema = z.object({
  sceneId: z.string(),
  puzzleType: z.string(),
  difficulty: z.number().nullable().optional(),
  correct: z.boolean(),
  attempts: z.number().int().nonnegative().optional(),
  solveTimeMs: z.number().nullable().optional(),
  shards: z.number().optional(),
})
export const sceneTimeSchema = z.object({
  sceneId: z.string(),
  dwellMs: z.number().nonnegative(),
  /* 1B — שדות טלמטריה: פגומים לא מפילים את ה-complete (catch → undefined) */
  wordCount: z.number().int().min(0).max(20000).optional().catch(undefined),
  closedDwellMs: z.number().min(0).max(86_400_000).optional().catch(undefined),
  /* כלל אורך הטקסט לתלמיד: מספר עמודי הטקסט שהוצגו + זמן על כל עמוד (פגום → נזרק, לא מפיל) */
  pages: z.number().int().min(1).max(50).optional().catch(undefined),
  pageMs: z.array(z.number().min(0).max(86_400_000)).max(50).optional().catch(undefined),
})
const summarySchema = z.object({
  totalChallenges: z.number().int().nonnegative(),
  correctChallenges: z.number().int().nonnegative(),
  successRate: z.number(),
  avgSceneMs: z.number(),
  scenesVisited: z.number().int().nonnegative(),
  crystalsEarned: z.number().int().nonnegative(),
  completed: z.boolean(),
  durationMs: z.number(),
})
const completeSchema = z.object({
  totalScore: z.number().int().min(0),
  crystalsFull: z.number().int().min(0).optional(),
  summary: summarySchema.optional(),
  challenges: z.array(challengeSchema).max(100).optional(),
  sceneTimes: z.array(sceneTimeSchema).max(200).optional(),
  /* 1B — טלמטריית תשובות. unknown בכוונה: הפרסור פר-שורה וסובלני (answerWriter) כך ששורה פגומה
     לעולם לא גורמת ל-400 ואובדן הכיול. challenges (מוגבל ל-100) נשאר בדיוק כמו קודם. */
  answers: z.unknown().optional(),
  moralChoices: z.unknown().optional(),
  gateEvents: z.unknown().optional(),
})

sessionsRouter.post('/:id/complete', async (req, res, next) => {
  try {
    const session = await loadOwnSession(req, req.params.id)
    const parsed = completeSchema.safeParse(req.body)
    if (!parsed.success) throw new AppError(400, 'בקשה לא תקינה: ' + parsed.error.message)
    const { totalScore, crystalsFull, summary, challenges, sceneTimes } = parsed.data
    const tAnswers = parseAnswers(parsed.data.answers)
    const tMoral = parseMoral(parsed.data.moralChoices)
    const tGate = parseGateEvents(parsed.data.gateEvents)

    /* מדדים לכיול — שיעור הצלחה פר סוג + זמן ממוצע לסצנה (זמני קריאה) */
    const perType = perTypeFromChallenges(challenges ?? [])
    const avgSceneMs = summary?.avgSceneMs ?? (sceneTimes && sceneTimes.length
      ? Math.round(sceneTimes.reduce((a, s) => a + s.dwellMs, 0) / sceneTimes.length)
      : 0)
    const skipping = avgSceneMs > 0 && avgSceneMs < 3000
    const perTypeSuccess: Record<string, number> = {}
    for (const [t, s] of Object.entries(perType)) {
      if (s && s.total > 0) perTypeSuccess[t] = Math.round((s.solved / s.total) * 100) / 100
    }

    /* כתיבת events מסוכמים — idempotent: מוחקים קודם (למקרה של retry) ואז כותבים */
    const rows: { session_id: string; user_id: string; quest_id: string; type: string; scene_id: string | null; payload: Record<string, unknown> }[] = []
    const base = { session_id: session.id, user_id: session.user_id, quest_id: session.quest_id }
    for (const c of challenges ?? []) {
      rows.push({
        ...base,
        type: c.correct ? 'puzzle_solved' : 'puzzle_failed',
        scene_id: c.sceneId,
        payload: { puzzleType: c.puzzleType, difficulty: c.difficulty ?? null, attempts: c.attempts ?? 1, solveTimeMs: c.solveTimeMs ?? null, shards: c.shards ?? 0 },
      })
    }
    for (const s of sceneTimes ?? []) {
      /* dwellMs נשאר כמו שהיה; word_count/closed_dwell_ms נוספים (1B) */
      const sp: Record<string, unknown> = { dwellMs: s.dwellMs }
      if (s.wordCount !== undefined) sp.word_count = s.wordCount
      if (s.closedDwellMs !== undefined) sp.closed_dwell_ms = Math.round(s.closedDwellMs)
      if (s.pages !== undefined) sp.pages = s.pages
      if (s.pageMs !== undefined) sp.page_ms = s.pageMs.map((x) => Math.round(x))
      rows.push({ ...base, type: 'scene_enter', scene_id: s.sceneId, payload: sp })
    }
    if (summary) {
      rows.push({ ...base, type: 'session_completed', scene_id: null, payload: { ...summary, skipping, perType: perTypeSuccess } })
    }
    /* 1B: שערים/מפתחות/בחירות שהיו נזרקים — נכתבים באותה אצווה (אידמפוטנטי יחד עם שאר ה-events) */
    for (const g of tGate) rows.push(toGateEventRow(g, base))

    /* האם זו שליחה חוזרת (כבר נכתב session_completed)? — לדילמות מוסריות (בלי מפתח אידמפוטנטי) */
    let isRetry = false
    if (tMoral.length > 0) {
      const { count } = await supabaseAdmin.from('events').select('id', { count: 'exact', head: true }).eq('session_id', session.id).eq('type', 'session_completed')
      isRetry = (count ?? 0) > 0
    }

    if (rows.length > 0) {
      /* idempotency בסדר בטוח: קודם insert של הרשומות החדשות (עם החזרת ה-ids),
         ואז delete של הישנות בלבד (id לא ברשימת החדשים). כך כשל ב-insert משאיר
         את הנתונים הישנים שלמים (בניגוד ל-delete-קודם, שאיבד הכול אם ה-insert
         נכשל אחריו); כשל ב-delete משאיר כפילויות — ו-retry הבא מנקה אותן. */
      const { data: inserted, error: evErr } = await supabaseAdmin.from('events').insert(rows).select('id')
      if (evErr) throw new AppError(500, 'כתיבת סיכום ה-events נכשלה: ' + evErr.message)
      const newIds = ((inserted ?? []) as { id: string }[]).map((r) => r.id)
      if (newIds.length > 0) {
        const { error: delErr } = await supabaseAdmin
          .from('events')
          .delete()
          .eq('session_id', session.id)
          .not('id', 'in', `(${newIds.join(',')})`)
        if (delErr) warn('[complete] ניקוי events ישנים נכשל (יתוקן ב-retry הבא):', delErr.message)
      }
    }

    const patch: Record<string, unknown> = { completed_at: new Date().toISOString(), total_score: totalScore }
    if (crystalsFull !== undefined && (await hasSessionCrystals())) patch.crystals = crystalsFull
    const { error } = await supabaseAdmin.from('sessions').update(patch).eq('id', session.id)
    if (error) throw new AppError(500, 'סיום ה-session נכשל: ' + error.message)

    /* כיול פרופיל הקושי בשרת (JS) — best-effort: כשל לא יפיל את הסיום */
    let profileUpdated = false
    try {
      /* מקצוע ההדמיה קובע לאיזה פרופיל מכוילים; הדמיה בלי מקצוע → הפרופיל הגלובלי */
      let subjectId: string | null = null
      if (await hasQuestSubjectId()) {
        const { data: qs } = await supabaseAdmin.from('quests').select('subject_id').eq('id', session.quest_id).maybeSingle()
        subjectId = (qs as { subject_id?: string | null } | null)?.subject_id ?? null
      }
      const cal = await recalibrateProfile(session.user_id, req.student!.classId ?? null, perType, avgSceneMs, { subjectId, sessionId: session.id })
      profileUpdated = cal !== null

      /* progress_snapshot — סדרת-הזמן של ההתקדמות. נכתב *אחרי* הכיול ורק לסשן שנספר
         (כויל בפועל → cal !== null). מצב מקרן לא יוצר session, ולכן לא מגיע לכאן.
         best-effort, ועמיד לפני המיגרציה (אם הטבלה חסרה — מדלגים). */
      if (cal && (await hasProgressSnapshots())) {
        const overall = summary?.successRate ?? (perTypeSuccess && Object.keys(perTypeSuccess).length
          ? Object.values(perTypeSuccess).reduce((a, b) => a + b, 0) / Object.keys(perTypeSuccess).length
          : null)
        /* idempotent — מוחקים snapshot קודם של אותו session (retry של complete לא יכפיל את סדרת-הזמן) */
        await supabaseAdmin.from('progress_snapshots').delete().eq('session_id', session.id)
        const snap: Record<string, unknown> = {
          student_id: session.user_id,
          class_id: req.student!.classId ?? null,
          session_id: session.id,
          text_level: cal.profile.textLevel,
          per_puzzle_level: cal.profile.perPuzzleLevel,
          success_rates: perTypeSuccess,
          overall_success: overall,
        }
        if (subjectId && (await hasQuestSubjectId())) snap.subject_id = subjectId
        const { error: snapErr } = await supabaseAdmin.from('progress_snapshots').insert(snap)
        if (snapErr) warn('[snapshot] כתיבת progress_snapshot נכשלה ל-session', session.id, '—', snapErr.message)
      }
    } catch (e) {
      warn('[calibrate] כיול הפרופיל נכשל ל-session', session.id, '—', e instanceof Error ? e.message : e)
    }
    /* טלמטריית תשובות (1B) — אחרי הליבה; best-effort מוחלט: לעולם לא משנה את התוצאה ולא חוסם */
    try {
      await writeAnswerTelemetry({
        sessionId: session.id, studentId: session.user_id, classId: req.student!.classId ?? null, questId: session.quest_id,
        answers: tAnswers, moral: tMoral, isRetry,
      })
    } catch (e) {
      warn('[telemetry] כתיבת answers נכשלה ל-session', session.id, '—', e instanceof Error ? e.message : e)
    }
    res.json({ ok: true, profileUpdated })
  } catch (err) {
    next(err)
  }
})
