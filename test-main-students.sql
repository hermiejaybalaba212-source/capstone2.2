-- ============================================================
-- RUN THIS IN MAIN SUPABASE SQL EDITOR (xflsxzmniseetvkrddmj)
-- Creates 2 test student accounts + user rows
-- Auth users already exist from signup
-- ============================================================

-- 1. Insert users rows
INSERT INTO users (auth_user_id, username, email, role, status)
VALUES
('bd7a2311-a264-4896-8cbe-c3f31607402a', 'maria.santos', 'maria.santos@student.spc.edu.ph', 'Student', 'Active'),
('aeeee009-14c4-40c5-906f-ded72da3c2ec', 'juan.delacruz', 'juan.delacruz@student.spc.edu.ph', 'Student', 'Active');

-- 2. Insert student_accounts (with registration_status = Verified)
INSERT INTO student_accounts (user_id, student_number, given_name, middle_name, last_name, sex, birthdate, program_name, year_level, registration_status)
SELECT user_id, '2024-00001', 'Maria', 'Cruz', 'Santos', 'Female', '2003-06-15',
       'Bachelor of Science in Information Technology', '3rd Year', 'Verified'
FROM users WHERE username = 'maria.santos';

INSERT INTO student_accounts (user_id, student_number, given_name, middle_name, last_name, sex, birthdate, program_name, year_level, registration_status)
SELECT user_id, '2024-00002', 'Juan', 'Reyes', 'Dela Cruz', 'Male', '2004-02-28',
       'Bachelor of Science in Information Technology', '2nd Year', 'Verified'
FROM users WHERE username = 'juan.delacruz';
