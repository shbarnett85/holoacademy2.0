import 'dotenv/config'
import { supabaseAdmin } from '../src/lib/supabase.js'
import { lintDetachedClitics, type GameData } from '../src/lib/questSchemas.js'
import { runFactCheck, scopedFactFix } from '../src/lib/factCheck.js'

/* ── מעבר QA מלא על ההדמיות הרשמיות (רץ מקומית, עם הבודק המשופר) ─────────
   לכל הדמיה: לינט דטרמיניסטי + runFactCheck (כולל כיסוי הסיומים החדש
   ודוגמאות הניב-המרוסק/סיומת-תלושה) → scopedFactFix על כל מה שדוגל →
   בדיקה חוזרת → שמירה. --dry = דיווח בלבד. [title-filter] = הדמיה אחת. */
const DRY = process.argv.includes('--dry')
const FILTER = process.argv.filter((a) => !a.startsWith('--')).slice(2)[0]

const { data } = await supabaseAdmin
  .from('quests')
  .select('id,title,game_data')
  .eq('is_official', true)

let checked = 0, flaggedQ = 0, fixedQ = 0
for (const q of (data ?? []) as { id: string; title: string; game_data: GameData }[]) {
  if (FILTER && !q.title.includes(FILTER)) continue
  const gd = q.game_data
  if (!gd?.scenes?.length) continue
  checked++
  const lint = lintDetachedClitics(gd)
  const fc = await runFactCheck(gd)
  const errors = [...lint, ...fc.errors]
  if (errors.length === 0) { console.log(`✓ נקי: ${q.title.slice(0, 34)}`); continue }
  flaggedQ++
  console.log(`\n[${q.title.slice(0, 34)}] ${errors.length} דיגולים (lint=${lint.length}, ai=${fc.errors.length}):`)
  for (const e of errors) console.log(`  · ${e.sceneId ?? '?'}: ${e.problem.slice(0, 100)}`)
  if (DRY) continue

  const fix = await scopedFactFix(gd, errors)
  console.log(`  → תוקנו: ${fix.corrected.join(', ') || '(כלום)'}${fix.reverted.length ? ` · שוחזרו: ${fix.reverted.join(',')}` : ''}`)
  if (lintDetachedClitics(gd).length > 0) { console.log('  ⚠ לינט עדיין מדגל — לא שומר'); continue }
  const { error } = await supabaseAdmin.from('quests').update({ game_data: gd }).eq('id', q.id)
  if (error) console.log(`  ✗ שמירה נכשלה: ${error.message}`)
  else { fixedQ++; console.log('  ✓ נשמר') }
}
console.log(`\n── ${checked} נבדקו · ${flaggedQ} דוגלו · ${fixedQ} תוקנו ונשמרו ──`)
