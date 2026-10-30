/* גבישי הכיתה (CLAUDE.md "תחושת משחק"): שני מספרים בלבד לכיתה — הסכום והיעד — וכמה מהם של התלמיד/ה עצמו/ה.
   · הסכום: הגבישים השלמים של הכיתה בשליחה הזאת, לפי המשחק הטוב ביותר של כל תלמיד/ה.
   · היעד: 3 × מספר התלמידים שקיבלו את השיעור.
   · בלי שמות, ובלי כמה תלמידים סיימו או לא סיימו. סימון "כל הכיתה סגרה" מוחזר רק כשזה קרה; עד אז — שום דבר.
   · ההרשאה (authz): הכיתה נלקחת רק מטוקן התלמיד/ה, ושיעור שלא נשלח לכיתה הזאת לא מחזיר נתון. */
import { hasSessionGems } from './activeColumn.js'
import { mayReadClassGems } from './authz.js'
import { supabaseAdmin } from './supabase.js'
import { classGemTarget, STORY_CLOSE_GEMS } from '../../../src/shared/lib/gemModel.js'

export type ClassGemsResponse =
  | { available: false }
  | { available: true; classGems: number; mine: number; target: number; allClosed: boolean }

export interface ClassGemRow { user_id: string; gems: number | null }

/* טהור: מהשורות לתשובה. שורות של מי שלא ברשימת הכיתה לא נספרות */
export function summarizeClassGems(rows: readonly ClassGemRow[], studentIds: readonly string[], me: string): Extract<ClassGemsResponse, { available: true }> {
  const members = new Set(studentIds)
  const best = new Map<string, number>()
  for (const r of rows) {
    if (!members.has(r.user_id) || typeof r.gems !== 'number') continue
    const cur = best.get(r.user_id)
    if (cur === undefined || r.gems > cur) best.set(r.user_id, r.gems)
  }
  let classGems = 0
  for (const v of best.values()) classGems += v
  const allClosed = studentIds.length > 0 && studentIds.every((id) => (best.get(id) ?? 0) >= STORY_CLOSE_GEMS)
  return { available: true, classGems, mine: best.get(me) ?? 0, target: classGemTarget(studentIds.length), allClosed }
}

async function classStudentIds(classId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin.from('class_members').select('user_id, users(role)').eq('class_id', classId)
  if (error) throw new Error(error.message)
  const out: string[] = []
  for (const m of (data ?? []) as unknown as { user_id: string; users: { role: string } | { role: string }[] | null }[]) {
    const u = Array.isArray(m.users) ? m.users[0] : m.users
    if (u?.role === 'student') out.push(m.user_id)
  }
  return out
}

export async function classGemsFor(student: { studentId: string; classId: string | null }, questId: string): Promise<ClassGemsResponse> {
  if (!student.classId || !(await hasSessionGems())) return { available: false }
  const { data: asg } = await supabaseAdmin.from('assignments').select('class_id').eq('quest_id', questId).eq('class_id', student.classId).limit(1)
  const assignment = ((asg ?? []) as { class_id: string }[])[0] ?? null
  if (!mayReadClassGems(student.classId, assignment)) return { available: false }
  const ids = await classStudentIds(student.classId)
  if (!ids.includes(student.studentId)) return { available: false }
  const { data, error } = await supabaseAdmin.from('sessions').select('user_id, gems').eq('quest_id', questId).in('user_id', ids).not('gems', 'is', null)
  if (error) throw new Error(error.message)
  return summarizeClassGems((data ?? []) as unknown as ClassGemRow[], ids, student.studentId)
}

/* המסע: באילו מהשיעורים כל הכיתה כבר סגרה את הסיפור */
export async function classGemsForLessons(classId: string, questIds: string[]): Promise<Set<string>> {
  const closed = new Set<string>()
  if (questIds.length === 0) return closed
  const ids = await classStudentIds(classId)
  if (ids.length === 0) return closed
  const { data, error } = await supabaseAdmin.from('sessions').select('quest_id, user_id, gems').in('quest_id', questIds).in('user_id', ids).gte('gems', STORY_CLOSE_GEMS)
  if (error) throw new Error(error.message)
  const closedBy = new Map<string, Set<string>>()
  for (const r of (data ?? []) as unknown as { quest_id: string; user_id: string }[]) {
    const s = closedBy.get(r.quest_id) ?? new Set<string>()
    s.add(r.user_id)
    closedBy.set(r.quest_id, s)
  }
  for (const [q, s] of closedBy) if (ids.every((id) => s.has(id))) closed.add(q)
  return closed
}
