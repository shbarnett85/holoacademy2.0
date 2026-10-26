import { Router } from 'express'
import type { Request } from 'express'
import { supabaseAdmin } from '../lib/supabase.js'
import { AppError } from '../middleware/errors.js'
import { requireStaff, isDemoGuest, isOrgAdminRole } from '../middleware/staffAuth.js'
import { ERR_LEGACY_SUMMARY_MOVED } from '../../../src/shared/lib/findingsNarrative.js'
import { demoAssignmentsList, demoAssignmentDashboard, demoStudentsLens, demoStudentDetail, demoTrends, demoChallengeTypes, demoSummary, DEMO_CLASS } from '../lib/demoAnalytics.js'
import { hasIsActive, hasGradeLabel, hasQuestSubject, hasQuestSubjectId, hasDifficultyProfileV2, hasProgressSnapshots, hasRollingTallies, hasFictitious, hasSubjectLevels, hasSyntheticFlag } from '../lib/activeColumn.js'
import {
  loadViewer, studentScope, requireStudentScope, canPatchLevels, assignmentVisible, questVisible, classAccess,
  isAggregateOnly, belowMinCell, MIN_CELL_SIZE, logAccess,
} from '../lib/authz.js'
import { subjectByCode, subjectById, allSubjects, questSubjectOut } from '../lib/subjects.js'
import { applyTeacherLevels } from '../lib/profileCalibration.js'
import { computeWeakConcepts } from '../lib/weakConcepts.js'
import { buildTrendBuckets, bucketIndexOf } from '../lib/trendBuckets.js'

/* כל המסלולים דורשים צוות; הגישה מסוננת להרשאות (מורה → כיתותיו, מנהל → בית ספרו). */
export const analyticsRouter = Router()
analyticsRouter.use(requireStaff)

/* ── מצב הדגמה (מורה אורח): האנליטיקה מוגשת מנתוני-דמו סינתטיים (demoAnalytics),
   קריאה-בלבד. כתיבות נחסמות כאן גורף (חוץ מ-POST /summary, שבדמו מחזיר טקסט
   קבוע בלי לכתוב דבר). ── */
analyticsRouter.use((req, res, next) => {
  if (isDemoGuest(req) && req.method !== 'GET' && !(req.method === 'POST' && req.path === '/summary')) {
    res.status(403).json({ error: 'מצב הדגמה — נתוני הדמו לקריאה בלבד' })
    return
  }
  next()
})

function isAdmin(req: Request): boolean {
  return isOrgAdminRole(req.staff?.role)
}

/* ── סף-דגלים (thresholds) — מקור אמת יחיד לחישוב הדגלים ── */
const EXCEL_RATE = 0.85       /* ⭐ הצטיין */
const STRUGGLE_RATE = 0.6     /* 🔴 מתקשה (אחוז הצלחה נמוך) */
const SKIP_AVG_SCENE_MS = 5000 /* ⚡ חשד לדילוג — מהיר מדי לכל סצנה */
const SLOW_AVG_SCENE_MS = 90000 /* איטי מאוד לכל סצנה (התקשות בזמן) */

/* גישת הצוות לכיתה (רמת אגרגט) — דרך מודול ההרשאות המרכזי (lib/authz.ts). */
async function assertClassAccess(req: Request, classId: string): Promise<{ id: string; school_id: string | null }> {
  const { data, error } = await supabaseAdmin.from('classes').select('id, school_id').eq('id', classId).single()
  if (error || !data) throw new AppError(404, 'כיתה לא נמצאה')
  const cls = data as { id: string; school_id: string | null }
  const viewer = await loadViewer(req)
  if (classAccess(viewer, cls) === 'none') throw new AppError(403, 'אין לך גישה לכיתה זו')
  return cls
}

/* האם לסנן החוצה נתונים סינתטיים: כל צופה מחוץ לארגון הדגמה (demo_data_enabled) רואה נתוני אמת בלבד */
async function excludeSynthetic(req: Request): Promise<boolean> {
  const viewer = await loadViewer(req)
  if (viewer.seesSynthetic) return false
  return hasSyntheticFlag()
}

/* מטא להדמיות: מקצוע + יוצר + כותרת (שאילתה אחת) */
interface QuestMeta { subject_id: string | null; created_by: string | null; subject: string | null; title: string }
async function questMeta(ids: string[]): Promise<Map<string, QuestMeta>> {
  const map = new Map<string, QuestMeta>()
  const uniq = [...new Set(ids)]
  if (uniq.length === 0) return map
  const withId = await hasQuestSubjectId()
  const withText = await hasQuestSubject()
  const cols = 'id, title, created_by' + (withId ? ', subject_id' : '') + (withText ? ', subject' : '')
  const { data } = await supabaseAdmin.from('quests').select(cols).in('id', uniq)
  for (const q of (data ?? []) as unknown as { id: string; title: string; created_by: string | null; subject_id?: string | null; subject?: string | null }[]) {
    const out = await questSubjectOut({ subject: withId ? undefined : q.subject, subject_id: withId ? (q.subject_id ?? null) : undefined })
    map.set(q.id, { subject_id: withId ? (q.subject_id ?? null) : null, created_by: q.created_by ?? null, subject: out.subject, title: q.title ?? '' })
  }
  return map
}

/* תלמידים פעילים בכיתה */
async function activeStudents(classId: string): Promise<{ id: string; name: string; isFictitious: boolean }[]> {
  const withActive = await hasIsActive('users')
  const cols = ['id', 'name', 'role']
  if (withActive) cols.push('is_active')
  if (await hasFictitious()) cols.push('is_fictitious')
  const sel: string = `users(${cols.join(', ')})`
  const { data: members } = await supabaseAdmin.from('class_members').select(sel).eq('class_id', classId)
  type U = { id: string; name: string; role: string; is_active?: boolean; is_fictitious?: boolean }
  return ((members ?? []) as unknown as { users: U | U[] }[])
    .map((m) => (Array.isArray(m.users) ? m.users[0] : m.users))
    .filter((u): u is U => !!u)
    .filter((u) => u.role === 'student' && u.is_active !== false)
    .map((u) => ({ id: u.id, name: u.name, isFictitious: u.is_fictitious === true }))
}

interface SessionRow {
  id: string; user_id: string; quest_id: string
  started_at: string | null; completed_at: string | null
  total_score: number | null; max_score: number | null
}

/* ה-session האחרון לכל תלמיד עבור הדמיה מסוימת (לפי quest_id — זרימת המשחק אינה נושאת assignment_id) */
async function latestSessionsByStudent(questId: string, studentIds: string[], excludeSyn = false): Promise<Map<string, SessionRow>> {
  const map = new Map<string, SessionRow>()
  if (studentIds.length === 0) return map
  let sq = supabaseAdmin
    .from('sessions')
    .select('id, user_id, quest_id, started_at, completed_at, total_score, max_score')
    .eq('quest_id', questId)
    .in('user_id', studentIds)
  if (excludeSyn) sq = sq.eq('is_synthetic', false)
  const { data } = await sq.order('started_at', { ascending: false })
  for (const s of (data ?? []) as SessionRow[]) {
    if (!map.has(s.user_id)) map.set(s.user_id, s) /* הראשון = האחרון (ordered desc) */
  }
  return map
}

/* payload של session_completed לכל session (הסיכום העשיר ביותר לכל משחק) */
async function completedSummaries(sessionIds: string[]): Promise<Map<string, Record<string, number>>> {
  const map = new Map<string, Record<string, number>>()
  if (sessionIds.length === 0) return map
  const { data } = await supabaseAdmin
    .from('events')
    .select('session_id, payload')
    .in('session_id', sessionIds)
    .eq('type', 'session_completed')
  for (const e of (data ?? []) as { session_id: string; payload: Record<string, number> }[]) {
    map.set(e.session_id, e.payload ?? {})
  }
  return map
}

