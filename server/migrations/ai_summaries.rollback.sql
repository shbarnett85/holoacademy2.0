-- rollback ל-ai_summaries.sql. מסיר רק את הטבלאות החדשות (והאינדקסים שלהן); pedagogical_summaries והשאר לא נגעו.
-- שימו לב: מוחק את כל הסיכומים השמורים ואת יומן השימוש. הקוד עמיד לחסרונן (store.ts: סכמה חסרה) — הסיכום פשוט מוצג בלי לשמור, והתקרה היומית נספרת בזיכרון.
BEGIN;
DROP INDEX IF EXISTS idx_ai_summary_usage_viewer;
DROP TABLE IF EXISTS ai_summary_usage;
DROP INDEX IF EXISTS idx_ai_summaries_viewer;
DROP INDEX IF EXISTS idx_ai_summaries_entity;
DROP TABLE IF EXISTS ai_summaries;
COMMIT;
NOTIFY pgrst, 'reload schema';
