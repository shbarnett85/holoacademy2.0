/* תמונה ממוזערת שמורה לשיעור — "ספרייה עם עשרות שיעורים נטענת מהר גם במחשב נייד בית ספרי".
   · המקור: תמונת השיעור (`lessonThumbUrl` — הסצנה השנייה). תמונת סצנה בגודל מלא היא ~120–160KB; הממוזערת (480×360, JPEG) ~25KB.
   · נוצרת **פעם אחת לכל שיעור** (העלאה מכתובת ל-Cloudinary עם חיתוך בעת ההעלאה — אין תלות בספריית תמונות מקומית)
     ונשמרת ב-`quests.thumb_url`, יחד עם כתובת המקור שממנה נוצרה (`thumb_src`). תמונת הסצנה התחלפה — `thumb_src` לא
     תואם והממוזערת נוצרת מחדש (עצלנית, ברקע).
   · עד שהיא נוצרת: שיעור שתמונתו ב-Cloudinary מקבל כתובת מומרת (אותו חיתוך, נשמרת ב-CDN); אחרת — תמונת המקור. הרשימה לא נחסמת.
   · עמיד לפני המיגרציה: בלי העמודות — אין שמירה, והכול חוזר לכתובת המקור/המומרת. */
import { createHash } from 'node:crypto'
import { v2 as cloudinary } from 'cloudinary'
import { hasQuestThumb } from './activeColumn.js'
import { lessonThumbUrl } from './lessonThumb.js'
import { error as logError, info as logInfo } from './log.js'
import { supabaseAdmin } from './supabase.js'

export const THUMB_WIDTH = 480
export const THUMB_HEIGHT = 360
const FOLDER = 'holo-thumbs'
/* כשל ביצירה לא מנוסה שוב לאותו שיעור מיד (למשל מקור לא נגיש) — מנוסה שוב אחרי עשר דקות */
const RETRY_AFTER_MS = 10 * 60 * 1000
const CONCURRENCY = 2
const MAX_QUEUE = 300

/* ── טהור ── */

/* מזהה יציב לקובץ: שיעור + גיבוב של המקור — מקור חדש = קובץ חדש (גם ה-CDN לא מגיש תמונה ישנה) */
export function thumbPublicId(questId: string, src: string): string {
  return `${questId}-${createHash('sha1').update(src).digest('hex').slice(0, 8)}`
}

/* תמונה שכבר ב-Cloudinary: אותה תמונה בחיתוך ממוזער, בלי לחכות ליצירה. אחרת — המקור כמו שהוא */
export function fastThumbUrl(src: string): string {
  const m = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(v\d+\/.+)$/.exec(src)
  return m ? `${m[1]}c_fill,g_auto,w_${THUMB_WIDTH},h_${THUMB_HEIGHT},f_auto,q_auto/${m[2]}` : src
}

export interface StoredThumb { url: string | null; src: string | null }

/* החלטה אחת: איזו כתובת מציגים, והאם צריך ליצור ממוזערת */
export function resolveThumb(src: string | null, stored: StoredThumb | undefined): { url: string | null; needsGeneration: boolean } {
  if (!src) return { url: null, needsGeneration: false }
  if (stored?.url && stored.src === src) return { url: stored.url, needsGeneration: false }
  return { url: fastThumbUrl(src), needsGeneration: true }
}

/* ── IO ── */

export function thumbGenerationEnabled(): boolean {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) return false
  if (process.env.THUMBS === '0') return false
  return !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
}

export async function loadStoredThumbs(ids: string[]): Promise<Map<string, StoredThumb>> {
  const out = new Map<string, StoredThumb>()
  if (ids.length === 0 || !(await hasQuestThumb())) return out
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await supabaseAdmin.from('quests').select('id, thumb_url, thumb_src').in('id', ids.slice(i, i + 100))
    for (const r of (data ?? []) as unknown as { id: string; thumb_url: string | null; thumb_src: string | null }[]) out.set(r.id, { url: r.thumb_url, src: r.thumb_src })
  }
  return out
}