/* אחוז הצלחה לכל סצנת-אתגר (מצרף puzzle_solved/failed על פני כל ה-sessions) */
async function challengeStats(sessionIds: string[]): Promise<Map<string, { solved: number; failed: number }>> {
  const map = new Map<string, { solved: number; failed: number }>()
  if (sessionIds.length === 0) return map
  const { data } = await supabaseAdmin
    .from('events')
    .select('scene_id, type')
    .in('session_id', sessionIds)
    .in('type', ['puzzle_solved', 'puzzle_failed'])
  for (const e of (data ?? []) as { scene_id: string | null; type: string }[]) {
    if (!e.scene_id) continue
    const cur = map.get(e.scene_id) ?? { solved: 0, failed: 0 }
    if (e.type === 'puzzle_solved') cur.solved++
    else cur.failed++
    map.set(e.scene_id, cur)
  }
  return map
}

interface ChallengeMeta { sceneId: string; title: string; type: string }
function questChallenges(gameData: unknown): ChallengeMeta[] {
  const scenes = (gameData as { scenes?: { id: string; title?: string; puzzle?: { type?: string } }[] } | null)?.scenes
  if (!Array.isArray(scenes)) return []
  return scenes.filter((s) => s.puzzle).map((s) => ({ sceneId: s.id, title: s.title ?? s.id, type: s.puzzle!.type ?? 'multipleChoice' }))
}

/* ── שליטה ביעדי למידה — מיפוי סצנה→יעד מתוך ה-game_data (התיוג נוצר ביצירה) ──
   אפס תיעוד נוסף בצד התלמיד: ה-events כבר שומרים scene_id; המיפוי נעשה כאן באגרגציה. */
interface ObjectiveDef { id: string; text: string }
function questObjectives(gameData: unknown): { objectives: ObjectiveDef[]; sceneToObjective: Map<string, string> } {
  const gd = gameData as { objectives?: ObjectiveDef[]; scenes?: { id: string; puzzle?: { objectiveId?: string | null } }[] } | null
  const objectives = Array.isArray(gd?.objectives) ? gd.objectives.filter((o) => o?.id && o?.text) : []
  const sceneToObjective = new Map<string, string>()
  if (objectives.length > 0 && Array.isArray(gd?.scenes)) {
    for (const s of gd.scenes) {
      if (s.puzzle?.objectiveId) sceneToObjective.set(s.id, s.puzzle.objectiveId)
    }
  }
  return { objectives, sceneToObjective }
}

/* תוצאות פר-יעד: הצלחה כיתתית + מי מתקשה בכל יעד (שיעור אישי מתחת לסף).
   נשען על אותם events מסוכמים (puzzle_solved/failed), עם session_id → תלמיד. */
async function objectiveStats(
  sessionIds: string[],
  sessionToStudent: Map<string, string>,
  sceneToObjective: Map<string, string>,
): Promise<Map<string, { solved: number; failed: number; perStudent: Map<string, { solved: number; failed: number }> }>> {
  const map = new Map<string, { solved: number; failed: number; perStudent: Map<string, { solved: number; failed: number }> }>()
  if (sessionIds.length === 0 || sceneToObjective.size === 0) return map
  const { data } = await supabaseAdmin
    .from('events')
    .select('session_id, scene_id, type')
    .in('session_id', sessionIds)
    .in('type', ['puzzle_solved', 'puzzle_failed'])
  for (const e of (data ?? []) as { session_id: string; scene_id: string | null; type: string }[]) {
    if (!e.scene_id) continue
    const objectiveId = sceneToObjective.get(e.scene_id)
    if (!objectiveId) continue
    const studentId = sessionToStudent.get(e.session_id)
    const cur = map.get(objectiveId) ?? { solved: 0, failed: 0, perStudent: new Map() }
    const solved = e.type === 'puzzle_solved'
    if (solved) cur.solved++
    else cur.failed++
    if (studentId) {
      const ps = cur.perStudent.get(studentId) ?? { solved: 0, failed: 0 }
      if (solved) ps.solved++
      else ps.failed++
      cur.perStudent.set(studentId, ps)
    }
    map.set(objectiveId, cur)
  }
  return map
}

