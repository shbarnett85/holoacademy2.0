import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import { supabaseAdmin } from '../lib/supabase.js'
import { hasIsActive } from '../lib/activeColumn.js'

/* ── יצירת מנהל עירוני מוגבל (municipal_admin) לארגון פיילוט ────────────────────
   idempotent — הרצה חוזרת לא יוצרת כפילויות; מעדכנת/מחזירה לאותו מצב ומנפיקה
   קישור הגדרת-סיסמה חדש.

   שימוש:
     npm run create-demo-admin -- --email matan.r@nesher.muni.il --org "Nesher Demo" --name "מתן רן"

   אבטחה:
   • שום סיסמה לא נכתבת בקוד/לוג/קובץ. החשבון נוצר עם סיסמה אקראית של 32 בתים שאינה
     נשמרת ואינה מוצגת (כלומר בלתי-שמישה), ומונפק **קישור recovery חד-פעמי** של
     Supabase — המנהל בוחר סיסמה משלו דרך מסך "סיסמה חדשה" (‎/staff/reset‎).
   • הקישור מודפס פעם אחת ל-stdout בלבד. הסקריפט לא שולח מייל.
   • APP_URL (ברירת מחדל https://holoacademy.ai) — חייב להיות ב-Redirect URLs של
     Supabase Auth (Authentication → URL Configuration), אחרת הקישור ינחת ב-Site URL. */

/* ערך מרובה-מילים: ב-PowerShell/‏npm המירכאות נשחקות ("Nesher Demo" → שני טוקנים),
   לכן לוקחים את כל הטוקנים עד הדגל הבא. */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf('--' + name)
  if (i < 0) return undefined
  const parts: string[] = []
  for (let j = i + 1; j < process.argv.length && !process.argv[j].startsWith('--'); j++) parts.push(process.argv[j])
  return parts.length ? parts.join(' ') : undefined
}

async function findAuthUserByEmail(email: string): Promise<{ id: string } | null> {
  /* listUsers מעמד — חשבונות הצוות מעטים; עוברים על עמודים עד שמוצאים */
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error('listUsers נכשל: ' + error.message)
    const hit = data.users.find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase())
    if (hit) return { id: hit.id }
    if (data.users.length < 200) break
  }
  return null
}

async function main() {
  const email = arg('email')?.trim().toLowerCase()
  const orgName = arg('org')?.trim()
  const displayName = arg('name')?.trim() || 'מנהל עירוני'
  if (!email || !orgName) {
    console.error('שימוש: npm run create-demo-admin -- --email <email> --org "<שם ארגון>" [--name "<שם תצוגה>"]')
    process.exit(1)
  }
  const appUrl = (process.env.APP_URL ?? 'https://holoacademy.ai').replace(/\/+$/, '')

  /* 1) הארגון — קיים לפי שם, אחרת נוצר כארגון-פיילוט מוגבל (מוסתר מהרשמה, מורים חדשים
        ללא הרשאת שיתוף כברירת מחדל). */
  let { data: school } = await supabaseAdmin.from('schools').select('id, name').eq('name', orgName).maybeSingle()
  if (!school) {
    const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'org-' + randomBytes(3).toString('hex')
    const { data: created, error } = await supabaseAdmin
      .from('schools')
      .insert({ name: orgName, slug, is_restricted_org: true, teachers_can_share_default: false })
      .select('id, name')
      .single()
    if (error || !created) throw new Error('יצירת הארגון נכשלה: ' + (error?.message ?? ''))
    school = created
    console.log(`✓ נוצר ארגון "${orgName}" (מוגבל: מוסתר מהרשמה, מורים חדשים ללא שיתוף)`)
  } else {
    /* ודא שהארגון מוגדר מוגבל גם אם נוצר ידנית קודם */
    await supabaseAdmin.from('schools').update({ is_restricted_org: true, teachers_can_share_default: false }).eq('id', school.id)
    console.log(`• ארגון "${orgName}" כבר קיים — עודכן למצב מוגבל`)
  }

  /* 2) משתמש auth — קיים או חדש עם סיסמה אקראית בלתי-ידועה */
  let authId: string
  const existing = await findAuthUserByEmail(email)
  if (existing) {
    authId = existing.id
    console.log('• משתמש auth כבר קיים — לא נוצר מחדש')
  } else {
    const unusable = randomBytes(32).toString('base64url') /* לא מודפס ולא נשמר */
    const { data, error } = await supabaseAdmin.auth.admin.createUser({ email, password: unusable, email_confirm: true })
    if (error || !data.user) throw new Error('יצירת משתמש ה-auth נכשלה: ' + (error?.message ?? ''))
    authId = data.user.id
    console.log('✓ נוצר משתמש auth')
  }

  const activeCol = await hasIsActive('users') /* ה-DB עשוי להיות לפני מיגרציית is_active */
  /* 3) רשומת users: municipal_admin בארגון, ללא הרשאת שיתוף, פעיל */
  const { data: row } = await supabaseAdmin.from('users').select('id, role').eq('auth_id', authId).maybeSingle()
  if (row) {
    if (row.role === 'super_admin') throw new Error('המשתמש הזה הוא super_admin — לא משנים תפקיד של מנהל-על')
    await supabaseAdmin
      .from('users')
      .update({ name: displayName, role: 'municipal_admin', school_id: school.id, can_share: false, ...(activeCol ? { is_active: true } : {}) })
      .eq('id', row.id)
    console.log('• רשומת המשתמש עודכנה ל-municipal_admin')
  } else {
    const { error } = await supabaseAdmin
      .from('users')
      .insert({ name: displayName, role: 'municipal_admin', school_id: school.id, auth_id: authId, can_share: false, ...(activeCol ? { is_active: true } : {}) })
    if (error) throw new Error('יצירת רשומת המשתמש נכשלה: ' + error.message)
    console.log('✓ נוצרה רשומת municipal_admin')
  }

  /* 4) קישור הגדרת-סיסמה חד-פעמי (recovery) — מודפס פעם אחת, לא נכתב לשום מקום */
  const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: appUrl + '/staff/reset' },
  })
  if (linkErr || !link?.properties?.action_link) throw new Error('הנפקת קישור ההגדרה נכשלה: ' + (linkErr?.message ?? ''))

  console.log('\n──────────────────────────────────────────────────────────────')
  console.log('קישור הגדרת סיסמה חד-פעמי (הדפסה אחת — העבר/י למנהל בעצמך):')
  console.log(link.properties.action_link)
  console.log('──────────────────────────────────────────────────────────────')
  console.log('• תוקף הקישור קצר (ברירת המחדל של Supabase: שעה) ושמיש פעם אחת.')
  console.log('• לא נשלח מייל. להנפקת קישור חדש — הרץ שוב את הסקריפט (idempotent).')
}

main().catch((e) => {
  console.error('✗', e instanceof Error ? e.message : e)
  process.exit(1)
})
