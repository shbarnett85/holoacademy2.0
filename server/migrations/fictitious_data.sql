-- ── נתוני דוגמה פיקטיביים בארגון הדגמה ───────────────────────────────────────
-- is_fictitious: תלמיד/כיתה/סשן שנוצרו ע"י מנגנון נתוני-הדוגמה (לא אנשים אמיתיים).
--   events / difficulty_profiles / progress_snapshots שייכים דרך user_id/session_id,
--   ולכן המחיקה והבידוד נגזרים מהמשתמש.
-- schools.demo_data_enabled: רק ארגון עם הדגל הזה מורשה ליצור/למחוק נתוני דוגמה —
--   הבדיקה בשרת, ובכל ארגון אחר הפעולה נדחית.
ALTER TABLE users    ADD COLUMN IF NOT EXISTS is_fictitious boolean NOT NULL DEFAULT false;
ALTER TABLE classes  ADD COLUMN IF NOT EXISTS is_fictitious boolean NOT NULL DEFAULT false;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_fictitious boolean NOT NULL DEFAULT false;
ALTER TABLE schools  ADD COLUMN IF NOT EXISTS demo_data_enabled boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_users_fictitious ON users(school_id) WHERE is_fictitious;
CREATE INDEX IF NOT EXISTS idx_sessions_fictitious ON sessions(user_id) WHERE is_fictitious;