/* ── GET /api/analytics/assignment/:assignmentId — המסך הראשי ── */
analyticsRouter.get('/assignment/:assignmentId', async (req, res, next) => {
  try {
    /* מצב הדגמה — דשבורד מטלה מנתוני הדמו */
    if (isDemoGuest(req)) {
      const demo = demoAssignmentDashboard(req.params.assignmentId, new Date())
      if (!demo) throw new AppError(404, 'מטלה לא נמצאה')
      res.json(demo)
      return
    }
    const { data: asg, error } = await supabaseAdmin
      .from('assignments')
      .select('id, quest_id, class_id, due_date')
      .eq('id', req.params.assignmentId)
      .single()
    if (error || !asg) throw new AppError(404, 'מטלה לא נמצאה')
    await assertClassAccess(req, asg.class_id)
    const viewer = await loadViewer(req)
    const qm = (await questMeta([asg.quest_id])).get(asg.quest_id)
    if (!assignmentVisible(viewer, asg.class_id, { subject_id: qm?.subject_id ?? null, created_by: qm?.created_by ?? null })) {
      throw new AppError(403, 'אין לך גישה לשיעור זה — הוא אינו במקצוע שלך בכיתה הזו')
    }
    const exSyn = await excludeSynthetic(req)
    const aggOnly = isAggregateOnly(viewer)

    const [{ data: questRow }, { data: clsRow }, students] = await Promise.all([
      supabaseAdmin.from('quests').select('title, game_data').eq('id', asg.quest_id).single(),
      supabaseAdmin.from('classes').select('*').eq('id', asg.class_id).single(),
      activeStudents(asg.class_id),
    ])
    const challenges = questChallenges(questRow?.game_data)
    const { objectives, sceneToObjective } = questObjectives(questRow?.game_data)
    const studentIds = students.map((s) => s.id)
    const sessions = await latestSessionsByStudent(asg.quest_id, studentIds, exSyn)
    const sessionIds = [...sessions.values()].map((s) => s.id)
    /* מיפוי session→תלמיד — לזיהוי מתקשים פר-יעד */
    const sessionToStudent = new Map<string, string>()
    for (const [studentId, sess] of sessions) sessionToStudent.set(sess.id, studentId)
    const [summaries, chStats, objStats] = await Promise.all([
      completedSummaries(sessionIds),
      challengeStats(sessionIds),
      objectiveStats(sessionIds, sessionToStudent, sceneToObjective),
    ])

    /* פירוק לפי תלמיד */
    const perStudent = students.map((stu) => {
      const sess = sessions.get(stu.id)
      if (!sess) return { studentId: stu.id, name: stu.name, isFictitious: stu.isFictitious, status: 'not_started' as const, successRate: null, crystals: null, durationMs: null, avgSceneMs: null, flags: [] as string[] }
      const status = sess.completed_at ? ('completed' as const) : ('in_progress' as const)
      const sum = summaries.get(sess.id)
      /* אחוז הצלחה/קריסטלים רלוונטיים רק למשחק שהושלם; באמצע → null */
      const successRate = status === 'completed' ? (sum?.successRate ?? (sess.max_score ? (sess.total_score ?? 0) / sess.max_score : null)) : null
      const crystals = status === 'completed' ? (sum?.crystalsEarned ?? null) : null
      const durationMs = sum?.durationMs ?? (sess.completed_at && sess.started_at ? new Date(sess.completed_at).getTime() - new Date(sess.started_at).getTime() : null)
      const avgSceneMs = status === 'completed' ? (sum?.avgSceneMs ?? null) : null
      const flags: string[] = []
      if (status === 'completed' && successRate !== null) {
        if (successRate >= EXCEL_RATE && (avgSceneMs === null || avgSceneMs >= SKIP_AVG_SCENE_MS)) flags.push('excelled')
        if (successRate < STRUGGLE_RATE) flags.push('struggling')
        if (avgSceneMs !== null && avgSceneMs < SKIP_AVG_SCENE_MS && successRate < EXCEL_RATE) flags.push('skip_suspect')
        if (avgSceneMs !== null && avgSceneMs > SLOW_AVG_SCENE_MS) flags.push('slow')
      }
      return { studentId: stu.id, name: stu.name, isFictitious: stu.isFictitious, status, successRate, crystals, durationMs, avgSceneMs, flags }
    })

    /* אגרגציות כיתתיות */
    const completed = perStudent.filter((s) => s.status === 'completed')
    const inProgress = perStudent.filter((s) => s.status === 'in_progress')
    const notStarted = perStudent.filter((s) => s.status === 'not_started')
    const rates = completed.map((s) => s.successRate).filter((r): r is number => r !== null)
    const avgSuccessRate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null
    const durations = completed.map((s) => s.durationMs).filter((d): d is number => d !== null)
    const avgCompletionMs = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null
    const distribution = {
      low: rates.filter((r) => r < STRUGGLE_RATE).length,         /* <60 */
      mid: rates.filter((r) => r >= STRUGGLE_RATE && r < EXCEL_RATE).length, /* 60-85 */
      high: rates.filter((r) => r >= EXCEL_RATE).length,          /* 85+ */
    }
    const flaggedCount = perStudent.filter((s) => s.flags.includes('struggling') || s.flags.includes('skip_suspect') || s.flags.includes('slow')).length

    /* פירוק לפי אתגר — הקשה ביותר (אחוז הצלחה נמוך) למעלה */
    const perChallenge = challenges.map((c) => {
      const st = chStats.get(c.sceneId) ?? { solved: 0, failed: 0 }
      const attempts = st.solved + st.failed
      return { sceneId: c.sceneId, title: c.title, type: c.type, attempts, solved: st.solved, failed: st.failed, successRate: attempts ? st.solved / attempts : null }
    }).sort((a, b) => {
      if (a.successRate === null) return 1
      if (b.successRate === null) return -1
      return a.successRate - b.successRate
    })

    /* ── שליטה ביעדי הלמידה — ספי 60/80 (עקבי עם מודל הכיול) ──
       masteryLevel: 'strong' ≥80% · 'partial' 60-80% · 'weak' <60% · null = אין נתונים.
       weakStudents = תלמידים ששיעורם האישי ביעד מתחת ל-60% (עם ניסיון אחד לפחות). */
    const nameOf = new Map(students.map((s) => [s.id, s.name]))
    const perObjective = objectives.map((o) => {
      const st = objStats.get(o.id)
      const attempts = (st?.solved ?? 0) + (st?.failed ?? 0)
      const successRate = attempts > 0 ? (st!.solved / attempts) : null
      const masteryLevel = successRate === null ? null : successRate >= 0.8 ? 'strong' : successRate >= 0.6 ? 'partial' : 'weak'
      const weakStudents: { studentId: string; name: string }[] = []
      if (st) {
        for (const [studentId, ps] of st.perStudent) {
          const t = ps.solved + ps.failed
          if (t > 0 && ps.solved / t < 0.6) weakStudents.push({ studentId, name: nameOf.get(studentId) ?? '' })
        }
      }
      return { id: o.id, text: o.text, attempts, successRate, masteryLevel, weakStudents }
    })

    /* תובנות מנוסחות כפעולה למורה */
    const insights: string[] = []
    const weakestObjective = [...perObjective].filter((o) => o.masteryLevel === 'weak' && o.attempts >= 2).sort((a, b) => (a.successRate ?? 0) - (b.successRate ?? 0))[0]
    if (weakestObjective) {
      insights.push(`היעד "${weakestObjective.text}" טעון חיזוק (${Math.round((weakestObjective.successRate ?? 0) * 100)}% הצלחה) — מומלץ לחזור עליו בכיתה.`)
    }
    const hardest = perChallenge.find((c) => c.successRate !== null && c.successRate < STRUGGLE_RATE && c.attempts >= 2)
    if (hardest) {
      const strugglers = hardest.failed
      insights.push(`${strugglers} תלמידים התקשו באתגר "${hardest.title}" (${Math.round((hardest.successRate ?? 0) * 100)}% הצלחה) — שווה לחזור עליו בכיתה.`)
    }
    /* תובנות על תלמידים בודדים — למורים בלבד; מנהלים מקבלים רק תובנות ברמת הכיתה (חוק 8) */
    if (!aggOnly) {
      const strugglingStudents = perStudent.filter((s) => s.flags.includes('struggling')).length
      if (strugglingStudents > 0) insights.push(`${strugglingStudents} תלמידים מתקשים בשיעור — כדאי לבדוק איתם אישית.`)
      const skips = perStudent.filter((s) => s.flags.includes('skip_suspect')).length
      if (skips > 0) insights.push(`${skips} תלמידים סיימו מהר מאוד עם הצלחה נמוכה — ייתכן שדילגו על התוכן.`)
    }
    if (notStarted.length > 0) insights.push(`${notStarted.length} תלמידים עוד לא התחילו את השיעור.`)
    if (avgSuccessRate !== null && avgSuccessRate >= EXCEL_RATE) insights.push('הכיתה שלטה בחומר — אחוז הצלחה ממוצע מצוין! 🎉')

    /* מנהלים: אגרגט בלבד + סף מינימום לתא. מתחת לסף — "אין עדיין מספיק נתונים". */
    const insufficient = aggOnly && belowMinCell(completed.length)

    res.json({
      assignment: { id: asg.id, dueDate: asg.due_date },
      quest: { id: asg.quest_id, title: questRow?.title ?? '' },
      class: { id: asg.class_id, name: (clsRow as { name?: string; grade_label?: string } | null)?.grade_label ?? (clsRow as { name?: string } | null)?.name ?? '' },
      totals: {
        students: students.length,
        completed: completed.length,
        inProgress: inProgress.length,
        notStarted: notStarted.length,
        completionRate: students.length ? completed.length / students.length : 0,
        avgSuccessRate: insufficient ? null : avgSuccessRate,
        avgCompletionMs: insufficient ? null : avgCompletionMs,
        flaggedCount: aggOnly ? 0 : flaggedCount,
      },
      distribution: insufficient ? { low: 0, mid: 0, high: 0 } : distribution,
      perChallenge: insufficient ? perChallenge.map((c) => ({ ...c, attempts: 0, solved: 0, failed: 0, successRate: null })) : perChallenge,
      perObjective: aggOnly
        ? perObjective.map((o) => ({ ...o, weakStudents: [], ...(insufficient ? { attempts: 0, successRate: null, masteryLevel: null } : {}) }))
        : perObjective,
      /* מנהלים לא רואים תלמידים בודדים */
      students: aggOnly ? [] : perStudent,
      insights: insufficient ? [] : insights,
      aggregateOnly: aggOnly,
      insufficientData: insufficient,
      minCellSize: MIN_CELL_SIZE,
    })
  } catch (err) {
    next(err)
  }
})

