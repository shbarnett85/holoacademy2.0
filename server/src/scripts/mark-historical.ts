import '../env.js'
import { supabaseAdmin } from '../lib/supabase.js'

/* סימון הדמיות היסטוריות קיימות (שנוצרו לפני שדה isHistorical) */
async function main() {
  const id = process.argv[2]
  if (!id) throw new Error('usage: tsx mark-historical.ts <questId>')
  const { data, error } = await supabaseAdmin.from('quests').select('game_data').eq('id', id).single()
  if (error || !data) throw new Error('quest not found')
  const gameData = data.game_data
  gameData.isHistorical = true
  const { error: upErr } = await supabaseAdmin.from('quests').update({ game_data: gameData }).eq('id', id)
  if (upErr) throw upErr
  console.log('marked historical: ' + id)
}
main().catch((e) => { console.error(e); process.exit(1) })
