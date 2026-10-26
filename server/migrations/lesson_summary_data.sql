-- מיגרציה (שלב R — "סיכום שיעור"): נתונים חדשים, תוספתיים ו-nullable בלבד. ה-DB משותף עם פרודקשן שמריץ קוד ישן, ולכן אין שינוי שובר.
--
-- 1) answers.level_at_play / level_dimension — הרמה (1-20) שבה התלמיד/ה שיחק/ה את האתגר בפועל: puzzle.difficulty של ה-game_data שהתלמיד קיבל
--    (גרסה אישית = הרמה המכוילת שלו/ה; הדמיית בסיס = רמת המורה ביצירה), והממד = סוג האתגר (מפתח per_puzzle_level). תשובות ישנות: NULL — לא
--    משווים אותן לפי רמה.
-- 2) sessions.last_seen_at / sessions.live — "תצוגה חיה": פעימה כל 30 שניות + סוף כל אתגר (שרת בלבד; הקליינט לא קורא).
--    live = { sceneId, inPuzzle, mistakes, progressAt, lastChallenge: { sceneId, outcome, at } }
ALTER TABLE answers  ADD COLUMN IF NOT EXISTS level_at_play   smallint CHECK (level_at_play IS NULL OR level_at_play BETWEEN 1 AND 20);
ALTER TABLE answers  ADD COLUMN IF NOT EXISTS level_dimension text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_seen_at    timestamptz;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS live            jsonb;
NOTIFY pgrst, 'reload schema';
