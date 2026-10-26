-- מיגרציה: תאריך יעד לשליחת שיעור (CLAUDE.md "תאריך יעד").
-- תוספתי בלבד: עמודה nullable אחת. הקוד הישן שרץ על אותו DB משותף מתעלם ממנה (לא קורא ולא כותב אותה).
-- (בטבלה כבר קיימת עמודה ישנה `due_date` שלא בשימוש — לא נוגעים בה.)
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS due_at timestamptz;

-- שליחות קיימות: מועד השליחה + 7 ימים, בשעה 23:59 שעון ישראל (מחושב לפי יום ישראלי של created_at,
-- כולל שעון קיץ). רק שורות בלי due_at — ריצה חוזרת לא דורסת תאריך שהמורה שינה.
UPDATE assignments
   SET due_at = ((date_trunc('day', created_at AT TIME ZONE 'Asia/Jerusalem') + interval '7 days 23 hours 59 minutes') AT TIME ZONE 'Asia/Jerusalem')
 WHERE due_at IS NULL;
