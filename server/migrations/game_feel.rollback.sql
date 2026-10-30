-- rollback ל-game_feel.sql. מוחק רק מה שנוסף. לפני ההרצה יש לשחזר את סצנות הסיום מ-quest_ending_conversion (scripts/openEndingLibrary.ts --restore-all).
DROP TABLE IF EXISTS quest_ending_conversion;
DROP INDEX IF EXISTS sessions_quest_user_replay_idx;
ALTER TABLE classes DROP COLUMN IF EXISTS effects_level;
ALTER TABLE sessions DROP COLUMN IF EXISTS is_replay;
ALTER TABLE sessions DROP COLUMN IF EXISTS gems;
ALTER TABLE sessions DROP COLUMN IF EXISTS gem_points;
