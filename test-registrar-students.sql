-- ============================================================
-- TEST STUDENTS FOR EARLY WARNING SYSTEM
-- Run this in REGISTRAR Supabase SQL Editor
-- ============================================================

-- 1. Insert 2 students
INSERT INTO registrar_students (
    student_number, last_name, given_name, middle_name, ext_name,
    sex, birthdate, program_name, year_level, registration_status
)
VALUES
(
    '2024-00001',
    'Santos',
    'Maria',
    'Cruz',
    null,
    'Female',
    '2003-06-15',
    'Bachelor of Science in Information Technology',
    '3rd Year',
    'Enrolled'
),
(
    '2024-00002',
    'Dela Cruz',
    'Juan',
    'Reyes',
    null,
    'Male',
    '2004-02-28',
    'Bachelor of Science in Information Technology',
    '2nd Year',
    'Enrolled'
);

-- 2. Insert enrollment
INSERT INTO registrar_enrollment (student_id, academic_year, semester, enrollment_status)
SELECT student_id, '2026-2027', '1st Semester', 'Enrolled'
FROM registrar_students
WHERE student_number IN ('2024-00001', '2024-00002');

-- ============================================================
-- STUDENT A: MARIA SANTOS (ABOVE 93%)
-- Grades: 1.0, 1.25, 1.0 → avg = 1.083 → percentage = 97.9%
-- ============================================================

INSERT INTO registrar_student_subjects (student_id, subject_code, subject_name, grade, units)
SELECT student_id, 'IT201', 'Data Structures and Algorithms', 1.00, 3
FROM registrar_students WHERE student_number = '2024-00001';

INSERT INTO registrar_student_subjects (student_id, subject_code, subject_name, grade, units)
SELECT student_id, 'IT202', 'Operating Systems', 1.25, 3
FROM registrar_students WHERE student_number = '2024-00001';

INSERT INTO registrar_student_subjects (student_id, subject_code, subject_name, grade, units)
SELECT student_id, 'IT203', 'Software Engineering', 1.00, 3
FROM registrar_students WHERE student_number = '2024-00001';

-- ============================================================
-- STUDENT B: JUAN DELA CRUZ (BELOW 93%)
-- Grades: 1.75, 2.00, 2.25 → avg = 2.00 → percentage = 75.0%
-- ============================================================

INSERT INTO registrar_student_subjects (student_id, subject_code, subject_name, grade, units)
SELECT student_id, 'IT101', 'Information Technology Fundamentals', 1.75, 3
FROM registrar_students WHERE student_number = '2024-00002';

INSERT INTO registrar_student_subjects (student_id, subject_code, subject_name, grade, units)
SELECT student_id, 'IT102', 'Database Management', 2.00, 3
FROM registrar_students WHERE student_number = '2024-00002';

INSERT INTO registrar_student_subjects (student_id, subject_code, subject_name, grade, units)
SELECT student_id, 'IT103', 'Web Development', 2.25, 3
FROM registrar_students WHERE student_number = '2024-00002';
