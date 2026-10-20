-- ============================================================================
-- HoloAcademy — סיכום מילולי של ד״ר הולו (שירות server/src/lib/aiSummary, נתיב /api/ai-summary)
-- ----------------------------------------------------------------------------
-- טבלה חדשה בלבד (additive): אין שינוי בטבלאות קיימות, ולכן הקוד הישן (prod) ממשיך לעבוד על אותו DB משותף.
-- pedagogical_summaries (הסיכום הישן) לא נוגעים בה.
--
-- · הסיכום אישי לצופה: UNIQUE לפי (viewer_id, scope, entity_id, subject_code, audience_key) — צופה ב׳ לעולם לא רואה
--   סיכום (או עריכה) של צופה א׳ (תיקון דליפת ה-cache שבנתיב הישן). audience_key = 'full' (מחנך/מנהל-על) או 'subj:<קודי מקצוע ממוינים>'.
-- · scope: student (entity_id=תלמיד) · class (כיתה) · class_subject (כיתה + subject_code) · submission (assignments.id).
-- · paragraphs/edited_text: הפלט המקורי (ללא שמות) ועריכת המורה בנפרד; "כתיבה מחדש" מאפסת edited_text.
-- · input_facts: העובדות האנונימיות שנשלחו ל-AI (בלי שמות/מזהים) — לביקורת ולשחזור; input_hash לזיהוי שינוי קלט.
-- · חוק 12: RLS מופעל **בלי policies** (חסימה מלאה ל-anon/authenticated). כל הגישה דרך service_role בשרת.
-- אידמפוטנטי. rollback: ai_summaries.rollback.sql.
-- הרצה (ידנית, בשיגור):  npm run migrate -- migrations/ai_summaries.sql
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS ai_summaries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id     uuid NOT NULL REFERENCES users(id),
  scope         text NOT NULL CHECK (scope IN ('student','class','class_subject','submission')),
  entity_id     uuid NOT NULL,
  subject_code  text NOT NULL DEFAULT '',
  audience_key  text NOT NULL,
  written_by    text NOT NULL CHECK (written_by IN ('ai','template')),
  paragraphs    jsonb NOT NULL,
  edited_text   text,
  model         text,
  prompt_version text NOT NULL,
  input_hash    text NOT NULL,
  input_facts   jsonb NOT NULL,
  sample_size   int  NOT NULL,
  sample_unit   text NOT NULL CHECK (sample_unit IN ('sessions','students')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (viewer_id, scope, entity_id, subject_code, audience_key)
);

-- חיפוש לפי ישות (בדיקות/ביקורת) ולפי צופה+זמן (תקרה יומית לצופה)
CREATE INDEX IF NOT EXISTS idx_ai_summaries_entity ON ai_summaries (scope, entity_id);
CREATE INDEX IF NOT EXISTS idx_ai_summaries_viewer ON ai_summaries (viewer_id, created_at);

-- חוק 12: חסימה מלאה — בלי policies ל-anon/authenticated
ALTER TABLE ai_summaries ENABLE ROW LEVEL SECURITY;

COMMIT;

NOTIFY pgrst, 'reload schema';
