-- ============================================================================
-- מיגרציה ממוקדת: progress_snapshots (סדרת-הזמן של ההתקדמות) + RLS הרשאה A
-- התאמה לסכמה האמיתית: אין טבלת "students" — תלמיד = users עם role='student';
-- חברות בכיתה דרך class_members; מיפוי מורה: class_teachers.teacher_id → users.auth_id = auth.uid().
-- idempotent. הרץ מול ה-DB (psql / runner). אינו נוגע בשום טבלה אחרת מלבד
-- ALTER מינימלי של class_teachers.is_homeroom (תנאי הכרחי למדיניות הרשאה A).
-- ============================================================================

-- 1) הטבלה
CREATE TABLE IF NOT EXISTS progress_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES users(id),
  class_id uuid REFERENCES classes(id),
  session_id uuid REFERENCES sessions(id),
  taken_at timestamptz NOT NULL DEFAULT now(),
  text_level numeric NOT NULL,
  per_puzzle_level jsonb NOT NULL,
  success_rates jsonb NOT NULL,
  overall_success numeric
);
CREATE INDEX IF NOT EXISTS idx_progress_snapshots_student ON progress_snapshots (student_id, taken_at);
CREATE INDEX IF NOT EXISTS idx_progress_snapshots_class   ON progress_snapshots (class_id, taken_at);

-- 2) RLS — הפעלה + מדיניות SELECT פרמיסיביות
ALTER TABLE progress_snapshots ENABLE ROW LEVEL SECURITY;

-- הרשאה A: מחנך קורא snapshots של תלמידי כיתת-החינוך שלו (is_homeroom=true).
-- תלוי בטבלת class_teachers (סעיף 4/10). אם עדיין לא קיימת — מדלגים בעדינות (DO block),
-- והמיגרציה הזו לא נכשלת; ההרשאה תיווצר כשטבלת class_teachers תהיה קיימת.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'class_teachers') THEN
    EXECUTE 'ALTER TABLE class_teachers ADD COLUMN IF NOT EXISTS is_homeroom boolean NOT NULL DEFAULT false';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_class_teachers_homeroom ON class_teachers (class_id, teacher_id) WHERE is_homeroom';
    EXECUTE 'DROP POLICY IF EXISTS "progress_snapshots_homeroom_select" ON progress_snapshots';
    EXECUTE 'CREATE POLICY "progress_snapshots_homeroom_select" ON progress_snapshots FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM class_teachers ct JOIN users u ON u.id = ct.teacher_id JOIN class_members cm ON cm.class_id = ct.class_id WHERE ct.is_homeroom = true AND u.auth_id = auth.uid() AND cm.user_id = progress_snapshots.student_id))';
    RAISE NOTICE 'progress_snapshots: הרשאת מחנך (A) נוצרה.';
  ELSE
    RAISE NOTICE 'progress_snapshots: class_teachers לא קיימת — דילוג על הרשאת מחנך (A) (תיווצר מאוחר יותר).';
  END IF;
END $$;

-- admin (אותו בית ספר) + super_admin (הכול)
DROP POLICY IF EXISTS "progress_snapshots_admin_select" ON progress_snapshots;
CREATE POLICY "progress_snapshots_admin_select" ON progress_snapshots
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users admin
      JOIN class_members cm ON cm.user_id = progress_snapshots.student_id
      JOIN classes c        ON c.id = cm.class_id
      WHERE admin.auth_id = auth.uid()
        AND admin.role::text IN ('admin', 'super_admin')
        AND (admin.role::text = 'super_admin' OR admin.school_id = c.school_id)
    )
  );