/* ── GET /api/analytics/class/:classId/assignments — רשימת מטלות + סיכום-על ── */
analyticsRouter.get('/class/:classId/assignments', async (req, res, next) => {
  try {
    if (isDemoGuest(req) && req.params.classId === DEMO_CLASS.id) {
      res.json(demoAssignmentsList(new Date()))
      return
    }
    await assertClassAccess(req, req.params.classId)
    const viewer = await loadViewer(req)
    const exSyn = await excludeSynthetic(req)
    const aggOnly = isAggregateOnly(viewer)
    const { data: asgsAll, error } = await supabaseAdmin
      .from('assignments')
      .select('id, quest_id, due_date, created_at, quests(title)')
      .eq('class_id', req.params.classId)
      .order('created_at', { ascending: false })
    if (error) throw new AppError(500, 'שגיאה בשליפת מטלות: ' + error.message)
    /* מורה רואה רק מטלות במקצועו (או שיצר / מחנך הכיתה) */
    const metaByQuest = await questMeta((asgsAll ?? []).map((a) => a.quest_id))
    const asgs = (asgsAll ?? []).filter((a) => {
      const m = metaByQuest.get(a.quest_id)
      return assignmentVisible(viewer, req.params.classId, { subject_id: m?.subject_id ?? null, created_by: m?.created_by ?? null })
    })

    const students = await activeStudents(req.params.classId)
    const studentIds = students.map((s) => s.id)
    const questIds = [...new Set((asgs ?? []).map((a) => a.quest_id))]

    /* כל ה-sessions של תלמידי הכיתה על ההדמיות המוקצות — שאילתה אחת, אגרגציה ב-JS */
    const byQuest = new Map<string, SessionRow[]>()
    if (questIds.length && studentIds.length) {
      let sq = supabaseAdmin
        .from('sessions')
        .select('id, user_id, quest_id, started_at, completed_at, total_score, max_score')
        .in('quest_id', questIds)
        .in('user_id', studentIds)
      if (exSyn) sq = sq.eq('is_synthetic', false)
      const { data } = await sq.order('started_at', { ascending: false })
      for (const s of (data ?? []) as SessionRow[]) {
        const arr = byQuest.get(s.quest_id) ?? []
        arr.push(s)
        byQuest.set(s.quest_id, arr)
      }
    }

    const assignments = (asgs ?? []).map((a) => {
      const sessions = byQuest.get(a.quest_id) ?? []
      const latest = new Map<string, SessionRow>()
      for (const s of sessions) if (!latest.has(s.user_id)) latest.set(s.user_id, s)
      const list = [...latest.values()]
      const completed = list.filter((s) => s.completed_at)
      const rates = completed.map((s) => (s.max_score ? (s.total_score ?? 0) / s.max_score : null)).filter((r): r is number => r !== null)
      const q = Array.isArray(a.quests) ? a.quests[0] : a.quests
      return {
        id: a.id,
        questId: a.quest_id,
        title: (q as { title?: string } | null)?.title ?? '',
        dueDate: a.due_date,
        students: students.length,
        completed: completed.length,
        completionRate: students.length ? completed.length / students.length : 0,
        avgSuccessRate: aggOnly && belowMinCell(completed.length) ? null : (rates.length ? rates.reduce((x, y) => x + y, 0) / rates.length : null),
      }
    })
    res.json({ assignments })
  } catch (err) {
    next(err)
  }
})

/* כל הכיתות שהצוות נגיש אליהן (super_admin → הכול, admin → בית ספרו, מורה → class_teachers/teacher_id) */
async function accessibleClasses(req: Request): Promise<{ id: string; gradeLabel: string }[]> {
  const withGrade = await hasGradeLabel()
  const s = req.staff!
  let rows: Record<string, unknown>[] = []
  if (s.role === 'super_admin') {
    const { data } = await supabaseAdmin.from('classes').select('*')
    rows = (data ?? []) as Record<string, unknown>[]
  } else if (isAdmin(req)) {
    let q = supabaseAdmin.from('classes').select('*')
    if (s.schoolId) q = q.eq('school_id', s.schoolId)
    const { data } = await q
    rows = (data ?? []) as Record<string, unknown>[]
  } else {
    const ids = [...(await loadViewer(req)).grants.keys()]
    if (ids.length === 0) return []
    const { data } = await supabaseAdmin.from('classes').select('*').in('id', ids)
    rows = (data ?? []) as Record<string, unknown>[]
  }
  return rows.map((c) => ({ id: c.id as string, gradeLabel: ((withGrade ? (c.grade_label as string) : null) ?? (c.name as string)) || '' }))
}

/* כיתות שהמורה הוא *מחנך* שלהן (is_homeroom=true). מושג של מורה בלבד —
   admin/super_admin ניגשים לפי בית ספר ולא צריכים את ההבחנה. */
async function homeroomClassIds(req: Request): Promise<Set<string>> {
  const viewer = await loadViewer(req)
  if (viewer.role !== 'teacher') return new Set()
  return new Set([...viewer.grants.values()].filter((g) => g.homeroom).map((g) => g.classId))
}

/* ── GET /api/analytics/assignments — כל המטלות בכל הכיתות הנגישות (לרשימה המלאה + סינון) ── */
analyticsRouter.get('/assignments', async (req, res, next) => {
  try {
    /* מצב הדגמה — רשימת השיעורים מנתוני הדמו (ולא מהכיתות האמיתיות של חשבון הדמו) */
    if (isDemoGuest(req)) {
      res.json(demoAssignmentsList(new Date()))
      return
    }
    const classes = await accessibleClasses(req)
    const classMap = new Map(classes.map((c) => [c.id, c.gradeLabel]))
    const classIds = classes.map((c) => c.id)
    if (classIds.length === 0) { res.json({ assignments: [] }); return }

    const { data: asgs, error } = await supabaseAdmin
      .from('assignments')
      .select('id, quest_id, class_id, due_date, created_at, quests(title)')
      .in('class_id', classIds)
      .order('created_at', { ascending: false })
    if (error) throw new AppError(500, 'שגיאה בשליפת מטלות: ' + error.message)

    /* תלמידים פעילים לכל כיתה */
    const studentsByClass = new Map<string, { id: string }[]>()
    for (const c of classes) studentsByClass.set(c.id, await activeStudents(c.id))
    const allStudentIds = [...new Set([...studentsByClass.values()].flat().map((s) => s.id))]
    const questIds = [...new Set((asgs ?? []).map((a) => a.quest_id))]

    /* מטא להדמיות: יוצר (לשיוך בעלות) + מקצוע (subject_id). נשלף בשאילתה אחת. */
    const metaByQuest = await questMeta(questIds)
    const subjectByQuest = new Map<string, string>()
    const authorByQuest = new Map<string, string | null>()
    for (const [qid, m] of metaByQuest) {
      authorByQuest.set(qid, m.created_by)
      if (m.subject) subjectByQuest.set(qid, m.subject)
    }
    const viewer = await loadViewer(req)
    const exSyn = await excludeSynthetic(req)
    /* שמות היוצרים — לתווית הבידול אצל מחנך ("כיתתי · <מקצוע> · <מורה>") */
    const authorIds = [...new Set([...authorByQuest.values()].filter((x): x is string => !!x))]
    const authorName = new Map<string, string>()
    if (authorIds.length) {
      const { data } = await supabaseAdmin.from('users').select('id, name').in('id', authorIds)
      for (const u of (data ?? []) as { id: string; name: string }[]) authorName.set(u.id, u.name)
    }

    /* סקופ (authz): מורה מקצועי → הקצאות שיצר או במקצוע שלו בכיתה; מחנך → כל ההקצאות לכיתתו
       (גם של מורים אחרים); admin/super → הכול (אגרגט). */
    const homeroomSet = await homeroomClassIds(req)
    const myId = req.staff!.userId

    /* sessions לכל ההדמיות + התלמידים — שאילתה אחת */
    const sessions: SessionRow[] = []
    if (questIds.length && allStudentIds.length) {
      let sq = supabaseAdmin
        .from('sessions')
        .select('id, user_id, quest_id, started_at, completed_at, total_score, max_score')
        .in('quest_id', questIds)
        .in('user_id', allStudentIds)
      if (exSyn) sq = sq.eq('is_synthetic', false)
      const { data } = await sq.order('started_at', { ascending: false })
      sessions.push(...((data ?? []) as SessionRow[]))
    }

    const adminLike = isAdmin(req)
    const assignments = (asgs ?? []).map((a) => {
      const clsStudents = studentsByClass.get(a.class_id) ?? []
      const sids = new Set(clsStudents.map((s) => s.id))
      const latest = new Map<string, SessionRow>()
      for (const s of sessions) {
        if (s.quest_id !== a.quest_id || !sids.has(s.user_id)) continue
        if (!latest.has(s.user_id)) latest.set(s.user_id, s)
      }
      const list = [...latest.values()]
      const completed = list.filter((s) => s.completed_at)
      const rates = completed.map((s) => (s.max_score ? (s.total_score ?? 0) / s.max_score : null)).filter((r): r is number => r !== null)
      const q = Array.isArray(a.quests) ? a.quests[0] : a.quests
      const author = authorByQuest.get(a.quest_id) ?? null
      const own = adminLike || author === myId
      const homeroom = !own && homeroomSet.has(a.class_id) /* הוקצה ע"י מורה אחר לכיתת-החינוך שלי */
      return {
        id: a.id, questId: a.quest_id, classId: a.class_id, classGradeLabel: classMap.get(a.class_id) ?? '',
        title: (q as { title?: string } | null)?.title ?? '', subject: subjectByQuest.get(a.quest_id) ?? null, dueDate: a.due_date, createdAt: a.created_at,
        students: clsStudents.length, completed: completed.length,
        completionRate: clsStudents.length ? completed.length / clsStudents.length : 0,
        avgSuccessRate: adminLike && belowMinCell(completed.length) ? null : (rates.length ? rates.reduce((x, y) => x + y, 0) / rates.length : null),
        own, homeroom, teacherName: homeroom && author ? (authorName.get(author) ?? null) : null,
        _visible: assignmentVisible(viewer, a.class_id, { subject_id: metaByQuest.get(a.quest_id)?.subject_id ?? null, created_by: author }),
      }
    }).filter((a) => a._visible).map(({ _visible, ...rest }) => { void _visible; return rest }) /* מורה מקצועי: שיצר/במקצועו; מחנך: + כל כיתתו; admin: הכול */
    res.json({ assignments })
  } catch (err) {
    next(err)
  }
})

