-- ============================================================================
-- HoloAcademy — סיכום מילולי של ד״ר הולו (שירות server/src/lib/aiSummary, נתיב /api/ai-summary)
-- ----------------------------------------------------------------------------
-- טבלאות חדשות בלבד (additive): אין שינוי בטבלאות קיימות, ולכן הקוד הישן (prod) ממשיך לעבוד על אותו DB משותף.
-- pedagogical_summaries (הסיכום הישן) לא נוגעים בה.
--
-- · הסיכום אישי לצופה: UNIQUE לפי (viewer_id, scope, entity_id, subject_code, audience_key) — צופה ב׳ לעולם לא רואה
--   סיכום (או עריכה) של צופה א׳ (תיקון דליפת ה-cache שבנתיב הישן). audience_key = 'full' (מחנך/מנהל-על) או 'subj:<קודי מקצוע ממוינים>'
--   (המקצועות שהצופה רואה בפועל אצל התלמיד, איחוד על כל כיתותיו).
-- · scope: student (entity_id=תלמיד) · class (כיתה) · class_subject (כיתה + subject_code) · submission (assignments.id).
-- · paragraphs/edited_text: הפלט המקורי (ללא שמות) ועריכת המורה בנפרד. "כתיבה מחדש" מחליפה את הפלט; עריכה נמחקת **רק** באישור מפורש של המורה
--   (discardEdit בבקשה) — השרת מסרב ב-409 אחרת. created_at = מועד הכתיבה של הטקסט (נדרס בכתיבה מחדש); updated_at = עריכה אחרונה.
-- · input_facts: העובדות האנונימיות שנשלחו ל-AI (בלי שמות/מזהים) — לביקורת ולשחזור. input_hash = חותמת הנתונים (עובדות + היקף + קהל + שכבה; לא מגדר ולא גרסת הנחיה):
--   אם היא שונה מהחותמת הנוכחית — הסיכום מסומן "ייתכן שהנתונים השתנו".
-- · ai_summary_usage: יומן שימוש מצטבר (שורה לכל יצירה, כולל כתיבה מחדש וניסיון שנפל לתבנית) — מקור התקרה היומית. השורות בסיכומים נדרסות ב-upsert ולכן לא מתאימות לספירה.
-- · חוק 12: RLS מופעל **בלי policies** (חסימה מלאה ל-anon/authenticated). כל הגישה דרך service_role בשרת.
--
-- ── מחיקות ושמירת נתונים (מדיניות) ──
-- · viewer_id → users(id) ON DELETE CASCADE: מחיקת מורה (או ניקוי משתמשי בדיקה) מוחקת את הסיכומים ויומן השימוש שלו, ולא נחסמת על FK.
-- · entity_id **בלי FK** בכוונה (הוא מצביע על טבלאות שונות לפי scope: users / classes / assignments). לכן מחיקת תלמיד, כיתה או הקצאה **אינה** מוחקת את הסיכומים עליהם.
--   הנוהג: השבתה רכה (is_active=false) היא הדרך הרגילה במערכת ואינה מוחקת שורות. בכל מחיקה קשיחה של ישות יש להריץ ניקוי ידני באותה פעולה:
--     DELETE FROM ai_summaries WHERE scope = 'student'       AND entity_id = '<student-id>';
--     DELETE FROM ai_summaries WHERE scope IN ('class','class_subject') AND entity_id = '<class-id>';
--     DELETE FROM ai_summaries WHERE scope = 'submission'    AND entity_id = '<assignment-id>';
--   edited_text הוא טקסט חופשי של המורה ועלול לכלול שם תלמיד — לכן ניקוי כזה חשוב כשתלמיד נמחק.
-- · מדיניות שמירה: סיכום שלא עודכן שנה — אינו נחוץ (חוק 7: נתונים ישנים דועכים). מומלץ ניקוי תקופתי (ידני או משימה מתוזמנת):
--     DELETE FROM ai_summaries      WHERE updated_at < now() - interval '1 year';
--     DELETE FROM ai_summary_usage  WHERE created_at < now() - interval '90 days';
-- אידמפוטנטי. rollback: ai_summaries.rollback.sql.
-- הרצה (ידנית, בשיגור):  npm run migrate -- migrations/ai_summaries.sql
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS ai_summaries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

-- חיפוש לפי ישות (בדיקות/ביקורת/ניקוי ידני אחרי מחיקת ישות)
CREATE INDEX IF NOT EXISTS idx_ai_summaries_entity ON ai_summaries (scope, entity_id);
CREATE INDEX IF NOT EXISTS idx_ai_summaries_viewer ON ai_summaries (viewer_id, created_at);

-- יומן שימוש: שורה לכל יצירה (תקרה יומית לצופה). insert-only
CREATE TABLE IF NOT EXISTS ai_summary_usage (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_summary_usage_viewer ON ai_summary_usage (viewer_id, created_at);

-- חוק 12: חסימה מלאה — בלי policies ל-anon/authenticated
ALTER TABLE ai_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_summary_usage ENABLE ROW LEVEL SECURITY;

COMMIT;

NOTIFY pgrst, 'reload schema';
