import 'dotenv/config'
import { supabaseAdmin } from '../lib/supabase.js'

/* סקריפט בדיקה לאנליטיקה — מזריק מטלה + sessions מגוונים לכיתת ההדגמה (demo-7b)
   על הדמיה אחת, כדי לבדוק את הדשבורד (התפלגות, נקודות קושי, דגלים). idempotent. */

const QUEST_ID = process.env.ANALYTICS_DEMO_QUEST ?? 'b9ca7497-8e97-4745-a2be-b066acb70afc'

/* פרופיל ביצועים לכל תלמיד (לפי שם) — מכסה את כל מצבי הדשבורד */
const PROFILES: Record<string, { status: 'completed' | 'in_progress' | 'none'; successRate?: number; scene1?: boolean; scene2?: boolean; avgSceneMs?: number; crystals?: number }> = {
  'נועה':  { status: 'completed', successRate: 0.92, scene1: true,  scene2: true,  avgSceneMs: 12000, crystals: 5 }, /* ⭐ הצטיין */
  'תמר':   { status: 'completed', successRate: 0.70, scene1: true,  scene2: false, avgSceneMs: 9000,  crystals: 3 }, /* mid */
  'איתי':  { status: 'completed', successRate: 0.40, scene1: true,  scene2: false, avgSceneMs: 16000, crystals: 2 }, /* 🔴 מתקשה */
  'יואב':  { status: 'completed', successRate: 0.45, scene1: false, scene2: false, avgSceneMs: 3000,  crystals: 1 }, /* ⚡ חשד לדילוג */
  'מאיה':  { status: 'in_progress' },
  'דניאל': { status: 'none' },
}

async function main() {
  const { data: cls } = await supabaseAdmin.from('classes').select('id, school_id, teacher_id').eq('url_code', 'demo-7b').single()
  if (!cls) throw new Error('כיתת demo-7b לא נמצאה — הרץ npm run seed קודם')

  const { data: quest } = await supabaseAdmin.from('quests').select('game_data').eq('id', QUEST_ID).single()
  const scenes = (quest?.game_data?.scenes ?? []) as { id: string; puzzle?: { type?: string; difficulty?: number } }[]
  const sceneIds = scenes.map((s) => s.id)
  const puzzleScenes = scenes.filter((s) => s.puzzle)
  const maxScore = puzzleScenes.length

  /* מטלה — idempotent (לפי class+quest) */
  const teacherId = (cls as { teacher_id?: string }).teacher_id ?? null
  let { data: asg } = await supabaseAdmin.from('assignments').select('id').eq('class_id', cls.id).eq('quest_id', QUEST_ID).maybeSingle()
  if (!asg) {
    const ins = await supabaseAdmin.from('assignments').insert({ class_id: cls.id, quest_id: QUEST_ID, user_id: teacherId, due_date: new Date(Date.now() + 7 * 864e5).toISOString() }).select('id').single()
    asg = ins.data
  }

  const { data: members } = await supabaseAdmin.from('class_members').select('users(id, name, role)').eq('class_id', cls.id)
  const students = (members ?? []).map((m) => (Array.isArray(m.users) ? m.users[0] : m.users)).filter((u): u is { id: string; name: string; role: string } => !!u && u.role === 'student')

  for (const stu of students) {
    const p = PROFILES[stu.name]
    /* ניקוי sessions+events קודמים של התלמיד על ההדמיה */
    const { data: old } = await supabaseAdmin.from('sessions').select('id').eq('quest_id', QUEST_ID).eq('user_id', stu.id)
    const oldIds = (old ?? []).map((s) => s.id)
    if (oldIds.length) { await supabaseAdmin.from('events').delete().in('session_id', oldIds); await supabaseAdmin.from('sessions').delete().in('id', oldIds) }
    if (!p || p.status === 'none') continue

    const startedAt = new Date(Date.now() - 3600e3).toISOString()
    const sessRow: Record<string, unknown> = { user_id: stu.id, quest_id: QUEST_ID, started_at: startedAt, max_score: maxScore, inventory: [], visited_scenes: sceneIds }
    if (p.status === 'in_progress') { sessRow.current_scene_id = sceneIds[1] ?? sceneIds[0] }
    if (p.status === 'completed') {
      const correct = (p.scene1 ? 1 : 0) + (p.scene2 ? 1 : 0)
      sessRow.completed_at = new Date().toISOString()
      sessRow.total_score = correct
    }
    const { data: sess } = await supabaseAdmin.from('sessions').insert(sessRow).select('id').single()
    if (!sess) continue

    if (p.status === 'completed') {
      const base = { session_id: sess.id, user_id: stu.id, quest_id: QUEST_ID }
      const rows: Record<string, unknown>[] = []
      /* רשומת אתגר תמציתית לכל אתגר */
      for (const ps of puzzleScenes) {
        const solved = ps.id === 'scene_1' ? !!p.scene1 : !!p.scene2
        rows.push({ ...base, type: solved ? 'puzzle_solved' : 'puzzle_failed', scene_id: ps.id, payload: { puzzleType: ps.puzzle!.type ?? 'multipleChoice', difficulty: ps.puzzle!.difficulty ?? 5, attempts: 1, solveTimeMs: (p.avgSceneMs ?? 8000) - 2000, shards: solved ? 1 : 0 } })
      }
      /* scene_enter עם dwell לכל סצנה */
      for (const sid of sceneIds) rows.push({ ...base, type: 'scene_enter', scene_id: sid, payload: { dwellMs: p.avgSceneMs ?? 8000 } })
      const correct = (p.scene1 ? 1 : 0) + (p.scene2 ? 1 : 0)
      rows.push({ ...base, type: 'session_completed', scene_id: null, payload: { successRate: p.successRate ?? correct / maxScore, avgSceneMs: p.avgSceneMs ?? 8000, crystalsEarned: p.crystals ?? 0, completed: true, durationMs: (p.avgSceneMs ?? 8000) * sceneIds.length, totalChallenges: maxScore, correctChallenges: correct, scenesVisited: sceneIds.length } })
      await supabaseAdmin.from('events').insert(rows)
    }
    console.log(`✦ ${stu.name}: ${p.status}`)
  }
  console.log('\n✦ נתוני אנליטיקה לדוגמה הוזרקו. assignmentId =', asg?.id, '| classId =', cls.id)
}

main().catch((e) => { console.error('שגיאה:', e); process.exit(1) })
