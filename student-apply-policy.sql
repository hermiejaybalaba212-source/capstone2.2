-- Deployed to MAIN scholarship Supabase on setup.
-- Allows logged-in students to apply only using their own student_id.

CREATE POLICY "Students can submit their own applications"
ON scholarship_applications
FOR INSERT
TO authenticated
WITH CHECK (
  student_id IN (
    SELECT sa.student_id
    FROM student_accounts sa
    JOIN users u ON u.user_id = sa.user_id
    WHERE u.auth_user_id = auth.uid()
  )
);
