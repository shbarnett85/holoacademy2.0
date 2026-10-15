-- rollback ל-analytics_capture.sql. מסיר רק את מה שנוסף כאן (שתי עמודות nullable ואילוץ).
-- הערה: classes.grade_label נוצרה כאן בהיעדרה; הקוד חוזר ל-classes.name כשהיא חסרה.
BEGIN;
ALTER TABLE classes DROP CONSTRAINT IF EXISTS classes_grade_level_range;
ALTER TABLE classes DROP COLUMN IF EXISTS grade_level;
ALTER TABLE classes DROP COLUMN IF EXISTS grade_label;
COMMIT;
NOTIFY pgrst, 'reload schema';
