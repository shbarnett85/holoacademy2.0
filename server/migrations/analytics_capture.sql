-- ============================================================================
-- HoloAcademy — שלב 1B: לכידת תשובות + שכבת כיתה
-- ----------------------------------------------------------------------------
-- תוספתי בלבד (additive): עמודות nullable חדשות על classes + backfill של נתונים.
-- בלי שינוי שם, בלי מחיקה, בלי NOT NULL על עמודה קיימת → הקוד הישן (prod) ממשיך לעבוד
-- על אותו DB משותף. טבלאות answers / moral_choices כבר נוצרו ב-analytics_foundations.sql.
-- אידמפוטנטי. rollback: analytics_capture.rollback.sql
-- הרצה:  npm run migrate -- migrations/analytics_capture.sql
-- ============================================================================

BEGIN;

-- תווית השכבה/כיתה הנוכחית (הקוד קורא אותה כבר, וחוזר ל-name כשחסרה). schema.sql §4 מעולם לא הורץ חי,
-- ולכן "קידום שכבה" החזיר שגיאה על עמודה חסרה.
ALTER TABLE classes ADD COLUMN IF NOT EXISTS grade_label text;
UPDATE classes SET grade_label = name WHERE grade_label IS NULL;

-- שכבה כמספר 1–12 (א׳=1 … י״ב=12). nullable: כיתות שאי אפשר לגזור להן שכבה נשארות NULL.
ALTER TABLE classes ADD COLUMN IF NOT EXISTS grade_level smallint;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'classes_grade_level_range' AND conrelid = 'classes'::regclass) THEN
    ALTER TABLE classes ADD CONSTRAINT classes_grade_level_range CHECK (grade_level IS NULL OR grade_level BETWEEN 1 AND 12);
  END IF;
END $$;

-- backfill: גזירת השכבה מתחילת השם/התווית ("ז׳3" → 7, "י״א2" → 11, "כיתה ח" → 8). לא מזוהה → נשאר NULL.
WITH c AS (
  SELECT id, btrim(regexp_replace(coalesce(grade_label, name), '^כיתה\s+', '')) AS n
    FROM classes WHERE grade_level IS NULL
)
UPDATE classes
   SET grade_level = CASE
     WHEN c.n ~ '^י[״"׳'']?ב' THEN 12
     WHEN c.n ~ '^י[״"׳'']?א' THEN 11
     WHEN c.n ~ '^י'          THEN 10
     WHEN c.n ~ '^ט'          THEN 9
     WHEN c.n ~ '^ח'          THEN 8
     WHEN c.n ~ '^ז'          THEN 7
     WHEN c.n ~ '^ו'          THEN 6
     WHEN c.n ~ '^ה'          THEN 5
     WHEN c.n ~ '^ד'          THEN 4
     WHEN c.n ~ '^ג'          THEN 3
     WHEN c.n ~ '^ב'          THEN 2
     WHEN c.n ~ '^א'          THEN 1
   END
  FROM c
 WHERE classes.id = c.id;

COMMIT;

NOTIFY pgrst, 'reload schema';
