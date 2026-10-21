import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import { supabaseAdmin } from '../lib/supabase.js'
import { hasIsActive, hasGradeLabel, hasClassTeachers, hasFictitious } from '../lib/activeColumn.js'

/* ── זריעת נתוני דמו לארגון פיילוט (כיתה + 8 תלמידים בדויים + 3 הדמיות + תוצאות) ──
   כדי שדשבורד האנליטיקה של המנהל העירוני לא יהיה ריק. כל שורה שנזרעת נרשמת
   ב-demo_seed_registry — ‎--remove‎ מסיר בדיוק אותן שורות ולא נוגע בנתונים שנוצרו
   אחר כך ע"י משתמשים אמיתיים. שמות התלמידים בדויים בעליל ("… דמו"), ללא אנשים אמיתיים.

   שימוש:
     npm run seed-nesher-demo -- --org "Nesher Demo"            זריעה
     npm run seed-nesher-demo -- --org "Nesher Demo" --remove   הסרה

   הערה: ההקצאות (assignments) נכתבות ישירות ל-DB כנתוני-דמו — מורה מוגבל אינו יכול
   ליצור אותן בעצמו (השער can_share חוסם בשרת); זה מכוון והסיבה שהדשבורד מלא. */

/* ערך מרובה-מילים: ב-PowerShell/‏npm המירכאות נשחקות ("Nesher Demo" → שני טוקנים),
   לכן לוקחים את כל הטוקנים עד הדגל הבא. */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf('--' + name)
  if (i < 0) return undefined
  const parts: string[] = []
  for (let j = i + 1; j < process.argv.length && !process.argv[j].startsWith('--'); j++) parts.push(process.argv[j])
  return parts.length ? parts.join(' ') : undefined
}
const has = (name: string) => process.argv.includes('--' + name)

/* PRNG דטרמיניסטי — אותן תוצאות בכל זריעה */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const FAKE_STUDENTS = [
  { name: 'אביב דמו', ability: 0.9, gender: 'male' },
  { name: 'בר דמו', ability: 0.8, gender: 'female' },
  { name: 'גל דמו', ability: 0.72, gender: 'male' },
  { name: 'דנה דמו', ability: 0.65, gender: 'female' },
  { name: 'הדר דמו', ability: 0.55, gender: 'female' },
  { name: 'ורד דמו', ability: 0.45, gender: 'female' },
  { name: 'זיו דמו', ability: 0.35, gender: 'male' },
  { name: 'חן דמו', ability: 0.6, gender: 'male' },
] as const

async function register(tag: string, table: string, ids: string[]) {
  if (!ids.length) return
  await supabaseAdmin.from('demo_seed_registry').insert(ids.map((row_id) => ({ seed_tag: tag, table_name: table, row_id })))
}

async function remove(tag: string) {
  const { data } = await supabaseAdmin.from('demo_seed_registry').select('table_name, row_id').eq('seed_tag', tag)
  const rows = (data ?? []) as { table_name: string; row_id: string }[]
  if (!rows.length) { console.log('אין נתוני דמו רשומים להסרה.'); return }
  const ids = (t: string) => rows.filter((r) => r.table_name === t).map((r) => r.row_id)

  const sessionIds = ids('sessions')
  const userIds = ids('users')
  const classIds = ids('classes')
  if (sessionIds.length) {
    await supabaseAdmin.from('events').delete().in('session_id', sessionIds)
    await supabaseAdmin.from('sessions').delete().in('id', sessionIds)
  }
  if (ids('assignments').length) await supabaseAdmin.from('assignments').delete().in('id', ids('assignments'))
  if (classIds.length) {
    await supabaseAdmin.from('class_members').delete().in('class_id', classIds)
    await supabaseAdmin.from('class_teachers').delete().in('class_id', classIds)
    await supabaseAdmin.from('classes').delete().in('id', classIds)
  }
  if (ids('quests').length) await supabaseAdmin.from('quests').delete().in('id', ids('quests'))
  if (userIds.length) {
    const { data: us } = await supabaseAdmin.from('users').select('id, auth_id').in('id', userIds)
    await supabaseAdmin.from('users').delete().in('id', userIds)
    for (const u of (us ?? []) as { auth_id: string | null }[]) {
      if (u.auth_id) await supabaseAdmin.auth.admin.deleteUser(u.auth_id).catch(() => {})
    }
  }
  await supabaseAdmin.from('demo_seed_registry').delete().eq('seed_tag', tag)
  console.log(`✓ הוסרו נתוני הדמו (${rows.length} שורות רשומות).`)
}

