-- rollback ל-ai_summaries.sql. מסיר רק את הטבלה החדשה (והאינדקסים שלה); pedagogical_summaries והשאר לא נגעו.
-- שימו לב: מוחק את כל הסיכומים השמורים. הקוד עמיד לחסרונה (hasAiSummaries) — הסיכום פשוט מוצג בלי לשמור.
BEGIN;
DROP INDEX IF EXISTS idx_ai_summaries_viewer;
DROP INDEX IF EXISTS idx_ai_summaries_entity;
DROP TABLE IF EXISTS ai_summaries;
COMMIT;
NOTIFY pgrst, 'reload schema';
