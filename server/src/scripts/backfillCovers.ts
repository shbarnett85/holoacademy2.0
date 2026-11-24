/* יוצר תמונת עטיפה (lib/lessonCover.ts) לשיעורים שעוד אין להם: כותב את הפרומפט מתוך השיעור, יוצר את התמונה, שומר אותה
   ב-game_data.cover, ומחדש את התמונה הממוזערת. כל שיעור עולה קריאה קצרה למודל ותמונה אחת (או שתיים, כשהבקרה מצאה טעות).
   ברירת המחדל היא ספירה בלבד: בלי --apply שום דבר לא נוצר ולא נכתב.
   הרצה:  npm run covers:backfill                          (סופר)
          npm run covers:backfill -- --official            (רק שיעורי ההתנסות: רשמיים ומשותפים)
          npm run covers:backfill -- --only <id>[,<id>]    (שיעורים מסוימים)
          npm run covers:backfill -- --limit 5
          npm run covers:backfill -- --redo                (גם שיעורים שכבר יש להם עטיפה: כותב פרומפט חדש ויוצר מחדש)
          npm run covers:backfill -- --official --apply    (יוצר וכותב)
          npm run covers:backfill -- --remove <id>         (מוחק את העטיפה משיעור: חוזר לתמונה של העמוד הראשון) */
import 'dotenv/config'
import { hasQuestGrade } from '../lib/activeColumn.js'
import { refreshQuestThumb } from '../lib/lessonThumbStore.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { produceCover, saveCover } from '../routes/images.js'

const arg = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined }
const apply = process.argv.includes('--apply')
const redo = process.argv.includes('--redo')
const official = process.argv.includes('--official')
const only = arg('--only')?.split(',').map((s) => s.trim()).filter(Boolean)
const limit = Number(arg('--limit') ?? Infinity)
const remove = arg('--remove')

interface Row { id: string; title: string; art_style?: string | null; game_data: { scenes?: unknown[]; cover?: { imagePrompt?: string; imageUrl?: string } } | null }

if (remove) {
  const { data, error } = await supabaseAdmin.from('quests').select('id, title, game_data').eq('id', remove).single()
  if (error || !data) { console.error('השיעור לא נמצא'); process.exit(1) }
  const gd = (data as unknown as Row).game_data
  if (!gd?.cover) { console.log('לשיעור אין עטיפה'); process.exit(0) }
  delete gd.cover
  const { error: upErr } = await supabaseAdmin.from('quests').update({ game_data: gd }).eq('id', remove)
  if (upErr) { console.error(upErr.message); process.exit(1) }
  await refreshQuestThumb(remove).catch(() => undefined)
  console.log('העטיפה נמחקה:', (data as unknown as Row).title)
  process.exit(0)
}

const todo: Row[] = []
let total = 0, has = 0, empty = 0
if (official && !(await hasQuestGrade())) { console.error('העמודה is_official לא קיימת במסד'); process.exit(1) }
for (let from = 0; ; from += 20) {
  let q = supabaseAdmin.from('quests').select('id, title, art_style, game_data')
  if (official) q = q.eq('is_official', true).eq('is_public', true)
  if (only) q = q.in('id', only)
  const { data, error } = await q.order('created_at', { ascending: true }).range(from, from + 19)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as unknown as Row[]
  if (rows.length === 0) break
  for (const r of rows) {
    total++
    if (!r.game_data?.scenes?.length) { empty++; continue }
    if (r.game_data.cover?.imageUrl && !redo) { has++; continue }
    todo.push(r)
  }
}
const batch = todo.slice(0, limit)
console.log(`שיעורים: ${total} | כבר יש עטיפה: ${has} | בלי תוכן: ${empty} | ליצירה: ${todo.length}${batch.length < todo.length ? ` (בהרצה הזאת: ${batch.length})` : ''}`)
if (!apply) {
  for (const r of batch.slice(0, 40)) console.log(`  · ${r.id}  ${r.title}`)
  console.log('ספירה בלבד. ליצירה ולכתיבה: --apply')
  process.exit(0)
}

let ok = 0, failed = 0
for (const r of batch) {
  try {
    /* --redo: פרומפט חדש, ולא זה שנשמר */
    const quest = redo && r.game_data?.cover ? { ...r, game_data: { ...r.game_data, cover: undefined } } : r
    const cover = await produceCover(quest as never, { unique: true })
    const err = await saveCover(r.id, cover)
    if (err) throw new Error(err)
    ok++
    console.log(`✓ ${r.title}\n    ${cover.url}\n    ${cover.prompt}${cover.problems.length ? `\n    לבדיקה: ${cover.problems.join(' | ')}` : ''}`)
  } catch (err) {
    failed++
    console.log(`✗ ${r.title}: ${err instanceof Error ? err.message : String(err)}`)
  }
}
console.log(`נוצרו: ${ok} | נכשלו: ${failed}`)
process.exit(failed ? 1 : 0)
