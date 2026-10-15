/* ── בדיקת תאימות: קוד ישן (prod) מול קוד חדש על אותו DB משותף ─────────────────────
   מריץ את אותה סדרת קריאות מול שני שרתים (OLD_API / NEW_API) ומשווה:
   · נקודות קצה של מורה/אנליטיקה עובדות בקוד הישן גם אחרי המיגרציות התוספתיות.
   · אותו payload של complete (כולל שדות הטלמטריה החדשים) → אותם events (puzzle_solved / puzzle_failed / session_completed)
     ואותו כיול 60/80 בשניהם; ההבדל היחיד הוא תוספות (word_count/closed_dwell_ms/שערים/answers).
   יוצר ארגון זמני (zz-compat-*) ומנקה. סיסמאות אקראיות בזיכרון.
   הרצה:  OLD_API=http://localhost:3002/api NEW_API=http://localhost:3001/api npm run compat:smoke */
import '../env.js'
import { randomBytes } from 'node:crypto'
import { supabaseAdmin, supabaseAnon } from '../lib/supabase.js'
import { hasIsActive } from '../lib/activeColumn.js'

const OLD = process.env.OLD_API ?? 'http://localhost:3002/api'
const NEW = process.env.NEW_API ?? 'http://localhost:3001/api'
let failed = 0, total = 0
const check = (name: string, ok: boolean, extra = '') => { total++; if (!ok) failed++; console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  — ' + extra : ''}`) }

async function call(api: string, token: string, method: string, p: string, body?: unknown): Promise<{ status: number; json: any }> { // eslint-disable-line
  const r = await fetch(api + p, { method, headers: { Authorization: 'Bearer ' + token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) })
  let json: any = {} // eslint-disable-line
  try { json = await r.json() } catch { /* empty */ }
  return { status: r.status, json }
}

const GAME = {
  entrySceneId: 's0',
  scenes: [
    { id: 's0', title: 'פתיחה', narrative: 'שלום עולם הדמיה', nextSceneId: 's1' },
    { id: 's1', title: 'א', narrative: 'ראשונה שנייה שלישית רביעית', nextSceneId: 's2', puzzle: { type: 'multipleChoice', question: 'q', difficulty: 8, choices: [{ id: 'a', text: 'א', isCorrect: true }, { id: 'b', text: 'ב', isCorrect: false }] } },
    { id: 's2', title: 'ב', narrative: 'עוד טקסט כאן', nextSceneId: 's3', puzzle: { type: 'trueFalse', question: 'q', difficulty: 8, choices: [{ id: 't', text: 'נכון', isCorrect: true }, { id: 'f', text: 'לא נכון', isCorrect: false }] } },
    { id: 's3', title: 'ג', narrative: 'סוף', puzzle: { type: 'multipleChoice', question: 'q', difficulty: 8, choices: [{ id: 'a', text: 'א', isCorrect: false }, { id: 'b', text: 'ב', isCorrect: true }] } },
  ],
}

const cleanup = { users: [] as string[], auths: [] as string[], classes: [] as string[], quests: [] as string[], school: '' }

async function main() {
  const slug = 'zz-compat-' + randomBytes(3).toString('hex')
  const { data: school } = await supabaseAdmin.from('schools').insert({ name: slug, slug }).select('id').single()
  cleanup.school = school!.id

  const email = `zz-compat-${randomBytes(3).toString('hex')}@example.com`
  const password = randomBytes(18).toString('base64url')
  const { data: au } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true })
  cleanup.auths.push(au.user!.id)
  const act = (await hasIsActive('users')) ? { is_active: true } : {}
  const { data: teacher } = await supabaseAdmin.from('users').insert({ name: 'zz-compat teacher', role: 'teacher', school_id: school!.id, auth_id: au.user!.id, can_share: false, ...act }).select('id').single()
  cleanup.users.push(teacher!.id)
  const { data: s } = await supabaseAnon.auth.signInWithPassword({ email, password })
  const tTok = s.session!.access_token

  try {
    /* כיתה בכל שני המודלים: teacher_id (ישן) + class_teachers (חדש) */
    const code = `zz-compat-c-${randomBytes(2).toString('hex')}`
    const { data: cls } = await supabaseAdmin.from('classes').insert({ name: 'ז׳9', slug: code, school_id: school!.id, url_code: code, teacher_id: teacher!.id }).select('id').single()
    cleanup.classes.push(cls!.id)
    await supabaseAdmin.from('class_teachers').insert({ class_id: cls!.id, teacher_id: teacher!.id, subject: '', subject_id: null, is_homeroom: true })

    const mkStu = async (n: string) => {
      const { data } = await supabaseAdmin.from('users').insert({ name: 'zz-compat stu ' + n, role: 'student', school_id: school!.id, pin: '1234' }).select('id').single()
      cleanup.users.push(data!.id)
      await supabaseAdmin.from('class_members').insert({ class_id: cls!.id, user_id: data!.id })
      return data!.id as string
    }
    const stuOld = await mkStu('old')
    const stuNew = await mkStu('new')
    const { data: q } = await supabaseAdmin.from('quests').insert({ title: 'zz-compat quest', game_data: GAME, status: 'draft', created_by: teacher!.id }).select('id').single()
    cleanup.quests.push(q!.id)
    await supabaseAdmin.from('assignments').insert({ class_id: cls!.id, quest_id: q!.id, user_id: teacher!.id })

    /* ── א) מורה/אנליטיקה בקוד הישן (אחרי המיגרציות התוספתיות) ── */
    console.log('\n— קוד ישן: נקודות קצה של מורה ואנליטיקה —')
    for (const [name, p] of [['GET /staff/classes', '/staff/classes'], ['GET /quests', '/quests'], ['GET /analytics/assignments', '/analytics/assignments'], ['GET /analytics/students', '/analytics/students'], ['GET /staff/students', '/staff/students'], ['GET /library', '/library']] as const) {
      const r = await call(OLD, tTok, 'GET', p)
      check(`ישן: ${name} → 200`, r.status === 200, 'status=' + r.status)
    }
    const oldClasses = await call(OLD, tTok, 'GET', '/staff/classes')
    const mine = (oldClasses.json.classes ?? []).find((c: any) => c.id === cls!.id) // eslint-disable-line
    check('ישן: המורה רואה את הכיתה שלו עם התלמידים', !!mine && mine.studentCount === 2)
    const oldStu = await call(OLD, tTok, 'GET', `/analytics/student/${stuOld}`)
    check('ישן: drill-down תלמיד → 200', oldStu.status === 200)
    const created = await call(OLD, tTok, 'POST', '/staff/classes', { name: 'ח׳1', slug: 'zz' + randomBytes(2).toString('hex') })
    check('ישן: יצירת כיתה חדשה → 201', created.status === 201, 'status=' + created.status)
    if (created.json.class?.id) cleanup.classes.push(created.json.class.id)

    /* ── ב) אותו complete בשני השרתים ── */
    console.log('\n— אותו משחק (payload זהה, כולל שדות 1B) בשני השרתים —')
    const login = async (api: string, id: string) => ((await (await fetch(api + '/auth/student-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId: id, pin: '1234' }) })).json()) as { token?: string }).token!
    const playOn = async (api: string, stuId: string) => {
      const tok = await login(api, stuId)
      const st = await call(api, tok, 'POST', '/sessions/start', { questId: q!.id })
      const sid = st.json.sessionId as string
      const body = {
        totalScore: 2, crystalsFull: 3,
        summary: { totalChallenges: 3, correctChallenges: 2, successRate: 2 / 3, avgSceneMs: 12000, scenesVisited: 4, crystalsEarned: 3, completed: true, durationMs: 60000 },
        challenges: [
          { sceneId: 's1', puzzleType: 'multipleChoice', difficulty: 8, correct: true, attempts: 1, solveTimeMs: 5000, shards: 1 },
          { sceneId: 's2', puzzleType: 'trueFalse', difficulty: 8, correct: true, attempts: 1, solveTimeMs: 4000, shards: 1 },
          { sceneId: 's3', puzzleType: 'multipleChoice', difficulty: 8, correct: false, attempts: 1, solveTimeMs: 6000, shards: 0 },
        ],
        sceneTimes: [
          { sceneId: 's0', dwellMs: 9000, wordCount: 3, closedDwellMs: 8800 },
          { sceneId: 's1', dwellMs: 14000, wordCount: 4, closedDwellMs: 13500 },
          { sceneId: 's2', dwellMs: 13000, wordCount: 3, closedDwellMs: 12900 },
          { sceneId: 's3', dwellMs: 12000, wordCount: 1, closedDwellMs: 12100 },
        ],
        answers: [
          { clientEventId: `${sid}:s1:0:1`, sceneId: 's1', itemIndex: 0, puzzleType: 'multipleChoice', selectedOptionId: 'a', selectedPosition: 1, correctPosition: 1, displayedOrder: ['b', 'a'], isCorrect: true, attemptNo: 1, responseMs: 3600, outcome: 'correct', interaction: { events: [{ k: 'select', t: 3600, optionId: 'a', position: 1 }] } },
          { clientEventId: `${sid}:s3:0:1`, sceneId: 's3', itemIndex: 0, puzzleType: 'multipleChoice', selectedOptionId: 'a', selectedPosition: 0, correctPosition: 1, displayedOrder: ['a', 'b'], isCorrect: false, attemptNo: 1, responseMs: 4100, outcome: 'wrong', interaction: null },
        ],
        moralChoices: [],
        gateEvents: [{ type: 'item_used_wrong', sceneId: 's2', payload: { itemId: 'key', sceneId: 'gate' }, clientTs: Date.now() }],
      }
      const done = await call(api, tok, 'POST', `/sessions/${sid}/complete`, body)
      return { sid, status: done.status, json: done.json }
    }
    const oldRun = await playOn(OLD, stuOld)
    const newRun = await playOn(NEW, stuNew)
    check('ישן: complete עם payload חדש → 200 (שדות לא מוכרים מתעלמים)', oldRun.status === 200, 'status=' + oldRun.status)
    check('חדש: complete → 200', newRun.status === 200, 'status=' + newRun.status)

    const evs = async (sid: string) => {
      const { data } = await supabaseAdmin.from('events').select('type, scene_id, payload').eq('session_id', sid)
      return (data ?? []) as { type: string; scene_id: string | null; payload: Record<string, unknown> }[]
    }
    const oe = await evs(oldRun.sid)
    const ne = await evs(newRun.sid)
    const core = (e: { type: string; scene_id: string | null; payload: Record<string, unknown> }) => {
      const { clientTs: _c, ...rest } = e.payload as Record<string, unknown> & { clientTs?: unknown }
      void _c
      return JSON.stringify([e.type, e.scene_id, rest])
    }
    const puzzlePart = (arr: typeof oe) => arr.filter((e) => e.type === 'puzzle_solved' || e.type === 'puzzle_failed').map(core).sort()
    check('events של puzzle_solved/failed זהים בדיוק (ישן = חדש)', JSON.stringify(puzzlePart(oe)) === JSON.stringify(puzzlePart(ne)), `${puzzlePart(oe).length} שורות`)
    const completedPart = (arr: typeof oe) => arr.filter((e) => e.type === 'session_completed').map(core)
    check('session_completed זהה (כולל perType/skipping)', JSON.stringify(completedPart(oe)) === JSON.stringify(completedPart(ne)))
    const enterOld = oe.filter((e) => e.type === 'scene_enter').map((e) => [e.scene_id, e.payload.dwellMs])
    const enterNew = ne.filter((e) => e.type === 'scene_enter').map((e) => [e.scene_id, e.payload.dwellMs])
    check('scene_enter.dwellMs זהה (ההיסטורי לא זז)', JSON.stringify(enterOld.sort()) === JSON.stringify(enterNew.sort()))
    const withWords = ne.filter((e) => e.type === 'scene_enter' && typeof e.payload.word_count === 'number' && typeof e.payload.closed_dwell_ms === 'number')
    check('חדש: scene_enter נושא word_count + closed_dwell_ms', withWords.length === 4)
    check('ישן: אין word_count (לא מכיר) — לא נשבר', oe.filter((e) => e.type === 'scene_enter' && 'word_count' in e.payload).length === 0)
    check('חדש: אירוע השער (item_used_wrong) נשמר', ne.some((e) => e.type === 'item_used_wrong' && e.scene_id === 's2'))

    /* כיול: אותה התחלה → אותן רמות */
    const prof = async (id: string) => (await supabaseAdmin.from('difficulty_profiles').select('text_level, per_puzzle_level').eq('user_id', id).maybeSingle()).data as { text_level: number; per_puzzle_level: Record<string, number> } | null
    const po = await prof(stuOld)
    const pn = await prof(stuNew)
    check('כיול 60/80: הרמות שיוצאות זהות (ישן = חדש)', !!po && !!pn && JSON.stringify(po) === JSON.stringify(pn), JSON.stringify(pn?.per_puzzle_level))
    const { count: ansOld } = await supabaseAdmin.from('answers').select('*', { count: 'exact', head: true }).eq('student_id', stuOld)
    const { count: ansNew } = await supabaseAdmin.from('answers').select('*', { count: 'exact', head: true }).eq('student_id', stuNew)
    check('answers: הקוד הישן לא כותב; החדש כותב שורה לכל תשובה', (ansOld ?? 0) === 0 && (ansNew ?? 0) === 2, `old=${ansOld} new=${ansNew}`)

    /* אידמפוטנטיות: שליחה חוזרת בשרת החדש לא מכפילה */
    const tokNew = await login(NEW, stuNew)
    const again = await call(NEW, tokNew, 'POST', `/sessions/${newRun.sid}/complete`, {
      totalScore: 2, crystalsFull: 3, summary: { totalChallenges: 3, correctChallenges: 2, successRate: 2 / 3, avgSceneMs: 12000, scenesVisited: 4, crystalsEarned: 3, completed: true, durationMs: 60000 },
      challenges: [{ sceneId: 's1', puzzleType: 'multipleChoice', difficulty: 8, correct: true, attempts: 1, solveTimeMs: 5000, shards: 1 }],
      sceneTimes: [{ sceneId: 's0', dwellMs: 9000 }],
      answers: [{ clientEventId: `${newRun.sid}:s1:0:1`, sceneId: 's1', itemIndex: 0, puzzleType: 'multipleChoice', selectedOptionId: 'a', selectedPosition: 1, correctPosition: 1, displayedOrder: ['b', 'a'], isCorrect: true, attemptNo: 1, responseMs: 3600, outcome: 'correct', interaction: null }],
    })
    const { count: ansAfter } = await supabaseAdmin.from('answers').select('*', { count: 'exact', head: true }).eq('student_id', stuNew)
    check('שליחה חוזרת: 200 ו-answers לא מוכפל (client_event_id)', again.status === 200 && ansAfter === 2, `count=${ansAfter}`)

    /* payload פגום בטלמטריה לא חוסם את הסיום */
    const stuBad = await mkStu('bad')
    const tokBad = await login(NEW, stuBad)
    const st2 = await call(NEW, tokBad, 'POST', '/sessions/start', { questId: q!.id })
    const bad = await call(NEW, tokBad, 'POST', `/sessions/${st2.json.sessionId}/complete`, {
      totalScore: 1, crystalsFull: 1, summary: { totalChallenges: 1, correctChallenges: 1, successRate: 1, avgSceneMs: 9000, scenesVisited: 1, crystalsEarned: 1, completed: true, durationMs: 9000 },
      challenges: [{ sceneId: 's1', puzzleType: 'multipleChoice', difficulty: 8, correct: true, attempts: 1, solveTimeMs: 5000, shards: 1 }],
      sceneTimes: [{ sceneId: 's0', dwellMs: 9000, wordCount: 'הרבה', closedDwellMs: -5 }],
      answers: [{ garbage: true }, 'x', null, { clientEventId: 'q', outcome: 'zzz' }],
      moralChoices: 'not-an-array', gateEvents: [{ type: 'hack', payload: 1 }],
    })
    check('טלמטריה פגומה לא מפילה את ה-complete (200 והכיול נכתב)', bad.status === 200 && (await prof(stuBad)) !== null, 'status=' + bad.status)
  } finally {
    const sessIds = ((await supabaseAdmin.from('sessions').select('id').in('user_id', cleanup.users.length ? cleanup.users : ['00000000-0000-0000-0000-000000000000'])).data ?? []).map((x) => x.id as string)
    if (sessIds.length) {
      await supabaseAdmin.from('answers').delete().in('session_id', sessIds)
      await supabaseAdmin.from('events').delete().in('session_id', sessIds)
      await supabaseAdmin.from('progress_snapshots').delete().in('session_id', sessIds)
      await supabaseAdmin.from('level_history').delete().in('session_id', sessIds)
      await supabaseAdmin.from('sessions').delete().in('id', sessIds)
    }
    if (cleanup.users.length) {
      await supabaseAdmin.from('level_history').delete().in('student_id', cleanup.users)
      await supabaseAdmin.from('student_subject_levels').delete().in('student_id', cleanup.users)
      await supabaseAdmin.from('difficulty_profiles').delete().in('user_id', cleanup.users)
      await supabaseAdmin.from('progress_snapshots').delete().in('student_id', cleanup.users)
      await supabaseAdmin.from('data_access_log').delete().in('viewer_id', cleanup.users)
    }
    if (cleanup.quests.length) { await supabaseAdmin.from('assignments').delete().in('quest_id', cleanup.quests); await supabaseAdmin.from('quests').delete().in('id', cleanup.quests) }
    if (cleanup.classes.length) {
      await supabaseAdmin.from('class_teachers').delete().in('class_id', cleanup.classes)
      await supabaseAdmin.from('class_members').delete().in('class_id', cleanup.classes)
      await supabaseAdmin.from('classes').delete().in('id', cleanup.classes)
    }
    if (cleanup.users.length) await supabaseAdmin.from('users').delete().in('id', cleanup.users)
    for (const a of cleanup.auths) await supabaseAdmin.auth.admin.deleteUser(a).catch(() => {})
    if (cleanup.school) await supabaseAdmin.from('schools').delete().eq('id', cleanup.school)
    console.log('\n(נוקה)')
  }
  console.log(failed === 0 ? `\nכל ${total} הבדיקות עברו` : `\n${failed} מתוך ${total} נכשלו`)
  if (failed) process.exitCode = 1
}

main().catch((e) => { console.error('FATAL', e instanceof Error ? e.message : e); process.exitCode = 1 })
