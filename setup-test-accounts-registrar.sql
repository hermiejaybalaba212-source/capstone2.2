-- RUN IN REGISTRAR SQL EDITOR
-- https://supabase.com/dashboard/project/zcnqxuydwagecdvitdva/sql/new

-- 1. Insert registrar_students
INSERT INTO registrar_students (
    student_number, last_name, given_name, middle_name, ext_name,
    sex, birthdate, program_name, year_level, registration_status
)
VALUES
(
    '2024-00101', 'Reyes', 'Ana', 'Santos', null,
    'Female', '2003-03-15',
    'Bachelor of Science in Information Technology', '3rd Year', 'Enrolled'
),
(
    '2024-00102', 'Magno', 'Carlo', 'Del', null,
    'Male', '2002-09-20',
    'Bachelor of Science in Information Technology', '3rd Year', 'Enrolled'
);

-- 2. Insert enrollment
INSERT INTO registrar_enrollment (student_id, academic_year, semester, enrollment_status)
SELECT student_id, '2026-2027', '1st Semester', 'Enrolled'
FROM registrar_students
WHERE student_number IN ('2024-00101', '2024-00102');

-- ============================================================
-- STUDENT A: ANA REYES (LOW GPA - below 93%)
-- Grades: 2.00, 2.25, 2.50 -> avg = 2.25 -> percentage = 68.75%
-- Risk: HIGH (<80%)
-- ============================================================

INSERT INTO registrar_student_subjects (student_id, subject_code, subject_name, grade, units)
SELECT student_id, 'IT201', 'Data Structures and Algorithms', 2.00, 3
FROM registrar_students WHERE student_number = '2024-00101';

INSERT INTO registrar_student_subjects (student_id, subject_code, subject_name, grade, units)
SELECT student_id, 'IT202', 'Operating Systems', 2.25, 3
FROM registrar_students WHERE student_number = '2024-00101';

INSERT INTO registrar_student_subjects (student_id, subject_code, subject_name, grade, units)
SELECT student_id, 'IT203', 'Software Engineering', 2.50, 3
FROM registrar_students WHERE student_number = '2024-00101';

-- ============================================================
-- STUDENT B: CARLO MAGNO (HIGH GPA - above 93%)
-- Grades: 1.25, 1.25, 1.00 -> avg = 1.17 -> percentage = 95.8%
-- No alert triggered
-- ============================================================

INSERT INTO registrar_student_subjects (student_id, subject_code, subject_name, grade, units)
SELECT student_id, 'IT201', 'Data Structures and Algorithms', 1.25, 3
FROM registrar_students WHERE student_number = '2024-00102';

INSERT INTO registrar_student_subjects (student_id, subject_code, subject_name, grade, units)
SELECT student_id, 'IT202', 'Operating Systems', 1.25, 3
FROM registrar_students WHERE student_number = '2024-00102';

INSERT INTO registrar_student_subjects (student_id, subject_code, subject_name, grade, units)
SELECT student_id, 'IT203', 'Software Engineering', 1.00, 3
FROM registrar_students WHERE student_number = '2024-00102';
