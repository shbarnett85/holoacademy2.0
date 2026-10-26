-- שחזור lesson_summary_data.sql. מוחק את הנתונים שנאספו בעמודות האלה.
ALTER TABLE answers  DROP COLUMN IF EXISTS level_at_play;
ALTER TABLE answers  DROP COLUMN IF EXISTS level_dimension;
ALTER TABLE sessions DROP COLUMN IF EXISTS last_seen_at;
ALTER TABLE sessions DROP COLUMN IF EXISTS live;
NOTIFY pgrst, 'reload schema';
