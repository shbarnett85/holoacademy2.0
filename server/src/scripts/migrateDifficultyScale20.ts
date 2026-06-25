/* מיגרציית נתונים חד-פעמית: ממפה difficulty_profiles מהסקאלות הישנות
   (text_level 1–16, per_puzzle_level 1–10) לסקאלת 1–20 המאוחדת.

   הרצה (יבש, רק דיווח):   npx tsx src/scripts/migrateDifficultyScale20.ts
   הרצה אמיתית (כתיבה):    RUN=1 npx tsx src/scripts/migrateDifficultyScale20.ts

   **חד-פעמי** — אינו אידמפוטנטי. הרץ פעם אחת אחרי פריסת מיגרציית הסקאלה.
   ערכי דמו אפשר פשוט לזרוע מחדש במקום זה (npm run seed:*). */
import '../env.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { hasDifficultyProfileV2 } from '../lib/activeColumn.js'
import { migrateTextLevel, migratePuzzleLevel, PROFILE_PUZZLE_TYPES } from '../../../src/shared/lib/difficultyCalibration.js'

const WRITE = process.env.RUN === '1'

async function main() {
  if (!(await hasDifficultyProfileV2())) {
    console.log('עמודת per_puzzle_level לא קיימת (לפני מיגרציית הסכמה) — אין מה למפות.')
    return
  }
  const { data, error } = await supabaseAdmin
    .from('difficulty_profiles')
    .select('id, text_level, per_puzzle_level')
  if (error) { console.error('שגיאת טעינה:', error.message); process.exit(1) }
  const rows = (data ?? []) as { id: string; text_level: number | null; per_puzzle_level: Record<string, number> | null }[]
  console.log(`נמצאו ${rows.length} פרופילים. מצב: ${WRITE ? 'כתיבה' : 'יבש (RUN=1 לכתיבה)'}\n`)

  let changed = 0
  for (const r of rows) {
    const oldText = typeof r.text_level === 'number' ? r.text_level : null
    const newText = oldText !== null ? migrateTextLevel(oldText) : null
    const oldPer = r.per_puzzle_level ?? {}
    const newPer: Record<string, number> = {}
    for (const t of PROFILE_PUZZLE_TYPES) {
      const v = oldPer[t]
      if (typeof v === 'number') newPer[t] = migratePuzzleLevel(v)
    }
    const sample = PROFILE_PUZZLE_TYPES.slice(0, 3).map((t) => `${t}:${oldPer[t]}→${newPer[t]}`).join(' ')
    console.log(`· ${r.id.slice(0, 8)} text ${oldText}→${newText} | ${sample}`)

    if (WRITE) {
      const patch: Record<string, unknown> = { per_puzzle_level: { ...oldPer, ...newPer } }
      if (newText !== null) patch.text_level = newText
      const { error: uErr } = await supabaseAdmin.from('difficulty_profiles').update(patch).eq('id', r.id)
      if (uErr) console.error(`  ✗ ${r.id}: ${uErr.message}`)
      else changed++
    }
  }
  console.log(`\n${WRITE ? `עודכנו ${changed}/${rows.length}` : 'יבש — לא נכתב דבר'}.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
