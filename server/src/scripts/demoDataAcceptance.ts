/* ── קבלה חיה: נתוני דוגמה פיקטיביים ─────────────────────────────────────────────
   רץ מול השרת המקומי (localhost:3001) ומול ה-DB המשותף. יוצר מורים זמניים
   (zz-acc-*) בארגון ההדגמה ובארגון אחר, מפעיל את נקודות /api/staff/demo ובודק:
   בידוד ארגונים, idempotency, מבנה התוצאות בדשבורד, מחיקה מוגבלת, ו-can_share=false.
   מנקה אחריו הכול. סיסמאות אקראיות בזיכרון בלבד — לא נכתבות ולא מודפסות.

   מצבים:  (ברירת מחדל) קבלה מלאה + ניקוי
           --prepare   יוצר מורה+הדמיות+כיתת דוגמה, כותב session ל-public/zz-session.json (לצילום מסך)
           --cleanup   מנקה את מה ש-prepare יצר                                                    */
import '../env.js'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { supabaseAdmin, supabaseAnon } from '../lib/supabase.js'
import { hasIsActive } from '../lib/activeColumn.js'

const API = process.env.ACCEPT_API ?? 'http://localhost:3001/api'
const STATE = path.resolve(process.cwd(), 'zz-demo-accept.state.json')
const SESSION_OUT = path.resolve(process.cwd(), '../public/zz-session.json')
const MODE = process.argv.includes('--prepare') ? 'prepare' : process.argv.includes('--cleanup') ? 'cleanup' : 'full'

interface Tmp { userId: string; authId: string; email: string; token: string; refresh: string; expiresAt?: number }
interface State { users: string[]; auths: string[]; quests: string[]; schools: string[] }
const state: State = { users: [], auths: [], quests: [], schools: [] }

let failed = 0
const check = (name: string, ok: boolean, extra = '') => { if (!ok) failed++; console.log(`${ok ? '✓' : '✗'} ${name}${extra ? '  — ' + extra : ''}`) }

