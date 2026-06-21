-- ============================================================================
-- HoloAcademy — מיגרציית Super Admin
-- ----------------------------------------------------------------------------
-- DDL לא ניתן להרצה דרך service_role/PostgREST. הרץ קובץ זה ב-Supabase SQL Editor
-- (Dashboard → SQL) פעם אחת. בטוח להרצה חוזרת (IF NOT EXISTS / IF EXISTS).
-- ============================================================================

-- 1) הוספת 'super_admin' ל-enum user_role  (super_admin > admin > teacher > student)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin';

-- 2) עמודת is_active — השבתה רכה (soft-disable) במקום מחיקה
ALTER TABLE users   ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_users_is_active   ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_schools_is_active ON schools(is_active);
CREATE INDEX IF NOT EXISTS idx_classes_is_active ON classes(is_active);

-- 3) RLS — סינון מושבתים כברירת מחדל.
-- הערה חשובה: כל גישת ה-DB באפליקציה עוברת דרך השרת עם service_role ש*עוקף* RLS,
-- ולכן האכיפה המעשית של is_active נעשית ב-queries בשרת (ראו staffAuth.ts ו-auth.ts).
-- המדיניות כאן היא הגנת-עומק לגישה ישירה (anon/authenticated). התאם לשמות המדיניות
-- הקיימים אצלך אם יש. הפוליסי הבא מסתיר משתמשים מושבתים מקריאה ציבורית:
DROP POLICY IF EXISTS "users_public_select_active" ON users;
CREATE POLICY "users_public_select_active" ON users
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

-- בתי ספר מושבתים מוסתרים מקריאה ציבורית:
DROP POLICY IF EXISTS "schools_public_select_active" ON schools;
CREATE POLICY "schools_public_select_active" ON schools
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

-- ============================================================================
-- 4) מודל כיתות: גוף קבוע (grade_label) + יחס רבים-לרבים מורים-כיתות
-- ============================================================================

-- 4א) שכבה נוכחית של הכיתה — מתעדכנת בתחילת שנה ("ג3"→"ד3"), אותו id/slug/url_code
ALTER TABLE classes ADD COLUMN IF NOT EXISTS grade_label text;
UPDATE classes SET grade_label = name WHERE grade_label IS NULL;

-- 4ב) טבלת קישור: כיתה ↔ מורה (+ מקצוע). כיתה יכולה לכמה מורים ולהפך.
CREATE TABLE IF NOT EXISTS class_teachers (
  class_id   uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  subject    text NOT NULL DEFAULT '',
  PRIMARY KEY (class_id, teacher_id, subject)
);
CREATE INDEX IF NOT EXISTS idx_class_teachers_teacher ON class_teachers(teacher_id);
CREATE INDEX IF NOT EXISTS idx_class_teachers_class   ON class_teachers(class_id);

-- 4ג) העברת השיוך הקיים (teacher_id יחיד) לטבלת הקישור
INSERT INTO class_teachers (class_id, teacher_id, subject)
  SELECT id, teacher_id, '' FROM classes WHERE teacher_id IS NOT NULL
  ON CONFLICT DO NOTHING;

-- 4ד) הסרת העמודה הישנה. הערה: אם קיימת מדיניות RLS על classes שמשתמשת ב-teacher_id,
--     מחק/עדכן אותה לפני השורה הבאה (ראו 4ה), אחרת ה-DROP ייכשל.
ALTER TABLE classes DROP COLUMN IF EXISTS teacher_id;

-- 4ה) RLS — מורה רואה כיתה אם קיים קישור class_teachers בינו לבינה.
-- (השרת ניגש דרך service_role ועוקף RLS — האכיפה המעשית server-side. זו הגנת-עומק.)
ALTER TABLE class_teachers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "classes_teacher_member" ON classes;
CREATE POLICY "classes_teacher_member" ON classes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM class_teachers ct
      JOIN users u ON u.id = ct.teacher_id
      WHERE ct.class_id = classes.id AND u.auth_id = auth.uid()
    )
  );

-- ============================================================================
-- 5) תיעוד משחק: מספר הקריסטלים שנצברו ב-session (resume + ניתוח)
-- ----------------------------------------------------------------------------
-- טבלאות sessions/events והפונקציה update_difficulty_profile כבר קיימות.
-- העמודה הזו היחידה שחסרה ל-snapshot מלא של ה-resume. הקוד עמיד לחוסר העמודה
-- (hasSessionCrystals ב-activeColumn.ts) — לפניה הקריסטלים פשוט לא נשמרים ב-resume.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS crystals integer NOT NULL DEFAULT 0;

