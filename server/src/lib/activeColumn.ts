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

/* ── יסודות האנליטיקה (migrations/analytics_foundations.sql) ── */
export async function hasSubjects(): Promise<boolean> {
  return check('__subjects', () => supabaseAdmin.from('subjects').select('id').limit(1))
}
export async function hasQuestSubjectId(): Promise<boolean> {
  return check('__quest_subject_id', () => supabaseAdmin.from('quests').select('subject_id').limit(1))
}
export async function hasSubjectLevels(): Promise<boolean> {
  return check('__subject_levels', () => supabaseAdmin.from('student_subject_levels').select('id').limit(1))
}
export async function hasLevelHistory(): Promise<boolean> {
  return check('__level_history', () => supabaseAdmin.from('level_history').select('id').limit(1))
}
export async function hasDataAccessLog(): Promise<boolean> {
  return check('__data_access_log', () => supabaseAdmin.from('data_access_log').select('id').limit(1))
}
/* דגל is_synthetic על sessions/events/progress_snapshots/difficulty_profiles */
export async function hasSyntheticFlag(): Promise<boolean> {
  return check('__synthetic', () => supabaseAdmin.from('sessions').select('is_synthetic').limit(1))
}
export async function hasClassTeacherSubjectId(): Promise<boolean> {
  return check('__ct_subject_id', () => supabaseAdmin.from('class_teachers').select('subject_id').limit(1))
}
export async function hasProfileLock(): Promise<boolean> {
  return check('__profile_lock', () => supabaseAdmin.from('difficulty_profiles').select('teacher_locked').limit(1))
}

/* האם עמודות הנתונים הפיקטיביים (users/classes/sessions.is_fictitious) קיימות */
export async function hasFictitious(): Promise<boolean> {
  return check('__fictitious', async () => {
    const a = await supabaseAdmin.from('users').select('is_fictitious').limit(1)
    if (a.error) return a
    const b = await supabaseAdmin.from('classes').select('is_fictitious').limit(1)
    if (b.error) return b
    return supabaseAdmin.from('sessions').select('is_fictitious').limit(1)
  })
}

/* האם עמודת users.can_share קיימת (מיגרציית org_permissions) — לפני כן כולם רשאים לשתף */
export async function hasCanShare(): Promise<boolean> {
  return check('__users_can_share', () => supabaseAdmin.from('users').select('can_share').limit(1))
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

/* האם classes.grade_level קיימת — שכבה כמספר 1–12 (migrations/analytics_capture.sql) */
export async function hasGradeLevel(): Promise<boolean> {
  return check('__grade_level', () => supabaseAdmin.from('classes').select('grade_level').limit(1))
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

/* האם עמודות המטא של הספרייה (grade_min/grade_max/is_official) קיימות */
export async function hasQuestGrade(): Promise<boolean> {
  return check('__quest_grade', () => supabaseAdmin.from('quests').select('grade_min').limit(1))
}

/* ── תוצאות (טאב "תוצאות"): טבלאות הפירוט — עמידות אם המיגרציה טרם הורצה ── */
export async function hasAnswersTable(): Promise<boolean> {
  return check('__answers_table', () => supabaseAdmin.from('answers').select('id').limit(1))
}
export async function hasOptionTags(): Promise<boolean> {
  return check('__option_tags', () => supabaseAdmin.from('option_tags').select('id').limit(1))
}
export async function hasMisconceptions(): Promise<boolean> {
  return check('__misconceptions', () => supabaseAdmin.from('misconceptions').select('id').limit(1))
}
export async function hasMisconceptionLinks(): Promise<boolean> {
  return check('__misconception_links', () => supabaseAdmin.from('misconception_content_links').select('quest_id').limit(1))
}
export async function hasMoralChoices(): Promise<boolean> {
  return check('__moral_choices', () => supabaseAdmin.from('moral_choices').select('id').limit(1))
}
