-- מטא-דאטה לספרייה הציבורית: טווח שכבות (מזין את פילטר השכבות שכבר בנוי ב-UI)
-- + סימון "רשמי" להדמיות צוות HoloAcademy (badge ✓ רשמי בגלריית הקהילה).
-- ערכי השכבה: מספר שכבה 0-13 (גן=0, א׳=1 … י"ב=12, י"ג=13) — עקבי עם gradeNumberFromLabel.
-- הרצה: npm run migrate -- migrations/library_meta.sql

alter table public.quests add column if not exists grade_min int;
alter table public.quests add column if not exists grade_max int;
alter table public.quests add column if not exists is_official boolean not null default false;