async function main() {
  const orgName = arg('org')?.trim() || 'Nesher Demo'
  const tag = 'demo-seed:' + orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-')

  const { data: school } = await supabaseAdmin.from('schools').select('id, slug').eq('name', orgName).maybeSingle()
  if (!school) throw new Error(`הארגון "${orgName}" לא נמצא — הרץ קודם create-demo-admin`)

  if (has('remove')) { await remove(tag); return }

  const { data: already } = await supabaseAdmin.from('demo_seed_registry').select('id').eq('seed_tag', tag).limit(1)
  if (already && already.length) { console.log('הארגון כבר נזרע. להסרה: --remove. לזריעה מחדש: --remove ואז זריעה.'); return }

  const act = (await hasIsActive('users')) ? { is_active: true } : {}
  /* תלמידים/כיתה/סשנים שנזרעים כאן הם נתוני דוגמה — מסומנים כדי שייחשפו עם התג וייכללו ב"מחק נתוני דוגמה" */
  const fict = (await hasFictitious()) ? { is_fictitious: true } : {}
  const actClass = (await hasIsActive('classes')) ? { is_active: true } : {}
  /* 1) מורה דמו — חשבון auth בלתי-שמיש (סיסמה אקראית לא ידועה), ללא הרשאת שיתוף */
  const teacherEmail = `demo.teacher.${randomBytes(3).toString('hex')}@example.com`
  const { data: au, error: auErr } = await supabaseAdmin.auth.admin.createUser({ email: teacherEmail, password: randomBytes(32).toString('base64url'), email_confirm: true })
  if (auErr || !au.user) throw new Error('יצירת מורה הדמו נכשלה: ' + (auErr?.message ?? ''))
  const { data: teacher, error: tErr } = await supabaseAdmin
    .from('users')
    .insert({ name: 'מורה דמו', role: 'teacher', school_id: school.id, auth_id: au.user.id, ...act, can_share: false })
    .select('id')
    .single()
  if (tErr || !teacher) throw new Error('רשומת מורה הדמו נכשלה: ' + (tErr?.message ?? ''))
  await register(tag, 'users', [teacher.id])

  /* 2) כיתה + שיוך מורה (מחנך) */
  const urlCode = `${school.slug}-demo-${randomBytes(2).toString('hex')}`
  const { data: cls, error: cErr } = await supabaseAdmin
    .from('classes')
    .insert({
      name: 'דמו ח׳1', slug: 'demo-h1', school_id: school.id, url_code: urlCode, ...actClass, ...fict,
      ...((await hasGradeLabel()) ? { grade_label: 'ח׳1' } : {}),
      ...((await hasClassTeachers()) ? {} : { teacher_id: teacher.id }), /* לפני מיגרציית class_teachers */
    })
    .select('id')
    .single()
  if (cErr || !cls) throw new Error('יצירת הכיתה נכשלה: ' + (cErr?.message ?? ''))
  await register(tag, 'classes', [cls.id])
  if (await hasClassTeachers()) await supabaseAdmin.from('class_teachers').insert({ class_id: cls.id, teacher_id: teacher.id, subject: '', is_homeroom: true })

  /* 3) תלמידים בדויים */
  const studentIds: { id: string; ability: number; name: string }[] = []
  for (const st of FAKE_STUDENTS) {
    const pin = String(Math.floor(1000 + Math.random() * 9000))
    const { data: u, error } = await supabaseAdmin
      .from('users')
      .insert({ name: st.name, role: 'student', pin, school_id: school.id, ...act, ...fict })
      .select('id')
      .single()
    if (error || !u) throw new Error('יצירת תלמיד דמו נכשלה: ' + (error?.message ?? ''))
    await supabaseAdmin.from('class_members').insert({ class_id: cls.id, user_id: u.id })
    studentIds.push({ id: u.id, ability: st.ability, name: st.name })
  }
  await register(tag, 'users', studentIds.map((s) => s.id))

  /* 4) 3 הדמיות — עותקי דמו של הדמיות רשמיות קיימות, בבעלות מורה הדמו */
  const { data: sources } = await supabaseAdmin
    .from('quests')
    .select('title, game_data, quest_type, art_style, include_dr_holo, curriculum, quest_length, status')
    .eq('is_public', true)
    .eq('is_official', true)
    .limit(3)
  const srcs = (sources ?? []) as { title: string; game_data: { scenes?: { id: string; puzzle?: { type?: string; difficulty?: number } }[] }; [k: string]: unknown }[]
  if (srcs.length === 0) throw new Error('לא נמצאו הדמיות רשמיות להעתקה — הרץ seed:library קודם')

  const quests: { id: string; scenes: { id: string; puzzle?: { type?: string; difficulty?: number } }[] }[] = []
  for (const q of srcs) {
    const { data: row, error } = await supabaseAdmin
      .from('quests')
      .insert({
        title: 'דמו — ' + q.title,
        curriculum: q.curriculum ?? '',
        quest_type: q.quest_type ?? 'adventure',
        quest_length: q.quest_length ?? 5,
        art_style: q.art_style ?? 'digital-painting',
        include_dr_holo: q.include_dr_holo ?? true,
        game_data: q.game_data,
        status: q.status ?? 'draft',
        created_by: teacher.id,
      })
      .select('id')
      .single()
    if (error || !row) throw new Error('יצירת הדמיית דמו נכשלה: ' + (error?.message ?? ''))
    quests.push({ id: row.id, scenes: q.game_data.scenes ?? [] })
  }
  await register(tag, 'quests', quests.map((q) => q.id))

  /* 5) הקצאות + sessions + events עם תוצאות מגוונות (ללא שיתוף-דרך-API: נתוני דמו) */
  const rand = mulberry32(20261015)
  const asgIds: string[] = []
  const sessIds: string[] = []
  for (const [qi, quest] of quests.entries()) {
    const { data: asg } = await supabaseAdmin
      .from('assignments')
      .insert({ class_id: cls.id, quest_id: quest.id, user_id: teacher.id, due_date: new Date(Date.now() + 7 * 864e5).toISOString() })
      .select('id')
      .single()
    if (asg) asgIds.push(asg.id)

    const puzzleScenes = quest.scenes.filter((s) => s.puzzle)
    const sceneIds = quest.scenes.map((s) => s.id)
    for (const [si, stu] of studentIds.entries()) {
      /* ההדמיה השלישית: תלמיד אחד באמצע, אחד לא התחיל — מגוון סטטוסים */
      if (qi === 2 && si === 7) continue
      const inProgress = qi === 2 && si === 6
      const startedAt = new Date(Date.now() - (qi * 2 + 1) * 86_400_000 - si * 3_600_000).toISOString()
      const sess: Record<string, unknown> = { user_id: stu.id, quest_id: quest.id, started_at: startedAt, max_score: puzzleScenes.length, inventory: [], visited_scenes: sceneIds, ...fict }
      let correct = 0
      const results = puzzleScenes.map(() => {
        const solved = rand() < Math.min(0.97, Math.max(0.12, stu.ability + (rand() - 0.5) * 0.25 - qi * 0.04))
        if (solved) correct++
        return solved
      })
      const avgSceneMs = Math.round(9000 + (1 - stu.ability) * 30000 + rand() * 6000)
      if (inProgress) sess.current_scene_id = sceneIds[Math.max(1, Math.floor(sceneIds.length / 2))] ?? sceneIds[0]
      else { sess.completed_at = new Date(new Date(startedAt).getTime() + avgSceneMs * sceneIds.length).toISOString(); sess.total_score = correct }
      const { data: s } = await supabaseAdmin.from('sessions').insert(sess).select('id').single()
      if (!s) continue
      sessIds.push(s.id)
      if (inProgress) continue

      const base = { session_id: s.id, user_id: stu.id, quest_id: quest.id }
      const events: Record<string, unknown>[] = []
      puzzleScenes.forEach((ps, i) => {
        events.push({ ...base, type: results[i] ? 'puzzle_solved' : 'puzzle_failed', scene_id: ps.id,
          payload: { puzzleType: ps.puzzle!.type ?? 'multipleChoice', difficulty: ps.puzzle!.difficulty ?? 5, attempts: 1, solveTimeMs: Math.round(avgSceneMs * 0.7), shards: results[i] ? 1 : 0 } })
      })
      for (const sid of sceneIds) events.push({ ...base, type: 'scene_enter', scene_id: sid, payload: { dwellMs: avgSceneMs } })
      const rate = puzzleScenes.length ? correct / puzzleScenes.length : 0
      events.push({ ...base, type: 'session_completed', scene_id: null,
        payload: { successRate: rate, avgSceneMs, crystalsEarned: Math.round(rate * 5), completed: true, durationMs: avgSceneMs * sceneIds.length, totalChallenges: puzzleScenes.length, correctChallenges: correct, scenesVisited: sceneIds.length } })
      await supabaseAdmin.from('events').insert(events)
    }
  }
  await register(tag, 'assignments', asgIds)
  await register(tag, 'sessions', sessIds)

  console.log(`✓ נזרעו: מורה דמו, כיתה "דמו ח׳1" (url_code=${urlCode}), ${studentIds.length} תלמידים בדויים, ${quests.length} הדמיות, ${sessIds.length} sessions.`)
  console.log('להסרה: npm run seed-nesher-demo -- --org "' + orgName + '" --remove')
}

main().catch((e) => { console.error('✗', e instanceof Error ? e.message : e); process.exit(1) })