/* יוצר את הממוזערת (העלאה מכתובת עם חיתוך 4:3 סביב החלק המעניין) ושומר ב-DB. מחזיר את הכתובת השמורה */
export async function generateThumb(questId: string, src: string): Promise<string> {
  cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET })
  const up = await cloudinary.uploader.upload(src, {
    folder: FOLDER, public_id: thumbPublicId(questId, src), overwrite: true, resource_type: 'image', format: 'jpg', quality: 'auto:good',
    transformation: [{ width: THUMB_WIDTH, height: THUMB_HEIGHT, crop: 'fill', gravity: 'auto' }],
  })
  if (await hasQuestThumb()) {
    const { error } = await supabaseAdmin.from('quests').update({ thumb_url: up.secure_url, thumb_src: src }).eq('id', questId)
    if (error) throw new Error(`שמירת התמונה הממוזערת: ${error.message}`)
  }
  return up.secure_url
}

/* ── תור ברקע: best-effort, מקבילות 2, בלי כפילויות ── */
interface Job { questId: string; src: string }
const queue: Job[] = []
const queued = new Set<string>()
const failedAt = new Map<string, number>()
let active = 0

function pump(): void {
  while (active < CONCURRENCY && queue.length > 0) {
    const job = queue.shift()!
    active++
    void generateThumb(job.questId, job.src)
      .then(() => { failedAt.delete(job.questId) })
      .catch((e) => { failedAt.set(job.questId, Date.now()); logError(`[thumb] יצירה נכשלה לשיעור ${job.questId}:`, e instanceof Error ? e.message : e) })
      .finally(() => { active--; queued.delete(job.questId); pump() })
  }
}

export function scheduleThumb(questId: string, src: string): void {
  if (!thumbGenerationEnabled() || queued.has(questId)) return
  const failed = failedAt.get(questId)
  if (failed && Date.now() - failed < RETRY_AFTER_MS) return
  if (queue.length >= MAX_QUEUE) return
  queued.add(questId)
  queue.push({ questId, src })
  pump()
}

/* ── לרשימות: כתובת התמונה הממוזערת לכל שיעור (ויוצר ברקע את מה שחסר) ── */
/* שורה שכבר נשלפה עם thumb_url/thumb_src (העמודות ב-select של הרשימה) לא דורשת שאילתה נוספת; שורה בלעדיהן — נשלפת בנפרד */
export const THUMB_COLUMNS = 'thumb_url, thumb_src'

export async function thumbsFor(rows: { id: string; game_data?: unknown; thumb_url?: string | null; thumb_src?: string | null }[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>()
  const srcOf = new Map<string, string | null>()
  for (const r of rows) srcOf.set(r.id, lessonThumbUrl(r.game_data as never))
  const stored = new Map<string, StoredThumb>()
  const missing: string[] = []
  for (const r of rows) {
    if (!srcOf.get(r.id)) continue
    if ('thumb_url' in r) stored.set(r.id, { url: r.thumb_url ?? null, src: r.thumb_src ?? null })
    else missing.push(r.id)
  }
  try { for (const [id, t] of await loadStoredThumbs(missing)) stored.set(id, t) } catch (e) { logError('[thumb] טעינת תמונות שמורות נכשלה:', e instanceof Error ? e.message : e) }
  for (const r of rows) {
    const src = srcOf.get(r.id) ?? null
    const res = resolveThumb(src, stored.get(r.id))
    out.set(r.id, res.url)
    if (res.needsGeneration && src) scheduleThumb(r.id, src)
  }
  return out
}

/* אחרי יצירה/חידוש תמונות: מחכה ליצירה (לא נכשל — עדיין best-effort) */
export async function ensureQuestThumb(questId: string, gameData: unknown): Promise<void> {
  const src = lessonThumbUrl(gameData as never)
  if (!src || !thumbGenerationEnabled()) return
  try {
    const stored = (await loadStoredThumbs([questId])).get(questId)
    if (stored?.url && stored.src === src) return
    await generateThumb(questId, src)
    logInfo(`[thumb] נוצרה תמונה ממוזערת לשיעור ${questId}`)
  } catch (e) {
    logError(`[thumb] יצירה נכשלה לשיעור ${questId}:`, e instanceof Error ? e.message : e)
  }
}

/* אחרי שמירת תמונות חדשות ל-game_data: קורא את ה-game_data העדכני ויוצר ממוזערת אם צריך (fire-and-forget ממי שקורא) */
export async function refreshQuestThumb(questId: string): Promise<void> {
  if (!thumbGenerationEnabled()) return
  const { data } = await supabaseAdmin.from('quests').select('game_data').eq('id', questId).single()
  if (data) await ensureQuestThumb(questId, (data as { game_data: unknown }).game_data)
}
