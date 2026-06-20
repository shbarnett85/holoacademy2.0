import 'dotenv/config'
import { supabaseAdmin } from '../lib/supabase.js'
import { hasClassTeachers, hasGradeLabel } from '../lib/activeColumn.js'

/* סקריפט seed — נתוני הדגמה. idempotent. */

const STUDENTS = [
  { name: 'נועה', pin: '1234' },
  { name: 'איתי', pin: '5678' },
  { name: 'תמר', pin: '2468' },
  { name: 'יואב', pin: '1357' },
  { name: 'מאיה', pin: '9012' },
  { name: 'דניאל', pin: '3456' },
]

/* פרטי הזדהות הצוות להדגמה */
const TEACHER_EMAIL = 'teacher@demo.com'
const ADMIN_EMAIL = 'admin@demo.com'
const STAFF_PASSWORD = 'demo1234'

/* נתוני הדגמה בסיסיים — מדלג אם בית הספר כבר קיים */
async function seedDemoData() {
  const { data: existing } = await supabaseAdmin
    .from('schools')
    .select('id')
    .eq('slug', 'demo')
    .maybeSingle()

  if (existing) {
    console.log('בית ספר "demo" כבר קיים — מדלג על נתוני הבסיס.')
    return
  }

  const { data: school, error: schoolErr } = await supabaseAdmin
    .from('schools')
    .insert({ name: 'בית ספר הדגמה', slug: 'demo' })
    .select()
    .single()
  if (schoolErr) throw schoolErr

  const { data: teacher, error: teacherErr } = await supabaseAdmin
    .from('users')
    .insert({ name: 'המורה רון', role: 'teacher', school_id: school.id })
    .select()
    .single()
  if (teacherErr) throw teacherErr

  /* כיתה — slug/url_code יציבים; שכבה ב-grade_label; שיוך מורה דרך class_teachers (dual-path) */
  const withGrade = await hasGradeLabel()
  const withCT = await hasClassTeachers()
  const classPayload: Record<string, unknown> = { name: 'ז׳2', slug: '7b', url_code: 'demo-7b', school_id: school.id }
  if (withGrade) classPayload.grade_label = 'ז׳2'
  if (!withCT) classPayload.teacher_id = teacher.id
  const { data: cls, error: classErr } = await supabaseAdmin
    .from('classes')
    .insert(classPayload)
    .select()
    .single()
  if (classErr) throw classErr
  if (withCT) {
    const { error: ctErr } = await supabaseAdmin
      .from('class_teachers')
      .insert({ class_id: cls.id, teacher_id: teacher.id, subject: '' })
    if (ctErr) throw ctErr
  }

  const { data: students, error: studentsErr } = await supabaseAdmin
    .from('users')
    .insert(STUDENTS.map((s) => ({ name: s.name, role: 'student', pin: s.pin, school_id: school.id })))
    .select()
  if (studentsErr) throw studentsErr

  const memberIds = [teacher.id, ...students.map((s) => s.id)]
  const { error: membersErr } = await supabaseAdmin
    .from('class_members')
    .insert(memberIds.map((userId) => ({ class_id: cls.id, user_id: userId })))
  if (membersErr) throw membersErr

  console.log('✦ נתוני בסיס נוצרו:', school.name, '| כיתה:', cls.name, '| קוד:', cls.url_code)
}

/* יוצר משתמש ב-Supabase Auth אם אינו קיים, ומחזיר את ה-id */
async function ensureAuthUser(email: string, password: string): Promise<string> {
  const { data: created } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true })
  if (created?.user) return created.user.id
  /* כבר קיים — מאתרים אותו */
  const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const found = list?.users.find((u) => u.email === email)
  if (found) return found.id
  throw new Error(`לא ניתן להבטיח את משתמש ה-auth ${email}`)
}

/* קישור הזדהות צוות — teacher@demo.com → "המורה רון", admin@demo.com → מנהל הדגמה */
async function seedStaffAuth() {
  const { data: school } = await supabaseAdmin.from('schools').select('id').eq('slug', 'demo').single()
  if (!school) throw new Error('בית ספר demo לא נמצא')

  /* מורה — קישור לרשומת "המורה רון" הקיימת */
  const teacherAuthId = await ensureAuthUser(TEACHER_EMAIL, STAFF_PASSWORD)
  const { data: ron } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('name', 'המורה רון')
    .eq('school_id', school.id)
    .maybeSingle()
  if (ron) {
    await supabaseAdmin.from('users').update({ auth_id: teacherAuthId, role: 'teacher' }).eq('id', ron.id)
  } else {
    await supabaseAdmin.from('users').insert({ name: 'המורה רון', role: 'teacher', school_id: school.id, auth_id: teacherAuthId })
  }

  /* מנהל — רשומת admin (לפי auth_id) */
  const adminAuthId = await ensureAuthUser(ADMIN_EMAIL, STAFF_PASSWORD)
  const { data: adminRow } = await supabaseAdmin.from('users').select('id').eq('auth_id', adminAuthId).maybeSingle()
  if (!adminRow) {
    await supabaseAdmin.from('users').insert({ name: 'מנהל הדגמה', role: 'admin', school_id: school.id, auth_id: adminAuthId })
  }

  console.log('✦ הזדהות צוות מוכנה.')
}

async function main() {
  await seedDemoData()
  await seedStaffAuth()

  console.log('\n✦ Seed הושלם!')
  console.log('\nהזדהות צוות (Supabase Auth):')
  console.log(`  מורה:  ${TEACHER_EMAIL} / ${STAFF_PASSWORD}`)
  console.log(`  מנהל:  ${ADMIN_EMAIL} / ${STAFF_PASSWORD}`)
  console.log('\nכניסת תלמיד (PIN, קוד כיתה demo-7b):')
  for (const s of STUDENTS) console.log(`  ${s.name}: ${s.pin}`)
}

main().catch((err) => {
  console.error('שגיאה ב-seed:', err)
  process.exit(1)
})