/* ── GET /api/analytics/students — עדשת "תלמידים" (לרשימת פרופילים + כרטיסי התקדמות) ──
   סקופ פר-תלמיד:
   · admin/super_admin → תמונה מלאה (כל ה-sessions + פרופיל קושי) לכל תלמיד בבית הספר.
   · מחנך → תמונה חוצת-מקצוע מלאה לתלמידי כיתת-החינוך שלו (הרשאה A).
   · מורה מקצועי → רק תלמידי כיתותיו, וביצועים מההקצאות שלו בלבד (sessions על הדמיות שיצר). */
analyticsRouter.get('/students', async (req, res, next) => {
  try {
    if (isDemoGuest(req)) {
      res.json(demoStudentsLens(new Date()))
      return
    }
    const viewer = await loadViewer(req)
    /* מנהלים: אגרגטים בלבד — אין רשימת תלמידים בודדים (חוק 8) */
    if (isAggregateOnly(viewer)) { res.json({ students: [], canCompare: false, aggregateOnly: true }); return }
    const classes = await accessibleClasses(req)
    if (classes.length === 0) { res.json({ students: [], canCompare: false }); return }
    const exSyn = await excludeSynthetic(req)

    /* תלמיד → כיתה מייצגת (מעדיף כיתת-חינוך) + כל הכיתות הנגישות שלו (לחישוב טווח) */
    const studentClass = new Map<string, { name: string; classId: string; gradeLabel: string; isFictitious: boolean; classIds: string[] }>()
    for (const c of classes) {
      for (const st of await activeStudents(c.id)) {
        const cur = studentClass.get(st.id)
        if (!cur) { studentClass.set(st.id, { name: st.name, classId: c.id, gradeLabel: c.gradeLabel, isFictitious: st.isFictitious, classIds: [c.id] }); continue }
        cur.classIds.push(c.id)
        if (viewer.grants.get(c.id)?.homeroom && !viewer.grants.get(cur.classId)?.homeroom) { cur.classId = c.id; cur.gradeLabel = c.gradeLabel }
      }
    }
    const studentIds = [...studentClass.keys()]
    if (studentIds.length === 0) { res.json({ students: [], canCompare: false }); return }

    let sessQ = supabaseAdmin
      .from('sessions')
      .select('id, user_id, quest_id, started_at, completed_at, total_score, max_score')
      .in('user_id', studentIds)
    if (exSyn) sessQ = sessQ.eq('is_synthetic', false)
    const { data: sessRows } = await sessQ.order('started_at', { ascending: false })
    const sessions = (sessRows ?? []) as SessionRow[]
    const qmeta = await questMeta(sessions.map((x) => x.quest_id))

    /* פרופיל קושי (חוצה-מקצוע) — מוצג רק בתמונה מלאה (מחנך) */
    const v2 = await hasDifficultyProfileV2()
    const profCols = v2 ? 'user_id, text_level, sessions_count' : 'user_id, writing_level, sessions_count'
    const { data: profRows } = await supabaseAdmin.from('difficulty_profiles').select(profCols).in('user_id', studentIds)
    const profByUser = new Map<string, { text_level?: number | null; writing_level?: number | null }>()
    for (const p of (profRows ?? []) as { user_id: string }[]) profByUser.set(p.user_id, p as never)

    const students = studentIds.map((sid) => {
      const meta = studentClass.get(sid)!
      const scope = studentScope(viewer, meta.classIds)
      const full = scope.kind === 'scoped' && scope.full
      const mySess = sessions.filter((se) => {
        if (se.user_id !== sid) return false
        const m = qmeta.get(se.quest_id)
        return questVisible(scope, { subject_id: m?.subject_id ?? null, created_by: m?.created_by ?? null }, viewer.userId)
      })
      const latest = new Map<string, SessionRow>()
      for (const se of mySess) if (!latest.has(se.quest_id)) latest.set(se.quest_id, se)
      const list = [...latest.values()]
      const completed = list.filter((se) => se.completed_at)
      const rates = completed.map((se) => (se.max_score ? (se.total_score ?? 0) / se.max_score : null)).filter((r): r is number => r !== null)
      const avgSuccessRate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null
      const prof = full ? profByUser.get(sid) : undefined
      const textLevel = prof ? (v2 ? prof.text_level ?? null : prof.writing_level ?? null) : null
      const flags: string[] = []
      if (avgSuccessRate !== null) {
        if (avgSuccessRate >= EXCEL_RATE) flags.push('excelled')
        else if (avgSuccessRate < STRUGGLE_RATE) flags.push('struggling')
      }
      return {
        studentId: sid, name: meta.name, isFictitious: meta.isFictitious, className: meta.gradeLabel, crossSubject: full,
        textLevel, sessionsCount: completed.length, avgSuccessRate,
        lastActive: mySess[0]?.started_at ?? null, flags,
      }
    }).sort((a, b) => a.name.localeCompare(b.name, 'he'))

    /* גרף ההשוואה זמין רק בתמונה מלאה — מחנך */
    void logAccess(viewer, { scope: 'students_lens', endpoint: 'GET /api/analytics/students' })
    res.json({ students, canCompare: viewer.role === 'super_admin' || viewer.grants.size > 0 && [...viewer.grants.values()].some((g) => g.homeroom) })
  } catch (err) {
    next(err)
  }
})

