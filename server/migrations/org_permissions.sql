-- ── הרשאות ארגון + דגל שיתוף + ביקורת ───────────────────────────────────────
-- users.can_share: מורה רשאי לשתף/להקצות הדמיות לתלמידים (ברירת מחדל true —
--   כל מורה קיים ממשיך לעבוד בדיוק כמו קודם). נאכף בשרת בלבד.
-- users.created_by / created_at: מי יצר את החשבון ומתי (ביקורת).
-- schools.is_restricted_org: ארגון פיילוט — מוסתר מרשימת ההרשמה הציבורית, והרשמה
--   עצמית אליו חסומה (רק מנהל הארגון/מנהל-על מוסיפים אליו אנשים).
-- schools.teachers_can_share_default: ערך can_share למורים חדשים בארגון.
ALTER TABLE users   ADD COLUMN IF NOT EXISTS can_share  boolean     NOT NULL DEFAULT true;
ALTER TABLE users   ADD COLUMN IF NOT EXISTS created_by uuid        REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users   ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE schools ADD COLUMN IF NOT EXISTS is_restricted_org          boolean NOT NULL DEFAULT false;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS teachers_can_share_default boolean NOT NULL DEFAULT true;

-- רישום נתוני דמו שנזרעו — כדי שאפשר להסיר אותם בנקיות (seed --remove) בלי
-- לגעת בנתונים שנוצרו אחר כך ע"י משתמשים אמיתיים.
CREATE TABLE IF NOT EXISTS demo_seed_registry (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  seed_tag   text NOT NULL,
  table_name text NOT NULL,
  row_id     uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_demo_seed_tag ON demo_seed_registry(seed_tag);
-- RLS ללא policies = גישה דרך service-role בלבד
ALTER TABLE demo_seed_registry ENABLE ROW LEVEL SECURITY;
