import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabase.js'
import { requireStaff } from '../middleware/staffAuth.js'

/* מדידת המשפך הוויראלי — אירועים אנונימיים מנקודות המפתח של הלולאה.
   POST ציבורי (המבקרים אנונימיים בהגדרה), whitelist קשיח של שמות אירועים,
   שדות קטומים, best-effort מוחלט (תמיד 200 — אנליטיקה לא מכשילה קליינט).
   הטבלה: migrations/funnel_events.sql (לפני המיגרציה — insert נכשל בשקט). */
export const funnelRouter = Router()

const EVENTS = new Set([
  'showcase_click', 'visitor_play_start', 'visitor_finish',
  'cta_create', 'cta_whatsapp', 'teacher_whatsapp',
])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

funnelRouter.post('/', async (req, res) => {
  try {
    const event = String(req.body?.event ?? '')
    if (!EVENTS.has(event)) { res.status(400).json({ error: 'אירוע לא מוכר' }); return }
    const rawQuest = req.body?.questId
    const quest_id = typeof rawQuest === 'string' && UUID.test(rawQuest) ? rawQuest : null
    const ref = typeof req.body?.ref === 'string' ? req.body.ref.slice(0, 80) : null
    await supabaseAdmin.from('funnel_events').insert({ event, quest_id, ref })
  } catch { /* best-effort */ }
  res.json({ ok: true })
})

/* סיכום למורה/מנהל: ספירה פר-אירוע ב-30 הימים האחרונים + פילוח הדמיות מובילות */
funnelRouter.get('/summary', requireStaff, async (_req, res) => {
  try {
    const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString()
    const { data, error } = await supabaseAdmin
      .from('funnel_events')
      .select('event, quest_id')
      .gte('created_at', since)
      .limit(20000)
    if (error) { res.json({ counts: {}, topQuests: [], notReady: true }); return }
    const counts: Record<string, number> = {}
    const perQuest: Record<string, number> = {}
    for (const r of data ?? []) {
      counts[r.event] = (counts[r.event] ?? 0) + 1
      if (r.quest_id) perQuest[r.quest_id] = (perQuest[r.quest_id] ?? 0) + 1
    }
    const topQuests = Object.entries(perQuest).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([questId, events]) => ({ questId, events }))
    res.json({ sinceDays: 30, counts, topQuests })
  } catch {
    res.json({ counts: {}, topQuests: [], notReady: true })
  }
})
