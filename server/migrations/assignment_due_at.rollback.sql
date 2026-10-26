-- rollback ל-assignment_due_at.sql. מוחק את העמודה due_at (תאריכי היעד אובדים; due_date הישנה לא נגעה).
ALTER TABLE assignments DROP COLUMN IF EXISTS due_at;
