-- rollback ל-staff_signup_approval.sql. מסיר רק את מה שנוסף שם.
-- אזהרה: בקשות הצטרפות ממתינות (pending) יאבדו את הסימון; הן נשארות is_active=false
-- ולכן עדיין לא יוכלו להתחבר, אבל יופיעו כ"מושבתות" ולא כבקשות — לפני rollback אשרו/דחו אותן.
BEGIN;
DROP INDEX IF EXISTS idx_users_pending_approval;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_approval_status_check;
ALTER TABLE users DROP COLUMN IF EXISTS approval_status;
COMMIT;
NOTIFY pgrst, 'reload schema';