/* ── GET /api/analytics/student/:studentId — drill-down תלמיד ── */
analyticsRouter.get('/student/:studentId', async (req, res, next) => {
  try {
    if (isDemoGuest(req)) {
      const demo = demoStudentDetail(req.params.studentId, new Date())
      if (!demo) throw new AppError(404, 'תלמיד לא נמצא')
      res.json(demo)
      return
    }
    /* authz: מנהלים נחסמים (אגרגטים בלבד); מורה מקצועי מוגבל למקצועותיו; מחנך — הכול */
    const { viewer, scope } = await requireStudentScope(req, req.params.studentId)
    if (scope.kind !== 'scoped') throw new AppError(403, 'אין לך גישה לתלמיד זה')
    const exSyn = await excludeSynthetic(req)
    const studentId = req.params.studentId

    const stuCols = (await hasFictitious()) ? 'id, name, is_fictitious' : 'id, name'
    const { data: stu } = await supabaseAdmin.from('users').select(stuCols).eq('id', studentId).single()

    /* סשנים — כל התלמיד, ואז סינון לפי טווח הצופה (מקצועות אחרים → שמות בלבד) */
    let sq = supabaseAdmin
      .from('sessions')
      .select('id, quest_id, started_at, completed_at, total_score, max_score')
      .eq('user_id', studentId)
    if (exSyn) sq = sq.eq('is_synthetic', false)
    const { data: allSessions } = await sq.order('started_at', { ascending: false }).limit(200)
    const qmeta = await questMeta((allSessions ?? []).map((x) => x.quest_id as string))
    const visible = (allSessions ?? []).filter((x) => {
      const m = qmeta.get(x.quest_id as string)
      return questVisible(scope, { subject_id: m?.subject_id ?? null, created_by: m?.created_by ?? null }, viewer.userId)
    })
    const hidden = (allSessions ?? []).filter((x) => !visible.includes(x))
    const otherSubjects = [...new Set(hidden.map((x) => qmeta.get(x.quest_id as string)?.subject).filter((n): n is string => !!n))]
      .map((name) => ({ name }))

    /* פרופיל הקושי הגלובלי — לתמונה מלאה בלבד (מחנך/מנהל-על). מורה מקצועי מקבל רמות פר-מקצוע. */
    const v2 = await hasDifficultyProfileV2()
    const withRolling = v2 && (await hasRollingTallies())
    const profileCols = v2
      ? ['text_level', 'per_puzzle_level', 'last_success_rates', 'last_avg_scene_ms', 'sessions_count', 'last_updated',
          ...(withRolling ? ['rolling_tallies'] : []),
        ].join(', ')
      : 'writing_level, puzzle_difficulty, avg_success_rate, avg_time_per_scene, sessions_count, last_updated'
    let profile: unknown = null
    if (scope.full) {
      const { data } = await supabaseAdmin.from('difficulty_profiles').select(profileCols).eq('user_id', studentId).maybeSingle()
      profile = data ?? null
    }

    /* רמות פר-מקצוע — רק המקצועות שהצופה רשאי לראות */
    const subjectLevels: { subjectCode: string; subjectName: string; textLevel: number; perType: Record<string, number>; teacherLocked: boolean }[] = []
    if (await hasSubjectLevels()) {
      const { data: lv } = await supabaseAdmin.from('student_subject_levels').select('subject_id, text_level, per_type, teacher_locked').eq('student_id', studentId)
      const allowed = new Set<string>(scope.subjectIds)
      for (const x of visible) { const sid = qmeta.get(x.quest_id as string)?.subject_id; if (sid) allowed.add(sid) }
      for (const r of (lv ?? []) as { subject_id: string; text_level: number; per_type: Record<string, number> | null; teacher_locked: boolean }[]) {
        if (!scope.full && !allowed.has(r.subject_id)) continue
        const srow = await questSubjectOut({ subject: undefined, subject_id: r.subject_id })
        if (!srow.subjectCode) continue
        subjectLevels.push({ subjectCode: srow.subjectCode, subjectName: srow.subject ?? '', textLevel: Number(r.text_level), perType: r.per_type ?? {}, teacherLocked: r.teacher_locked })
      }
    }

    /* אילו מקצועות הצופה רשאי לעדכן ברמות (נאכף שוב ב-PATCH): מחנך — הכול + גלובלי; מקצועי — שלו */
    const editable: { global: boolean; subjects: { code: string; name: string }[] } = { global: scope.full, subjects: [] }
    if (scope.full) {
      editable.subjects = (await allSubjects()).filter((s) => s.id).map((s) => ({ code: s.code, name: s.nameHe }))
    } else {
      for (const sid of scope.subjectIds) {
        const r = await subjectById(sid)
        if (r) editable.subjects.push({ code: r.code, name: r.nameHe })
      }
    }

    /* דגל "דילוג" — מה-session_completed של הסשן המושלם האחרון שבטווח */
    const lastDone = visible.find((x) => x.completed_at)
    let skipping = false
    if (lastDone) {
      const { data: lastCompleted } = await supabaseAdmin
        .from('events').select('payload').eq('session_id', lastDone.id).eq('type', 'session_completed').limit(1).maybeSingle()
      skipping = Boolean((lastCompleted?.payload as { skipping?: boolean } | null)?.skipping)
    }

    const history = visible.slice(0, 50).map((s) => {
      const successRate = s.max_score ? ((s.total_score as number | null) ?? 0) / (s.max_score as number) : null
      return {
        sessionId: s.id, questId: s.quest_id, questTitle: qmeta.get(s.quest_id as string)?.title ?? '',
        startedAt: s.started_at, completedAt: s.completed_at,
        status: s.completed_at ? 'completed' : 'in_progress', successRate,
      }
    })
    /* מגמה — אחוז הצלחה לאורך משחקים שהושלמו (כרונולוגי) */
    const trend = [...history].filter((h) => h.status === 'completed' && h.successRate !== null)
      .reverse()
      .map((h) => ({ date: h.completedAt, successRate: h.successRate }))

    void logAccess(viewer, { studentId, scope: 'student_detail', endpoint: 'GET /api/analytics/student/:id' })
    res.json({
      student: {
        id: studentId,
        name: (stu as { name?: string } | null)?.name ?? '',
        isFictitious: (stu as { is_fictitious?: boolean } | null)?.is_fictitious === true,
      },
      profile,
      profileVersion: v2 ? 2 : 1,
      skipping,
      history,
      trend,
      subjectLevels,
      otherSubjects,
      editable,
      visibility: { full: scope.full },
    })
  } catch (err) {
    next(err)
  }
})

/* ── PATCH /api/analytics/student/:studentId/profile — עקיפת מורה לרמות ──
   רק מחנך (כל מקצוע + הגלובלי) או מורה שמלמד את התלמיד באותו מקצוע (subjectCode חובה).
   כותב teacher_locked=true — הכיול האוטומטי לא דורס עד ש-unlock:true משחרר. נרשם ב-level_history. */
analyticsRouter.patch('/student/:studentId/profile', async (req, res, next) => {
  try {
    const { studentId } = req.params
    const { viewer, scope, classIds } = await requireStudentScope(req, studentId)

    const body = (req.body ?? {}) as { perPuzzleLevel?: Record<string, number>; textLevel?: number; subjectCode?: string; unlock?: boolean }
    let subjectId: string | null = null
    if (body.subjectCode !== undefined && body.subjectCode !== null && body.subjectCode !== '') {
      const row = await subjectByCode(body.subjectCode)
      if (!row) throw new AppError(400, 'מקצוע לא מוכר')
      subjectId = row.id
    }
    if (!canPatchLevels(scope, subjectId)) {
      throw new AppError(403, subjectId === null
        ? 'עדכון הרמה הכללית מותר למחנך הכיתה בלבד — ציינו מקצוע שאתם מלמדים'
        : 'אפשר לעדכן רמות רק במקצוע שאתם מלמדים את התלמיד, או כמחנכים')
    }
    if (body.textLevel !== undefined && typeof body.textLevel !== 'number') throw new AppError(400, 'textLevel לא תקין')

    const result = await applyTeacherLevels({
      studentId, classId: classIds[0] ?? null, subjectId, actorId: viewer.userId,
      textLevel: body.textLevel, perPuzzleLevel: body.perPuzzleLevel, unlock: body.unlock === true,
    })
    void logAccess(viewer, { studentId, scope: 'profile_patch', endpoint: 'PATCH /api/analytics/student/:id/profile' })
    res.json({ ok: true, locked: result.locked })
  } catch (err) {
    next(err)
  }
})

/* ════════════════════════════════════════════════════════════════════════
   עמוד "התקדמות" — סדרת-זמן של progress_snapshots (גרף קווי רב-סדרתי)
   סקופ (הרשאה A, נאכף ב-JS עקבי לשאר המערכת): מחנך → כיתות-החינוך שלו בלבד;
   admin → בית ספרו; super_admin → הכול; מורה מקצועי → ריק (אין גישה חוצת-מקצוע).
   ════════════════════════════════════════════════════════════════════════ */

/* דליי הזמן עברו ל-lib/trendBuckets.ts (year/term/month/custom) — משותף גם לדמו */

/* כיתות הזמינות לגרף ההתקדמות: super→הכול, admin→בית ספרו (כיתות בלבד, ללא תלמידים),
   מורה→כיתות-החינוך שלו. מורה מקצועי (בלי כיתת-חינוך) לא רואה התקדמות חוצת-מקצוע. */
async function snapshotClasses(req: Request): Promise<{ id: string; gradeLabel: string }[]> {
  const s = req.staff!
  if (s.role === 'super_admin' || isAdmin(req)) return accessibleClasses(req)
  const hr = await homeroomClassIds(req)
  return (await accessibleClasses(req)).filter((c) => hr.has(c.id))
}

