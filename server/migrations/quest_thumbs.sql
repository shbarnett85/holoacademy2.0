-- מיגרציה: תמונה ממוזערת שמורה לכל שיעור (CLAUDE.md "תמונת השיעור — תמונה ממוזערת").
-- תוספתי בלבד: שתי עמודות nullable. הקוד הישן שרץ על אותו DB משותף מתעלם מהן (לא קורא ולא כותב אותן).
--   thumb_url — כתובת התמונה הממוזערת (480×360, JPEG) שנוצרה פעם אחת ונשמרה;
--   thumb_src — כתובת תמונת הסצנה שממנה נוצרה. כשתמונת הסצנה מתחלפת, thumb_src כבר לא תואם והתמונה הממוזערת נוצרת מחדש.
ALTER TABLE quests ADD COLUMN IF NOT EXISTS thumb_url text;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS thumb_src text;
