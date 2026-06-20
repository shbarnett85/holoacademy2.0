import { supabaseAdmin } from './supabase.js'

/* בדיקה (וב-cache) האם עמודת is_active קיימת בטבלה — כדי שהניהול יעבוד גם לפני המיגרציה.
   לפני שהעמודה נוספה: הכול נחשב פעיל, ופעולות השבתה/הפעלה מחזירות הודעה ברורה. */
const cache = new Map<string, boolean>()

export async function hasIsActive(table: 'users' | 'classes' | 'schools'): Promise<boolean> {
  const cached = cache.get(table)
  if (cached !== undefined) return cached
  const { error } = await supabaseAdmin.from(table).select('is_active').limit(1)
  const exists = !error
  cache.set(table, exists)
  return exists
}

/* האם המודל החדש (טבלת class_teachers) כבר קיים — אחרת fallback ל-classes.teacher_id */
export async function hasClassTeachers(): Promise<boolean> {
  const cached = cache.get('__class_teachers')
  if (cached !== undefined) return cached
  const { error } = await supabaseAdmin.from('class_teachers').select('class_id').limit(1)
  const exists = !error
  cache.set('__class_teachers', exists)
  return exists
}

/* האם עמודת class_teachers.is_homeroom קיימת (דגל מחנך כיתה) — אחרת אין מחנכים.
   עמיד גם לחוסר טבלת class_teachers עצמה (לפני מיגרציית סעיף 4/10). */
export async function hasHomeroom(): Promise<boolean> {
  const cached = cache.get('__class_teachers_homeroom')
  if (cached !== undefined) return cached
  const { error } = await supabaseAdmin.from('class_teachers').select('is_homeroom').limit(1)
  const exists = !error
  cache.set('__class_teachers_homeroom', exists)
  return exists
}

/* האם עמודת grade_label קיימת — אחרת משתמשים ב-name כתווית השכבה */
export async function hasGradeLabel(): Promise<boolean> {
  const cached = cache.get('__grade_label')
  if (cached !== undefined) return cached
  const { error } = await supabaseAdmin.from('classes').select('grade_label').limit(1)
  const exists = !error
  cache.set('__grade_label', exists)
  return exists
}

/* האם עמודת sessions.crystals קיימת — לשמירת מספר הקריסטלים (resume + ניתוח). אחרת מדלגים. */
export async function hasSessionCrystals(): Promise<boolean> {
  const cached = cache.get('__session_crystals')
  if (cached !== undefined) return cached
  const { error } = await supabaseAdmin.from('sessions').select('crystals').limit(1)
  const exists = !error
  cache.set('__session_crystals', exists)
  return exists
}

/* האם עמודת quests.is_public קיימת — ספרייה ציבורית. אחרת השיתוף מושבת בעדינות. */
export async function hasPublicQuests(): Promise<boolean> {
  const cached = cache.get('__quests_public')
  if (cached !== undefined) return cached
  const { error } = await supabaseAdmin.from('quests').select('is_public').limit(1)
  const exists = !error
  cache.set('__quests_public', exists)
  return exists
}

/* האם טבלת quest_reports קיימת — דיווחי מודרציה. אחרת הדיווח מושבת בעדינות. */
export async function hasQuestReports(): Promise<boolean> {
  const cached = cache.get('__quest_reports')
  if (cached !== undefined) return cached
  const { error } = await supabaseAdmin.from('quest_reports').select('id').limit(1)
  const exists = !error
  cache.set('__quest_reports', exists)
  return exists
}

/* האם עמודת users.gender קיימת — מגדר תלמיד להתאמת פנייה. אחרת מתעלמים (לא מוגדר). */
export async function hasUserGender(): Promise<boolean> {
  const cached = cache.get('__user_gender')
  if (cached !== undefined) return cached
  const { error } = await supabaseAdmin.from('users').select('gender').limit(1)
  const exists = !error
  cache.set('__user_gender', exists)
  return exists
}

/* האם המבנה החדש של difficulty_profiles קיים (per_puzzle_level) — אחרת מדלגים על שמירת הפרופיל. */
export async function hasDifficultyProfileV2(): Promise<boolean> {
  const cached = cache.get('__difficulty_v2')
  if (cached !== undefined) return cached
  const { error } = await supabaseAdmin.from('difficulty_profiles').select('per_puzzle_level').limit(1)
  const exists = !error
  cache.set('__difficulty_v2', exists)
  return exists
}

/* האם טבלת progress_snapshots קיימת — סדרת-הזמן שמזינה את גרף ההתקדמות.
   אחרת לא כותבים snapshot (הסיום עצמו עובד כרגיל). */
export async function hasProgressSnapshots(): Promise<boolean> {
  const cached = cache.get('__progress_snapshots')
  if (cached !== undefined) return cached
  const { error } = await supabaseAdmin.from('progress_snapshots').select('id').limit(1)
  const exists = !error
  cache.set('__progress_snapshots', exists)
  return exists
}

/* האם טבלת pedagogical_summaries קיימת — סיכום פדגוגי שמור. אחרת לא שומרים cache
   (הסיכום עדיין נוצר ומוחזר חי, פשוט לא נשמר/נטען מ-DB עד המיגרציה). */
export async function hasPedagogicalSummaries(): Promise<boolean> {
  const cached = cache.get('__pedagogical_summaries')
  if (cached !== undefined) return cached
  const { error } = await supabaseAdmin.from('pedagogical_summaries').select('id').limit(1)
  const exists = !error
  cache.set('__pedagogical_summaries', exists)
  return exists
}

/* האם עמודת quests.subject קיימת — מקצוע ההדמיה לסינון. אחרת מדלגים. */
export async function hasQuestSubject(): Promise<boolean> {
  const cached = cache.get('__quest_subject')
  if (cached !== undefined) return cached
  const { error } = await supabaseAdmin.from('quests').select('subject').limit(1)
  const exists = !error
  cache.set('__quest_subject', exists)
  return exists
}
