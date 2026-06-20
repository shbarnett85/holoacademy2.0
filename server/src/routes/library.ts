import { Router } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabase.js'
import { AppError } from '../middleware/errors.js'
import { requireStaff } from '../middleware/staffAuth.js'
import { hasPublicQuests, hasQuestReports, hasQuestSubject } from '../lib/activeColumn.js'

/* ספרייה ציבורית — כל מורה במערכת רואה הדמיות משותפות, מעתיק אותן לעריכה, ומדווח. */
export const libraryRouter = Router()
libraryRouter.use(requireStaff)

interface PublicScene { puzzle?: { type?: string } }
interface PublicGameData { scenes?: PublicScene[] }

/* סוגי האתגרים הייחודיים בהדמיה */
function puzzleTypes(gd: PublicGameData | null | undefined): string[] {
  const set = new Set<string>()
  for (const s of gd?.scenes ?? []) if (s.puzzle?.type) set.add(s.puzzle.type)
  return [...set]
}

/* GET /api/library — כל ההדמיות הציבוריות (חיפוש לפי כותרת + סינון לפי נושא) */
libraryRouter.get('/', async (req, res, next) => {
  try {
    if (!(await hasPublicQuests())) { res.json({ quests: [] }); return }
    const withSubject = await hasQuestSubject()
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    const subject = typeof req.query.subject === 'string' ? req.query.subject.trim() : ''

    const cols = 'id, title, game_data, created_at, published_at, created_by, original_author_id' + (withSubject ? ', subject' : '')
    let query = supabaseAdmin.from('quests').select(cols).eq('is_public', true).order('published_at', { ascending: false })
    if (q) query = query.ilike('title', `%${q}%`)
    if (subject && withSubject) query = query.eq('subject', subject)
    const { data, error } = await query
    if (error) throw new AppError(500, 'שגיאה בשליפת הספרייה: ' + error.message)

    type Row = { id: string; title: string; game_data?: PublicGameData; created_at: string; published_at: string | null; created_by: string | null; original_author_id: string | null; subject?: string | null }
    const rows = (data ?? []) as unknown as Row[]

    /* שמות היוצרים המקוריים (לקרדיט) */
    const authorIds = [...new Set(rows.map((r) => r.original_author_id ?? r.created_by).filter((x): x is string => !!x))]
    const names = new Map<string, string>()
    if (authorIds.length) {
      const { data: users } = await supabaseAdmin.from('users').select('id, name').in('id', authorIds)
      for (const u of (users ?? []) as { id: string; name: string }[]) names.set(u.id, u.name)
    }

    const quests = rows.map((r) => {
      const authorId = r.original_author_id ?? r.created_by
      return {
        id: r.id,
        title: r.title,
        subject: r.subject ?? null,
        sceneCount: r.game_data?.scenes?.length ?? 0,
        puzzleTypes: puzzleTypes(r.game_data),
        authorName: (authorId && names.get(authorId)) || 'מורה',
        publishedAt: r.published_at ?? r.created_at,
      }
    })
    res.json({ quests })
  } catch (err) {
    next(err)
  }
})

/* POST /api/library/:id/copy — עותק עצמאי לעריכה עבור המורה המבקש (לא נוגע במקור) */
libraryRouter.post('/:id/copy', async (req, res, next) => {
  try {
    if (!(await hasPublicQuests())) throw new AppError(503, 'הספרייה הציבורית עדיין לא זמינה')
    const withSubject = await hasQuestSubject()
    const cols = 'id, title, game_data, is_public, created_by, original_author_id' + (withSubject ? ', subject' : '')
    const { data: src, error } = await supabaseAdmin.from('quests').select(cols).eq('id', req.params.id).single()
    if (error || !src) throw new AppError(404, 'הדמיה לא נמצאה')
    const s = src as unknown as { id: string; title: string; game_data: unknown; is_public?: boolean; created_by: string | null; original_author_id: string | null; subject?: string | null }
    if (!s.is_public) throw new AppError(403, 'ההדמיה אינה ציבורית')

    const insert: Record<string, unknown> = {
      title: s.title,
      game_data: s.game_data,
      status: 'draft',
      created_by: req.staff!.userId,
      is_public: false,
      original_author_id: s.original_author_id ?? s.created_by, /* שמירת קרדיט ליוצר המקורי */
    }
    if (withSubject && s.subject) insert.subject = s.subject
    const { data: created, error: insErr } = await supabaseAdmin.from('quests').insert(insert).select('id, title').single()
    if (insErr || !created) throw new AppError(500, 'שגיאה ביצירת העותק: ' + (insErr?.message ?? ''))
    res.status(201).json({ quest: created })
  } catch (err) {
    next(err)
  }
})

/* POST /api/library/:id/report — דיווח על הדמיה ציבורית (מודרציה בדיעבד) */
const reportSchema = z.object({ reason: z.string().min(3).max(1000) })
libraryRouter.post('/:id/report', async (req, res, next) => {
  try {
    if (!(await hasQuestReports())) throw new AppError(503, 'מערכת הדיווחים עדיין לא זמינה (נדרשת מיגרציה)')
    const parsed = reportSchema.safeParse(req.body)
    if (!parsed.success) throw new AppError(400, 'יש לציין סיבת דיווח (3+ תווים)')
    const { data: quest } = await supabaseAdmin.from('quests').select('id').eq('id', req.params.id).single()
    if (!quest) throw new AppError(404, 'הדמיה לא נמצאה')
    const { error } = await supabaseAdmin.from('quest_reports').insert({
      quest_id: req.params.id, reporter_id: req.staff!.userId, reason: parsed.data.reason.trim(), status: 'open',
    })
    if (error) throw new AppError(500, 'שגיאה בשליחת הדיווח: ' + error.message)
    res.status(201).json({ ok: true })
  } catch (err) {
    next(err)
  }
})
