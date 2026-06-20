import 'dotenv/config'
import { supabaseAdmin } from '../lib/supabase.js'
import { hasProgressSnapshots, hasHomeroom, hasClassTeachers } from '../lib/activeColumn.js'

/* Seed לסדרת-הזמן של ההתקדמות (גרף "התקדמות"). idempotent + מתויג דמו (session_id=null).
   מזריק snapshots חודשיים ספט→יוני ל-5 תלמידי כיתת הדמו, עם trajectories שמספרים סיפור:
   משה עולה בקריאה 6→8, מאיה צונחת באפריל→מאי. בנוסף מוודא ששחר הוא מחנך הכיתה
   (class_teachers.is_homeroom=true) — אחרת RLS/הסקופ לא יחזיר לו snapshots.
   דורש את מיגרציית אזור 1 (progress_snapshots + is_homeroom). */

const CLASS_CODE = process.env.SNAPSHOT_DEMO_CLASS ?? 'demo-7b'

/* חודשי שנת הלימודים (15 לכל חודש) — תואם את דליי ה-'year' ב-endpoint */
const MONTHS = ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']

/* trajectory רמת-קריאה (text_level) + אחוז-הצלחה (overall) לכל חודש (ספט→יוני), פר תלמיד.
   החודשים: ספט,אוק,נוב,דצמ,ינו,פבר,מרץ,אפר,מאי,יוני (אינדקס מאי=8). */
const TRAJ: Record<string, { text: number[]; ok: number[] }> = {
  'משה':  { text: [6, 6, 6.3, 6.6, 6.9, 7.1, 7.3, 7.6, 7.8, 8], ok: [0.55, 0.58, 0.61, 0.65, 0.69, 0.72, 0.75, 0.79, 0.82, 0.86] }, /* עולה 6→8 */
  'מאיה': { text: [7, 7, 7, 7, 7, 7, 7, 6.8, 6, 5.5], ok: [0.83, 0.84, 0.84, 0.85, 0.84, 0.85, 0.84, 0.78, 0.6, 0.5] }, /* צניחה שמתחילה סביב מאי */
  'יואב': { text: [5, 5.2, 5.5, 5.8, 6, 6.2, 6.5, 6.8, 7, 7.1], ok: [0.48, 0.5, 0.54, 0.57, 0.6, 0.63, 0.66, 0.69, 0.72, 0.74] }, /* מטפס 5→7.1 */
  'נועה': { text: [6.5, 6.6, 6.6, 6.7, 6.8, 6.8, 6.9, 6.9, 7, 7], ok: [0.8, 0.81, 0.82, 0.82, 0.83, 0.84, 0.84, 0.85, 0.85, 0.86] }, /* יציבה 6.5→7 */
  'איתי': { text: [5, 5.2, 4.8, 5.1, 5, 5.2, 4.9, 5.1, 5, 5.1], ok: [0.5, 0.53, 0.47, 0.52, 0.49, 0.54, 0.48, 0.52, 0.5, 0.51] }, /* שטוח/תנודתי ~5 */
}

function perPuzzle(level: number): Record<string, number> {
  const l = Math.max(1, Math.min(10, Math.round(level / 1.6)))
  return { multipleChoice: l, trueFalse: l, finalQuiz: l, wordCompletion: l, memory: l }
}
function rates(ok: number): Record<string, number> {
  return { multipleChoice: ok, trueFalse: Math.min(1, ok + 0.05), finalQuiz: Math.max(0, ok - 0.05) }
}

async function main() {
  if (!(await hasProgressSnapshots())) {
    console.error('✗ טבלת progress_snapshots לא קיימת — הרץ את מיגרציית אזור 1 (סעיף 10ד ב-schema.sql) ב-Supabase SQL Editor, ואז שוב את ה-seed.')
    process.exit(1)
  }

  const { data: cls } = await supabaseAdmin.from('classes').select('id, school_id, teacher_id').eq('url_code', CLASS_CODE).single()
  if (!cls) throw new Error(`כיתת ${CLASS_CODE} לא נמצאה — הרץ npm run seed קודם`)
  const classId = cls.id as string
  const teacherId = (cls as { teacher_id?: string | null }).teacher_id ?? null

  /* ── ודא ששחר (מורה הכיתה) הוא מחנך: class_teachers.is_homeroom=true ── */
  if (teacherId && (await hasClassTeachers()) && (await hasHomeroom())) {
    const { data: link } = await supabaseAdmin.from('class_teachers').select('class_id, teacher_id').eq('class_id', classId).eq('teacher_id', teacherId).maybeSingle()
    if (link) await supabaseAdmin.from('class_teachers').update({ is_homeroom: true }).eq('class_id', classId).eq('teacher_id', teacherId)
    else await supabaseAdmin.from('class_teachers').insert({ class_id: classId, teacher_id: teacherId, subject: 'חינוך', is_homeroom: true })
    console.log('✦ שחר סומן כמחנך הכיתה (is_homeroom=true)')
  } else {
    console.warn('⚠ לא ניתן לסמן מחנך — class_teachers/is_homeroom חסרים (מיגרציה לא הורצה). הגרף יישאר ריק עד לכך.')
  }

  /* ── ודא שכל 5 התלמידים קיימים בכיתה (יוצר את החסרים, למשל "משה") ── */
  const { data: members } = await supabaseAdmin.from('class_members').select('users(id, name, role)').eq('class_id', classId)
  const present = new Map<string, string>()
  for (const m of members ?? []) {
    const u = (Array.isArray(m.users) ? m.users[0] : m.users) as { id: string; name: string; role: string } | null
    if (u && u.role === 'student') present.set(u.name, u.id)
  }
  const studentIds: { id: string; name: string }[] = []
  for (const name of Object.keys(TRAJ)) {
    let id = present.get(name)
    if (!id) {
      const pin = String(1000 + Math.floor(Math.random() * 9000))
      const { data: nu } = await supabaseAdmin.from('users').insert({ name, role: 'student', pin, school_id: cls.school_id }).select('id').single()
      if (!nu) { console.warn('⚠ יצירת התלמיד', name, 'נכשלה'); continue }
      id = nu.id
      await supabaseAdmin.from('class_members').insert({ class_id: classId, user_id: id })
      console.log(`✦ נוצר תלמיד דמו: ${name}`)
    }
    if (!id) continue
    studentIds.push({ id, name })
  }

  /* ── seed snapshots — idempotent: מוחק קודם seeded (session_id null) לתלמידים האלה ── */
  const ids = studentIds.map((s) => s.id)
  await supabaseAdmin.from('progress_snapshots').delete().is('session_id', null).in('student_id', ids)

  const rows: Record<string, unknown>[] = []
  for (const { id, name } of studentIds) {
    const t = TRAJ[name]
    MONTHS.forEach((ym, i) => {
      const text = t.text[i], ok = t.ok[i]
      rows.push({
        student_id: id, class_id: classId, session_id: null,
        taken_at: `${ym}-15T10:00:00Z`,
        text_level: text, per_puzzle_level: perPuzzle(text), success_rates: rates(ok), overall_success: ok,
      })
    })
  }
  const { error } = await supabaseAdmin.from('progress_snapshots').insert(rows)
  if (error) throw new Error('הזרקת snapshots נכשלה: ' + error.message)

  console.log(`\n✦ הוזרקו ${rows.length} snapshots ל-${studentIds.length} תלמידים (${MONTHS.length} חודשים). classId=${classId}`)
  console.log('  הסיפור: משה עולה 6→8 · מאיה צונחת באפריל→מאי.')
}

main().catch((e) => { console.error('שגיאה:', e); process.exit(1) })
