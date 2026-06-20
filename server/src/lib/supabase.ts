import { createClient } from '@supabase/supabase-js'

/* קליינט אדמין — משתמש ב-SERVICE_ROLE_KEY ועוקף RLS. לשימוש בצד שרת בלבד! */
const url = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceRoleKey) {
  console.warn('⚠ חסרים SUPABASE_URL או SUPABASE_SERVICE_ROLE_KEY ב-.env — קריאות DB ייכשלו עד שיוגדרו')
}

/* placeholder מאפשר לשרת לעלות גם בלי מפתחות — הקריאות עצמן ייכשלו עד להגדרה */
export const supabaseAdmin = createClient(
  url || 'http://localhost:54321',
  serviceRoleKey || 'placeholder-key',
  {
    auth: { autoRefreshToken: false, persistSession: false },
  },
)

/* קליינט אנונימי (anon key) — לאימות אימייל+סיסמה של צוות (signInWithPassword).
   ה-anon key הוא ציבורי (אותו מפתח שרץ בדפדפן). */
const anonKey = process.env.SUPABASE_ANON_KEY
export const supabaseAnon = createClient(url || 'http://localhost:54321', anonKey || 'placeholder-key', {
  auth: { autoRefreshToken: false, persistSession: false },
})
