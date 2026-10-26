-- מיגרציה: המרת המינוח "הדמיה" → "שיעור" בתוכן קיים (CLAUDE.md "מינוח") — גרסאות קודמות + רשימת "לבדיקה".
-- לכל שיעור/וריאציה שהומרו נשמרת הגרסה הקודמת (previous_game_data + previous_title), כך אפשר לשחזר כל אחד בנפרד.
-- סטטוס 'review' = ההמרה לא עברה את הבדיקות; התוכן לא שונה ולא נשמרה גרסה כושלת.
-- תוספתית בלבד (טבלה חדשה): ה-DB משותף עם פרודקשן שמריץ קוד ישן.
CREATE TABLE IF NOT EXISTS quest_term_conversion (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target            text NOT NULL CHECK (target IN ('quest','variant')),
  quest_id          uuid NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
  student_id        uuid REFERENCES users(id) ON DELETE CASCADE,   -- רק לוריאציות
  status            text NOT NULL CHECK (status IN ('converted','review','restored')),
  previous_game_data jsonb,                                         -- רק כש-status='converted'
  previous_title    text,                                           -- רק לשיעור (quests.title) שהוחלף
  issues            jsonb,                                          -- ספירות / סיבת ה-review
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
-- שורה אחת לכל יעד: (quest) או (variant, student)
CREATE UNIQUE INDEX IF NOT EXISTS uq_qtc_quest   ON quest_term_conversion(quest_id) WHERE target = 'quest';
CREATE UNIQUE INDEX IF NOT EXISTS uq_qtc_variant ON quest_term_conversion(quest_id, student_id) WHERE target = 'variant';
CREATE INDEX IF NOT EXISTS idx_qtc_status ON quest_term_conversion(status);
-- RLS (חוק 12): גישה דרך השרת בלבד (service_role עוקף), בלי policies ל-anon/authenticated = חסימה מלאה.
ALTER TABLE quest_term_conversion ENABLE ROW LEVEL SECURITY;
