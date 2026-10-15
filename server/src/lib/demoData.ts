import { randomBytes } from 'node:crypto'
import { supabaseAdmin } from './supabase.js'
import { AppError } from '../middleware/errors.js'
import type { StaffContext } from '../middleware/staffAuth.js'
import { hasClassTeachers, hasFictitious, hasGradeLabel, hasIsActive, hasProgressSnapshots, hasSessionCrystals, hasUserGender } from './activeColumn.js'
import { recalibrateProfile } from './profileCalibration.js'
import { perTypeFromChallenges } from '../../../src/shared/lib/difficultyCalibration.js'
import {
  extractPuzzles, fakeStudentName, hashStr, simulateSession, tierForIndex,
  type SimSession, type Tier,
} from './demoSim.js'

/* ── נתוני דוגמה פיקטיביים — שירות ──────────────────────────────────────────────
   כותב תוצאות לאותן טבלאות ובאותו מבנה כמו מסלול ה-complete האמיתי (sessions +
   events + difficulty_profiles + progress_snapshots), כך שהדשבורד קורא אותן בלי
   שום קוד מיוחד. פעולת שרת בלבד: ההקצאות נכתבות ישירות (ובכיתות פיקטיביות
   בלבד — בלי תלמידים אמיתיים), לא דרך מסלול השיתוף, ו-can_share לא נפתח. */

export interface DemoScope {
  schoolId: string
  actorId: string
  role: 'municipal_admin' | 'teacher'
}

/* שער הארגון: רק municipal_admin / מורה בארגון עם demo_data_enabled. בכל ארגון אחר — 403. */
export async function requireDemoScope(staff: StaffContext | undefined): Promise<DemoScope> {
  if (!staff) throw new AppError(401, 'נדרשת התחברות צוות')
  if (staff.role !== 'municipal_admin' && staff.role !== 'teacher') {
    throw new AppError(403, 'נתוני דוגמה זמינים למנהל עירוני ולמורי הארגון בלבד')
  }
  if (!staff.schoolId) throw new AppError(403, 'נתוני דוגמה זמינים רק בארגון ההדגמה')
  const { data, error } = await supabaseAdmin.from('schools').select('demo_data_enabled').eq('id', staff.schoolId).maybeSingle()
  if (error || !(data as { demo_data_enabled?: boolean } | null)?.demo_data_enabled) {
    throw new AppError(403, 'נתוני דוגמה זמינים רק בארגון ההדגמה')
  }
  if (!(await hasFictitious())) throw new AppError(503, 'מיגרציית נתוני הדוגמה טרם הורצה')
  return { schoolId: staff.schoolId, actorId: staff.userId, role: staff.role }
}

interface QuestRow { id: string; title: string; game_data: unknown; created_by: string | null }
interface ClassRow { id: string; name: string }

/* הכיתות הפיקטיביות בהיקף: מורה — אלה שמקושרות אליו; מנהל עירוני — כל הארגון */
async function scopedFictitiousClasses(scope: DemoScope): Promise<ClassRow[]> {
  const { data } = await supabaseAdmin.from('classes').select('id, name, teacher_id').eq('school_id', scope.schoolId).eq('is_fictitious', true)
  const rows = (data ?? []) as (ClassRow & { teacher_id?: string | null })[]
  if (scope.role === 'municipal_admin') return rows.map((c) => ({ id: c.id, name: c.name }))
  if (await hasClassTeachers()) {
    const { data: links } = await supabaseAdmin.from('class_teachers').select('class_id').eq('teacher_id', scope.actorId).in('class_id', rows.map((r) => r.id).concat(['00000000-0000-0000-0000-000000000000']))
    const mine = new Set((links ?? []).map((l) => l.class_id as string))
    return rows.filter((c) => mine.has(c.id)).map((c) => ({ id: c.id, name: c.name }))
  }
  return rows.filter((c) => c.teacher_id === scope.actorId).map((c) => ({ id: c.id, name: c.name }))
}

/* ההדמיות המוכנות בהיקף (בפרופיל המורה): נוצרו ע"י המורה / ע"י מורי הארגון,
   עם סצנות ואתגרים, לא בייצור וללא שגיאת יצירה. מוגבל ל-12 האחרונות. */
