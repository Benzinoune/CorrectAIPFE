-- =============================================================================
-- SEED DATA — Run after FULL_DEPLOY.sql or via Supabase Dashboard SQL Editor
-- =============================================================================
-- This script creates realistic test data for development and testing.
-- The super_admin profile must already exist (created via FULL_DEPLOY.sql + auth signup).

-- =============================================================================
-- 1. ESTABLISHMENT
-- =============================================================================
INSERT INTO establishments (id, name, city, admin_name, admin_email, status)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Université de Technologie',
  'Alger',
  'Ahmed Benali',
  'admin@utc.dz',
  'ACTIF'
) ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 2. ADMIN (profile — must link to an auth.users entry)
-- =============================================================================
-- NOTE: To create an admin, first create them via the app UI (SignUp flow).
-- Or if you have the auth user UUID, insert the profile here:
--
-- INSERT INTO profiles (id, role, first_name, last_name, email, establishment_id, status)
-- VALUES ('<auth-user-uuid>', 'admin', 'Ahmed', 'Benali', 'admin@utc.dz', '11111111-1111-1111-1111-111111111111', 'ACTIF');

-- =============================================================================
-- 3. PROFESSOR (profile — must link to an auth.users entry)
-- =============================================================================
-- Same as admin: create via app UI first, then insert profile.
--
-- INSERT INTO profiles (id, role, first_name, last_name, email, establishment_id, status)
-- VALUES ('<auth-user-uuid>', 'professor', 'Fatima', 'Khelifi', 'fatima.khelifi@utc.dz', '11111111-1111-1111-1111-111111111111', 'ACTIF');

-- =============================================================================
-- 4. CLASSES
-- =============================================================================
INSERT INTO classes (id, name, establishment_id)
VALUES
  ('22222222-2222-2222-2222-222222222201', 'Info L3 A', '11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222202', 'Info L3 B', '11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222203', 'Math L2',   '11111111-1111-1111-1111-111111111111')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 5. STUDENTS (profiles)
-- =============================================================================
-- Create students via app UI, then link to classes:
--
-- INSERT INTO profiles (id, role, first_name, last_name, email, matricule, establishment_id, status)
-- VALUES ('<auth-uuid>', 'student', 'Youcef', 'Ammari', 'youcef.ammari@utc.dz', 'ETU-2024-001', '11111111-1111-1111-1111-111111111111', 'ACTIF');
--
-- INSERT INTO student_classes (student_id, class_id)
-- VALUES ('<auth-uuid>', '22222222-2222-2222-2222-222222222201');

-- =============================================================================
-- 6. EXAMS (requires professor UUID)
-- =============================================================================
-- After creating a professor and linking to auth:
--
-- INSERT INTO exams (id, name, date, subject, professor_id, class_name, question_count, status, correction_type)
-- VALUES (
--   '33333333-3333-3333-3333-333333333301',
--   'Examen Partiel - Structures de Données',
--   '2026-07-20',
--   'Informatique',
--   '<professor-auth-uuid>',
--   'Info L3 A',
--   20,
--   'PLANIFIE',
--   'AUTO'
-- );
--
-- INSERT INTO exam_classes (exam_id, class_id)
-- VALUES ('33333333-3333-3333-3333-333333333301', '22222222-2222-2222-2222-222222222201');
--
-- -- Add question bank
-- INSERT INTO exam_questions (exam_id, number, correct_answers, points)
-- VALUES
--   ('33333333-3333-3333-3333-333333333301', 1,  ARRAY['A'], 1),
--   ('33333333-3333-3333-3333-333333333301', 2,  ARRAY['B'], 1),
--   ('33333333-3333-3333-3333-333333333301', 3,  ARRAY['C'], 1),
--   ('33333333-3333-3333-3333-333333333301', 4,  ARRAY['A','C'], 2),
--   ('33333333-3333-3333-3333-333333333301', 5,  ARRAY['D'], 1);

-- =============================================================================
-- NOTES
-- =============================================================================
-- - All IDs use deterministic UUIDs for easy reference in tests.
-- - The establishment ID is fixed; class IDs follow a pattern.
-- - Professor, admin, and student IDs depend on actual auth.users UUIDs.
-- - For quick testing, create accounts via the app UI first, then
--   use Supabase Dashboard to add profiles and link relationships.
-- =============================================================================
