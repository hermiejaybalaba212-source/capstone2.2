-- ============================================================
-- RUN THIS IN THE *REGISTRAR* SUPABASE PROJECT (SQL Editor)
-- Project: "simulated registrar information system"
-- (zcnqxuydwagecdvitdva)
--
-- Creates the registrar_grades table the scholarship system reads,
-- opens read access, and seeds simulated PH-scale grades
-- (1.00 best ... 5.00 failing) for both test students:
--   2023-00010 Balaba  -> average 2.30  (~87.0%  = BELOW 93%, alert fires)
--   2023-00011 Magbaril -> average 1.60 (~94.0% = passing, no alert)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.registrar_grades (
  grade_id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_number varchar(20) NOT NULL,
  subject_code   varchar(30),
  subject_name   varchar(150),
  grade          numeric(4,2) NOT NULL,
  units          numeric(4,1) NOT NULL DEFAULT 3,
  school_year    varchar(10),
  semester       varchar(10),
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.registrar_grades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public grade reads" ON public.registrar_grades;
CREATE POLICY "Allow public grade reads"
ON public.registrar_grades
FOR SELECT
TO anon, authenticated
USING (true);

-- open read access on subjects too (in case it was never applied)
DROP POLICY IF EXISTS "Allow public grade verification" ON public.registrar_student_subjects;
CREATE POLICY "Allow public grade verification"
ON public.registrar_student_subjects
FOR SELECT
TO anon, authenticated
USING (true);

INSERT INTO public.registrar_grades
  (student_number, subject_code, subject_name, grade, units, school_year, semester)
VALUES
  -- 2023-00010 Balaba Hermie Jay : weighted avg 2.30 -> 87.0% FAILING
  ('2023-00010','IT111','Introduction to Computing',        1.75, 3,'2025-2026','1st'),
  ('2023-00010','IT112','Computer Programming 1',           2.25, 3,'2025-2026','1st'),
  ('2023-00010','GE101','Mathematics in the Modern World',  2.50, 3,'2025-2026','1st'),
  ('2023-00010','GE102','Purposive Communication',          2.25, 3,'2025-2026','1st'),
  ('2023-00010','PE101','Physical Education 1',             2.75, 3,'2025-2026','1st'),
  -- 2023-00011 Magbaril Eves Mark : weighted avg 1.60 -> 94.0% PASSING
  ('2023-00011','IT111','Introduction to Computing',        1.25, 3,'2025-2026','1st'),
  ('2023-00011','IT112','Computer Programming 1',           1.50, 3,'2025-2026','1st'),
  ('2023-00011','GE101','Mathematics in the Modern World',  1.75, 3,'2025-2026','1st'),
  ('2023-00011','GE102','Purposive Communication',          1.50, 3,'2025-2026','1st'),
  ('2023-00011','PE101','Physical Education 1',             2.00, 3,'2025-2026','1st')
ON CONFLICT DO NOTHING;
