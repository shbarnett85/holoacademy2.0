-- ── יצירה אנונימית + ניטור עלויות יצירה ──────────────────────────────────────
-- מדיניות: יצירת הדמיות פתוחה לכולם בלי הרשמה; שיתוף לכיתה דורש חשבון.
-- הדמיה אנונימית מזוהה ב-anon_id (עוגיית דפדפן) ועוברת לחשבון בהרשמה (claim).

ALTER TABLE quests ADD COLUMN IF NOT EXISTS anon_id uuid;
CREATE INDEX IF NOT EXISTS idx_quests_anon ON quests(anon_id) WHERE anon_id IS NOT NULL;

-- לוג יצירות — ניטור עלויות (יצירות ליום, אנונימי מול רשום, המרות)
CREATE TABLE IF NOT EXISTS gen_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  event text NOT NULL DEFAULT 'generate',   -- generate | claim
  actor_type text NOT NULL,                 -- anon | staff | guest
  actor_id text NOT NULL,
  ip_hash text,
  quest_id uuid,
  est_cost_agorot int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_gen_log_created ON gen_log(created_at);
CREATE INDEX IF NOT EXISTS idx_gen_log_actor ON gen_log(actor_id);

-- RLS ללא policies = גישה דרך service-role בלבד (השרת)
ALTER TABLE gen_log ENABLE ROW LEVEL SECURITY;
