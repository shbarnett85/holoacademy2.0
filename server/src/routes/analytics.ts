import { Router } from 'express'
import type { Request } from 'express'
import { supabaseAdmin } from '../lib/supabase.js'
import { AppError } from '../middleware/errors.js'
import { requireStaff } from '../middleware/staffAuth.js'
import { hasClassTeachers, hasIsActive, hasGradeLabel, hasQuestSubject, hasDifficultyProfileV2, hasHomeroom, hasPedagogicalSummaries, hasProgressSnapshots, hasRollingTallies } from '../lib/activeColumn.js'
import { claude } from '../lib/claude.js'

/* כל המסלולים דורשים צוות; הגישה מסוננת להרשאות (מורה → כיתותיו, מנהל → בית ספרו). */
export const analyticsRouter = Router()
analyticsRouter.use(requireStaff)

function isAdmin(req: Request): boolean {
  return req.staff?.role === 'admin' || req.staff?.role === 'super_admin'
}

/* ── סף-דגלים (thresholds) — מקור אמת יחיד לחישוב הדגלים ── */
const EXCEL_RATE = 0.85       /* ⭐ הצטיין */
const STRUGGLE_RATE = 0.6     /* 🔴 מתקשה (אחוז הצלחה נמוך) */
const SKIP_AVG_SCENE_MS = 5000 /* ⚡ חשד לדילוג — מהיר מדי לכל סצנה */
const SLOW_AVG_SCENE_MS = 90000 /* איטי מאוד לכל סצנה (התקשות בזמן) */

/* גישת הצוות לכיתה: super_admin → תמיד; admin → בית ספרו; מורה → קישור class_teachers (או teacher_id). */
async function assertClassAccess(req: Request, classId: string): Promise<{ id: string; school_id: string | null }> {
  const { data, error } = await supabaseAdmin.from('classes').select('id, school_id, teacher_id').eq('id', classId).single()
  if (error || !data) throw new AppError(404, 'כיתה לא נמצאה')
  const cls = data as { id: string; school_id: string | null; teacher_id?: string | null }
  const s = req.staff!
  if (s.role === 'super_admin') return cls
  if (isAdmin(req)) {
    if (cls.school_id !== s.schoolId) throw new AppError(403, 'הכיתה אינה בבית ספרך')
    return cls
  }
  /* מורה — dual-path */
  if (await hasClassTeachers()) {
    const { data: link } = await supabaseAdmin.from('class_teachers').select('class_id').eq('class_id', classId).eq('teacher_id', s.userId).limit(1)
    if (link && link.length > 0) return cls
  } else if (cls.teacher_id === s.userId) {
    return cls
  }
  throw new AppError(403, 'אין לך גישה לכיתה זו')
}

/* תלמידים פעילים בכיתה */
async function activeStudents(classId: string): Promise<{ id: string; name: string }[]> {
  const withActive = await hasIsActive('users')
  const { data: members } = await supabaseAdmin
    .from('class_members')
    .select(withActive ? 'users(id, name, role, is_active)' : 'users(id, name, role)')
    .eq('class_id', classId)
  return (members ?? [])
    .map((m) => (Array.isArray(m.users) ? m.users[0] : m.users))
    .filter(Boolean)
    .filter((u: { role: string; is_active?: boolean }) => u.role === 'student' && u.is_active !== false)
    .map((u: { id: string; name: string }) => ({ id: u.id, name: u.name }))
}

interface SessionRow {
  id: string; user_id: string; quest_id: string
  started_at: string | null; completed_at: string | null
  total_score: number | null; max_score: number | null
}

/* ה-session האחרון לכל תלמיד עבור הדמיה מסוימת (לפי quest_id — זרימת המשחק אינה נושאת assignment_id) */
async function latestSessionsByStudent(questId: string, studentIds: string[]): Promise<Map<string, SessionRow>> {
  const map = new Map<string, SessionRow>()
  if (studentIds.length === 0) return map
  const { data } = await supabaseAdmin
    .from('sessions')
    .select('id, user_id, quest_id, started_at, completed_at, total_score, max_score')
    .eq('quest_id', questId)
    .in('user_id', studentIds)
    .order('started_at', { ascending: false })
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

/* ── GET /api/analytics/assignment/:assignmentId — המסך הראשי ── */
analyticsRouter.get('/assignment/:assignmentId', async (req, res, next) => {
  try {
    const { data: asg, error } = await supabaseAdmin
      .from('assignments')
      .select('id, quest_id, class_id, due_date')
      .eq('id', req.params.assignmentId)
      .single()
    if (error || !asg) throw new AppError(404, 'מטלה לא נמצאה')
    await assertClassAccess(req, asg.class_id)

    const [{ data: questRow }, { data: clsRow }, students] = await Promise.all([
      supabaseAdmin.from('quests').select('title, game_data').eq('id', asg.quest_id).single(),
      supabaseAdmin.from('classes').select('*').eq('id', asg.class_id).single(),
      activeStudents(asg.class_id),
    ])
    const challenges = questChallenges(questRow?.game_data)
    const studentIds = students.map((s) => s.id)
    const sessions = await latestSessionsByStudent(asg.quest_id, studentIds)
    const sessionIds = [...sessions.values()].map((s) => s.id)
    const [summaries, chStats] = await Promise.all([completedSummaries(sessionIds), challengeStats(sessionIds)])

    /* פירוק לפי תלמיד */
    const perStudent = students.map((stu) => {
      const sess = sessions.get(stu.id)
      if (!sess) return { studentId: stu.id, name: stu.name, status: 'not_started' as const, successRate: null, crystals: null, durationMs: null, avgSceneMs: null, flags: [] as string[] }
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
      return { studentId: stu.id, name: stu.name, status, successRate, crystals, durationMs, avgSceneMs, flags }
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

    /* תובנות מנוסחות כפעולה למורה */
    const insights: string[] = []
    const hardest = perChallenge.find((c) => c.successRate !== null && c.successRate < STRUGGLE_RATE && c.attempts >= 2)
    if (hardest) {
      const strugglers = hardest.failed
      insights.push(`${strugglers} תלמידים התקשו באתגר "${hardest.title}" (${Math.round((hardest.successRate ?? 0) * 100)}% הצלחה) — שווה לחזור עליו בכיתה.`)
    }
    const strugglingStudents = perStudent.filter((s) => s.flags.includes('struggling')).length
    if (strugglingStudents > 0) insights.push(`${strugglingStudents} תלמידים מתקשים בהדמיה — כדאי לבדוק איתם אישית.`)
    const skips = perStudent.filter((s) => s.flags.includes('skip_suspect')).length
    if (skips > 0) insights.push(`${skips} תלמידים סיימו מהר מאוד עם הצלחה נמוכה — ייתכן שדילגו על התוכן.`)
    if (notStarted.length > 0) insights.push(`${notStarted.length} תלמידים עוד לא התחילו את ההדמיה.`)
    if (avgSuccessRate !== null && avgSuccessRate >= EXCEL_RATE) insights.push('הכיתה שלטה בחומר — אחוז הצלחה ממוצע מצוין! 🎉')

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
        avgSuccessRate,
        avgCompletionMs,
        flaggedCount,
      },
      distribution,
      perChallenge,
      students: perStudent,
      insights,
    })
  } catch (err) {
    next(err)
  }
})

