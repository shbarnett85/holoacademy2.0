import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Client } from 'pg'

/* מריץ קובץ SQL מול ה-DB דרך חיבור Postgres ישיר (DDL — לא ניתן דרך PostgREST/service_role).
   דורש DATABASE_URL ב-.env (Supabase → Project Settings → Database → Connection string · URI).
   שימוש: npm run migrate -- <path-to-sql>  (ברירת מחדל: migrations/progress_snapshots.sql) */

/* חיבור Postgres ישיר. עדיפות ל-DATABASE_URL; אחרת שדות בדידים (עמיד לסיסמה עם תווים לא-לטיניים). */
const url = process.env.DATABASE_URL
const host = process.env.SUPABASE_DB_HOST
const password = process.env.SUPABASE_DB_PASSWORD
if (!url && !(host && password)) {
  console.error('✗ חסר DATABASE_URL או SUPABASE_DB_HOST+SUPABASE_DB_PASSWORD ב-.env.')
  process.exit(1)
}

const file = process.argv[2] ?? 'migrations/progress_snapshots.sql'
const sql = readFileSync(resolve(process.cwd(), file), 'utf8')

const client = url
  ? new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  : new Client({ host, port: Number(process.env.SUPABASE_DB_PORT ?? 5432), database: process.env.SUPABASE_DB_NAME ?? 'postgres', user: process.env.SUPABASE_DB_USER ?? 'postgres', password, ssl: { rejectUnauthorized: false } })

async function main() {
  await client.connect()
  console.log(`▶ מריץ ${file} …`)
  await client.query(sql)
  console.log('✓ המיגרציה רצה בהצלחה.')
  await client.end()
}

main().catch(async (e) => {
  console.error('✗ המיגרציה נכשלה:', e instanceof Error ? e.message : e)
  try { await client.end() } catch { /* ignore */ }
  process.exit(1)
})
