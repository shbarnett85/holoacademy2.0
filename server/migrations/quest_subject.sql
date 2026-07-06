-- עמודת המקצוע (סעיף 5 ב-schema.sql — מעולם לא הורצה על ה-DB החי; ה-guard הדיפנסיבי
-- hasQuestSubject הסתיר את החוסר). מזינה את סינון המקצוע באנליטיקה ובספרייה הציבורית.
alter table public.quests add column if not exists subject text;