/* ── GET /api/analytics/class/:classId/assignments — רשימת מטלות + סיכום-על ── */
analyticsRouter.get('/class/:classId/assignments', async (req, res, next) => {
  try {
    await assertClassAccess(req, req.params.classId)
    const { data: asgs, error } = await supabaseAdmin
      .from('assignments')
      .select('id, quest_id, due_date, created_at, quests(title)')
      .eq('class_id', req.params.classId)
      .order('created_at', { ascending: false })
    if (error) throw new AppError(500, 'שגיאה בשליפת מטלות: ' + error.message)

    const students = await activeStudents(req.params.classId)
    const studentIds = students.map((s) => s.id)
    const questIds = [...new Set((asgs ?? []).map((a) => a.quest_id))]

    /* כל ה-sessions של תלמידי הכיתה על ההדמיות המוקצות — שאילתה אחת, אגרגציה ב-JS */
    const byQuest = new Map<string, SessionRow[]>()
    if (questIds.length && studentIds.length) {
      const { data } = await supabaseAdmin
        .from('sessions')
        .select('id, user_id, quest_id, started_at, completed_at, total_score, max_score')
        .in('quest_id', questIds)
        .in('user_id', studentIds)
        .order('started_at', { ascending: false })
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
        avgSuccessRate: rates.length ? rates.reduce((x, y) => x + y, 0) / rates.length : null,
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
    let ids: string[]
    if (await hasClassTeachers()) {
      const { data } = await supabaseAdmin.from('class_teachers').select('class_id').eq('teacher_id', s.userId)
      ids = (data ?? []).map((l) => l.class_id)
    } else {
      const { data } = await supabaseAdmin.from('classes').select('id').eq('teacher_id', s.userId)
      ids = (data ?? []).map((c) => c.id)
    }
    if (ids.length === 0) return []
    const { data } = await supabaseAdmin.from('classes').select('*').in('id', ids)
    rows = (data ?? []) as Record<string, unknown>[]
  }
  return rows.map((c) => ({ id: c.id as string, gradeLabel: ((withGrade ? (c.grade_label as string) : null) ?? (c.name as string)) || '' }))
}

/* כיתות שהמורה הוא *מחנך* שלהן (is_homeroom=true). מושג של מורה בלבד —
   admin/super_admin ניגשים לפי בית ספר ולא צריכים את ההבחנה. עמיד לפני המיגרציה (ריק). */
async function homeroomClassIds(req: Request): Promise<Set<string>> {
  const s = req.staff!
  if (s.role !== 'teacher') return new Set()
  if (!(await hasHomeroom())) return new Set()
  const { data } = await supabaseAdmin.from('class_teachers').select('class_id').eq('teacher_id', s.userId).eq('is_homeroom', true)
  return new Set((data ?? []).map((r) => r.class_id as string))
}

/* ── GET /api/analytics/assignments — כל המטלות בכל הכיתות הנגישות (לרשימה המלאה + סינון) ── */
analyticsRouter.get('/assignments', async (req, res, next) => {
  try {
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

    /* מטא להדמיות: יוצר (לשיוך בעלות) + מקצוע. נשלף בשאילתה אחת. */
    const withSubject = await hasQuestSubject()
    const subjectByQuest = new Map<string, string>()
    const authorByQuest = new Map<string, string | null>()
    if (questIds.length) {
      const cols = 'id, created_by' + (withSubject ? ', subject' : '')
      const { data } = await supabaseAdmin.from('quests').select(cols).in('id', questIds)
      for (const q of (data ?? []) as unknown as { id: string; created_by: string | null; subject?: string | null }[]) {
        authorByQuest.set(q.id, q.created_by ?? null)
        if (q.subject) subjectByQuest.set(q.id, q.subject)
      }
    }
    /* שמות היוצרים — לתווית הבידול אצל מחנך ("כיתתי · <מקצוע> · <מורה>") */
    const authorIds = [...new Set([...authorByQuest.values()].filter((x): x is string => !!x))]
    const authorName = new Map<string, string>()
    if (authorIds.length) {
      const { data } = await supabaseAdmin.from('users').select('id, name').in('id', authorIds)
      for (const u of (data ?? []) as { id: string; name: string }[]) authorName.set(u.id, u.name)
    }

    /* סקופ: מורה מקצועי → ההקצאות שלו בלבד (quest.created_by === הוא);
       מחנך → בנוסף הקצאות מורים אחרים שהוקצו לכיתת-החינוך שלו (הרשאה B). admin/super → הכול. */
    const homeroomSet = await homeroomClassIds(req)
    const myId = req.staff!.userId

    /* sessions לכל ההדמיות + התלמידים — שאילתה אחת */
    const sessions: SessionRow[] = []
    if (questIds.length && allStudentIds.length) {
      const { data } = await supabaseAdmin
        .from('sessions')
        .select('id, user_id, quest_id, started_at, completed_at, total_score, max_score')
        .in('quest_id', questIds)
        .in('user_id', allStudentIds)
        .order('started_at', { ascending: false })
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
        avgSuccessRate: rates.length ? rates.reduce((x, y) => x + y, 0) / rates.length : null,
        own, homeroom, teacherName: homeroom && author ? (authorName.get(author) ?? null) : null,
      }
    }).filter((a) => a.own || a.homeroom) /* מורה מקצועי: רק שלו; מחנך: + של כיתתו; admin: הכול (own=true) */
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
    const s = req.staff!
    const adminLike = isAdmin(req)
    const classes = await accessibleClasses(req)
    if (classes.length === 0) { res.json({ students: [], canCompare: false }); return }
    const homeroomSet = await homeroomClassIds(req)

    /* הדמיות שהמורה יצר — לסקופ "ביצועים מההקצאות שלו" (מורה מקצועי) */
    let ownQuestIds = new Set<string>()
    if (!adminLike) {
      const { data } = await supabaseAdmin.from('quests').select('id').eq('created_by', s.userId)
      ownQuestIds = new Set((data ?? []).map((q) => q.id as string))
    }

    /* תלמיד → כיתה מייצגת (מעדיף כיתת-חינוך אם התלמיד בכמה כיתות נגישות) */
    const studentClass = new Map<string, { name: string; classId: string; gradeLabel: string }>()
    for (const c of classes) {
      for (const st of await activeStudents(c.id)) {
        const cur = studentClass.get(st.id)
        const isHome = homeroomSet.has(c.id)
        if (!cur || (isHome && !homeroomSet.has(cur.classId))) studentClass.set(st.id, { name: st.name, classId: c.id, gradeLabel: c.gradeLabel })
      }
    }
    const studentIds = [...studentClass.keys()]
    if (studentIds.length === 0) { res.json({ students: [], canCompare: false }); return }

    /* תמונה מלאה לתלמיד = admin/super, או שהתלמיד בכיתת-חינוך של המורה */
    const isFull = (classId: string) => adminLike || homeroomSet.has(classId)

    const { data: sessRows } = await supabaseAdmin
      .from('sessions')
      .select('id, user_id, quest_id, started_at, completed_at, total_score, max_score')
      .in('user_id', studentIds)
      .order('started_at', { ascending: false })
    const sessions = (sessRows ?? []) as SessionRow[]

    /* פרופיל קושי (חוצה-מקצוע) — מוצג רק בתמונה מלאה */
    const v2 = await hasDifficultyProfileV2()
    const profCols = v2 ? 'user_id, text_level, sessions_count' : 'user_id, writing_level, sessions_count'
    const { data: profRows } = await supabaseAdmin.from('difficulty_profiles').select(profCols).in('user_id', studentIds)
    const profByUser = new Map<string, { text_level?: number | null; writing_level?: number | null }>()
    for (const p of (profRows ?? []) as { user_id: string }[]) profByUser.set(p.user_id, p as never)

    const students = studentIds.map((sid) => {
      const meta = studentClass.get(sid)!
      const full = isFull(meta.classId)
      const mySess = sessions.filter((se) => se.user_id === sid && (full || ownQuestIds.has(se.quest_id)))
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
        studentId: sid, name: meta.name, className: meta.gradeLabel, crossSubject: full,
        textLevel, sessionsCount: completed.length, avgSuccessRate,
        lastActive: mySess[0]?.started_at ?? null, flags,
      }
    }).sort((a, b) => a.name.localeCompare(b.name, 'he'))

    /* גרף ההשוואה (מבלוק מודל ההשוואה) זמין רק בתמונה מלאה — מחנך/מנהל */
    res.json({ students, canCompare: adminLike || homeroomSet.size > 0 })
  } catch (err) {
    next(err)
  }
})

