-- Run this in the separate Registrar Supabase project.

DROP POLICY IF EXISTS "Allow public student verification" ON registrar_students;
CREATE POLICY "Allow public student verification"
ON registrar_students
FOR SELECT
TO anon, authenticated
USING (true);