/* ── GET /api/analytics/trends?metric=&entities=&range= — סדרות לגרף ההתקדמות ── */
analyticsRouter.get('/trends', async (req, res, next) => {
  try {
    const metric = (req.query.metric as string) || 'text_level'
    const range = (req.query.range as string) || 'year'
    const entities = ((req.query.entities as string) || '').split(',').map((x) => x.trim()).filter(Boolean)
    /* מדדים: רמת קריאה / הצלחה כוללת / רמה פר-סוג-אתגר (puzzle:<type> — מ-per_puzzle_level שבסנפשוטים) */
    const puzzleMetric = metric.startsWith('puzzle:') ? metric.slice(7) : null
    if (!['text_level', 'overall_success'].includes(metric) && !puzzleMetric) throw new AppError(400, 'metric לא נתמך')

    const buckets = buildTrendBuckets(range, req.query.from as string | undefined, req.query.to as string | undefined)
    const labels = buckets.map((b) => b.label)
    /* מצב הדגמה — סדרות מנתוני הדמו על דליים מתגלגלים (ראו demoAnalytics) */
    if (isDemoGuest(req)) {
      res.json(demoTrends(range, metric, entities, new Date(), req.query.from as string | undefined, req.query.to as string | undefined))
      return
    }
    /* עמיד לפני המיגרציה — אין טבלה → גרף ריק עם דגל notReady */
    if (!(await hasProgressSnapshots())) { res.json({ labels, series: [], notReady: true }); return }

    const viewer = await loadViewer(req)
    const aggOnly = isAggregateOnly(viewer)
    const exSyn = await excludeSynthetic(req)
    const classes = await snapshotClasses(req)
    const classMap = new Map(classes.map((c) => [c.id, c.gradeLabel]))
    const studentsByClass = new Map<string, { id: string; name: string }[]>()
    for (const c of classes) studentsByClass.set(c.id, await activeStudents(c.id))
    const studentName = new Map<string, string>()
    for (const arr of studentsByClass.values()) for (const st of arr) studentName.set(st.id, st.name)

    type Ent = { id: string; name: string; kind: 'student' | 'class'; studentIds: string[] }
    const ents: Ent[] = []
    for (const id of entities) {
      if (classMap.has(id)) {
        const ids = (studentsByClass.get(id) ?? []).map((s) => s.id)
        /* מנהלים: קו כיתתי רק מעל סף המינימום */
        if (aggOnly && belowMinCell(ids.length)) continue
        ents.push({ id, name: 'כיתה ' + classMap.get(id), kind: 'class', studentIds: ids })
      } else if (studentName.has(id) && !aggOnly) {
        ents.push({ id, name: studentName.get(id)!, kind: 'student', studentIds: [id] })
      }
      /* אחרת — מחוץ לסקופ של המשתמש (או תלמיד בודד למנהל) → מדלגים בשקט */
    }
    /* ברירת מחדל: מנהל → שתי הכיתות הראשונות (מעל הסף); מורה → שני התלמידים הראשונים */
    if (ents.length === 0) {
      if (aggOnly) {
        for (const c of classes) {
          const ids = (studentsByClass.get(c.id) ?? []).map((s) => s.id)
          if (belowMinCell(ids.length)) continue
          ents.push({ id: c.id, name: 'כיתה ' + c.gradeLabel, kind: 'class', studentIds: ids })
          if (ents.length >= 2) break
        }
      } else {
        for (const [id, name] of [...studentName.entries()].slice(0, 2)) ents.push({ id, name, kind: 'student', studentIds: [id] })
      }
    }

    const needIds = [...new Set(ents.flatMap((e) => e.studentIds))]
    if (needIds.length === 0) { res.json({ labels, series: [], aggregateOnly: aggOnly }); return }

    const start = buckets[0].start.toISOString()
    const end = buckets[buckets.length - 1].end.toISOString()
    /* רמות פר-סוג חיות ב-per_puzzle_level (jsonb) — נשלף רק כשהמדד דורש */
    const snapCols = 'student_id, taken_at, text_level, overall_success' + (puzzleMetric ? ', per_puzzle_level' : '')
    let snapQ = supabaseAdmin
      .from('progress_snapshots')
      .select(snapCols)
      .in('student_id', needIds)
      .gte('taken_at', start).lt('taken_at', end)
    if (exSyn) snapQ = snapQ.eq('is_synthetic', false)
    const { data: snaps } = await snapQ.order('taken_at', { ascending: true })

    /* student → אינדקס-דלי → הערך האחרון בדלי (ordered asc → last wins).
       השיוך לפי טווח [start,end) של הדלי — עובד לדלי חודשי ושבועי כאחד. */
    const byStudent = new Map<string, Map<number, number>>()
    for (const r of (snaps ?? []) as unknown as { student_id: string; taken_at: string; text_level: number | null; overall_success: number | null; per_puzzle_level?: Record<string, number> | null }[]) {
      const v = puzzleMetric
        ? r.per_puzzle_level?.[puzzleMetric] ?? null
        : metric === 'text_level' ? r.text_level : r.overall_success
      if (v == null) continue
      const bi = bucketIndexOf(buckets, new Date(r.taken_at))
      if (bi < 0) continue
      let m = byStudent.get(r.student_id); if (!m) { m = new Map(); byStudent.set(r.student_id, m) }
      m.set(bi, Number(v))
    }

    const series = ents.map((e) => ({
      id: e.id, name: e.name, kind: e.kind,
      points: buckets.map((_b, bi) => {
        const vals = e.studentIds.map((sid) => byStudent.get(sid)?.get(bi)).filter((v): v is number => v != null)
        if (vals.length === 0) return null
        return Math.round((vals.reduce((a, c) => a + c, 0) / vals.length) * 100) / 100
      }),
    }))
    res.json({ labels, series, aggregateOnly: aggOnly })
  } catch (err) {
    next(err)
  }
})

/* ── GET /api/analytics/challenge-types?subject= — ביצועי הכיתות לפי סוג אתגר ──
   אגרגציה מה-events המסוכמים (puzzle_solved/failed, payload.puzzleType+difficulty)
   על פני כל ההדמיות הנגישות, עם סינון אופציונלי לפי מקצוע ההדמיה. סקופ כמו עדשת
   התלמידים: admin/מחנך → הכול; מורה מקצועי → sessions על הדמיות שיצר בלבד. */