async function api(token: string, method: string, p: string, body?: unknown): Promise<{ status: number; json: Record<string, any> }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const r = await fetch(API + p, {
    method,
    headers: { Authorization: 'Bearer ' + token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let json: Record<string, any> = {} // eslint-disable-line @typescript-eslint/no-explicit-any
  try { json = await r.json() } catch { /* empty */ }
  return { status: r.status, json }
}

async function makeTeacher(schoolId: string, label: string): Promise<Tmp> {
  const email = `zz-acc-${label}-${randomBytes(3).toString('hex')}@example.com`
  const password = randomBytes(18).toString('base64url')
  const { data: au, error } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !au.user) throw new Error('createUser: ' + error?.message)
  state.auths.push(au.user.id)
  const act = (await hasIsActive('users')) ? { is_active: true } : {}
  const { data: u, error: uErr } = await supabaseAdmin
    .from('users').insert({ name: `zz-acc ${label}`, role: 'teacher', school_id: schoolId, auth_id: au.user.id, can_share: false, ...act })
    .select('id').single()
  if (uErr || !u) throw new Error('users insert: ' + uErr?.message)
  state.users.push(u.id)
  const { data: s, error: sErr } = await supabaseAnon.auth.signInWithPassword({ email, password })
  if (sErr || !s.session) throw new Error('signIn: ' + sErr?.message)
  return { userId: u.id, authId: au.user.id, email, token: s.session.access_token, refresh: s.session.refresh_token, expiresAt: s.session.expires_at }
}

async function cleanup(st: State) {
  /* תלמידי/כיתות דוגמה של המורים הזמניים נמחקים דרך ה-API של המחיקה כשאפשר; כאן ניקוי ישיר ובטוח */
  for (const uid of st.users) {
    const { data: links } = await supabaseAdmin.from('class_teachers').select('class_id').eq('teacher_id', uid)
    const classIds = (links ?? []).map((l) => l.class_id as string)
    if (classIds.length) {
      const { data: cls } = await supabaseAdmin.from('classes').select('id').in('id', classIds).eq('is_fictitious', true)
      const fIds = (cls ?? []).map((c) => c.id as string)
      if (fIds.length) {
        const { data: mem } = await supabaseAdmin.from('class_members').select('user_id').in('class_id', fIds)
        const stuIds = (mem ?? []).map((m) => m.user_id as string)
        if (stuIds.length) {
          const { data: ss } = await supabaseAdmin.from('sessions').select('id').in('user_id', stuIds)
          const sids = (ss ?? []).map((s) => s.id as string)
          if (sids.length) {
            await supabaseAdmin.from('events').delete().in('session_id', sids)
            await supabaseAdmin.from('progress_snapshots').delete().in('session_id', sids)
            await supabaseAdmin.from('sessions').delete().in('id', sids)
          }
          await supabaseAdmin.from('progress_snapshots').delete().in('student_id', stuIds)
          await supabaseAdmin.from('difficulty_profiles').delete().in('user_id', stuIds)
        }
        await supabaseAdmin.from('assignments').delete().in('class_id', fIds)
        await supabaseAdmin.from('class_members').delete().in('class_id', fIds)
        await supabaseAdmin.from('class_teachers').delete().in('class_id', fIds)
        await supabaseAdmin.from('classes').delete().in('id', fIds)
        if (stuIds.length) await supabaseAdmin.from('users').delete().in('id', stuIds).eq('is_fictitious', true)
      }
    }
  }
  if (st.quests.length) {
    await supabaseAdmin.from('assignments').delete().in('quest_id', st.quests)
    await supabaseAdmin.from('quests').delete().in('id', st.quests)
  }
  if (st.users.length) {
    await supabaseAdmin.from('class_teachers').delete().in('teacher_id', st.users)
    await supabaseAdmin.from('users').delete().in('id', st.users)
  }
  for (const a of st.auths) await supabaseAdmin.auth.admin.deleteUser(a).catch(() => {})
  if (st.schools.length) await supabaseAdmin.from('schools').delete().in('id', st.schools)
}

async function main() {
  if (MODE === 'cleanup') {
    if (!fs.existsSync(STATE)) { console.log('אין מה לנקות'); return }
    await cleanup(JSON.parse(fs.readFileSync(STATE, 'utf8')) as State)
    fs.rmSync(STATE, { force: true }); fs.rmSync(SESSION_OUT, { force: true })
    console.log('✓ נוקה')
    return
  }

  const { data: nesher } = await supabaseAdmin.from('schools').select('id, demo_data_enabled').eq('name', 'Nesher Demo').single()
  if (!nesher?.demo_data_enabled) throw new Error('Nesher Demo לא מופעל לנתוני דוגמה (demo_data_enabled)')

  /* הדמיות מקור — רשמיות */
  const { data: srcs } = await supabaseAdmin
    .from('quests').select('title, game_data, quest_type, art_style, include_dr_holo, curriculum, quest_length, status')
    .eq('is_public', true).eq('is_official', true).limit(3)
  if (!srcs || srcs.length === 0) throw new Error('אין הדמיות רשמיות להעתקה')

  /* ארגון אחר */
  let { data: other } = await supabaseAdmin.from('schools').select('id').neq('id', nesher.id).eq('demo_data_enabled', false).limit(1).maybeSingle()
  if (!other) {
    const slug = 'zz-acc-' + randomBytes(2).toString('hex')
    const { data: s } = await supabaseAdmin.from('schools').insert({ name: slug, slug }).select('id').single()
    other = s; state.schools.push(s!.id as string)
  }
  fs.writeFileSync(STATE, JSON.stringify(state))

  try {
    const A = await makeTeacher(nesher.id as string, 'A')
    const B = await makeTeacher(other!.id as string, 'B')
    fs.writeFileSync(STATE, JSON.stringify(state))

    for (const q of srcs as { title: string; game_data: unknown; [k: string]: unknown }[]) {
      const { data: row, error } = await supabaseAdmin.from('quests').insert({
        title: 'zz-acc — ' + q.title, curriculum: q.curriculum ?? '', quest_type: q.quest_type ?? 'adventure',
        quest_length: q.quest_length ?? 5, art_style: q.art_style ?? 'digital-painting', include_dr_holo: q.include_dr_holo ?? true,
        game_data: q.game_data, status: q.status ?? 'draft', created_by: A.userId,
      }).select('id').single()
      if (error || !row) throw new Error('quest insert: ' + error?.message)
      state.quests.push(row.id as string)
    }
    fs.writeFileSync(STATE, JSON.stringify(state))

    /* ── בידוד ארגונים ── */
    const bStatus = await api(B.token, 'GET', '/staff/demo/status')
    check('ארגון אחר: status מחזיר enabled=false', bStatus.status === 200 && bStatus.json.enabled === false)
    for (const [m, p, b] of [['POST', '/staff/demo/class', {}], ['POST', '/staff/demo/refresh', {}], ['DELETE', '/staff/demo/data', undefined]] as const) {
      const r = await api(B.token, m, p, b)
      check(`ארגון אחר: ${m} ${p} → 403`, r.status === 403, 'status=' + r.status)
    }
    const stuBefore = (await supabaseAdmin.from('users').select('id', { count: 'exact', head: true }).eq('school_id', other!.id).eq('is_fictitious', true)).count
    check('ארגון אחר: לא נוצרו תלמידי דוגמה', (stuBefore ?? 0) === 0)

    /* ── יצירת כיתה ── */
    const st0 = await api(A.token, 'GET', '/staff/demo/status')
    check('Nesher: status enabled עם 3 הדמיות מוכנות', st0.json.enabled === true && st0.json.readyQuests === 3, JSON.stringify(st0.json))
    const created = await api(A.token, 'POST', '/staff/demo/class', {})
    check('POST /class → 201 + 12 תלמידים', created.status === 201 && created.json.students === 12, `status=${created.status} created=${created.json.results?.created}`)
    const classId = created.json.classId as string

    const classes = await api(A.token, 'GET', '/staff/classes')
    const myCls = (classes.json.classes as { id: string; is_fictitious?: boolean; studentCount: number }[]).find((c) => c.id === classId)
    check('הכיתה מסומנת is_fictitious ויש בה 12 תלמידים', !!myCls?.is_fictitious && myCls.studentCount === 12)

    const roster = await api(A.token, 'GET', '/staff/students')
    const rs = roster.json.students as { id: string; name: string; isFictitious: boolean }[]
    check('הרוסטר מחזיר 12 תלמידים עם isFictitious=true', rs.length === 12 && rs.every((s) => s.isFictitious), `n=${rs.length}`)

    const list = await api(A.token, 'GET', '/analytics/assignments')
    const asgs = (list.json.assignments as { id: string; classId: string; title: string; avgSuccessRate: number | null; completionRate: number }[]).filter((a) => a.classId === classId)
    check('הדשבורד מציג 3 מטלות לכיתה', asgs.length === 3, `n=${asgs.length}`)

    /* התפלגות פרופילים: ממוצע הצלחה פר-תלמיד מכל המטלות */
    const perStudent = new Map<string, { name: string; rates: number[]; completed: number; started: number; isFict: boolean }>()
    for (const a of asgs) {
      const d = await api(A.token, 'GET', '/analytics/assignment/' + a.id)
      for (const s of d.json.students as { studentId: string; name: string; isFictitious: boolean; status: string; successRate: number | null }[]) {
        const cur = perStudent.get(s.studentId) ?? { name: s.name, rates: [], completed: 0, started: 0, isFict: s.isFictitious }
        if (s.status === 'completed' && s.successRate !== null) { cur.rates.push(s.successRate); cur.completed++ }
        if (s.status !== 'not_started') cur.started++
        perStudent.set(s.studentId, cur)
      }
    }
    const avg = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length
    const rows = [...perStudent.values()].map((s) => ({ ...s, avg: s.rates.length ? avg(s.rates) : null })).sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1))
    console.log('\n  תלמיד                     ממוצע    הושלמו/התחילו')
    for (const r of rows) console.log(`  ${r.name.padEnd(22)}  ${r.avg === null ? '  —  ' : (r.avg * 100).toFixed(0).padStart(4) + '%'}    ${r.completed}/${r.started}`)
    console.log('')
    check('בדשבורד 12 תלמידים וכולם isFictitious', rows.length === 12 && rows.every((r) => r.isFict))
    const band = (lo: number, hi: number) => rows.filter((r) => r.avg !== null && r.avg >= lo && r.avg < hi).length
    check('יש תלמידים בכל טווחי ההצלחה (≥85 / 70-85 / 55-70 / <55)', band(0.85, 1.01) >= 1 && band(0.7, 0.85) >= 1 && band(0.55, 0.7) >= 1 && band(0, 0.55) >= 1,
      `${band(0.85, 1.01)}/${band(0.7, 0.85)}/${band(0.55, 0.7)}/${band(0, 0.55)}`)
    check('יש תלמיד חלקי (לא סיים את כל ההדמיות)', rows.some((r) => r.completed < 3))
    check('הפרופיל החזק מקבל קושי אישי גבוה מהמתקשה', await (async () => {
      const top = [...perStudent.entries()].sort((x, y) => (avg(y[1].rates) || 0) - (avg(x[1].rates) || 0))
      const best = top[0][0]; const worst = top.filter(([, v]) => v.rates.length)[top.filter(([, v]) => v.rates.length).length - 1][0]
      const lvl = async (id: string) => { const r = await api(A.token, 'GET', '/analytics/student/' + id); return (r.json.profile?.text_level as number) ?? null }
      const [lb, lw] = [await lvl(best), await lvl(worst)]
      console.log(`  text_level חזק=${lb} מתקשה=${lw}`)
      return lb !== null && lw !== null && lb >= lw
    })())

    const trends = await api(A.token, 'GET', `/analytics/trends?metric=overall_success&range=year&entities=${[...perStudent.keys()].slice(0, 3).join(',')}`)
    const trendPts = ((trends.json.series ?? []) as { points: (number | null)[] }[]).flatMap((s) => s.points).filter((p) => p !== null).length
    check('גרף ההתקדמות מקבל נקודות מ-progress_snapshots', trendPts > 0, `points=${trendPts}`)

    /* ── idempotency ── */
    const countSessions = async () => (await supabaseAdmin.from('sessions').select('id', { count: 'exact', head: true }).eq('is_fictitious', true).in('quest_id', state.quests)).count ?? 0
    const s1 = await countSessions()
    const refresh = await api(A.token, 'POST', '/staff/demo/refresh', {})
    const s2 = await countSessions()
    check('רענון חוזר לא יוצר כפילויות', refresh.status === 200 && refresh.json.created === 0 && s1 === s2, `created=${refresh.json.created} sessions ${s1}→${s2}`)

    const add = await api(A.token, 'POST', '/staff/demo/students', { classId, count: 1 })
    check('הוספת תלמיד בודד לכיתת דוגמה', add.status === 201 && add.json.students === 1 && add.json.results?.created > 0, `created=${add.json.results?.created}`)
    const addBad = await api(A.token, 'POST', '/staff/demo/students', { classId: '00000000-0000-4000-8000-000000000000', count: 1 })
    check('הוספה לכיתה שאינה כיתת דוגמה שלי נדחית', addBad.status === 403, 'status=' + addBad.status)

    /* ── can_share לא נפתח ── */
    const { data: me } = await supabaseAdmin.from('users').select('can_share').eq('id', A.userId).single()
    check('can_share של המורה נשאר false', me?.can_share === false)
    const share = await api(A.token, 'POST', `/quests/${state.quests[0]}/share`, {})
    check('מסלול השיתוף עדיין חסום (403)', share.status === 403, 'status=' + share.status)

    if (MODE === 'prepare') {
      fs.writeFileSync(SESSION_OUT, JSON.stringify({
        access_token: A.token, refresh_token: A.refresh, expires_at: A.expiresAt,
        staff: { userId: A.userId, name: 'zz-acc A', role: 'teacher', schoolId: nesher.id, email: A.email, canShare: false },
      }))
      console.log('מוכן לצילום מסך: public/zz-session.json — להריץ --cleanup בסיום')
      return
    }

    /* ── מחיקה ── */
    const realFict = (await supabaseAdmin.from('users').select('id', { count: 'exact', head: true }).eq('is_fictitious', true).neq('school_id', nesher.id)).count ?? 0
    const nonFictBefore = (await supabaseAdmin.from('users').select('id', { count: 'exact', head: true }).eq('school_id', nesher.id).eq('is_fictitious', false)).count ?? 0
    const sessBefore = (await supabaseAdmin.from('sessions').select('id', { count: 'exact', head: true }).eq('is_fictitious', false)).count ?? 0
    const del = await api(A.token, 'DELETE', '/staff/demo/data')
    check('DELETE מחזיר 13 תלמידים וכיתה אחת', del.status === 200 && del.json.students === 13 && del.json.classes === 1, JSON.stringify(del.json))
    const left = (await supabaseAdmin.from('class_members').select('user_id', { count: 'exact', head: true }).eq('class_id', classId)).count ?? 0
    check('הכיתה והחברויות נמחקו', left === 0 && !(await supabaseAdmin.from('classes').select('id').eq('id', classId).maybeSingle()).data)
    const nonFictAfter = (await supabaseAdmin.from('users').select('id', { count: 'exact', head: true }).eq('school_id', nesher.id).eq('is_fictitious', false)).count ?? 0
    const sessAfter = (await supabaseAdmin.from('sessions').select('id', { count: 'exact', head: true }).eq('is_fictitious', false)).count ?? 0
    const realFictAfter = (await supabaseAdmin.from('users').select('id', { count: 'exact', head: true }).eq('is_fictitious', true).neq('school_id', nesher.id)).count ?? 0
    check('משתמשים אמיתיים ובסשנים אמיתיים לא נגעו', nonFictBefore === nonFictAfter && sessBefore === sessAfter && realFict === realFictAfter,
      `users ${nonFictBefore}→${nonFictAfter} sessions ${sessBefore}→${sessAfter}`)
    const stat2 = await api(A.token, 'GET', '/staff/demo/status')
    check('אחרי מחיקה: 0 כיתות ו-0 תלמידים', stat2.json.classes === 0 && stat2.json.students === 0)
    const del2 = await api(A.token, 'DELETE', '/staff/demo/data')
    check('מחיקה חוזרת — no-op', del2.status === 200 && del2.json.students === 0)
  } finally {
    if (MODE === 'full') {
      await cleanup(state)
      fs.rmSync(STATE, { force: true })
      console.log('(נוקו המשתמשים/ההדמיות הזמניים)')
    }
  }
  console.log(failed === 0 ? '\nכל הבדיקות עברו' : `\n${failed} בדיקות נכשלו`)
  if (failed) process.exitCode = 1
}

main().catch((e) => { console.error('FATAL', e instanceof Error ? e.message : e); process.exitCode = 1 })