async function readyQuests(scope: DemoScope): Promise<QuestRow[]> {
  let creators = [scope.actorId]
  if (scope.role === 'municipal_admin') {
    const { data: us } = await supabaseAdmin.from('users').select('id').eq('school_id', scope.schoolId).eq('role', 'teacher')
    creators = (us ?? []).map((u) => u.id as string)
  }
  if (creators.length === 0) return []
  const { data } = await supabaseAdmin
    .from('quests')
    .select('id, title, game_data, created_by')
    .in('created_by', creators)
    .order('created_at', { ascending: false })
    .limit(30)
  return ((data ?? []) as QuestRow[])
    .filter((q) => {
      const gd = q.game_data as { generating?: boolean; genError?: unknown } | null
      if (!gd || gd.generating || gd.genError) return false
      return extractPuzzles(gd).puzzles.length > 0
    })
    .slice(0, 12)
}

/* אינדקס פיקטיבי מהשם ("נועה דמו 2" → סיבוב 1) — לגזירת פרופיל ההצלחה בלי עמודה */
const NAME_ROOTS = Array.from({ length: 24 }, (_, i) => fakeStudentName(i).split(' ')[0])
export function fictitiousIndexFromName(name: string): number {
  const parts = name.trim().split(/\s+/)
  const i = NAME_ROOTS.indexOf(parts[0])
  if (i < 0) return hashStr(name) % 12 /* תלמיד מזריעה ישנה — פרופיל דטרמיניסטי מהשם */
  const round = parts.length >= 3 ? Math.max(0, parseInt(parts[2], 10) - 1) || 0 : 0
  return round * 24 + i
}
export const tierOfStudentName = (name: string): Tier => tierForIndex(fictitiousIndexFromName(name))

async function ensureAssignment(classId: string, quest: QuestRow, actorId: string): Promise<void> {
  const { data } = await supabaseAdmin.from('assignments').select('id').eq('class_id', classId).eq('quest_id', quest.id).limit(1)
  if (data && data.length > 0) return
  await supabaseAdmin.from('assignments').insert({
    class_id: classId, quest_id: quest.id, user_id: quest.created_by ?? actorId,
    due_date: new Date(Date.now() + 7 * 864e5).toISOString(),
  })
}

/* כותב סשן אחד — אותה צורה כמו /sessions/:id/complete. מחזיר true אם נכתב. */
async function writeSession(studentId: string, classId: string, quest: QuestRow, sim: SimSession): Promise<boolean> {
  if (sim.status === 'not_started') return false
  const { puzzles, sceneIds } = extractPuzzles(quest.game_data)
  const jitterMs = (hashStr(studentId + quest.id) % 8) * 3_600_000
  const startedAt = new Date(Date.now() - sim.dayOffset * 86_400_000 - 2 * 3_600_000 - jitterMs)

  const sess: Record<string, unknown> = {
    user_id: studentId, quest_id: quest.id, started_at: startedAt.toISOString(),
    max_score: puzzles.length, inventory: [], visited_scenes: sceneIds, is_fictitious: true,
  }
  if (sim.status === 'in_progress') {
    sess.current_scene_id = sceneIds[Math.max(1, Math.floor(sceneIds.length / 2))] ?? sceneIds[0]
    sess.visited_scenes = sceneIds.slice(0, Math.max(1, Math.floor(sceneIds.length / 2)))
    const { error } = await supabaseAdmin.from('sessions').insert(sess)
    return !error
  }
  const summary = sim.summary!
  sess.completed_at = new Date(startedAt.getTime() + summary.durationMs).toISOString()
  sess.total_score = summary.correctChallenges
  if (await hasSessionCrystals()) sess.crystals = summary.crystalsEarned
  const { data: row, error } = await supabaseAdmin.from('sessions').insert(sess).select('id').single()
  if (error || !row) return false

  const perType = perTypeFromChallenges(sim.challenges)
  const perTypeSuccess: Record<string, number> = {}
  for (const [t, s] of Object.entries(perType)) if (s && s.total > 0) perTypeSuccess[t] = Math.round((s.solved / s.total) * 100) / 100
  const base = { session_id: row.id, user_id: studentId, quest_id: quest.id }
  const events: Record<string, unknown>[] = []
  for (const c of sim.challenges) {
    events.push({
      ...base, type: c.correct ? 'puzzle_solved' : 'puzzle_failed', scene_id: c.sceneId,
      payload: { puzzleType: c.puzzleType, difficulty: c.difficulty, attempts: c.attempts, solveTimeMs: c.solveTimeMs, shards: c.shards, ...c.extra },
    })
  }
  for (const s of sim.sceneTimes) events.push({ ...base, type: 'scene_enter', scene_id: s.sceneId, payload: { dwellMs: s.dwellMs } })
  events.push({ ...base, type: 'session_completed', scene_id: null, payload: { ...summary, skipping: false, perType: perTypeSuccess } })
  await supabaseAdmin.from('events').insert(events)

  /* כיול פרופיל + snapshot — בדיוק כמו במסלול האמיתי */
  const cal = await recalibrateProfile(studentId, classId, perType, summary.avgSceneMs)
  if (cal && (await hasProgressSnapshots())) {
    const { error: snapErr } = await supabaseAdmin.from('progress_snapshots').insert({
      student_id: studentId, class_id: classId, session_id: row.id,
      text_level: cal.profile.textLevel, per_puzzle_level: cal.profile.perPuzzleLevel,
      success_rates: perTypeSuccess, overall_success: summary.successRate,
      taken_at: sess.completed_at,
    })
    if (snapErr) throw new Error('כתיבת snapshot נכשלה: ' + snapErr.message)
  }
  return true
}

