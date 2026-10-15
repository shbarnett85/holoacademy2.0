-- ============================================================================
-- HoloAcademy — שלב 1A: יסודות הנתונים, המקצועות וההרשאות
-- ----------------------------------------------------------------------------
-- אידמפוטנטי (IF NOT EXISTS / ON CONFLICT) וטרנזקציוני. rollback: analytics_foundations.rollback.sql
-- הרצה:  npm run migrate -- migrations/analytics_foundations.sql
-- אחרי ההרצה: NOTIFY pgrst נכלל בסוף הקובץ; השרת מזהה עמודות/טבלאות חדשות לבד
-- (activeColumn.ts שומר רק תוצאות חיוביות) — אתחול שרת מומלץ בכל זאת.
--
-- עקרונות:
--  · כל טבלה חדשה: ENABLE ROW LEVEL SECURITY ובלי שום policy ל-anon/authenticated
--    (חסימה מלאה). הגישה רק דרך השרת (service_role עוקף RLS).
--  · אין שינוי במשמעות שדות קיימים: events.payload (attempts, solveTimeMs…) לא נוגעים.
--  · classes.teacher_id נשאר (תאימות). quests.subject (טקסט) נשאר לצד quests.subject_id.
--  · class_teachers: הטבלה לא הייתה קיימת ב-DB החי (schema.sql §4 מעולם לא הורצה במלואה);
--    כאן נוצרת בצורה תואמת לקוד הקיים (עמודת subject טקסטואלית נשמרת) + subject_id/is_homeroom.
-- ============================================================================

BEGIN;

-- ── 1) מקצועות ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subjects (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text NOT NULL UNIQUE,
  name_he    text NOT NULL,
  sort_order int  NOT NULL DEFAULT 0,
  active     boolean NOT NULL DEFAULT true
);
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;

-- 15 שורות. הרשימה זהה ל-src/shared/lib/subjects.ts (מקור יחיד בקוד; נבדק בטסט).
-- "תנ״ך" באותיות גרשיים עבריות (U+05F4) — כמו המחרוזות הקיימות ב-DB.
INSERT INTO subjects (code, name_he, sort_order) VALUES
  ('hebrew',     'עברית',      1),
  ('history',    'היסטוריה',   2),
  ('math',       'מתמטיקה',    3),
  ('english',    'אנגלית',     4),
  ('science',    'מדעים',      5),
  ('bible',      'תנ״ך',       6),
  ('geography',  'גאוגרפיה',   7),
  ('civics',     'אזרחות',     8),
  ('literature', 'ספרות',      9),
  ('art',        'אמנות',      10),
  ('music',      'מוזיקה',     11),
  ('pe',         'חינוך גופני', 12),
  ('arabic',     'ערבית',      13),
  ('french',     'צרפתית',     14),
  ('other',      'אחר/שונה',   15)
ON CONFLICT (code) DO NOTHING;

-- טבלת מיפוי מפורשת מהמחרוזות ההיסטוריות. מחרוזת שאינה כאן → subject_id נשאר NULL ("לא סווג").
CREATE TABLE IF NOT EXISTS subject_legacy_map (
  legacy_name  text PRIMARY KEY,
  subject_code text NOT NULL REFERENCES subjects(code)
);
ALTER TABLE subject_legacy_map ENABLE ROW LEVEL SECURITY;
INSERT INTO subject_legacy_map (legacy_name, subject_code) VALUES
  ('עברית', 'hebrew'),
  ('היסטוריה', 'history'),
  ('מתמטיקה', 'math'),
  ('אנגלית', 'english'),
  ('מדעים', 'science'),
  ('תנ״ך', 'bible'),
  ('תנ"ך', 'bible'),
  ('תנך', 'bible'),
  ('גאוגרפיה', 'geography'),
  ('אזרחות', 'civics'),
  ('ספרות', 'literature'),
  ('אמנות', 'art'),
  ('מוזיקה', 'music'),
  ('חינוך גופני', 'pe'),
  ('ערבית', 'arabic'),
  ('צרפתית', 'french'),
  ('אחר', 'other'),
  ('אחר/שונה', 'other')
ON CONFLICT (legacy_name) DO NOTHING;

ALTER TABLE quests ADD COLUMN IF NOT EXISTS subject_id uuid REFERENCES subjects(id);
CREATE INDEX IF NOT EXISTS idx_quests_subject_id ON quests(subject_id);

UPDATE quests q
   SET subject_id = s.id
  FROM subject_legacy_map m
  JOIN subjects s ON s.code = m.subject_code
 WHERE q.subject_id IS NULL
   AND q.subject IS NOT NULL
   AND btrim(q.subject) = m.legacy_name;

