import 'dotenv/config'
import { supabaseAdmin } from '../src/lib/supabase.js'
const { data } = await supabaseAdmin.from('quests').select('title,created_at').eq('is_official', true).order('created_at', { ascending: false })
for (const q of data ?? []) console.log((q as { created_at: string }).created_at.slice(0, 16), (q as { title: string }).title)
