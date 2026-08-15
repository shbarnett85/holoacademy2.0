import 'dotenv/config'
import { supabaseAdmin } from '../src/lib/supabase.js'

/* איתור שגיאות לשוניות מכניות בהדמיות האחרונות — כולל טקסט מנוקד
   (סימני ניקוד ֑-ׇ עשויים לשבת בין האותיות). */
const { data } = await supabaseAdmin
  .from('quests')
  .select('id,title,game_data,created_at')
  .order('created_at', { ascending: false })
  .limit(40)

const NK = '[\\u0591-\\u05C7]*'
const patterns: [string, RegExp][] = [
  ['של כם (מפוצל)', new RegExp(`של${NK} כ${NK}ם`, 'g')],
  ['שתחוסכו (ו׳ עודפת)', new RegExp(`שתח${NK}ו${NK}ס${NK}כ`, 'g')],
  ['סיומת כם- מנותקת', new RegExp(`[א-ת]${NK} כ${NK}ם(?![א-ת])`, 'g')],
]

for (const q of (data ?? []) as { id: string; title: string; game_data: unknown }[]) {
  const s = JSON.stringify(q.game_data)
  for (const [name, re] of patterns) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    let count = 0
    while ((m = re.exec(s)) && count < 3) {
      count++
      const ctx = s.slice(Math.max(0, m.index - 80), m.index + 80).replace(/\\n/g, ' ')
      const hasNikud = /[֑-ׇ]/.test(ctx)
      console.log(`[${q.title.slice(0, 26)}] ${name} | ניקוד בסביבה=${hasNikud}`)
      console.log('   ...' + ctx + '...\n')
    }
  }
}
console.log('scan done')
