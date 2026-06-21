import { Router } from 'express'
import type { Request } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabase.js'
import { AppError } from '../middleware/errors.js'
import { requireStudent } from '../middleware/studentAuth.js'
import { hasSessionCrystals, hasDifficultyProfileV2, hasGradeLabel, hasProgressSnapshots, hasQuestSubject } from '../lib/activeColumn.js'
import {
  CALIBRATION,
  calibrate,
  normalizeProfile,
  defaultProfileForGrade,
  perTypeFromChallenges,
  type ProfilePuzzleType,
  type PuzzleStat,
  type DifficultyProfile,
} from '../../../src/shared/lib/difficultyCalibration.js'

/* כל המסלולים דורשים תלמיד מחובר; תלמיד יכול לכתוב/לקרוא רק את ה-session שלו. */
export const sessionsRouter = Router()
sessionsRouter.use(requireStudent)

/* GET /api/sessions/assigned — הדמיות המוקצות לכיתת התלמיד */
sessionsRouter.get('/assigned', async (req, res, next) => {
  try {
    const classId = req.student!.classId
    if (!classId) return res.json({ quests: [] })

    const { data: asgData, error: asgErr } = await supabaseAdmin
      .from('assignments')
      .select('quest_id, created_at')
      .eq('class_id', classId)
    if (asgErr) throw new AppError(500, asgErr.message)

    const asgRows = asgData ?? [] as { quest_id: string; created_at: string }[]
    const questIds = asgRows.map((r: { quest_id: string }) => r.quest_id)
    if (questIds.length === 0) { res.json({ quests: [] }); return }

    /* מיפוי quest_id → assignedAt */
    const assignedAtMap = new Map(asgRows.map((r: { quest_id: string; created_at: string }) => [r.quest_id, r.created_at]))

    const subjectExists = await hasQuestSubject()
    const questSelect = `id, title, game_data, art_style, created_by${subjectExists ? ', subject' : ''}`

    const [questResult, sessionResult] = await Promise.all([
      supabaseAdmin.from('quests').select(questSelect).in('id', questIds),
      supabaseAdmin.from('sessions')
        .select('quest_id, completed_at, crystals, total_score, max_score')
        .eq('user_id', req.student!.userId)
        .in('quest_id', questIds),
    ])

    if (questResult.error) throw new AppError(500, questResult.error.message)

    type Scene = { id: string; imageUrl?: string }
    type GameData = { scenes?: Scene[]; entrySceneId?: string }
    type QuestRow = { id: string; title: string; game_data: GameData; art_style?: string; subject?: string | null; created_by?: string | null; [k: string]: unknown }

    /* שמות מורים לפי created_by */
    const teacherIds = [...new Set((questResult.data ?? []).map((q: QuestRow) => q.created_by).filter(Boolean))] as string[]
    const teacherMap = new Map<string, string>()
    if (teacherIds.length > 0) {
      const { data: teachers } = await supabaseAdmin.from('users').select('id, name').in('id', teacherIds)
      for (const t of (teachers ?? []) as { id: string; name: string }[]) teacherMap.set(t.id, t.name)
    }

    /* מיפוי quest_id → מצב session הטוב ביותר */
    type SessionRow = { quest_id: string; completed_at: string | null; crystals?: number | null; total_score?: number | null; max_score?: number | null }
    const sessionsByQuest = new Map<string, SessionRow[]>()
    for (const s of (sessionResult.data ?? []) as SessionRow[]) {
      const arr = sessionsByQuest.get(s.quest_id) ?? []
      arr.push(s)
      sessionsByQuest.set(s.quest_id, arr)
    }

    const quests = (questResult.data ?? []).map((q: QuestRow) => {
      const gd = q.game_data as GameData
      const entryScene = gd?.scenes?.find((s) => s.id === gd.entrySceneId) ?? gd?.scenes?.[0]

      const sessions = sessionsByQuest.get(q.id) ?? []
      const completedSession = sessions
        .filter((s) => s.completed_at)
        .sort((a, b) => (b.crystals ?? 0) - (a.crystals ?? 0))[0] ?? null
      const sessionStatus = completedSession ? 'completed'
        : sessions.length > 0 ? 'in_progress'
        : null

      return {
        id: q.id,
        title: q.title,
        sceneCount: gd?.scenes?.length ?? 0,
        artStyle: q.art_style,
        subject: q.subject ?? null,
        teacherName: q.created_by ? (teacherMap.get(q.created_by) ?? null) : null,
        assignedAt: assignedAtMap.get(q.id) ?? null,
        entryImageUrl: entryScene?.imageUrl ?? null,
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

/* ── כיול הקושי בשרת (JS) — רץ אחרי כל session שהושלם, מחליף את ה-RPC הישן ──
   טוען את הפרופיל הקיים (או ברירת מחדל לפי שכבת הכיתה), מחיל את כלל 60/80
   פר-סוג + text_level + תיקון זמני קריאה, ושומר את הפרופיל החדש. */
async function recalibrateProfile(
  userId: string,
  classId: string | null,
  perType: Partial<Record<ProfilePuzzleType, PuzzleStat>>,
  avgSceneMs: number,
): Promise<{ skipping: boolean; profile: DifficultyProfile } | null> {
  if (!(await hasDifficultyProfileV2())) return null

  /* ברירת מחדל לפי שכבת הכיתה (grade_label) */
  let gradeLabel: string | null = null
  if (classId) {
    const sel = (await hasGradeLabel()) ? 'grade_label, name' : 'name'
    const { data: cls } = await supabaseAdmin.from('classes').select(sel).eq('id', classId).maybeSingle()
    const c = cls as { grade_label?: string | null; name?: string | null } | null
    gradeLabel = c?.grade_label ?? c?.name ?? null
  }
  const fallback = defaultProfileForGrade(gradeLabel)

  /* פרופיל קודם (אם קיים) */
  const { data: row } = await supabaseAdmin
    .from('difficulty_profiles')
    .select('id, text_level, per_puzzle_level, sessions_count')
    .eq('user_id', userId)
    .maybeSingle()
  const r = row as { id?: string; text_level?: number | null; per_puzzle_level?: Record<string, number> | null; sessions_count?: number | null } | null
  const prev = normalizeProfile(
    r ? { textLevel: r.text_level ?? undefined, perPuzzleLevel: (r.per_puzzle_level as Record<ProfilePuzzleType, number>) ?? undefined } : null,
    fallback,
  )

  const result = calibrate(prev, { perType, avgSceneMs })

  /* היסטוריית שיעורי הצלחה אחרונים פר סוג (נחוצה לחישוב/תצוגה) */
  const lastRates: Record<string, number> = {}
  for (const [t, s] of Object.entries(perType)) {
    if (s && s.total > 0) lastRates[t] = Math.round((s.solved / s.total) * 100) / 100
  }

  const profilePatch = {
    text_level: result.profile.textLevel,
    per_puzzle_level: result.profile.perPuzzleLevel,
    last_success_rates: lastRates,
    last_avg_scene_ms: Math.round(avgSceneMs),
    sessions_count: (r?.sessions_count ?? 0) + 1,
    last_updated: new Date().toISOString(),
  }
  if (r?.id) {
    await supabaseAdmin.from('difficulty_profiles').update(profilePatch).eq('id', r.id)
  } else {
    await supabaseAdmin.from('difficulty_profiles').insert({ user_id: userId, ...profilePatch })
  }

  return { skipping: result.skipping, profile: result.profile }
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
      res.json({
        sessionId: o.id, resumed: true,
        currentSceneId: o.current_scene_id ?? null,
        inventory: o.inventory ?? [],
        visitedScenes: o.visited_scenes ?? [],
        crystals: withCrystals ? (o.crystals ?? 0) : 0,
      })
      return
    }

    /* max_score לפי מספר האתגרים בהדמיה */
    const { data: quest } = await supabaseAdmin.from('quests').select('game_data').eq('id', questId).single()
    const maxScore = countChallenges(quest?.game_data)

    const payload: Record<string, unknown> = {
      user_id: userId, quest_id: questId, started_at: new Date().toISOString(),
      max_score: maxScore, total_score: 0, visited_scenes: [], inventory: [],
    }
    if (assignmentId) payload.assignment_id = assignmentId
    if (withCrystals) payload.crystals = 0

    const { data: created, error } = await supabaseAdmin.from('sessions').insert(payload).select('id').single()
    if (error || !created) throw new AppError(500, 'יצירת session נכשלה: ' + (error?.message ?? ''))
    res.status(201).json({ sessionId: created.id, resumed: false, currentSceneId: null, inventory: [], visitedScenes: [], crystals: 0 })
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
const sceneTimeSchema = z.object({ sceneId: z.string(), dwellMs: z.number().nonnegative() })
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
})

sessionsRouter.post('/:id/complete', async (req, res, next) => {
  try {
    const session = await loadOwnSession(req, req.params.id)
    const parsed = completeSchema.safeParse(req.body)
    if (!parsed.success) throw new AppError(400, 'בקשה לא תקינה: ' + parsed.error.message)
    const { totalScore, crystalsFull, summary, challenges, sceneTimes } = parsed.data

    /* מדדים לכיול — שיעור הצלחה פר סוג + זמן ממוצע לסצנה (זמני קריאה) */
    const perType = perTypeFromChallenges(challenges ?? [])
    const avgSceneMs = summary?.avgSceneMs ?? (sceneTimes && sceneTimes.length
      ? Math.round(sceneTimes.reduce((a, s) => a + s.dwellMs, 0) / sceneTimes.length)
      : 0)
    const skipping = avgSceneMs > 0 && avgSceneMs < CALIBRATION.SKIP_MS_PER_SCENE
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
      rows.push({ ...base, type: 'scene_enter', scene_id: s.sceneId, payload: { dwellMs: s.dwellMs } })
    }
    if (summary) {
      rows.push({ ...base, type: 'session_completed', scene_id: null, payload: { ...summary, skipping, perType: perTypeSuccess } })
    }

    if (rows.length > 0) {
      await supabaseAdmin.from('events').delete().eq('session_id', session.id)
      const { error: evErr } = await supabaseAdmin.from('events').insert(rows)
      if (evErr) throw new AppError(500, 'כתיבת סיכום ה-events נכשלה: ' + evErr.message)
    }

    const patch: Record<string, unknown> = { completed_at: new Date().toISOString(), total_score: totalScore }
    if (crystalsFull !== undefined && (await hasSessionCrystals())) patch.crystals = crystalsFull
    const { error } = await supabaseAdmin.from('sessions').update(patch).eq('id', session.id)
    if (error) throw new AppError(500, 'סיום ה-session נכשל: ' + error.message)

    /* כיול פרופיל הקושי בשרת (JS) — best-effort: כשל לא יפיל את הסיום */
    let profileUpdated = false
    try {
      const cal = await recalibrateProfile(session.user_id, req.student!.classId ?? null, perType, avgSceneMs)
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
        const { error: snapErr } = await supabaseAdmin.from('progress_snapshots').insert({
          student_id: session.user_id,
          class_id: req.student!.classId ?? null,
          session_id: session.id,
          text_level: cal.profile.textLevel,
          per_puzzle_level: cal.profile.perPuzzleLevel,
          success_rates: perTypeSuccess,
          overall_success: overall,
        })
        if (snapErr) console.warn('[snapshot] כתיבת progress_snapshot נכשלה ל-session', session.id, '—', snapErr.message)
      }
    } catch (e) {
      console.warn('[calibrate] כיול הפרופיל נכשל ל-session', session.id, '—', e instanceof Error ? e.message : e)
    }
    res.json({ ok: true, profileUpdated })
  } catch (err) {
    next(err)
  }
})
