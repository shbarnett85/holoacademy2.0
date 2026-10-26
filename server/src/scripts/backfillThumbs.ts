/* יוצר את התמונה הממוזערת (480×360) לכל שיעור שעוד אין לו — פעם אחת לכל שיעור, נשמרת ב-quests.thumb_url.
   שיעור ששמורה לו ממוזערת מהמקור הנוכחי — מדולג (idempotent). דורש את migrations/quest_thumbs.sql ואת משתני Cloudinary.
   הרצה:  npm run thumbs:backfill            (יוצר)
          npm run thumbs:backfill -- --dry    (סופר בלבד, בלי העלאה ובלי כתיבה)
          npm run thumbs:backfill -- --limit 20 */
import 'dotenv/config'
import { hasQuestThumb } from '../lib/activeColumn.js'
import { lessonThumbUrl } from '../lib/lessonThumb.js'
import { generateThumb, loadStoredThumbs, thumbGenerationEnabled } from '../lib/lessonThumbStore.js'
import { supabaseAdmin } from '../lib/supabase.js'

const dry = process.argv.includes('--dry')
const limIdx = process.argv.indexOf('--limit')
const limit = limIdx >= 0 ? Number(process.argv[limIdx + 1]) : Infinity
const CONCURRENCY = 3

if (!(await hasQuestThumb())) { console.error('העמודות thumb_url/thumb_src לא קיימות — להריץ קודם: npm run migrate -- migrations/quest_thumbs.sql'); process.exit(1) }
if (!dry && !thumbGenerationEnabled()) { console.error('Cloudinary לא מוגדר (CLOUDINARY_*) או THUMBS=0 — אי אפשר ליצור תמונות ממוזערות'); process.exit(1) }

interface Todo { id: string; title: string; src: string }
const todo: Todo[] = []
let total = 0
let noImage = 0
let alreadyDone = 0
for (let from = 0; ; from += 20) {
  const { data, error } = await supabaseAdmin.from('quests').select('id, title, game_data').order('created_at', { ascending: true }).range(from, from + 19)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as unknown as { id: string; title: string; game_data: unknown }[]
  if (rows.length === 0) break
  const stored = await loadStoredThumbs(rows.map((r) => r.id))
  for (const r of rows) {
    total++
    const src = lessonThumbUrl(r.game_data as never)
    if (!src) { noImage++; continue }
    const st = stored.get(r.id)
    if (st?.url && st.src === src) { alreadyDone++; continue }
    todo.push({ id: r.id, title: r.title, src })
  }
}
const batch = todo.slice(0, Number.isFinite(limit) ? limit : todo.length)
console.log(`סה"כ שיעורים: ${total} · בלי תמונה: ${noImage} · כבר עם ממוזערת: ${alreadyDone} · ליצירה: ${todo.length}${batch.length < todo.length ? ` (הפעם ${batch.length})` : ''}`)
if (dry) process.exit(0)

let done = 0
let failed = 0
let next = 0
const t0 = Date.now()
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (next < batch.length) {
    const job = batch[next++]
    try {
      const url = await generateThumb(job.id, job.src)
      done++
      console.log(`  ✓ ${done + failed}/${batch.length} ${job.title.slice(0, 40)} → ${url.slice(-48)}`)
    } catch (e) {
      failed++
      console.error(`  ✗ ${job.id} ${job.title.slice(0, 40)}: ${e instanceof Error ? e.message : e}`)
    }
  }
}))
console.log(`נוצרו ${done}, נכשלו ${failed}, ${Math.round((Date.now() - t0) / 1000)} שניות`)
process.exit(failed > 0 ? 1 : 0)
