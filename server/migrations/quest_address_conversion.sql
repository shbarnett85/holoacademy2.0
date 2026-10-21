-- מיגרציה: המרת הפנייה לתלמיד ללשון רבים (CLAUDE.md "פנייה לתלמיד") — גרסאות קודמות + רשימת "לבדיקה".
-- לכל הדמיה/וריאציה שהומרה נשמרת הגרסה הקודמת (previous_game_data), כך אפשר לשחזר כל אחת בנפרד.
-- סטטוס 'review' = ההמרה לא עברה את הבדיקות אחרי ניסיון תיקון אחד; התוכן לא שונה ולא נשמרה גרסה כושלת.
CREATE TABLE IF NOT EXISTS quest_address_conversion (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target            text NOT NULL CHECK (target IN ('quest','variant')),
  quest_id          uuid NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
  student_id        uuid REFERENCES users(id) ON DELETE CASCADE,   -- רק לוריאציות
  status            text NOT NULL CHECK (status IN ('converted','review','restored')),
  previous_game_data jsonb,                                         -- רק כש-status='converted'
  issues            jsonb,                                          -- ספירות / הפרות שנותרו / סיבת ה-review
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
-- שורה אחת לכל יעד: (quest) או (variant, student)
CREATE UNIQUE INDEX IF NOT EXISTS uq_qac_quest   ON quest_address_conversion(quest_id) WHERE target = 'quest';
CREATE UNIQUE INDEX IF NOT EXISTS uq_qac_variant ON quest_address_conversion(quest_id, student_id) WHERE target = 'variant';
CREATE INDEX IF NOT EXISTS idx_qac_status ON quest_address_conversion(status);
-- RLS (חוק 12): גישה דרך השרת בלבד (service_role עוקף), בלי policies ל-anon/authenticated = חסימה מלאה.
ALTER TABLE quest_address_conversion ENABLE ROW LEVEL SECURITY;