-- מקצוע ההדמיה (לסינון באנליטיקה ובספרייה). הקוד עמיד לחוסר העמודה (hasQuestSubject).
ALTER TABLE quests ADD COLUMN IF NOT EXISTS subject text;

-- ============================================================================
-- 6) אינדקסים לאנליטיקה — שאילתות הדשבורד נשענות על הנתונים המסוכמים
-- ----------------------------------------------------------------------------
-- אנליטיקת מטלה מצרפת sessions לפי (quest_id, user_id) ו-events לפי session_id+type.
CREATE INDEX IF NOT EXISTS idx_sessions_quest_user ON sessions(quest_id, user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user        ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_events_session_type  ON events(session_id, type);
CREATE INDEX IF NOT EXISTS idx_assignments_class    ON assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_difficulty_user      ON difficulty_profiles(user_id);

-- ============================================================================
-- 7) מודל כיול קושי חדש — שיעור הצלחה פר-סוג-אתגר
-- ----------------------------------------------------------------------------
-- מחליף את הלוגיקה הישנה (writing_level/puzzle_difficulty + update_difficulty_profile).
-- הכיול עצמו רץ עכשיו בשרת ב-JS אחרי כל session שהושלם (sessions.ts), לכן הפונקציה
-- update_difficulty_profile כבר לא נקראת (היא גם הייתה באגית — 42803). הקוד עמיד
-- לחוסר העמודות החדשות (hasDifficultyProfileV2) — לפני המיגרציה הפרופיל פשוט לא נשמר.
-- העמודות אדיטיביות (העמודות הישנות נשארות לתאימות לאחור).
ALTER TABLE difficulty_profiles ADD COLUMN IF NOT EXISTS text_level        integer;     -- רמת הטקסט 1-16
ALTER TABLE difficulty_profiles ADD COLUMN IF NOT EXISTS per_puzzle_level  jsonb;       -- רמה 1-10 לכל סוג אתגר
ALTER TABLE difficulty_profiles ADD COLUMN IF NOT EXISTS last_success_rates jsonb;      -- שיעור ההצלחה האחרון פר סוג (היסטוריה לחישוב)
ALTER TABLE difficulty_profiles ADD COLUMN IF NOT EXISTS rolling_tallies    jsonb;      -- אקומולטור מתגלגל {type:{solved,total}} חוצה-סשנים (K=10)
ALTER TABLE difficulty_profiles ADD COLUMN IF NOT EXISTS teacher_overrides  jsonb;      -- עקיפות מורה {dim:{setBy,setAt,value}} — מימדים שמורה קבע ידנית
ALTER TABLE difficulty_profiles ADD COLUMN IF NOT EXISTS calibration_log    jsonb;      -- יומן כיול {dim:{oldVal,newVal,rate?,n?,trigger,timestamp}} — מה השתנה ולמה
ALTER TABLE difficulty_profiles ADD COLUMN IF NOT EXISTS last_avg_scene_ms integer;     -- זמן ממוצע אחרון לסצנה (ms)
ALTER TABLE difficulty_profiles ADD COLUMN IF NOT EXISTS sessions_count    integer NOT NULL DEFAULT 0;
ALTER TABLE difficulty_profiles ADD COLUMN IF NOT EXISTS last_updated      timestamptz;

-- ============================================================================
-- 8) מגדר תלמיד — להתאמה דקדוקית של הפנייה ("את הולכת" / "אתה הולך")
-- ----------------------------------------------------------------------------
-- null = לא מוגדר → פנייה ניטרלית בלשון רבים. הקוד עמיד לחוסר העמודה (hasUserGender).
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender text CHECK (gender IN ('male','female'));

-- ============================================================================
-- 9) ספרייה ציבורית — שיתוף הדמיות בין מורים + מודרציה בדיעבד דרך דיווחים
-- ----------------------------------------------------------------------------
-- שיתוף ללא אישור מראש: is_public=true. עותק לעריכה דרך POST /api/library/:id/copy.
-- הקוד עמיד לחוסר העמודות/הטבלה (hasPublicQuests / hasQuestReports).
ALTER TABLE quests ADD COLUMN IF NOT EXISTS is_public          boolean NOT NULL DEFAULT false;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS published_at       timestamptz;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS original_author_id uuid REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_quests_is_public ON quests(is_public);

