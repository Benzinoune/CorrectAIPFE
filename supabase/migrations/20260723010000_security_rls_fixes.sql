-- =============================================================================
-- Migration: Security RLS Fixes + Input Validation
-- Date: 2026-07-23
--
-- Fixes:
--   1. CRITICAL: Students can self-promote to super_admin via UPDATE
--   2. CRITICAL: Professors can self-promote and modify other professors/admins
--   3. HIGH: Admins can change any profile's role in their establishment
--   4. MEDIUM: No input length/format validation on key fields
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Fix profiles_student_update_own: prevent role escalation
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_student_update_own" ON profiles;

CREATE POLICY "profiles_student_update_own"
  ON profiles FOR UPDATE
  USING (
    public.user_role() = 'student'
    AND id = auth.uid()
  )
  WITH CHECK (
    public.user_role() = 'student'
    AND id = auth.uid()
    AND role = 'student'  -- role is immutable for students
  );

-- -----------------------------------------------------------------------------
-- 2. Fix profiles_professor_update_establishment: restrict to own + students,
--    prevent role escalation
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_professor_update_establishment" ON profiles;

CREATE POLICY "profiles_professor_update_establishment"
  ON profiles FOR UPDATE
  USING (
    public.user_role() = 'professor'
    AND establishment_id = public.user_establishment_id()
    AND (id = auth.uid() OR role = 'student')  -- can only update self or students
  )
  WITH CHECK (
    public.user_role() = 'professor'
    AND establishment_id = public.user_establishment_id()
    AND (id = auth.uid() OR role = 'student')
    AND role = (SELECT role FROM profiles WHERE id = id)  -- role is immutable
  );

-- -----------------------------------------------------------------------------
-- 3. Fix profiles_admin_establishment: prevent admin from changing roles
--    Admins can still manage all profiles in their establishment, but cannot
--    escalate anyone to super_admin or change their own/admin role.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_admin_establishment" ON profiles;

CREATE POLICY "profiles_admin_establishment"
  ON profiles FOR UPDATE
  USING (
    public.user_role() = 'admin'
    AND establishment_id = public.user_establishment_id()
  )
  WITH CHECK (
    public.user_role() = 'admin'
    AND establishment_id = public.user_establishment_id()
    AND role = (SELECT role FROM profiles WHERE id = id)  -- role is immutable
  );

-- Admin INSERT policy: admin can only create students and professors
DROP POLICY IF EXISTS "profiles_admin_insert" ON profiles;

CREATE POLICY "profiles_admin_insert"
  ON profiles FOR INSERT
  WITH CHECK (
    public.user_role() = 'admin'
    AND establishment_id = public.user_establishment_id()
    AND role IN ('student', 'professor')  -- cannot create admins or super_admins
  );

-- Admin DELETE policy: admin cannot delete other admins
DROP POLICY IF EXISTS "profiles_admin_delete" ON profiles;

CREATE POLICY "profiles_admin_delete"
  ON profiles FOR DELETE
  USING (
    public.user_role() = 'admin'
    AND establishment_id = public.user_establishment_id()
    AND role IN ('student', 'professor')  -- cannot delete admins
  );

-- -----------------------------------------------------------------------------
-- 4. Input validation: CHECK constraints on key fields
--    Prevents arbitrarily long strings and enforces basic format.
-- -----------------------------------------------------------------------------

-- Profiles
ALTER TABLE profiles
  ADD CONSTRAINT chk_profiles_first_name_length
  CHECK (char_length(first_name) BETWEEN 1 AND 100);

ALTER TABLE profiles
  ADD CONSTRAINT chk_profiles_last_name_length
  CHECK (char_length(last_name) BETWEEN 1 AND 100);

ALTER TABLE profiles
  ADD CONSTRAINT chk_profiles_email_format
  CHECK (email ~* '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$');

ALTER TABLE profiles
  ADD CONSTRAINT chk_profiles_matricule_length
  CHECK (matricule IS NULL OR char_length(matricule) BETWEEN 1 AND 50);

-- Establishments
ALTER TABLE establishments
  ADD CONSTRAINT chk_establishments_name_length
  CHECK (char_length(name) BETWEEN 1 AND 200);

ALTER TABLE establishments
  ADD CONSTRAINT chk_establishments_city_length
  CHECK (char_length(city) BETWEEN 1 AND 100);

-- Classes
ALTER TABLE classes
  ADD CONSTRAINT chk_classes_name_length
  CHECK (char_length(name) BETWEEN 1 AND 100);

-- Exams
ALTER TABLE exams
  ADD CONSTRAINT chk_exams_name_length
  CHECK (char_length(name) BETWEEN 1 AND 200);

-- Scanned copies
ALTER TABLE scanned_copies
  ADD CONSTRAINT chk_scanned_copies_student_name_length
  CHECK (student_name IS NULL OR char_length(student_name) BETWEEN 1 AND 200);

ALTER TABLE scanned_copies
  ADD CONSTRAINT chk_scanned_copies_matricule_length
  CHECK (matricule IS NULL OR char_length(matricule) BETWEEN 1 AND 50);

ALTER TABLE scanned_copies
  ADD CONSTRAINT chk_scanned_copies_class_name_length
  CHECK (char_length(class_name) BETWEEN 1 AND 100);
