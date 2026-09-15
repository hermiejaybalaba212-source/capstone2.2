-- Run this in the MAIN scholarship Supabase project.
-- Adds RLS policies for ranking_result and ched_form_input tables.

-- ============================================================
-- ranking_result: Admin can CRUD, CHED can read
-- ============================================================

ALTER TABLE ranking_result ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can manage ranking results" ON ranking_result;
CREATE POLICY "Admin can manage ranking results"
ON ranking_result
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_user_id = auth.uid()
      AND users.role = 'Admin'
  )
);

DROP POLICY IF EXISTS "CHED can view ranking results" ON ranking_result;
CREATE POLICY "CHED can view ranking results"
ON ranking_result
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_user_id = auth.uid()
      AND users.role = 'CHED'
  )
);

-- ============================================================
-- ched_form_input: Admin can manage, CHED can read
-- ============================================================

ALTER TABLE ched_form_input ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can manage CHED form data" ON ched_form_input;
CREATE POLICY "Admin can manage CHED form data"
ON ched_form_input
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_user_id = auth.uid()
      AND users.role = 'Admin'
  )
);

DROP POLICY IF EXISTS "CHED can view CHED form data" ON ched_form_input;
CREATE POLICY "CHED can view CHED form data"
ON ched_form_input
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_user_id = auth.uid()
      AND users.role = 'CHED'
  )
);

-- ============================================================
-- scholarship_approval: Admin can manage, CHED can read+update
-- ============================================================

ALTER TABLE scholarship_approval ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can manage approval records" ON scholarship_approval;
CREATE POLICY "Admin can manage approval records"
ON scholarship_approval
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_user_id = auth.uid()
      AND users.role = 'Admin'
  )
);

DROP POLICY IF EXISTS "CHED can view and update approvals" ON scholarship_approval;
CREATE POLICY "CHED can view and update approvals"
ON scholarship_approval
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_user_id = auth.uid()
      AND users.role = 'CHED'
  )
);

-- ============================================================
-- notifications_announcements: Students can read+update own,
--   Admin can CRUD, Faculty can read own
-- ============================================================

ALTER TABLE notifications_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students can view and update their notifications" ON notifications_announcements;
CREATE POLICY "Students can view and update their notifications"
ON notifications_announcements
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM student_accounts sa
    JOIN users u ON u.user_id = sa.user_id
    WHERE u.auth_user_id = auth.uid()
      AND notifications_announcements.student_id = sa.student_id
  )
);

DROP POLICY IF EXISTS "Admin can manage all notifications" ON notifications_announcements;
CREATE POLICY "Admin can manage all notifications"
ON notifications_announcements
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_user_id = auth.uid()
      AND users.role = 'Admin'
  )
);