-- דיווחים על הדמיות ציבוריות (מודרציה בדיעבד ע"י super_admin)
CREATE TABLE IF NOT EXISTS quest_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id    uuid NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
  reporter_id uuid REFERENCES users(id),
  reason      text NOT NULL,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','dismissed')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quest_reports_status ON quest_reports(status);
CREATE INDEX IF NOT EXISTS idx_quest_reports_quest  ON quest_reports(quest_id);

-- ============================================================================
-- 10) מחנך כיתה (homeroom) — דגל על קשר מורה-כיתה, *לא* רול חדש
-- ----------------------------------------------------------------------------
-- ה-base role נשאר 'teacher'; אין רול 'homeroom' בהיררכיה. מחנך = שורת
-- class_teachers עם is_homeroom=true. מותר כמה מחנכים לכיתה (co-מחנכוּת) —
-- ללא אילוץ ייחודיות. למחנך שתי הרחבות גישת-קריאה (אגרגט בלבד):
--   הרשאה A — תמונת תלמיד חוצת-מקצוע (סאב-טאב "תלמידים"): difficulty_profiles
--     (text_level/per_puzzle_level/דגלים) + סיכומי-הדמיה ב-sessions/events לתלמיד
--     ששייך לכיתה שבה למשתמש is_homeroom=true (דרך class_members).
--   הרשאה B — אנליטיקת הקצאות הכיתה (סאב-טאב "שיעורים"): assignments שהוקצו לכיתה
--     שבה למשתמש is_homeroom=true — גם אם נוצרו ע"י מורה אחר. ה-scoping: ct.class_id
--     = assignments.class_id, ולכן חוזרת רק ההקצאה של *אותה כיתה*, לא תוצאות אותה
--     הדמיה בכיתות אחרות (כל הקצאה היא שורה נפרדת עם class_id משלה).
-- תשובות בודדות ובחירות moralDilemma אינן מאוחסנות בטבלאות האלה ולכן אינן נחשפות
-- בשום מסלול מחנך (events מסכם type/correct/attempts/dwell בלבד; הבחירה ב-moralDilemma
-- לא נשמרת כלל). אגרגט בלבד.

-- 10א) הדגל + אינדקס חלקי לביצועי RLS (רק שורות מחנך)
ALTER TABLE class_teachers ADD COLUMN IF NOT EXISTS is_homeroom boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_class_teachers_homeroom
  ON class_teachers (class_id, teacher_id) WHERE is_homeroom;

-- 10ב) RLS — מדיניות SELECT *נוספת ופרמיסיבית* (לא מחליפה קיימת) למחנך בלבד.
--      מיפוי auth.uid()→מורה זהה לדפוס של classes_teacher_member (סעיף 4ה):
--      class_teachers.teacher_id → users.auth_id = auth.uid(); תלמיד↔כיתה דרך class_members.
--
--      ⚠️ הערת אמת חשובה: בסכמה של הריפו אין מדיניות RLS קיימת על
--      difficulty_profiles/sessions/events (הגדרת הבסיס שלהן נוצרה ב-Supabase מחוץ
--      לריפו). כל גישת האפליקציה עוברת דרך service_role שעוקף RLS — ולכן המדיניות כאן
--      היא הגנת-עומק בלבד ואינה ה-enforcement בפועל. אין כאן מדיניות מורה-מקצועי/
--      admin/super_admin "לשמר": מורה מקצועי פשוט לא מקבל גישה ישירה דרך מסלול זה
--      (אין לו policy), ו-admin/super_admin/השרת ניגשים דרך service_role. **לפני
--      ההרצה ודא ב-Supabase מה מצב ה-RLS/policies הקיים על הטבלאות האלה כדי לא לשבור
--      גישה ישירה שאולי הוגדרה בבסיס.** ה-enforcement הפונקציונלי של תצוגת המחנך
--      ייבנה בשכבת ה-JS בשרת (אזור ה-API הבא), עקבי לשאר המערכת.

ALTER TABLE difficulty_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "difficulty_profiles_homeroom_select" ON difficulty_profiles;
CREATE POLICY "difficulty_profiles_homeroom_select" ON difficulty_profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM class_teachers ct
      JOIN users u         ON u.id = ct.teacher_id
      JOIN class_members cm ON cm.class_id = ct.class_id
      WHERE ct.is_homeroom = true
        AND u.auth_id = auth.uid()
        AND cm.user_id = difficulty_profiles.user_id
    )
  );

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sessions_homeroom_select" ON sessions;
CREATE POLICY "sessions_homeroom_select" ON sessions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM class_teachers ct
      JOIN users u         ON u.id = ct.teacher_id
      JOIN class_members cm ON cm.class_id = ct.class_id
      WHERE ct.is_homeroom = true
        AND u.auth_id = auth.uid()
        AND cm.user_id = sessions.user_id
    )
  );

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "events_homeroom_select" ON events;
CREATE POLICY "events_homeroom_select" ON events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM class_teachers ct
      JOIN users u         ON u.id = ct.teacher_id
      JOIN class_members cm ON cm.class_id = ct.class_id
      WHERE ct.is_homeroom = true
        AND u.auth_id = auth.uid()
        AND cm.user_id = events.user_id
    )
  );

