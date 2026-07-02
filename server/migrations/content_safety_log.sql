-- מיגרציה: לוג בטיחות תוכן (section 13 ב-schema.sql) — ראה שם להסבר מלא.
CREATE TABLE IF NOT EXISTS content_safety_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id    uuid REFERENCES users(id),
  quest_id      uuid REFERENCES quests(id) ON DELETE SET NULL,
  stage         text NOT NULL CHECK (stage IN ('input','output')),
  category      text NOT NULL,
  input_title   text,
  input_excerpt text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_content_safety_teacher ON content_safety_log(teacher_id, created_at);
CREATE INDEX IF NOT EXISTS idx_content_safety_stage    ON content_safety_log(stage);
