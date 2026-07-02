import { supabaseAdmin } from './supabase.js'

/* בדיקה האם עמודה/טבלה קיימת — cache רק תוצאות חיוביות (true).
   תוצאה שלילית לא נשמרת, כך שאחרי הרצת מיגרציה השרת מתעדכן אוטומטית
   בבקשה הבאה, ללא צורך ב-restart. */
const cache = new Set<string>()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function check(key: string, query: () => PromiseLike<{ error: any }>): Promise<boolean> {
  if (cache.has(key)) return true
  const { error } = await query()
  if (!error) { cache.add(key); return true }
  return false
}

export async function hasIsActive(table: 'users' | 'classes' | 'schools'): Promise<boolean> {
  return check(table, () => supabaseAdmin.from(table).select('is_active').limit(1))
}

/* האם המודל החדש (טבלת class_teachers) כבר קיים — אחרת fallback ל-classes.teacher_id */
export async function hasClassTeachers(): Promise<boolean> {
  return check('__class_teachers', () => supabaseAdmin.from('class_teachers').select('class_id').limit(1))
}

/* האם עמודת class_teachers.is_homeroom קיימת (דגל מחנך כיתה) */
export async function hasHomeroom(): Promise<boolean> {
  return check('__class_teachers_homeroom', () => supabaseAdmin.from('class_teachers').select('is_homeroom').limit(1))
}

/* האם עמודת grade_label קיימת — אחרת משתמשים ב-name כתווית השכבה */
export async function hasGradeLabel(): Promise<boolean> {
  return check('__grade_label', () => supabaseAdmin.from('classes').select('grade_label').limit(1))
}

/* האם עמודת sessions.crystals קיימת */
export async function hasSessionCrystals(): Promise<boolean> {
  return check('__session_crystals', () => supabaseAdmin.from('sessions').select('crystals').limit(1))
}

/* האם עמודת quests.is_public קיימת — ספרייה ציבורית */
export async function hasPublicQuests(): Promise<boolean> {
  return check('__quests_public', () => supabaseAdmin.from('quests').select('is_public').limit(1))
}

/* האם טבלת quest_reports קיימת — דיווחי מודרציה */
export async function hasQuestReports(): Promise<boolean> {
  return check('__quest_reports', () => supabaseAdmin.from('quest_reports').select('id').limit(1))
}

/* האם עמודת users.gender קיימת — מגדר תלמיד להתאמת פנייה */
export async function hasUserGender(): Promise<boolean> {
  return check('__user_gender', () => supabaseAdmin.from('users').select('gender').limit(1))
}

/* האם טבלת content_safety_log קיימת — לוג חסימות שכבת בטיחות התוכן (קלט/פלט) */
export async function hasContentSafetyLog(): Promise<boolean> {
  return check('__content_safety_log', () => supabaseAdmin.from('content_safety_log').select('id').limit(1))
}

/* האם המבנה החדש של difficulty_profiles קיים (per_puzzle_level) */
export async function hasDifficultyProfileV2(): Promise<boolean> {
  return check('__difficulty_v2', () => supabaseAdmin.from('difficulty_profiles').select('per_puzzle_level').limit(1))
}

/* האם טבלת progress_snapshots קיימת — סדרת-הזמן שמזינה את גרף ההתקדמות */
export async function hasProgressSnapshots(): Promise<boolean> {
  return check('__progress_snapshots', () => supabaseAdmin.from('progress_snapshots').select('id').limit(1))
}

/* האם טבלת pedagogical_summaries קיימת — סיכום פדגוגי שמור */
export async function hasPedagogicalSummaries(): Promise<boolean> {
  return check('__pedagogical_summaries', () => supabaseAdmin.from('pedagogical_summaries').select('id').limit(1))
}

/* האם עמודת rolling_tallies קיימת ב-difficulty_profiles — אקומולטור חוצה-סשנים */
export async function hasRollingTallies(): Promise<boolean> {
  return check('__rolling_tallies', () => supabaseAdmin.from('difficulty_profiles').select('rolling_tallies').limit(1))
}

/* האם עמודת teacher_overrides קיימת ב-difficulty_profiles */
export async function hasTeacherOverrides(): Promise<boolean> {
  return check('__teacher_overrides', () => supabaseAdmin.from('difficulty_profiles').select('teacher_overrides').limit(1))
}

/* האם עמודת quests.subject קיימת — מקצוע ההדמיה לסינון */
export async function hasQuestSubject(): Promise<boolean> {
  return check('__quest_subject', () => supabaseAdmin.from('quests').select('subject').limit(1))
}

/* האם טבלת quest_variants קיימת — וריאציות הדמיה פר-תלמיד */
export async function hasQuestVariants(): Promise<boolean> {
  return check('__quest_variants', () => supabaseAdmin.from('quest_variants').select('id').limit(1))
}