-- 10ג) הרשאה B — אנליטיקת הקצאות הכיתה (סאב-טאב "שיעורים"). מחנך קורא הקצאות
--      שהוקצו לכיתה שהוא מחנך שלה (גם של מורה אחר). ה-scoping מובנה בתנאי
--      ct.class_id = assignments.class_id → חוזרת רק הקצאת *אותה כיתה* (לא אותה הדמיה
--      בכיתות אחרות — שורת assignment נפרדת עם class_id אחר). אגרגט נגזר מ-sessions/events
--      שכבר מכוסים בהרשאה A (אין כאן תשובות בודדות/בחירות moralDilemma).
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "assignments_homeroom_select" ON assignments;
CREATE POLICY "assignments_homeroom_select" ON assignments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM class_teachers ct
      JOIN users u ON u.id = ct.teacher_id
      WHERE ct.is_homeroom = true
        AND u.auth_id = auth.uid()
        AND ct.class_id = assignments.class_id
    )
  );

-- 10ד) progress_snapshots — סדרת-הזמן שמזינה את גרף ההתקדמות (השלמת אזור 1).
--      שורה נכתבת בנתיב session-complete *אחרי* כיול הפרופיל, רק לסשן שנספר
--      (מצב מקרן לא יוצר session כלל → לא נכתב snapshot; אין עמודת is_replay בסכמה).
--      הכתיבה דרך service_role מהשרת. אגרגט בלבד — אין כאן תשובות בודדות/moralDilemma.
CREATE TABLE IF NOT EXISTS progress_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES users(id),
  class_id uuid REFERENCES classes(id),
  session_id uuid REFERENCES sessions(id),
  taken_at timestamptz NOT NULL DEFAULT now(),
  text_level numeric NOT NULL,           -- רמת הטקסט שלאחר הכיול
  per_puzzle_level jsonb NOT NULL,       -- רמה פר-סוג-אתגר שלאחר הכיול
  success_rates jsonb NOT NULL,          -- שיעור הצלחה פר-סוג בסשן זה
  overall_success numeric                -- אחוז הצלחה כולל בסשן (0..1)
);
CREATE INDEX IF NOT EXISTS idx_progress_snapshots_student ON progress_snapshots (student_id, taken_at);
CREATE INDEX IF NOT EXISTS idx_progress_snapshots_class   ON progress_snapshots (class_id, taken_at);

-- 10ה) RLS — הרשאה A על progress_snapshots: מחנך קורא snapshots של תלמיד בכיתה
--      שבה למשתמש is_homeroom=true (אותו מיפוי auth.uid()→מורה→class_members כמו 10ב).
--      מדיניות *נוספת ופרמיסיבית* בלבד — מורה מקצועי/admin/super_admin/service_role לא מושפעים.
ALTER TABLE progress_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "progress_snapshots_homeroom_select" ON progress_snapshots;
CREATE POLICY "progress_snapshots_homeroom_select" ON progress_snapshots
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM class_teachers ct
      JOIN users u          ON u.id = ct.teacher_id
      JOIN class_members cm  ON cm.class_id = ct.class_id
      WHERE ct.is_homeroom = true
        AND u.auth_id = auth.uid()
        AND cm.user_id = progress_snapshots.student_id
    )
  );

-- ============================================================================
-- 11) סיכום פדגוגי — "ד"ר הולו כשכבת פרשנות" (קריאה אנושית מהוסה על הנתונים)
-- ----------------------------------------------------------------------------
-- פלט AI (Sonnet) קצר בעברית על מה שהמערכת מבינה מהנתונים, מוכלל לפי הקשר:
-- תלמיד / כיתה / הקצאה (שיעור). נשמר עם timestamp כדי לא לחייב שוב בכל צפייה,
-- וניתן לעריכת מורה (edited_content) לפני ייצוא. שורה אחת לכל (scope, entity_id);
-- "צור מחדש" עושה upsert. created_by = מי שהפיק. הגישה נאכפת ב-JS בשרת (RLS A/B),
-- לכן אין כאן policies — כל הגישה דרך service_role.
CREATE TABLE IF NOT EXISTS pedagogical_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('student','class','assignment')),
  entity_id uuid NOT NULL,
  content text NOT NULL,          -- הטקסט שנכתב ע"י ד"ר הולו (AI)
  edited_content text,            -- גרסת המורה (אם ערך) — היא שמיוצאת
  model text,
  sample_size int,               -- N הסשנים שעליהם התבסס הניסוח (להוס/שקיפות)
  created_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (scope, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_pedagogical_summaries_entity ON pedagogical_summaries(scope, entity_id);
