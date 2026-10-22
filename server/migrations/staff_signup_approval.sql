-- ── אישור הצטרפות מורים לבית ספר קיים (הרשמה עצמית) ─────────────────────────────
-- הרשמה ציבורית לבית ספר קיים לא יוצרת עוד מורה פעיל: נוצר מורה עם approval_status='pending'
-- (ו-is_active=false), שמנהל בית הספר (או מנהל-על) מאשר בלשונית "בקשות הצטרפות".
-- NULL = מאושר — כל השורות הקיימות נשארות כמות שהן (אין backfill), והקוד הישן שרץ על אותו DB
-- אינו מושפע (עמודה נוספת בלבד). נבדק בקוד דרך hasApprovalStatus; בלעדיה ההצטרפות נכשלת סגור (503).
-- אדיטיבי בלבד: עמודה nullable + אילוץ + אינדקס חלקי. ללא טבלה חדשה → אין שינוי RLS.
BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_status text;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_approval_status_check;
ALTER TABLE users ADD CONSTRAINT users_approval_status_check CHECK (approval_status IS NULL OR approval_status = 'pending');
CREATE INDEX IF NOT EXISTS idx_users_pending_approval ON users (school_id) WHERE approval_status = 'pending';
COMMIT;
NOTIFY pgrst, 'reload schema';
