-- =============================================================================
-- CorrectAI — Seed Data
-- Run AFTER the initial migration to populate with test data.
--
-- IMPORTANT: This file creates auth.users + profiles for testing.
-- In production, users should sign up through the app.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Establishments
-- ---------------------------------------------------------------------------
INSERT INTO establishments (id, name, city, admin_name, admin_email, status, professors_count, students_count)
VALUES
  ('est-1', 'Lycee Ibn Khaldoun', 'Alger', 'Karim Yelles', 'admin@ibnkhaldoun.dz', 'ACTIF', 2, 2),
  ('est-2', 'CEM El Fath', 'Oran', 'Salima Chergui', 'admin@elfath.dz', 'ACTIF', 1, 2),
  ('est-3', 'Lycee Didouche', 'Constantine', 'Nadir Bouziane', 'admin@didouche.dz', 'INACTIF', 0, 0)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Auth Users + Profiles
-- NOTE: In production, use Supabase Auth signup. This is for testing only.
--       auth.users entries are created via Supabase dashboard or API.
--       profiles are created here for reference.
--
-- For local testing, create users via Supabase Dashboard > Auth > Users:
--   super@correctai.test / Super@123  (role: super_admin)
--   admin@ibnkhaldoun.dz / Admin@123  (role: admin)
--   admin@elfath.dz / Admin@123       (role: admin)
--   m.benali@ecole.dz / Professor@123 (role: professor)
--   h.ziane@ecole.dz / Professor@123  (role: professor)
--   s.amrani@ecole.dz / Professor@123 (role: professor)
--   abdo.tyson@correctai.test / Student@123 (role: student)
--   ibtissam.sa7out@correctai.test / Student@123 (role: student)
--
-- After creating auth users, insert their profiles:
-- ---------------------------------------------------------------------------

-- Example profiles (IDs must match auth.users UUIDs created in dashboard):
-- INSERT INTO profiles (id, role, initials, first_name, last_name, email, status, establishment_id)
-- VALUES
--   ('<super-admin-uuid>', 'super_admin', 'SA', 'Super', 'Admin', 'super@correctai.test', 'ACTIF', NULL),
--   ('<admin-uuid>', 'admin', 'KY', 'Karim', 'Yelles', 'admin@ibnkhaldoun.dz', 'ACTIF', 'est-1'),
--   ('<professor-uuid>', 'professor', 'MB', 'M.', 'Benali', 'm.benali@ecole.dz', 'ACTIF', 'est-1');

-- ---------------------------------------------------------------------------
-- 3. Classes
-- ---------------------------------------------------------------------------
INSERT INTO classes (id, name, establishment_id, students_count, exams_count)
VALUES
  ('dev2', '2 eme annee DEV', 'est-1', 4, 3),
  ('gestion2', '2 eme annees gestion', 'est-2', 5, 2),
  ('mobile2', '2 annee mobile', 'est-1', 7, 1)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Student-Class enrollments
-- (Run after profiles are created)
-- ---------------------------------------------------------------------------
-- INSERT INTO student_classes (student_id, class_id) VALUES
--   ('<student-1-uuid>', 'dev2'),
--   ('<student-1-uuid>', 'mobile2'),
--   ('<student-2-uuid>', 'gestion2');

-- ---------------------------------------------------------------------------
-- 5. Exams
-- ---------------------------------------------------------------------------
INSERT INTO exams (id, name, subject, class_name, professor_id, establishment_id, date, questions, status)
VALUES
  ('controle-1', 'controle math 1', 'Mathematic', 'informatique', NULL, 'est-1', '2026-05-20', 20, 'ACTIF'),
  ('francais', 'francais', 'francais', '2 eme annees gestion', NULL, 'est-2', '2026-05-25', 20, 'BROUILLON'),
  ('math-2', 'Mathematic', 'Mathematic', 'Aucune classe', NULL, 'est-1', '2026-05-24', 20, 'EN COURS'),
  ('math-3', 'Mathematic', 'Mathematic', '2 eme annees gestion, 1 er annee dev', NULL, 'est-2', '2026-05-24', 20, 'BROUILLON')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. Exam-Class assignments
-- ---------------------------------------------------------------------------
INSERT INTO exam_classes (exam_id, class_id) VALUES
  ('controle-1', 'dev2'),
  ('controle-1', 'mobile2'),
  ('francais', 'gestion2'),
  ('math-3', 'gestion2')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7. Default exam questions (20 questions per exam)
-- ---------------------------------------------------------------------------
INSERT INTO exam_questions (exam_id, number, correct_answers, points)
SELECT
  e.id,
  q.num,
  ARRAY['A']::TEXT[],
  1.0
FROM exams e
CROSS JOIN generate_series(1, 20) AS q(num)
ON CONFLICT (exam_id, number) DO NOTHING;
