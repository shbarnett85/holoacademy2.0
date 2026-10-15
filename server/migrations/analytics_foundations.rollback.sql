-- ============================================================================
-- rollback ל-analytics_foundations.sql — הפוך, אידמפוטנטי (IF EXISTS).
-- ⚠ הורס את כל הנתונים שנכתבו לטבלאות החדשות מאז המיגרציה (answers, student_subject_levels,
--   level_history, class_teachers וכו׳). class_teachers לא הייתה קיימת לפני המיגרציה, ולכן נמחקת:
--   הקוד חוזר ל-classes.teacher_id (נשאר שלם). quests.subject (טקסט) לא נגוע.
-- הרצה:  npm run migrate -- migrations/analytics_foundations.rollback.sql
-- ============================================================================

BEGIN;

DROP TABLE IF EXISTS pedagogical_summaries;       -- לא הייתה קיימת לפני
DROP TABLE IF EXISTS data_access_log;
DROP TABLE IF EXISTS analytics_findings;
DROP TABLE IF EXISTS level_history;
DROP TABLE IF EXISTS student_subject_levels;
DROP TABLE IF EXISTS misconception_content_links;
DROP TABLE IF EXISTS curriculum_links;
DROP TABLE IF EXISTS curriculum_nodes;
DROP TABLE IF EXISTS option_tags;
DROP TABLE IF EXISTS misconceptions;
DROP TRIGGER IF EXISTS trg_concepts_namespace ON concepts;
DROP TABLE IF EXISTS concepts;
DROP FUNCTION IF EXISTS concepts_enforce_namespace();
DROP TABLE IF EXISTS moral_choices;
DROP TABLE IF EXISTS answers;

ALTER TABLE progress_snapshots  DROP COLUMN IF EXISTS subject_id;
ALTER TABLE progress_snapshots  DROP COLUMN IF EXISTS is_synthetic;
ALTER TABLE difficulty_profiles DROP COLUMN IF EXISTS teacher_locked;
ALTER TABLE difficulty_profiles DROP COLUMN IF EXISTS is_synthetic;
ALTER TABLE events              DROP COLUMN IF EXISTS is_synthetic;
ALTER TABLE sessions            DROP COLUMN IF EXISTS is_synthetic;

DROP TABLE IF EXISTS class_teachers;

DROP INDEX IF EXISTS idx_quests_subject_id;
ALTER TABLE quests DROP COLUMN IF EXISTS subject_id;
DROP TABLE IF EXISTS subject_legacy_map;
DROP TABLE IF EXISTS subjects;

COMMIT;

NOTIFY pgrst, 'reload schema';
