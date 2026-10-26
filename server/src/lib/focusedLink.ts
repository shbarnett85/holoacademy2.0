/* ──────────────────────────────────────────────────────────────────────────
   focusedLink — קישור "שיעור ממוקד" לתפיסה השגויה שבגללה נוצר (טבלת misconception_content_links).
   נקרא אחרי יצירת שיעור שהמורה פתחה/פתח מהכפתור "שיעור ממוקד" בסיכום שיעור. אחר כך מסך התוצאות מציג "יש שיעור ממוקד לטעות הזאת" ואת הכפתור "פתיחת השיעור".
   best-effort לגמרי: כשל (טבלה חסרה, תפיסה לא קיימת/לא מאושרת, כפילות) לעולם לא מפיל את היצירה. הרשימה הסגורה: רק תפיסה שקיימת ומאושרת ב-misconceptions.
   ────────────────────────────────────────────────────────────────────────── */
import { hasMisconceptionLinks, hasMisconceptions } from './activeColumn.js'
import { supabaseAdmin } from './supabase.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type FocusedLinkResult = 'linked' | 'exists' | 'skipped'

export async function linkFocusedLesson(misconceptionId: string, questId: string, teacherId: string | null): Promise<FocusedLinkResult> {
  try {
    if (!UUID_RE.test(misconceptionId) || !UUID_RE.test(questId)) return 'skipped'
    if (!(await hasMisconceptions()) || !(await hasMisconceptionLinks())) return 'skipped'
    const m = await supabaseAdmin.from('misconceptions').select('id, status').eq('id', misconceptionId).maybeSingle()
    if (m.error || !m.data || (m.data as { status?: string }).status !== 'approved') return 'skipped'
    const dup = await supabaseAdmin.from('misconception_content_links').select('quest_id').eq('misconception_id', misconceptionId).eq('quest_id', questId).maybeSingle()
    if (dup.data) return 'exists'
    const ins = await supabaseAdmin.from('misconception_content_links').insert({ misconception_id: misconceptionId, quest_id: questId, created_by: teacherId })
    return ins.error ? 'skipped' : 'linked'
  } catch {
    return 'skipped'
  }
}