/* תוצאות לכל תלמידי הכיתה × כל ההדמיות המוכנות. idempotent — מדלג על (תלמיד,הדמיה) קיימים. */
export async function generateResultsForClass(scope: DemoScope, classId: string): Promise<{ created: number; skipped: number; quests: number }> {
  const quests = await readyQuests(scope)
  const { data: members } = await supabaseAdmin
    .from('class_members')
    .select('users(id, name, role, is_fictitious)')
    .eq('class_id', classId)
  const students = (members ?? [])
    .map((m) => (Array.isArray(m.users) ? m.users[0] : m.users) as { id: string; name: string; role: string; is_fictitious?: boolean } | null)
    .filter((u): u is { id: string; name: string; role: string; is_fictitious?: boolean } => !!u && u.role === 'student' && u.is_fictitious === true)

  for (const q of quests) await ensureAssignment(classId, q, scope.actorId)

  let created = 0
  let skipped = 0
  for (const stu of students) {
    const tier = tierOfStudentName(stu.name)
    const { data: existing } = await supabaseAdmin.from('sessions').select('quest_id').eq('user_id', stu.id)
    const have = new Set((existing ?? []).map((s) => s.quest_id as string))
    /* כרונולוגי (ישן→חדש) כדי שפרופיל הקושי יתפתח כמו אצל תלמיד אמיתי */
    const sims = quests
      .map((q, i) => ({ q, sim: simulateSession({ studentId: stu.id, questId: q.id, tier, gameData: q.game_data, questIndex: i }) }))
      .sort((a, b) => b.sim.dayOffset - a.sim.dayOffset)
    for (const { q, sim } of sims) {
      if (have.has(q.id)) { skipped++; continue }
      if (await writeSession(stu.id, classId, q, sim)) created++
    }
  }
  return { created, skipped, quests: quests.length }
}

async function createStudents(scope: DemoScope, classId: string, count: number): Promise<{ id: string; name: string }[]> {
  const { data: members } = await supabaseAdmin.from('class_members').select('users(name, is_fictitious)').eq('class_id', classId)
  const names = (members ?? [])
    .map((m) => (Array.isArray(m.users) ? m.users[0] : m.users) as { name: string; is_fictitious?: boolean } | null)
    .filter((u): u is { name: string; is_fictitious?: boolean } => !!u && u.is_fictitious === true)
    .map((u) => u.name)
  let n = names.length === 0 ? 0 : Math.max(...names.map((nm) => fictitiousIndexFromName(nm))) + 1
  const withActive = await hasIsActive('users')
  const withGender = await hasUserGender()
  const out: { id: string; name: string }[] = []
  for (let k = 0; k < count; k++, n++) {
    const name = fakeStudentName(n)
    const payload: Record<string, unknown> = {
      name, role: 'student', school_id: scope.schoolId, is_fictitious: true,
      pin: String(Math.floor(1000 + Math.random() * 9000)),
    }
    if (withActive) payload.is_active = true
    if (withGender) payload.gender = n % 2 === 0 ? 'female' : 'male'
    const { data: u, error } = await supabaseAdmin.from('users').insert(payload).select('id, name').single()
    if (error || !u) throw new AppError(500, 'יצירת תלמיד הדוגמה נכשלה: ' + (error?.message ?? ''))
    await supabaseAdmin.from('class_members').insert({ class_id: classId, user_id: u.id })
    out.push({ id: u.id, name: u.name })
  }
  return out
}

