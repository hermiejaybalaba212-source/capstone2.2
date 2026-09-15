-- Run this in the MAIN scholarship Supabase SQL Editor.
-- Grants the CHED role the read/write access it needs so the CHED Review
-- Module (Applications 2.0, ML Ranking 3.0, Approvals 4.0) actually shows
-- data: applications, student accounts, documents, academic records,
-- rankings. Also grants Admin a safety-net full access on the same tables
-- and lets students submit their own CHED form.
--
-- Policies are created idempotently (DROP IF EXISTS) so this file can be
-- safely re-run any number of times.

-- ============================================================
-- scholarship_applications
-- ============================================================
ALTER TABLE scholarship_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access to applications" ON scholarship_applications;
CREATE POLICY "Admin full access to applications"
ON scholarship_applications
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_user_id = auth.uid()
      AND users.role = 'Admin'
  )
);

DROP POLICY IF EXISTS "CHED can view applications" ON scholarship_applications;
CREATE POLICY "CHED can view applications"
ON scholarship_applications
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_user_id = auth.uid()
      AND users.role = 'CHED'
  )
);

DROP POLICY IF EXISTS "CHED can update applications" ON scholarship_applications;
CREATE POLICY "CHED can update applications"
ON scholarship_applications
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_user_id = auth.uid()
      AND users.role = 'CHED'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_user_id = auth.uid()
      AND users.role = 'CHED'
  )
);

-- ============================================================
-- student_accounts
-- ============================================================
ALTER TABLE student_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access to student accounts" ON student_accounts;
CREATE POLICY "Admin full access to student accounts"
ON student_accounts
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_user_id = auth.uid()
      AND users.role = 'Admin'
  )
);

DROP POLICY IF EXISTS "CHED can view student accounts" ON student_accounts;
CREATE POLICY "CHED can view student accounts"
ON student_accounts
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
-- support_documents
-- ============================================================
ALTER TABLE support_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access to support documents" ON support_documents;
CREATE POLICY "Admin full access to support documents"
ON support_documents
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_user_id = auth.uid()
      AND users.role = 'Admin'
  )
);

DROP POLICY IF EXISTS "CHED can view support documents" ON support_documents;
CREATE POLICY "CHED can view support documents"
ON support_documents
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
-- support_academic_records
-- ============================================================
ALTER TABLE support_academic_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access to academic records" ON support_academic_records;
CREATE POLICY "Admin full access to academic records"
ON support_academic_records
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_user_id = auth.uid()
      AND users.role = 'Admin'
  )
);

DROP POLICY IF EXISTS "CHED can view academic records" ON support_academic_records;
CREATE POLICY "CHED can view academic records"
ON support_academic_records
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
-- ched_form_input: students must be able to submit their own CHED form
-- ============================================================
ALTER TABLE ched_form_input ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students can submit their CHED form" ON ched_form_input;
CREATE POLICY "Students can submit their CHED form"
ON ched_form_input
FOR INSERT
TO authenticated
WITH CHECK (
  application_id IN (
    SELECT sa.application_id
    FROM scholarship_applications sa
    JOIN student_accounts st ON st.student_id = sa.student_id
    JOIN users u ON u.user_id = st.user_id
    WHERE u.auth_user_id = auth.uid()
  )
);

-- ============================================================
-- notifications_announcements: CHED can send notifications to students
-- ============================================================
ALTER TABLE notifications_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CHED can send notifications" ON notifications_announcements;
CREATE POLICY "CHED can send notifications"
ON notifications_announcements
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.auth_user_id = auth.uid()
      AND users.role = 'CHED'
  )
);