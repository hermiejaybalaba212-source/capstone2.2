-- Run this in the MAIN scholarship Supabase project.
-- This allows free account creation while the Registrar details remain unverified.

ALTER TABLE student_accounts
    ALTER COLUMN student_number DROP NOT NULL,
    ALTER COLUMN last_name DROP NOT NULL,
    ALTER COLUMN given_name DROP NOT NULL,
    ALTER COLUMN sex DROP NOT NULL,
    ALTER COLUMN birthdate DROP NOT NULL,
    ALTER COLUMN program_name DROP NOT NULL,
    ALTER COLUMN year_level DROP NOT NULL;

-- Create both application records automatically when Supabase Auth creates a user.
-- This avoids RLS/session problems when email confirmation is enabled.
CREATE OR REPLACE FUNCTION public.handle_new_student_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    created_user_id BIGINT;
BEGIN
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

DROP TRIGGER IF EXISTS on_auth_user_created_student_registration ON auth.users;
CREATE TRIGGER on_auth_user_created_student_registration
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_student_registration();

DROP POLICY IF EXISTS "Students can create their user record" ON users;
CREATE POLICY "Students can create their user record"
ON users
FOR INSERT
TO authenticated
WITH CHECK (
    auth_user_id = auth.uid()
    AND role = 'Student'
    AND status = 'Active'
);

DROP POLICY IF EXISTS "Students can create their student account" ON student_accounts;
CREATE POLICY "Students can create their student account"
ON student_accounts
FOR INSERT
TO authenticated
WITH CHECK (
    user_id IN (
        SELECT user_id
        FROM users
        WHERE auth_user_id = auth.uid()
    )
);
