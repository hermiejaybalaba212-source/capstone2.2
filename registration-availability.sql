-- Run this in the MAIN scholarship Supabase project (SQL Editor).
-- Lets the Register page check for duplicate email / username / student number
-- BEFORE calling supabase.auth.signUp, so users get a clear error instead of
-- the vague "Database error saving new user".

CREATE OR REPLACE FUNCTION public.check_registration_availability(
    p_email text,
    p_username text,
    p_student_number text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result json;
BEGIN
    result := json_build_object(
        'email_taken',
        EXISTS (
            SELECT 1 FROM public.users
            WHERE lower(email) = lower(p_email)
        ),

        'username_taken',
        EXISTS (
            SELECT 1 FROM public.users
            WHERE lower(username) = lower(p_username)
        ),

        'student_number_taken',
        COALESCE(p_student_number, '') <> ''
        AND EXISTS (
            SELECT 1 FROM public.student_accounts
            WHERE student_number = p_student_number
        )
    );

    RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_registration_availability(text, text, text)
TO anon, authenticated;
