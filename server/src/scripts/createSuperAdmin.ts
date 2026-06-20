import 'dotenv/config'
import { supabaseAdmin } from '../lib/supabase.js'

/* יצירת מנהל-על ראשוני. idempotent — לא יוצר כפול אם כבר קיים.
   קורא אימייל+סיסמה ממשתני סביבה (אל תכניס סיסמאות לקוד):
     SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD
   הרצה: npm run create-superadmin */

async function main() {
  const email = process.env.SUPERADMIN_EMAIL
  const password = process.env.SUPERADMIN_PASSWORD
  if (!email || !password) {
    console.error('חסרים SUPERADMIN_EMAIL ו/או SUPERADMIN_PASSWORD ב-.env')
    process.exit(1)
  }

  /* האם כבר קיים מנהל-על עם האימייל הזה? */
  const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const existingAuth = list?.users.find((u) => u.email === email)

  let authId: string
  if (existingAuth) {
    authId = existingAuth.id
    console.log('משתמש auth כבר קיים — מדלג על יצירה.')
  } else {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true })
    if (error || !data.user) {
      console.error('יצירת משתמש ה-auth נכשלה:', error?.message)
      process.exit(1)
    }
    authId = data.user.id
    console.log('נוצר משתמש auth למנהל-על.')
  }

  /* רשומת users — מנהל-על ללא שיוך לבית ספר */
  const { data: existingRow } = await supabaseAdmin
    .from('users')
    .select('id, role')
    .eq('auth_id', authId)
    .maybeSingle()

  /* לא שולחים is_active כדי שהסקריפט יעבוד גם לפני שעמודת is_active נוספה (ברירת המחדל
     שלה היא true, כך שהרשומה תהיה פעילה ממילא לאחר המיגרציה). */
  if (existingRow) {
    if (existingRow.role !== 'super_admin') {
      await supabaseAdmin.from('users').update({ role: 'super_admin' }).eq('id', existingRow.id)
      console.log('רשומת המשתמש עודכנה ל-super_admin.')
    } else {
      console.log('מנהל-על כבר קיים — אין מה לעשות.')
    }
  } else {
    const { error: insErr } = await supabaseAdmin
      .from('users')
      .insert({ name: 'מנהל-על', role: 'super_admin', school_id: null, auth_id: authId })
    if (insErr) {
      console.error('יצירת רשומת המשתמש נכשלה:', insErr.message)
      process.exit(1)
    }
    console.log('נוצרה רשומת super_admin.')
  }

  console.log(`✦ מנהל-על מוכן: ${email}`)
}

main().catch((err) => {
  console.error('שגיאה:', err)
  process.exit(1)
})
