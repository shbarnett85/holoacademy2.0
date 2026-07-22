-- מיגרציה: הפעלת RLS על שלוש טבלאות שנוצרו ללא RLS
-- (Supabase Security Advisor: rls_disabled_in_public — קריטי).
--
-- רקע: quest_variants (§12), content_safety_log (§13), quest_reports (§9) נוספו
-- בעבודות אחרונות ולא קיבלו ENABLE ROW LEVEL SECURITY, בעוד schema.sql מפעיל RLS
-- מפורשות רק לחלק מהטבלאות. טבלה בלי RLS נגישה לקריאה/כתיבה/מחיקה דרך ה-anon key
-- הציבורי (PostgREST) — כולל quest_variants שמכילה student_id + מגדר + פרופיל קושי
-- של קטינים.
--
-- תיקון (Option A — default-deny): כל שלוש הטבלאות נגישות אך ורק דרך השרת עם
-- service_role (עוקף RLS). הדפדפן לא ניגש ל-DB ישירות, ותלמידים משתמשים ב-JWT-PIN
-- (לא Supabase Auth). לכן RLS דלוק ללא policies = חסימה מלאה של anon/authenticated,
-- והשרת ממשיך לעבוד — זהה לדפוס assignments/class_members/classes/funnel_events.
-- idempotent (ENABLE ROW LEVEL SECURITY בטוח להרצה חוזרת).

ALTER TABLE public.quest_variants      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_safety_log  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_reports       ENABLE ROW LEVEL SECURITY;