export async function createFictitiousClass(scope: DemoScope, name?: string): Promise<{ classId: string; students: number; results: { created: number; skipped: number; quests: number } }> {
  const n = (await scopedFictitiousClasses(scope)).length + 1
  const clsName = (name?.trim() || `כיתה לדוגמה ${n}`).slice(0, 40)
  const urlCode = `demo-cls-${randomBytes(3).toString('hex')}`
  const payload: Record<string, unknown> = {
    name: clsName, slug: urlCode, school_id: scope.schoolId, url_code: urlCode, is_fictitious: true,
  }
  if (await hasIsActive('classes')) payload.is_active = true
  if (await hasGradeLabel()) payload.grade_label = clsName
  if (!(await hasClassTeachers())) payload.teacher_id = scope.actorId
  const { data: cls, error } = await supabaseAdmin.from('classes').insert(payload).select('id').single()
  if (error || !cls) throw new AppError(500, 'יצירת הכיתה נכשלה: ' + (error?.message ?? ''))
  if (await hasClassTeachers()) {
    await supabaseAdmin.from('class_teachers').insert({ class_id: cls.id, teacher_id: scope.actorId, subject: '', is_homeroom: scope.role === 'teacher' })
  }
  const students = await createStudents(scope, cls.id, 12)
  const results = await generateResultsForClass(scope, cls.id)
  return { classId: cls.id, students: students.length, results }
}

export async function addFictitiousStudents(scope: DemoScope, classId: string, count: number) {
  const classes = await scopedFictitiousClasses(scope)
  if (!classes.some((c) => c.id === classId)) {
    throw new AppError(403, 'אפשר להוסיף תלמידי דוגמה רק לכיתת דוגמה שלך')
  }
  const students = await createStudents(scope, classId, Math.min(12, Math.max(1, count)))
  const results = await generateResultsForClass(scope, classId)
  return { students: students.length, results }
}

export async function refreshResults(scope: DemoScope) {
  const classes = await scopedFictitiousClasses(scope)
  const total = { created: 0, skipped: 0, quests: 0, classes: classes.length }
  for (const c of classes) {
    const r = await generateResultsForClass(scope, c.id)
    total.created += r.created; total.skipped += r.skipped; total.quests = Math.max(total.quests, r.quests)
  }
  return total
}

/* מחיקה: רק תלמידים/כיתות isFictitious בהיקף + התוצאות שלהם. לא נוגע במורים, בהדמיות
   ובנתונים אמיתיים. */
export async function deleteDemoData(scope: DemoScope) {
  const classes = await scopedFictitiousClasses(scope)
  const classIds = classes.map((c) => c.id)
  if (classIds.length === 0) return { classes: 0, students: 0, sessions: 0 }

  const { data: members } = await supabaseAdmin
    .from('class_members').select('user_id, users(role, is_fictitious)').in('class_id', classIds)
  const studentIds = (members ?? [])
    .filter((m) => {
      const u = (Array.isArray(m.users) ? m.users[0] : m.users) as { role: string; is_fictitious?: boolean } | null
      return !!u && u.role === 'student' && u.is_fictitious === true
    })
    .map((m) => m.user_id as string)

  let sessionsDeleted = 0
  if (studentIds.length) {
    const { data: sess } = await supabaseAdmin.from('sessions').select('id').in('user_id', studentIds).eq('is_fictitious', true)
    const sids = (sess ?? []).map((s) => s.id as string)
    if (sids.length) {
      await supabaseAdmin.from('events').delete().in('session_id', sids)
      await supabaseAdmin.from('progress_snapshots').delete().in('session_id', sids)
      await supabaseAdmin.from('sessions').delete().in('id', sids)
      sessionsDeleted = sids.length
    }
    await supabaseAdmin.from('progress_snapshots').delete().in('student_id', studentIds)
    await supabaseAdmin.from('difficulty_profiles').delete().in('user_id', studentIds)
  }
  await supabaseAdmin.from('assignments').delete().in('class_id', classIds)
  await supabaseAdmin.from('class_members').delete().in('class_id', classIds)
  if (await hasClassTeachers()) await supabaseAdmin.from('class_teachers').delete().in('class_id', classIds)
  await supabaseAdmin.from('classes').delete().in('id', classIds).eq('is_fictitious', true)
  if (studentIds.length) await supabaseAdmin.from('users').delete().in('id', studentIds).eq('is_fictitious', true).eq('role', 'student')
  return { classes: classIds.length, students: studentIds.length, sessions: sessionsDeleted }
}

export async function demoStatus(scope: DemoScope) {
  const classes = await scopedFictitiousClasses(scope)
  let students = 0
  if (classes.length) {
    const { data } = await supabaseAdmin.from('class_members').select('users(role, is_fictitious)').in('class_id', classes.map((c) => c.id))
    students = (data ?? []).filter((m) => {
      const u = (Array.isArray(m.users) ? m.users[0] : m.users) as { role: string; is_fictitious?: boolean } | null
      return !!u && u.role === 'student' && u.is_fictitious === true
    }).length
  }
  return { enabled: true, classes: classes.length, students, readyQuests: (await readyQuests(scope)).length }
}