-- ── 2) מורים, כיתות ומחנכים ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS class_teachers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id    uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id  uuid NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  subject     text NOT NULL DEFAULT '',           -- תווית היסטורית (טקסט חופשי) — נשמרת לתאימות לקוד קיים
  subject_id  uuid REFERENCES subjects(id),       -- NULL = ללא מקצוע מוגדר
  is_homeroom boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- UNIQUE(class_id, teacher_id, subject_id) — כאינדקס עם COALESCE כדי ש-NULL לא יאפשר כפילויות.
-- העמודה הטקסטואלית נכללת כדי שקוד ישן (שכותב subject טקסטואלי בלבד) לא ייתקל בהתנגשות.
CREATE UNIQUE INDEX IF NOT EXISTS uq_class_teachers_link
  ON class_teachers (class_id, teacher_id, COALESCE(subject_id, '00000000-0000-0000-0000-000000000000'::uuid), subject);
CREATE INDEX IF NOT EXISTS idx_class_teachers_teacher ON class_teachers (teacher_id);
CREATE INDEX IF NOT EXISTS idx_class_teachers_class   ON class_teachers (class_id);
CREATE INDEX IF NOT EXISTS idx_class_teachers_homeroom ON class_teachers (class_id, teacher_id) WHERE is_homeroom;
ALTER TABLE class_teachers ENABLE ROW LEVEL SECURITY;

-- מילוי: מורה הכיתה מ-classes.teacher_id → מחנך (subject_id NULL). שומר בדיוק את ההתנהגות
-- הנוכחית (רואה הכול). classes.teacher_id לא נמחק.
INSERT INTO class_teachers (class_id, teacher_id, subject, is_homeroom)
SELECT c.id, c.teacher_id, '', true
  FROM classes c
 WHERE c.teacher_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM class_teachers ct
      WHERE ct.class_id = c.id AND ct.teacher_id = c.teacher_id AND ct.subject_id IS NULL AND ct.subject = ''
   );

-- ── 3) טבלאות האנליטיקה החדשות (נוצרות בלבד; ייכתבו בשלבים הבאים) ─────────────
CREATE TABLE IF NOT EXISTS answers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_event_id    text NOT NULL UNIQUE,              -- אידמפוטנטיות: retry לא מכפיל
  session_id         uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  student_id         uuid NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  class_id           uuid REFERENCES classes(id) ON DELETE SET NULL,
  quest_id           uuid NOT NULL REFERENCES quests(id)   ON DELETE CASCADE,
  variant_id         uuid REFERENCES quest_variants(id) ON DELETE SET NULL,
  scene_id           text NOT NULL,
  item_index         int  NOT NULL DEFAULT 0,           -- שאלה בתוך מבחן סיכום; 0 לאתגר בודד
  puzzle_type        text NOT NULL,
  subject_id         uuid REFERENCES subjects(id),
  selected_option_id text,
  selected_position  int,
  correct_position   int,
  displayed_order    jsonb,
  is_correct         boolean NOT NULL,
  attempt_no         int NOT NULL DEFAULT 1,
  response_ms        int,
  outcome            text NOT NULL CHECK (outcome IN ('correct','wrong','timeout','gave_up','closed')),
  interaction        jsonb,
  schema_version     int NOT NULL DEFAULT 1,
  is_synthetic       boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_answers_student_subject ON answers (student_id, subject_id, created_at);
CREATE INDEX IF NOT EXISTS idx_answers_quest_variant   ON answers (quest_id, variant_id, scene_id);
CREATE INDEX IF NOT EXISTS idx_answers_class_subject   ON answers (class_id, subject_id, created_at);
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;

