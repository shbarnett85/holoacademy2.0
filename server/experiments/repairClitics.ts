import 'dotenv/config'
import { supabaseAdmin } from '../src/lib/supabase.js'
import { lintDetachedClitics, type GameData } from '../src/lib/questSchemas.js'
import { scopedFactFix } from '../src/lib/factCheck.js'

/* תיקון רטרואקטיבי: סריקת כל ההדמיות הרשמיות בלינט הסיומות-התלושות,
   והרצת scopedFactFix (Haiku, שדות טקסט בלבד, משמר ניקוד) רק על מה שדוגל.
   --dry = סריקה בלבד. */
const DRY = process.argv.includes('--dry')

const { data } = await supabaseAdmin
  .from('quests')
  .select('id,title,game_data')
  .eq('is_official', true)

let flagged = 0, fixed = 0
for (const q of (data ?? []) as { id: string; title: string; game_data: GameData }[]) {
  const gd = q.game_data
  if (!gd?.scenes?.length) continue
  const lint = lintDetachedClitics(gd)
  if (lint.length === 0) continue
  flagged++
  console.log(`\n[${q.title.slice(0, 34)}] ${lint.length} דיגולים:`)
  for (const l of lint) console.log(`  · ${l.sceneId}: ${l.problem.slice(0, 90)}`)
  if (DRY) continue

  const fix = await scopedFactFix(gd, lint)
  console.log(`  → תוקנו: ${fix.corrected.join(', ') || '(כלום)'}`)
  /* אימות: הלינט חייב לצאת נקי אחרי התיקון */
  const recheck = lintDetachedClitics(gd)
  if (recheck.length > 0) {
    console.log(`  ⚠ עדיין ${recheck.length} דיגולים אחרי תיקון — לא שומר, דורש מבט ידני`)
    continue
  }
  const { error } = await supabaseAdmin.from('quests').update({ game_data: gd }).eq('id', q.id)
  if (error) console.log(`  ✗ שמירה נכשלה: ${error.message}`)
  else { fixed++; console.log('  ✓ נשמר') }
}
console.log(`\n── סיכום: ${flagged} הדמיות דוגלו, ${fixed} תוקנו ונשמרו ──`)
