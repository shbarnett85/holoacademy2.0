import 'dotenv/config'
import { supabaseAdmin } from '../src/lib/supabase.js'

/* QA מהיר להדמיה רשמית לפי כותרת — מדדי שלמות התוכן אחרי rewrite. */
const title = process.argv[2]
const { data } = await supabaseAdmin
  .from('quests')
  .select('id,title,is_official,is_public,game_data,grade_min,grade_max')
  .eq('title', title).eq('is_official', true).limit(1)
const q = data?.[0] as { id: string; is_official: boolean; is_public: boolean; grade_min: number; grade_max: number; game_data: Record<string, unknown> } | undefined
if (!q) { console.log('not found'); process.exit(1) }
const gd = q.game_data as {
  scenes?: { narrative?: string; drHoloDialog?: string; imageUrl?: string; puzzle?: { type: string; objectiveId?: string } }[]
  endingGood?: { imageUrl?: string }; endingBad?: { imageUrl?: string }
  objectives?: unknown[]; factCheck?: { status?: string; warnings?: unknown[] }
}
const scenes = gd.scenes ?? []
const phrases = ['להסביר את זה בעברית פשוטה', 'דמיינו', 'ספרו לכיתה', 'הנה למה זה חשוב', 'הייתם עושים', 'השורה התחתונה', 'שתזכרו']
console.log(JSON.stringify({
  id: q.id.slice(0, 8), official: q.is_official, pub: q.is_public, grades: q.grade_min + '-' + q.grade_max,
  scenes: scenes.length,
  images: scenes.filter((s) => s.imageUrl).length,
  endingImages: [gd.endingGood?.imageUrl, gd.endingBad?.imageUrl].filter(Boolean).length,
  puzzles: scenes.filter((s) => s.puzzle).map((s) => s.puzzle!.type),
  objectives: (gd.objectives ?? []).length,
  taggedPuzzles: scenes.filter((s) => s.puzzle?.objectiveId).length,
  drHoloDialogs: scenes.filter((s) => s.drHoloDialog).length,
  signaturePhrases: scenes.filter((s) => s.drHoloDialog && phrases.some((p) => s.drHoloDialog!.includes(p))).length,
  factCheck: gd.factCheck?.status, fcWarnings: (gd.factCheck?.warnings ?? []).length,
  narrativeSample: (scenes[1]?.narrative ?? '').slice(0, 110),
}, null, 1))