analyticsRouter.get('/challenge-types', async (req, res, next) => {
  try {
    const subject = ((req.query.subject as string) || '').trim()
    if (isDemoGuest(req)) { res.json(demoChallengeTypes(subject)); return }

    const viewer = await loadViewer(req)
    const aggOnly = isAggregateOnly(viewer)
    const exSyn = await excludeSynthetic(req)
    const classes = await accessibleClasses(req)
    if (!classes.length) { res.json({ types: [], subjects: [] }); return }
    const studentClassIds = new Map<string, string[]>()
    for (const c of classes) {
      for (const st of await activeStudents(c.id)) {
        const arr = studentClassIds.get(st.id) ?? []
        arr.push(c.id)
        studentClassIds.set(st.id, arr)
      }
    }
    const uniqIds = [...studentClassIds.keys()]
    if (!uniqIds.length) { res.json({ types: [], subjects: [] }); return }

    let sessQ = supabaseAdmin
      .from('sessions')
      .select('id, user_id, quest_id, started_at')
      .in('user_id', uniqIds)
      .not('completed_at', 'is', null)
    if (exSyn) sessQ = sessQ.eq('is_synthetic', false)
    const { data: sessRows } = await sessQ.order('started_at', { ascending: false }).limit(600)
    let sessions = (sessRows ?? []) as { id: string; user_id: string; quest_id: string }[]
    const qmeta = await questMeta(sessions.map((x) => x.quest_id))
    /* מורה: רק sessions על הדמיות שבטווח שלו (מקצוע/יוצר/כיתת-חינוך) */
    if (!aggOnly && viewer.role !== 'super_admin') {
      sessions = sessions.filter((x) => {
        const m = qmeta.get(x.quest_id)
        return questVisible(studentScope(viewer, studentClassIds.get(x.user_id) ?? []), { subject_id: m?.subject_id ?? null, created_by: m?.created_by ?? null }, viewer.userId)
      })
    }

    /* מקצוע פר-הדמיה — לרשימת הסינון ולסינון עצמו (לפי subject_id → שם) */
    const subjByQuest = new Map<string, string | null>()
    for (const q of sessions) subjByQuest.set(q.quest_id, qmeta.get(q.quest_id)?.subject ?? null)
    const subjects = [...new Set([...subjByQuest.values()].filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'he'))
    if (subject) sessions = sessions.filter((s) => subjByQuest.get(s.quest_id) === subject)

    const stats = new Map<string, { solved: number; failed: number; diffSum: number; diffN: number }>()
    const sessIds = sessions.map((s) => s.id)
    for (let i = 0; i < sessIds.length; i += 200) {
      const { data: evs } = await supabaseAdmin
        .from('events')
        .select('type, payload')
        .in('session_id', sessIds.slice(i, i + 200))
        .in('type', ['puzzle_solved', 'puzzle_failed'])
      for (const e of (evs ?? []) as { type: string; payload: { puzzleType?: string; difficulty?: number | null } | null }[]) {
        const t = e.payload?.puzzleType ?? 'multipleChoice'
        let s0 = stats.get(t)
        if (!s0) { s0 = { solved: 0, failed: 0, diffSum: 0, diffN: 0 }; stats.set(t, s0) }
        if (e.type === 'puzzle_solved') s0.solved++; else s0.failed++
        if (typeof e.payload?.difficulty === 'number') { s0.diffSum += e.payload.difficulty; s0.diffN++ }
      }
    }
    /* מנהלים: מתחת לסף תלמידים בתא — לא מציגים */
    if (aggOnly && belowMinCell(new Set(sessions.map((x) => x.user_id)).size)) {
      res.json({ types: [], subjects, insufficientData: true, minCellSize: MIN_CELL_SIZE, aggregateOnly: true })
      return
    }
    const types = [...stats.entries()]
      .map(([type, s0]) => {
        const attempts = s0.solved + s0.failed
        return { type, attempts, solved: s0.solved, failed: s0.failed, successRate: attempts ? Math.round((s0.solved / attempts) * 100) / 100 : null, avgDifficulty: s0.diffN ? Math.round((s0.diffSum / s0.diffN) * 10) / 10 : null }
      })
      .sort((a, b) => (a.successRate ?? 2) - (b.successRate ?? 2))
    res.json({ types, subjects, aggregateOnly: aggOnly })
  } catch (err) {
    next(err)
  }
})

/* ════════════════════════════════════════════════════════════════════════
   סיכום פדגוגי (נתיב ישן) — הופרש.
   הסיכום של ד"ר הולו עבר למסך התלמיד/ה והכיתה באנליטיקה (/api/ai-summary: שומר פלט דטרמיניסטי, תקרה יומית, cache ועריכה אישיים לצופה, יומן גישה).
   הנתיב הישן עקף את כל אלה (פלט ה-LLM הוחזר כמות שהוא), ולכן POST ו-PATCH מחזירים 410 עם הודעה בעברית פשוטה, ו-GET מחזיר "אין סיכום".
   אורח: POST מחזיר את סיכום ההדגמה הקבוע כמו קודם (בלי LLM ובלי שמירה). אין עוד צרכן ב-client (PedagogicalSummary הוסר).
   ════════════════════════════════════════════════════════════════════════ */

/* GET — אין סיכום שמור בנתיב הזה יותר */
analyticsRouter.get('/summary', (_req, res) => {
  res.json({ summary: null })
})

/* POST — אורח: סיכום הדגמה קבוע; כל השאר 410 */
analyticsRouter.post('/summary', (req, res, next) => {
  try {
    const { scope, id } = (req.body ?? {}) as { scope?: string; id?: string }
    if (isDemoGuest(req) && (scope === 'student' || scope === 'class' || scope === 'assignment') && typeof id === 'string' && id) {
      res.json(demoSummary(scope, id, new Date()))
      return
    }
    throw new AppError(410, ERR_LEGACY_SUMMARY_MOVED)
  } catch (err) {
    next(err)
  }
})

/* PATCH — עריכה בנתיב הישן אינה נתמכת (העריכה היא ב-/api/ai-summary/:id) */
analyticsRouter.patch('/summary', (_req, _res, next) => {
  next(new AppError(410, ERR_LEGACY_SUMMARY_MOVED))
})

/* ── GET /api/analytics/review-suggestions — "ד"ר הולו מציע" (spaced retrieval, שלב ב׳) ──
   מטלות בחלון ההיזכרות (5-30 יום, ?minDays= לבדיקות) של הדמיות בבעלות המורה, שעדיין
   אין להן הדמיית-חזרה ושיש בהן מושגים חלשים → הצעה ליצירת חזרה. מחושב רק כשהמורה
   פותח את האנליטיקה (אין cron), מוגבל ל-3 הצעות ול-10 מועמדות לבדיקת חולשות. */
analyticsRouter.get('/review-suggestions', async (req, res, next) => {
  try {
    const minDays = req.query.minDays !== undefined ? Math.max(0, Number(req.query.minDays) || 0) : 5
    const maxDays = 30
    const now = Date.now()
    /* מצב הדגמה — בלי הצעות חזרה (יצירת הדמיית-חזרה היא פעולת כתיבה, והדמו לקריאה בלבד) */
    if (isDemoGuest(req)) { res.json({ suggestions: [] }); return }
    if (isAggregateOnly(await loadViewer(req))) { res.json({ suggestions: [] }); return }
    const classes = await accessibleClasses(req)
    if (classes.length === 0) { res.json({ suggestions: [] }); return }
    const classNames = new Map(classes.map((c) => [c.id, c.gradeLabel]))

    const { data: asgs } = await supabaseAdmin
      .from('assignments')
      .select('id, quest_id, class_id, created_at, quests(title, game_data, created_by)')
      .in('class_id', classes.map((c) => c.id))
      .gte('created_at', new Date(now - maxDays * 86_400_000).toISOString())
      .lte('created_at', new Date(now - minDays * 86_400_000).toISOString())
      .order('created_at', { ascending: false })

    type AsgRow = { id: string; quest_id: string; class_id: string; created_at: string; quests: { title?: string; game_data?: unknown; created_by?: string | null } | { title?: string; game_data?: unknown; created_by?: string | null }[] | null }
    const rows = ((asgs ?? []) as unknown as AsgRow[])
      .map((a) => ({ ...a, quest: Array.isArray(a.quests) ? a.quests[0] : a.quests }))
      /* רק הדמיות בבעלות המורה (יצירת חזרה דורשת בעלות) — מנהל רואה הכול */
      .filter((a) => a.quest?.game_data && (req.staff!.role !== 'teacher' || a.quest?.created_by === req.staff!.userId))
      /* לא מציעים חזרה להדמיה שהיא עצמה חזרה */
      .filter((a) => !(a.quest!.game_data as { reviewOf?: unknown }).reviewOf)
      .slice(0, 10)
    if (rows.length === 0) { res.json({ suggestions: [] }); return }

    /* מטלות שכבר יש להן הדמיית-חזרה — שאילתה אחת על jsonb path */
    const { data: reviews } = await supabaseAdmin
      .from('quests')
      .select('reviewAsg:game_data->reviewOf->>assignmentId')
      .not('game_data->reviewOf', 'is', null)
    const reviewedAsgIds = new Set(((reviews ?? []) as { reviewAsg: string | null }[]).map((r) => r.reviewAsg).filter(Boolean))

    const suggestions: { assignmentId: string; questId: string; title: string; className: string; weakCount: number }[] = []
    for (const a of rows) {
      if (suggestions.length >= 3) break
      if (reviewedAsgIds.has(a.id)) continue
      const concepts = await computeWeakConcepts(a.quest_id, a.class_id, a.quest!.game_data)
      if (concepts.length === 0) continue
      suggestions.push({
        assignmentId: a.id,
        questId: a.quest_id,
        title: a.quest!.title ?? '',
        className: classNames.get(a.class_id) ?? '',
        weakCount: concepts.length,
      })
    }
    res.json({ suggestions })
  } catch (err) {
    next(err)
  }
})