/* ── GET /api/analytics/student/:studentId — drill-down תלמיד ── */
analyticsRouter.get('/student/:studentId', async (req, res, next) => {
  try {
    /* ודא שהתלמיד באחת מכיתות הצוות */
    const { data: memberships } = await supabaseAdmin.from('class_members').select('class_id').eq('user_id', req.params.studentId)
    const classIds = (memberships ?? []).map((m) => m.class_id)
    let allowed = req.staff!.role === 'super_admin'
    if (!allowed) {
      for (const cid of classIds) {
        try { await assertClassAccess(req, cid); allowed = true; break } catch { /* נסה את הבא */ }
      }
    }
    if (!allowed) throw new AppError(403, 'אין לך גישה לתלמיד זה')

    const { data: stu } = await supabaseAdmin.from('users').select('id, name').eq('id', req.params.studentId).single()

    /* פרופיל הקושי — המבנה החדש (per-type) אם המיגרציה רצה, אחרת המבנה הישן */
    const v2 = await hasDifficultyProfileV2()
    const withRolling = v2 && (await hasRollingTallies())
    const profileCols = v2
      ? ['text_level', 'per_puzzle_level', 'last_success_rates', 'last_avg_scene_ms', 'sessions_count', 'last_updated',
          ...(withRolling ? ['rolling_tallies'] : []),
        ].join(', ')
      : 'writing_level, puzzle_difficulty, avg_success_rate, avg_time_per_scene, sessions_count, last_updated'
    const { data: profile } = await supabaseAdmin
      .from('difficulty_profiles')
      .select(profileCols)
      .eq('user_id', req.params.studentId)
      .maybeSingle()

    /* דגל "דילוג" — מה-session_completed האחרון */
    const { data: lastCompleted } = await supabaseAdmin
      .from('events')
      .select('payload, created_at')
      .eq('user_id', req.params.studentId)
      .eq('type', 'session_completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const skipping = Boolean((lastCompleted?.payload as { skipping?: boolean } | null)?.skipping)

    const { data: sessions } = await supabaseAdmin
      .from('sessions')
      .select('id, quest_id, started_at, completed_at, total_score, max_score, quests(title)')
      .eq('user_id', req.params.studentId)
      .order('started_at', { ascending: false })
      .limit(50)

    const history = (sessions ?? []).map((s) => {
      const q = Array.isArray(s.quests) ? s.quests[0] : s.quests
      const successRate = s.max_score ? (s.total_score ?? 0) / s.max_score : null
      return {
        sessionId: s.id, questId: s.quest_id, questTitle: (q as { title?: string } | null)?.title ?? '',
        startedAt: s.started_at, completedAt: s.completed_at,
        status: s.completed_at ? 'completed' : 'in_progress', successRate,
      }
    })
    /* מגמה — אחוז הצלחה לאורך משחקים שהושלמו (כרונולוגי) */
    const trend = [...history].filter((h) => h.status === 'completed' && h.successRate !== null)
      .reverse()
      .map((h) => ({ date: h.completedAt, successRate: h.successRate }))

    const profileAny = profile as Record<string, unknown> | null
    res.json({
      student: { id: req.params.studentId, name: (stu as { name?: string } | null)?.name ?? '' },
      profile: profileAny ?? null,
      profileVersion: v2 ? 2 : 1,
      skipping,
      history,
      trend,
    })
  } catch (err) {
    next(err)
  }
})

/* ── PATCH /api/analytics/student/:studentId/profile — עקיפת מורה לפרופיל קושי ── */
analyticsRouter.patch('/student/:studentId/profile', async (req, res, next) => {
  try {
    const { studentId } = req.params
    /* בדיקת גישה בסיסית */
    const { data: memberships } = await supabaseAdmin.from('class_members').select('class_id').eq('user_id', studentId)
    const classIds = (memberships ?? []).map((m: { class_id: string }) => m.class_id)
    let allowed = req.staff!.role === 'super_admin'
    if (!allowed) {
      for (const cid of classIds) {
        try { await assertClassAccess(req, cid); allowed = true; break } catch { /* נסה */ }
      }
    }
    if (!allowed) throw new AppError(403, 'אין לך גישה לתלמיד זה')

    const body = req.body as {
      perPuzzleLevel?: Record<string, number>
      textLevel?: number
    }

    const v2 = await hasDifficultyProfileV2()
    const { data: existing } = await supabaseAdmin
      .from('difficulty_profiles').select('id').eq('user_id', studentId).maybeSingle()
    const existingRow = existing as { id?: string } | null

    const patch: Record<string, unknown> = { last_updated: new Date().toISOString() }
    if (typeof body.textLevel === 'number') patch.text_level = Math.max(1, Math.min(16, Math.round(body.textLevel)))
    if (body.perPuzzleLevel && v2) patch.per_puzzle_level = body.perPuzzleLevel

    if (existingRow?.id) {
      await supabaseAdmin.from('difficulty_profiles').update(patch).eq('id', existingRow.id)
    } else {
      await supabaseAdmin.from('difficulty_profiles').insert({ user_id: studentId, ...patch })
    }
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

/* ════════════════════════════════════════════════════════════════════════
   עמוד "התקדמות" — סדרת-זמן של progress_snapshots (גרף קווי רב-סדרתי)
   סקופ (הרשאה A, נאכף ב-JS עקבי לשאר המערכת): מחנך → כיתות-החינוך שלו בלבד;
   admin → בית ספרו; super_admin → הכול; מורה מקצועי → ריק (אין גישה חוצת-מקצוע).
   ════════════════════════════════════════════════════════════════════════ */

const HE_MONTHS = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳']
const mkey = (y: number, m0: number) => `${y}-${String(m0 + 1).padStart(2, '0')}` /* m0 = 0-indexed */

/* דליי חודשים לפי טווח: שנה = שנת לימודים ספט→יוני; מחצית = 6 חודשים אחרונים */
function monthBuckets(range: string): { key: string; label: string }[] {
  const now = new Date()
  const out: { key: string; label: string }[] = []
  if (range === 'term') {
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      out.push({ key: mkey(d.getFullYear(), d.getMonth()), label: HE_MONTHS[d.getMonth()] })
    }
  } else {
    const startY = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1 /* ספט=8 */
    const seq: [number, number][] = [[startY, 8], [startY, 9], [startY, 10], [startY, 11], [startY + 1, 0], [startY + 1, 1], [startY + 1, 2], [startY + 1, 3], [startY + 1, 4], [startY + 1, 5]]
    for (const [y, m] of seq) out.push({ key: mkey(y, m), label: HE_MONTHS[m] })
  }
  return out
}

/* כיתות הזמינות לגרף ההתקדמות (הרשאה A): super→הכול, admin→בית ספרו, מורה→כיתות-החינוך שלו */
async function snapshotClasses(req: Request): Promise<{ id: string; gradeLabel: string }[]> {
  const s = req.staff!
  if (s.role === 'super_admin' || isAdmin(req)) return accessibleClasses(req)
  const hr = await homeroomClassIds(req)
  if (hr.size > 0) return (await accessibleClasses(req)).filter((c) => hr.has(c.id))
  /* dual-path: לפני מיגרציית class_teachers/is_homeroom אין הבחנת מחנך — נופלים לכיתות
     המורה (classes.teacher_id, דרך accessibleClasses). משתמרת ההפרדה homeroom/מקצועי לאחר המיגרציה. */
  if (!(await hasHomeroom())) return accessibleClasses(req)
  return []
}

/* ── GET /api/analytics/trends?metric=&entities=&range= — סדרות לגרף ההתקדמות ── */
analyticsRouter.get('/trends', async (req, res, next) => {
  try {
    const metric = (req.query.metric as string) || 'text_level'
    const range = (req.query.range as string) || 'year'
    const entities = ((req.query.entities as string) || '').split(',').map((x) => x.trim()).filter(Boolean)
    if (!['text_level', 'overall_success'].includes(metric)) throw new AppError(400, 'metric לא נתמך')

    const buckets = monthBuckets(range)
    const labels = buckets.map((b) => b.label)
    /* עמיד לפני המיגרציה — אין טבלה → גרף ריק עם דגל notReady */
    if (!(await hasProgressSnapshots())) { res.json({ labels, series: [], notReady: true }); return }

    const classes = await snapshotClasses(req)
    const classMap = new Map(classes.map((c) => [c.id, c.gradeLabel]))
    const studentsByClass = new Map<string, { id: string; name: string }[]>()
    for (const c of classes) studentsByClass.set(c.id, await activeStudents(c.id))
    const studentName = new Map<string, string>()
    for (const arr of studentsByClass.values()) for (const st of arr) studentName.set(st.id, st.name)

    type Ent = { id: string; name: string; kind: 'student' | 'class'; studentIds: string[] }
    const ents: Ent[] = []
    for (const id of entities) {
      if (classMap.has(id)) ents.push({ id, name: 'כיתה ' + classMap.get(id), kind: 'class', studentIds: (studentsByClass.get(id) ?? []).map((s) => s.id) })
      else if (studentName.has(id)) ents.push({ id, name: studentName.get(id)!, kind: 'student', studentIds: [id] })
      /* אחרת — מחוץ לסקופ של המשתמש (RLS) → מדלגים בשקט */
    }
    /* happy-path ברירת מחדל — שני התלמידים הראשונים אם לא נבחרו ישויות */
    if (ents.length === 0) {
      for (const [id, name] of [...studentName.entries()].slice(0, 2)) ents.push({ id, name, kind: 'student', studentIds: [id] })
    }

    const needIds = [...new Set(ents.flatMap((e) => e.studentIds))]
    if (needIds.length === 0) { res.json({ labels, series: [] }); return }

    const firstKey = buckets[0].key, lastKey = buckets[buckets.length - 1].key
    const start = new Date(firstKey + '-01T00:00:00Z').toISOString()
    const [ly, lm] = lastKey.split('-').map(Number)
    const end = new Date(Date.UTC(ly, lm, 1)).toISOString() /* תחילת החודש הבא אחרי הדלי האחרון */
    const { data: snaps } = await supabaseAdmin
      .from('progress_snapshots')
      .select('student_id, taken_at, text_level, overall_success')
      .in('student_id', needIds)
      .gte('taken_at', start).lt('taken_at', end)
      .order('taken_at', { ascending: true })

    /* student → bucketKey → הערך האחרון בחודש (ordered asc → last wins) */
    const byStudent = new Map<string, Map<string, number>>()
    for (const r of (snaps ?? []) as { student_id: string; taken_at: string; text_level: number | null; overall_success: number | null }[]) {
      const v = metric === 'text_level' ? r.text_level : r.overall_success
      if (v == null) continue
      const d = new Date(r.taken_at)
      const key = mkey(d.getUTCFullYear(), d.getUTCMonth())
      let m = byStudent.get(r.student_id); if (!m) { m = new Map(); byStudent.set(r.student_id, m) }
      m.set(key, Number(v))
    }

    const series = ents.map((e) => ({
      id: e.id, name: e.name, kind: e.kind,
      points: buckets.map((b) => {
        const vals = e.studentIds.map((sid) => byStudent.get(sid)?.get(b.key)).filter((v): v is number => v != null)
        if (vals.length === 0) return null
        return Math.round((vals.reduce((a, c) => a + c, 0) / vals.length) * 100) / 100
      }),
    }))
    res.json({ labels, series })
  } catch (err) {
    next(err)
  }
})

/* ════════════════════════════════════════════════════════════════════════
   סיכום פדגוגי — "ד"ר הולו כשכבת פרשנות"
   כפתור אחד שמכליל לפי הקשר (תלמיד / כיתה / הקצאה). Sonnet כותב קריאה אנושית
   *מהוסה* (תצפיות, לא אבחנות), על נתוני רמה 1+2 בלבד. נשמר עם timestamp + "צור מחדש".
   ════════════════════════════════════════════════════════════════════════ */

type SummaryScope = 'student' | 'class' | 'assignment'
const pctStr = (r: number | null) => (r === null ? '—' : Math.round(r * 100) + '%')

/* שם הכיתה (gradeLabel) */
async function classLabel(classId: string): Promise<string> {
  const withGrade = await hasGradeLabel()
  const { data } = await supabaseAdmin.from('classes').select('*').eq('id', classId).single()
  const c = (data ?? {}) as { name?: string; grade_label?: string }
  return (withGrade ? c.grade_label : null) ?? c.name ?? ''
}

/* גוזר את נתוני הקלט לסיכום + אוכף RLS (הרשאות A/B). מחזיר label אנושי, JSON מצרפי, ו-N (גודל מדגם). */
async function gatherSummary(req: Request, scope: SummaryScope, entityId: string): Promise<{ label: string; data: Record<string, unknown>; sampleSize: number }> {
  const adminLike = isAdmin(req)
  const homeroomSet = await homeroomClassIds(req)

  if (scope === 'assignment') {
    const { data: asg } = await supabaseAdmin.from('assignments').select('id, quest_id, class_id').eq('id', entityId).single()
    if (!asg) throw new AppError(404, 'מטלה לא נמצאה')
    await assertClassAccess(req, asg.class_id)
    /* מורה מקצועי: רק הקצאה משלו (יוצר ההדמיה) או של כיתת-החינוך שלו */
    if (!adminLike) {
      const { data: q } = await supabaseAdmin.from('quests').select('created_by').eq('id', asg.quest_id).single()
      const own = (q as { created_by?: string } | null)?.created_by === req.staff!.userId
      if (!own && !homeroomSet.has(asg.class_id)) throw new AppError(403, 'אין לך גישה לסכם הקצאה זו')
    }
    const [{ data: questRow }, students] = await Promise.all([
      supabaseAdmin.from('quests').select('title, game_data').eq('id', asg.quest_id).single(),
      activeStudents(asg.class_id),
    ])
    const challenges = questChallenges(questRow?.game_data)
    const studentIds = students.map((s) => s.id)
    const sessions = await latestSessionsByStudent(asg.quest_id, studentIds)
    const sessionIds = [...sessions.values()].map((s) => s.id)
    const [summaries, chStats] = await Promise.all([completedSummaries(sessionIds), challengeStats(sessionIds)])
    let completed = 0, inProgress = 0
    const rates: number[] = []
    for (const stu of students) {
      const sess = sessions.get(stu.id)
      if (!sess) continue
      if (sess.completed_at) {
        completed++
        const sum = summaries.get(sess.id)
        const r = sum?.successRate ?? (sess.max_score ? (sess.total_score ?? 0) / sess.max_score : null)
        if (r !== null && r !== undefined) rates.push(r)
      } else inProgress++
    }
    const avg = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null
    const perChallenge = challenges.map((c) => {
      const st = chStats.get(c.sceneId) ?? { solved: 0, failed: 0 }
      const att = st.solved + st.failed
      return { title: c.title, type: c.type, successRate: att ? st.solved / att : null, attempts: att }
    }).filter((c) => c.attempts > 0).sort((a, b) => (a.successRate ?? 1) - (b.successRate ?? 1))
    return {
      label: `הקצאה: "${questRow?.title ?? ''}" · כיתה ${await classLabel(asg.class_id)}`,
      sampleSize: completed,
      data: {
        סוג: 'סיכום ביצועי כיתה בהדמיה',
        הדמיה: questRow?.title ?? '',
        מספר_תלמידים: students.length,
        השלימו: completed, בתהליך: inProgress, לא_התחילו: students.length - completed - inProgress,
        אחוז_הצלחה_ממוצע: pctStr(avg),
        התפלגות: { 'נמוך(<60%)': rates.filter((r) => r < STRUGGLE_RATE).length, 'בינוני(60-85%)': rates.filter((r) => r >= STRUGGLE_RATE && r < EXCEL_RATE).length, 'גבוה(85%+)': rates.filter((r) => r >= EXCEL_RATE).length },
        אתגרים_קשים: perChallenge.slice(0, 3).map((c) => ({ אתגר: c.title, הצלחה: pctStr(c.successRate) })),
      },
    }
  }

  if (scope === 'class') {
    await assertClassAccess(req, entityId)
    /* סיכום כיתה — למחנך הכיתה ולמנהל בלבד */
    if (!adminLike && !homeroomSet.has(entityId)) throw new AppError(403, 'סיכום כיתה זמין למחנך הכיתה ולמנהל בלבד')
    const students = await activeStudents(entityId)
    const studentIds = students.map((s) => s.id)
    const perStudentRate = new Map<string, number>()
    let completedSessions = 0
    if (studentIds.length) {
      const { data } = await supabaseAdmin
        .from('sessions')
        .select('user_id, quest_id, completed_at, total_score, max_score')
        .in('user_id', studentIds)
        .not('completed_at', 'is', null)
      const byStudent = new Map<string, number[]>()
      for (const s of (data ?? []) as { user_id: string; total_score: number | null; max_score: number | null }[]) {
        const r = s.max_score ? (s.total_score ?? 0) / s.max_score : null
        if (r === null) continue
        completedSessions++
        const arr = byStudent.get(s.user_id) ?? []; arr.push(r); byStudent.set(s.user_id, arr)
      }
      for (const [uid, arr] of byStudent) perStudentRate.set(uid, arr.reduce((a, b) => a + b, 0) / arr.length)
    }
    const rates = [...perStudentRate.values()]
    const avg = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null
    const played = perStudentRate.size
    return {
      label: `כיתה ${await classLabel(entityId)}`,
      sampleSize: completedSessions,
      data: {
        סוג: 'סיכום כיתה (חוצה-מקצוע)',
        מספר_תלמידים: students.length,
        תלמידים_ששיחקו: played,
        תלמידים_שטרם_שיחקו: students.length - played,
        אחוז_הצלחה_ממוצע_כיתתי: pctStr(avg),
        התפלגות_תלמידים: { 'מתקשים(<60%)': rates.filter((r) => r < STRUGGLE_RATE).length, 'בינוני(60-85%)': rates.filter((r) => r >= STRUGGLE_RATE && r < EXCEL_RATE).length, 'מצטיינים(85%+)': rates.filter((r) => r >= EXCEL_RATE).length },
      },
    }
  }

  /* scope === 'student' */
  const { data: memberships } = await supabaseAdmin.from('class_members').select('class_id').eq('user_id', entityId)
  const classIds = (memberships ?? []).map((m) => m.class_id)
  let accessibleClass: string | null = null
  if (req.staff!.role === 'super_admin') accessibleClass = classIds[0] ?? '__'
  else for (const cid of classIds) { try { await assertClassAccess(req, cid); accessibleClass = cid; break } catch { /* הבא */ } }
  if (!accessibleClass) throw new AppError(403, 'אין לך גישה לתלמיד זה')
  const isHomeroomStudent = classIds.some((c) => homeroomSet.has(c))
  const full = adminLike || isHomeroomStudent
  /* מורה מקצועי: רק תלמיד מתוך הקצאותיו (יש לו סשן על הדמיה שהמורה יצר) */
  let ownIds: string[] = []
  if (!full) {
    const { data: ownQ } = await supabaseAdmin.from('quests').select('id').eq('created_by', req.staff!.userId)
    ownIds = (ownQ ?? []).map((q) => q.id as string)
    const { data: sess } = await supabaseAdmin.from('sessions').select('id').eq('user_id', entityId).in('quest_id', ownIds.length ? ownIds : ['__']).limit(1)
    if (!sess || sess.length === 0) throw new AppError(403, 'אין לך גישה לסכם תלמיד זה — הוא אינו בהקצאותיך')
  }

  const { data: stu } = await supabaseAdmin.from('users').select('name').eq('id', entityId).single()
  const v2 = await hasDifficultyProfileV2()
  const { data: profile } = await supabaseAdmin
    .from('difficulty_profiles')
    .select(v2 ? 'text_level, per_puzzle_level, last_avg_scene_ms, sessions_count' : 'writing_level, puzzle_difficulty, avg_success_rate')
    .eq('user_id', entityId)
    .maybeSingle()
  /* סשנים — מורה מקצועי רואה רק על הדמיות שיצר */
  let sq = supabaseAdmin.from('sessions').select('id, quest_id, completed_at, total_score, max_score, started_at').eq('user_id', entityId).order('started_at', { ascending: false }).limit(50)
  if (!full && ownIds.length) sq = sq.in('quest_id', ownIds)
  const { data: sessions } = await sq
  const completed = (sessions ?? []).filter((s) => s.completed_at)
  const rates = completed.map((s) => (s.max_score ? (s.total_score ?? 0) / s.max_score : null)).filter((r): r is number => r !== null)
  const avg = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null
  const trend = [...completed].reverse().map((s) => (s.max_score ? Math.round(((s.total_score ?? 0) / s.max_score) * 100) : null)).filter((x) => x !== null)
  const { data: lastCompleted } = await supabaseAdmin.from('events').select('payload').eq('user_id', entityId).eq('type', 'session_completed').order('created_at', { ascending: false }).limit(1).maybeSingle()
  const skipping = Boolean((lastCompleted?.payload as { skipping?: boolean } | null)?.skipping)
  const p = (profile ?? {}) as Record<string, unknown>
  return {
    label: `תלמיד/ה: ${(stu as { name?: string } | null)?.name ?? ''} · כיתה ${await classLabel(accessibleClass)}`,
    sampleSize: completed.length,
    data: {
      סוג: full ? 'סיכום תלמיד (חוצה-מקצוע)' : 'סיכום תלמיד (מההקצאות שלך בלבד)',
      רמת_טקסט: v2 ? (p.text_level ?? null) : (p.writing_level ?? null),
      רמות_לפי_סוג_אתגר: v2 ? (p.per_puzzle_level ?? null) : null,
      מספר_הדמיות_שהושלמו: completed.length,
      אחוז_הצלחה_ממוצע: pctStr(avg),
      מגמת_הצלחה_אחרונה: trend.slice(0, 6),
      קריאה_מהירה_מאוד_חשד_דילוג: skipping,
    },
  }
}

/* בניית הפרומפט של ד"ר הולו — מהוסה, רמה 1+2 בלבד, ללא שפה אבחנתית */
function buildPedagogicalPrompt(label: string, data: Record<string, unknown>, sampleSize: number): string {
  return `אתה ד"ר הולו — דמות פדגוגית חכמה, חמה ומנוסה. אתה כותב "סיכום פדגוגי" קצר בעברית **עבור המורה**, המבוסס *אך ורק* על הנתונים המצורפים. זהו מסמך על ילד/כיתה אמיתיים — כתוב באחריות.

## כללים מחייבים (אסור לחרוג!)
1. **תצפיות מהוסות — לא אבחנות.** פתח בהקשר הכמותי (למשל "על סמך ${sampleSize} הדמיות שהושלמו…") והשתמש בלשון זהירה: "נראה ש…", "ייתכן ש…", "הנתונים מצביעים על…". אתה מתאר דפוסים בנתונים, לא קובע עובדות על הילד.
2. **אסורה לחלוטין שפה קלינית/אבחנתית.** אל תשתמש במילים כמו "לקות", "הפרעה", "ADHD", "דיסלקציה", "דיכאון", או כל אבחנה. אתה לא מאבחן.
3. **התבסס רק על מדדים כמותיים שמופיעים בנתונים** — רמות קושי, אחוזי הצלחה, מגמות, זמני שהייה. אל תמציא נתונים ואל תייחס רגשות/כוונות שלא נמדדו.
4. **טון מכבד, בונה וממוקד-פעולה**: ציין מה הולך טוב, היכן נראה קושי, והצע 1-2 צעדים מעשיים להמשך. לעולם לא טון מאשים.
5. אם המדגם קטן (מעט הדמיות), ציין במפורש שהתמונה חלקית ויש להתייחס אליה בזהירות.
6. 2-4 פסקאות קצרות. עברית בלבד. **אל תוסיף כותרת** (היא תיווסף ע"י המערכת) ואל תחתום בשם.

## ההקשר
${label}

## הנתונים
${JSON.stringify(data, null, 2)}

כתוב כעת את הסיכום הפדגוגי:`
}

async function callSonnetSummary(prompt: string): Promise<string> {
  const response = await claude.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1200,
    messages: [{ role: 'user', content: prompt }],
  })
  const block = response.content.find((b) => b.type === 'text')
  const text = block && block.type === 'text' ? block.text.trim() : ''
  if (!text) throw new AppError(502, 'תשובה ריקה מ-Claude')
  return text
}

const SUMMARY_MODEL = 'claude-sonnet-4-5'

/* GET /api/analytics/summary?scope=&id= — שליפת סיכום שמור (אם קיים) */
analyticsRouter.get('/summary', async (req, res, next) => {
  try {
    const scope = req.query.scope as SummaryScope
    const id = req.query.id as string
    if (!['student', 'class', 'assignment'].includes(scope) || !id) throw new AppError(400, 'scope/id חסרים')
    /* אכיפת גישה — גם לשליפה בלבד (אל תחזיר סיכום על ישות שאסור לראות) */
    await gatherSummary(req, scope, id)
    if (!(await hasPedagogicalSummaries())) { res.json({ summary: null }); return }
    const { data } = await supabaseAdmin.from('pedagogical_summaries').select('*').eq('scope', scope).eq('entity_id', id).maybeSingle()
    res.json({ summary: data ?? null })
  } catch (err) {
    next(err)
  }
})

/* PATCH /api/analytics/summary — שמירת עריכת המורה (edited_content). המורה הוא השכבה האחרונה
   לפני ייצוא. body: { scope, id, edited_content }. דורש את הטבלה (אחרת אין רשומה לעדכן). */
analyticsRouter.patch('/summary', async (req, res, next) => {
  try {
    const { scope, id, edited_content } = req.body as { scope: SummaryScope; id: string; edited_content: string }
    if (!['student', 'class', 'assignment'].includes(scope) || !id) throw new AppError(400, 'scope/id חסרים')
    if (typeof edited_content !== 'string') throw new AppError(400, 'edited_content חסר')
    /* אכיפת גישה זהה ליצירה */
    await gatherSummary(req, scope, id)
    if (!(await hasPedagogicalSummaries())) throw new AppError(503, 'שמירת עריכה תהיה זמינה לאחר הרצת המיגרציה (טבלת pedagogical_summaries)')
    const { data: saved, error } = await supabaseAdmin
      .from('pedagogical_summaries')
      .update({ edited_content, updated_at: new Date().toISOString() })
      .eq('scope', scope).eq('entity_id', id)
      .select('*')
      .single()
    if (error) throw new AppError(500, 'שגיאה בשמירת העריכה: ' + error.message)
    res.json({ summary: saved })
  } catch (err) {
    next(err)
  }
})

/* POST /api/analytics/summary — יצירה/יצירה-מחדש (Sonnet). body: { scope, id, regenerate? } */
analyticsRouter.post('/summary', async (req, res, next) => {
  try {
    const { scope, id, regenerate } = req.body as { scope: SummaryScope; id: string; regenerate?: boolean }
    if (!['student', 'class', 'assignment'].includes(scope) || !id) throw new AppError(400, 'scope/id חסרים')
    const stored = await hasPedagogicalSummaries()
    /* גוזר נתונים + אוכף RLS לפני כל קריאת AI */
    const { label, data, sampleSize } = await gatherSummary(req, scope, id)

    /* cache — אם קיים ולא ביקשו רענון, החזר בלי לחייב שוב */
    if (stored && !regenerate) {
      const { data: existing } = await supabaseAdmin.from('pedagogical_summaries').select('*').eq('scope', scope).eq('entity_id', id).maybeSingle()
      if (existing) { res.json({ summary: existing, cached: true }); return }
    }

    const content = await callSonnetSummary(buildPedagogicalPrompt(label, data, sampleSize))
    const now = new Date().toISOString()
    const row = { scope, entity_id: id, content, model: SUMMARY_MODEL, sample_size: sampleSize, created_by: req.staff!.userId, created_at: now, updated_at: now }

    if (stored) {
      /* upsert לפי (scope, entity_id) — שמירת edited_content רק אם לא רעננו */
      const { data: saved, error } = await supabaseAdmin
        .from('pedagogical_summaries')
        .upsert(row, { onConflict: 'scope,entity_id' })
        .select('*')
        .single()
      if (error) throw new AppError(500, 'שגיאה בשמירת הסיכום: ' + error.message)
      res.json({ summary: saved, cached: false })
    } else {
      /* לפני המיגרציה — מחזירים את הסיכום החי בלי לשמור (בלי cache) */
      res.json({ summary: { ...row, id: null }, cached: false, notPersisted: true })
    }
  } catch (err) {
    next(err)
  }
})
