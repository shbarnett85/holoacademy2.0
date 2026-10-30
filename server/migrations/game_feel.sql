-- מיגרציה: תחושת משחק (שלב J) — גבישים, משחק חוזר, עוצמת אפקטים לכיתה, והמרת סצנות הסיום.
-- תוספתי בלבד. הקוד הישן שרץ על אותו DB משותף לא קורא ולא כותב את העמודות האלה.

-- gem_points: הנקודות שנצברו במשחק (מספר עשרוני, 0.5 לאתגר שהצליח אחרי טעות). gems: גבישים שלמים 0..5.
-- שתיהן נכתבות רק למשחק שהגיע לסוף; יציאה באמצע משאירה אותן ריקות.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS gem_points numeric;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS gems smallint;
-- משחק חוזר: לא נכנס לאנליטיקה, לכיול ולזיהוי הדפוסים. משפר רק את שכבת המשחק.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_replay boolean NOT NULL DEFAULT false;

-- עוצמת האפקטים של הכיתה: gentle / medium / full. NULL = בינוני (ברירת המחדל).
ALTER TABLE classes ADD COLUMN IF NOT EXISTS effects_level text;

-- משחקים קיימים: הגבישים שנשמרו עד היום הם הגבישים של המשחק.
UPDATE sessions SET gems = LEAST(GREATEST(COALESCE(crystals, 0), 0), 5)
 WHERE completed_at IS NOT NULL AND gems IS NULL;

-- משחקים קיימים: כל מה שאחרי ההשלמה הראשונה של אותו תלמיד באותו שיעור הוא משחק חוזר.
UPDATE sessions s SET is_replay = true
  FROM (
    SELECT id, row_number() OVER (PARTITION BY user_id, quest_id ORDER BY completed_at ASC, started_at ASC) AS n
      FROM sessions
     WHERE completed_at IS NOT NULL
  ) ranked
 WHERE s.id = ranked.id AND ranked.n > 1 AND s.is_replay = false;

CREATE INDEX IF NOT EXISTS sessions_quest_user_replay_idx ON sessions (quest_id, user_id, is_replay);

-- הגרסאות הקודמות של סצנות הסיום לפני ההמרה ל"סיפור שנסגר / סיפור פתוח". RLS בלי policies: נגיש רק לשרת.
CREATE TABLE IF NOT EXISTS quest_ending_conversion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id uuid NOT NULL,
  student_id uuid,
  previous_ending_good jsonb,
  previous_ending_bad jsonb,
  converted_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'converted',
  detail jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS quest_ending_conversion_uq ON quest_ending_conversion (quest_id, COALESCE(student_id, '00000000-0000-0000-0000-000000000000'::uuid));
ALTER TABLE quest_ending_conversion ENABLE ROW LEVEL SECURITY;
