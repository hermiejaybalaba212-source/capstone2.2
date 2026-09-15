-- Run this in the MAIN scholarship Supabase SQL editor (xflsxzmniseetvkrddmj).
-- PURPOSE: Fix "CHED/Admin/Faculty login routes to Student dashboard".
--
-- Root cause: non-student accounts (CHED/Admin/Faculty) end up with MULTIPLE rows
-- in the `users` table for the same auth_user_id, OR the only row has role='Student'.
-- The login page uses maybeSingle() on auth_user_id, which returns an arbitrary
-- matching row -- often the wrong (Student) role.

-- =====================================================================
-- STEP 1 -- DIAGNOSE: show all users rows grouped by email
-- Run this first to see what is in the table.
-- =====================================================================
SELECT u.user_id, u.auth_user_id, u.email, u.username, u.role, u.status
FROM users u
ORDER BY u.email, u.user_id;

-- =====================================================================
-- STEP 2 -- FIX: remove duplicate/leftover Student rows for admin staff
-- For each auth_user_id that has MORE THAN ONE users row, keep only the
-- row that is NOT 'Student' when one exists. If a row is a duplicate 'Student'
-- while another row with the same email has a real role, delete the Student row.
-- =====================================================================
DELETE FROM users u
USING users dupe
WHERE u.auth_user_id = dupe.auth_user_id
  AND u.email = dupe.email
  AND u.user_id <> dupe.user_id
  AND u.role = 'Student'
  AND EXISTS (
    SELECT 1 FROM users other
    WHERE other.email = u.email
      AND other.role <> 'Student'
  );

-- =====================================================================
-- STEP 3 -- CORRECT ROLE: set the correct staff role by email
-- Replace the role value below if your actual staff roles differ.
-- This makes sure the single remaining row for each staff account is right.
-- =====================================================================
UPDATE users
SET role = 'CHED'
WHERE email = 'testing.ched@gmail.com'
  AND role <> 'CHED';

UPDATE users
SET role = 'Admin'
WHERE email = 'testing.admin@gmail.com'
  AND role <> 'Admin';

UPDATE users
SET role = 'Faculty'
WHERE email = 'testing.faculty@gmail.com'
  AND role <> 'Faculty';

-- =====================================================================
-- STEP 4 -- PREVENT RECURRENCE: make the signup trigger only create a
-- Student row when the signup is actually a Student.
-- Without this, any staff account created via auth.signUp() also gets a
-- duplicate 'Student' users row from handle_new_student_registration.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.handle_new_student_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    created_user_id BIGINT;
    new_role        TEXT;
BEGIN
    new_role := COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'role', ''), 'Student');

    -- Only auto-create a Student row for actual student signups.
    -- Staff signups (CHED/Admin/Faculty) create their own users row explicitly.
    IF new_role <> 'Student' THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.users (
        username,
        role,
        email,
        status,
        auth_user_id
    )
    VALUES (
        COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'username', ''), split_part(NEW.email, '@', 1)),
        'Student',
        NEW.email,
        'Active',
        NEW.id
    )
    RETURNING user_id INTO created_user_id;

    INSERT INTO public.student_accounts (
        user_id,
        student_number,
        last_name,
        given_name,
        ext_name,
        middle_name,
        sex,
        birthdate,
        program_name,
        year_level,
        registration_status,
        account_status
    )
    VALUES (
        created_user_id,
        NULLIF(NEW.raw_user_meta_data ->> 'student_number', ''),
        NULLIF(NEW.raw_user_meta_data ->> 'last_name', ''),
        NULLIF(NEW.raw_user_meta_data ->> 'given_name', ''),
        NULLIF(NEW.raw_user_meta_data ->> 'ext_name', ''),
        NULLIF(NEW.raw_user_meta_data ->> 'middle_name', ''),
        NULLIF(NEW.raw_user_meta_data ->> 'sex', '')::sex_type,
        NULLIF(NEW.raw_user_meta_data ->> 'birthdate', '')::date,
        NULLIF(NEW.raw_user_meta_data ->> 'program_name', ''),
        NULLIF(NEW.raw_user_meta_data ->> 'year_level', ''),
        'Unverified',
        'Active'
    );

    RETURN NEW;
END;
$$;

-- =====================================================================
-- STEP 5 -- VERIFY: re-run the diagnosis to confirm 1 row per email
-- with the correct role.
-- =====================================================================
SELECT u.user_id, u.auth_user_id, u.email, u.username, u.role, u.status
FROM users u
ORDER BY u.email, u.user_id;