-- דילמות מוסריות: בכוונה בלי student_id — ניתוח מצטבר בלבד, לעולם לא פרופיל ערכים אישי.
CREATE TABLE IF NOT EXISTS moral_choices (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id   uuid NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES quest_variants(id) ON DELETE SET NULL,
  scene_id   text NOT NULL,
  option_id  text NOT NULL,
  class_id   uuid REFERENCES classes(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_moral_choices_quest ON moral_choices (quest_id, scene_id);
ALTER TABLE moral_choices ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS concepts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES subjects(id),
  key        text NOT NULL UNIQUE,                       -- namespace של המקצוע, למשל math.fractions.common_denominator
  title_he   text NOT NULL,
  status     text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT concepts_key_format CHECK (key ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$')
);
CREATE INDEX IF NOT EXISTS idx_concepts_subject ON concepts (subject_id);
ALTER TABLE concepts ENABLE ROW LEVEL SECURITY;

-- אכיפת namespace: הסגמנט הראשון של key חייב להיות code של המקצוע (אין מיומנויות חוצות מקצועות).
CREATE OR REPLACE FUNCTION concepts_enforce_namespace() RETURNS trigger AS $$
DECLARE subj_code text;
BEGIN
  SELECT code INTO subj_code FROM subjects WHERE id = NEW.subject_id;
  IF subj_code IS NULL OR split_part(NEW.key, '.', 1) <> subj_code THEN
    RAISE EXCEPTION 'concepts.key חייב להתחיל ב-namespace של המקצוע (% ≠ %)', split_part(NEW.key, '.', 1), subj_code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_concepts_namespace ON concepts;
CREATE TRIGGER trg_concepts_namespace BEFORE INSERT OR UPDATE OF key, subject_id ON concepts
  FOR EACH ROW EXECUTE FUNCTION concepts_enforce_namespace();

CREATE TABLE IF NOT EXISTS misconceptions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id     uuid NOT NULL REFERENCES subjects(id),
  concept_id     uuid REFERENCES concepts(id),
  code           text NOT NULL UNIQUE,
  title_he       text NOT NULL,
  description_he text,
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved')),
  source         text,
  approved_by    uuid REFERENCES users(id),
  approved_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_misconceptions_subject ON misconceptions (subject_id, concept_id);
ALTER TABLE misconceptions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS option_tags (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id         uuid NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
  variant_id       uuid REFERENCES quest_variants(id) ON DELETE CASCADE,
  scene_id         text NOT NULL,
  item_index       int  NOT NULL DEFAULT 0,
  option_id        text NOT NULL,
  misconception_id uuid REFERENCES misconceptions(id),
  concept_id       uuid REFERENCES concepts(id),
  tag_source       text NOT NULL CHECK (tag_source IN ('generation','backfill','teacher')),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_option_tags_option
  ON option_tags (quest_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid), scene_id, item_index, option_id);
ALTER TABLE option_tags ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS curriculum_nodes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id     uuid NOT NULL REFERENCES subjects(id),
  parent_id      uuid REFERENCES curriculum_nodes(id),
  grade_from     int,
  grade_to       int,
  code           text,
  title_he       text NOT NULL,
  description_he text,
  source_url     text,
  source_version text,
  status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved')),
  approved_by    uuid REFERENCES users(id),
  approved_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_curriculum_nodes_subject ON curriculum_nodes (subject_id, parent_id);
ALTER TABLE curriculum_nodes ENABLE ROW LEVEL SECURITY;

-- entity_id: objective → '<questId>:<objectiveId>' · puzzle → '<questId>:<sceneId>' · concept → concepts.id
CREATE TABLE IF NOT EXISTS curriculum_links (
  entity_type text NOT NULL CHECK (entity_type IN ('objective','puzzle','concept')),
  entity_id   text NOT NULL,
  node_id     uuid NOT NULL REFERENCES curriculum_nodes(id) ON DELETE CASCADE,
  link_source text NOT NULL DEFAULT 'generation',
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_type, entity_id, node_id)
);
ALTER TABLE curriculum_links ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS misconception_content_links (
  misconception_id uuid NOT NULL REFERENCES misconceptions(id) ON DELETE CASCADE,
  quest_id         uuid NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
  created_by       uuid REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (misconception_id, quest_id)
);
ALTER TABLE misconception_content_links ENABLE ROW LEVEL SECURITY;

-- ── 4) רמות פר-מקצוע + היסטוריית רמות ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_subject_levels (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     uuid NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  subject_id     uuid NOT NULL REFERENCES subjects(id),
  text_level     numeric NOT NULL,
  per_type       jsonb   NOT NULL DEFAULT '{}'::jsonb,   -- רמה 1-20 לכל סוג אתגר
  teacher_locked boolean NOT NULL DEFAULT false,
  is_synthetic   boolean NOT NULL DEFAULT false,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, subject_id)
);
ALTER TABLE student_subject_levels ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS level_history (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES subjects(id),                -- NULL = הפרופיל הגלובלי (הדמיה ללא מקצוע)
  dimension  text NOT NULL,                               -- 'text' או שם סוג אתגר
  old_level  numeric,
  new_level  numeric NOT NULL,
  trigger    text NOT NULL CHECK (trigger IN ('calibration','teacher','seed')),
  session_id uuid REFERENCES sessions(id) ON DELETE SET NULL,
  actor_id   uuid REFERENCES users(id),
  is_synthetic boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_level_history_student ON level_history (student_id, subject_id, created_at);
ALTER TABLE level_history ENABLE ROW LEVEL SECURITY;

-- ── 5) ממצאים, יומן גישה, סיכומים פדגוגיים ──────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics_findings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope           text NOT NULL CHECK (scope IN ('student','class','grade','school')),
  entity_id       uuid NOT NULL,
  subject_id      uuid REFERENCES subjects(id),           -- NULL = רב-מקצועי
  kind            text NOT NULL,
  window_start    timestamptz,
  window_end      timestamptz,
  evidence        jsonb,
  p_value         numeric,
  p_adjusted      numeric,
  effect_size     numeric,
  n               int,
  status          text NOT NULL DEFAULT 'open',
  acknowledged_by uuid REFERENCES users(id),
  is_synthetic    boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_findings_entity ON analytics_findings (scope, entity_id, subject_id, created_at);
ALTER TABLE analytics_findings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS data_access_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id   uuid NOT NULL,
  viewer_role text NOT NULL,
  student_id  uuid,
  scope       text NOT NULL,
  endpoint    text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_access_log_student ON data_access_log (student_id, created_at);
CREATE INDEX IF NOT EXISTS idx_access_log_viewer  ON data_access_log (viewer_id, created_at);
ALTER TABLE data_access_log ENABLE ROW LEVEL SECURITY;

-- schema.sql §11 מעולם לא הורץ חי — נוצרת כאן עם שדות ההוכחה (קלט, מודל, גרסת פרומפט).
CREATE TABLE IF NOT EXISTS pedagogical_summaries (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope          text NOT NULL CHECK (scope IN ('student','class','assignment')),
  entity_id      uuid NOT NULL,
  content        text NOT NULL,
  edited_content text,
  model          text,
  prompt_version text,
  input_data     jsonb,                                   -- הנתונים שהוזנו למודל (ללא שמות)
  sample_size    int,
  created_by     uuid REFERENCES users(id),
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  UNIQUE (scope, entity_id)
);
ALTER TABLE pedagogical_summaries ADD COLUMN IF NOT EXISTS prompt_version text;
ALTER TABLE pedagogical_summaries ADD COLUMN IF NOT EXISTS input_data jsonb;
CREATE INDEX IF NOT EXISTS idx_pedagogical_summaries_entity ON pedagogical_summaries (scope, entity_id);
ALTER TABLE pedagogical_summaries ENABLE ROW LEVEL SECURITY;

-- ── 6) דגל is_synthetic על טבלאות קיימות + עמודות עזר ────────────────────────
ALTER TABLE sessions            ADD COLUMN IF NOT EXISTS is_synthetic boolean NOT NULL DEFAULT false;
ALTER TABLE events              ADD COLUMN IF NOT EXISTS is_synthetic boolean NOT NULL DEFAULT false;
ALTER TABLE progress_snapshots  ADD COLUMN IF NOT EXISTS is_synthetic boolean NOT NULL DEFAULT false;
ALTER TABLE difficulty_profiles ADD COLUMN IF NOT EXISTS is_synthetic boolean NOT NULL DEFAULT false;
ALTER TABLE difficulty_profiles ADD COLUMN IF NOT EXISTS teacher_locked boolean NOT NULL DEFAULT false;
ALTER TABLE progress_snapshots  ADD COLUMN IF NOT EXISTS subject_id uuid REFERENCES subjects(id);

-- מילוי לאחור — רק מה שניתן להוכיח לפי מקור:
--  · demoSim (תלמידי דוגמה): users.is_fictitious / sessions.is_fictitious
--  · seedProgressSnapshots: snapshots עם session_id IS NULL (נכתבים רק ע"י ה-seed)
--  · seedAnalyticsDemo: סשנים של תלמידי הכיתה demo-7b על הדמיית ה-seed (הסקריפט מוחק ובונה מחדש)
UPDATE sessions SET is_synthetic = true
 WHERE is_synthetic = false AND (is_fictitious = true
    OR user_id IN (SELECT id FROM users WHERE is_fictitious = true));

UPDATE sessions s SET is_synthetic = true
 WHERE s.is_synthetic = false
   AND s.quest_id = 'b9ca7497-8e97-4745-a2be-b066acb70afc'::uuid
   AND s.user_id IN (
     SELECT cm.user_id FROM class_members cm JOIN classes c ON c.id = cm.class_id WHERE c.url_code = 'demo-7b'
   );

UPDATE events e SET is_synthetic = true
 WHERE e.is_synthetic = false AND e.session_id IN (SELECT id FROM sessions WHERE is_synthetic = true);

UPDATE progress_snapshots p SET is_synthetic = true
 WHERE p.is_synthetic = false
   AND (p.session_id IS NULL
        OR p.session_id IN (SELECT id FROM sessions WHERE is_synthetic = true)
        OR p.student_id IN (SELECT id FROM users WHERE is_fictitious = true));

UPDATE difficulty_profiles d SET is_synthetic = true
 WHERE d.is_synthetic = false AND d.user_id IN (SELECT id FROM users WHERE is_fictitious = true);

COMMIT;

NOTIFY pgrst, 'reload schema';
