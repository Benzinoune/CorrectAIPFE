-- =============================================================================
-- CorrectAI — Initial Supabase Migration
-- Generated: 2026-07-23
-- Description: Creates all tables, enums, indexes, RLS policies, and helper
--   functions for the CorrectAI platform.
--
-- Migration order:
--   1. ENUMS (no dependencies)
--   2. TABLES (referential dependency order)
--   3. INDEXES
--   4. RLS HELPER FUNCTIONS
--   5. ROW LEVEL SECURITY (enable + policies)
--   6. UPDATED_AT TRIGGERS
-- =============================================================================

-- =============================================================================
-- 1. ENUMS
-- =============================================================================

CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'professor', 'student');

CREATE TYPE user_status AS ENUM ('ACTIF', 'INACTIF', 'SUSPENDU');

CREATE TYPE establishment_status AS ENUM ('ACTIF', 'INACTIF', 'SUSPENDU');

CREATE TYPE exam_status AS ENUM ('ACTIF', 'BROUILLON', 'EN COURS', 'A VENIR', 'TERMINE');

CREATE TYPE copy_review_status AS ENUM ('PENDING', 'DETECTED', 'VALIDATED', 'CORRECTED');

CREATE TYPE response_sheet_id AS ENUM ('20', '50', '100');

CREATE TYPE tone AS ENUM ('primary', 'success', 'warning', 'danger', 'neutral', 'info');

-- =============================================================================
-- 2. TABLES (referential dependency order)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 2.1 establishments
-- Referenced by: profiles, classes, exams, scanned_copies
-- ---------------------------------------------------------------------------

CREATE TABLE establishments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  city            TEXT NOT NULL,
  admin_name      TEXT NOT NULL,
  admin_email     TEXT NOT NULL,
  status          establishment_status NOT NULL DEFAULT 'ACTIF',
  professors_count INT NOT NULL DEFAULT 0,
  students_count  INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2.2 profiles  (unified: admin / professor / student + super_admin)
-- auth.users.id = profiles.id  (1:1 FK via Supabase Auth)
-- ---------------------------------------------------------------------------

CREATE TABLE profiles (
  id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role             user_role NOT NULL,
  initials         TEXT NOT NULL,
  first_name       TEXT NOT NULL,
  last_name        TEXT NOT NULL,
  email            TEXT NOT NULL UNIQUE,
  status           user_status NOT NULL DEFAULT 'ACTIF',
  establishment_id UUID REFERENCES establishments(id) ON DELETE SET NULL,
  -- Student-only fields (NULL for admin/professor)
  matricule        TEXT,
  external_ref     TEXT,
  correct_ai_id    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2.3 classes
-- Referenced by: student_classes, exam_classes
-- ---------------------------------------------------------------------------

CREATE TABLE classes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  establishment_id UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  students_count   INT NOT NULL DEFAULT 0,
  exams_count      INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2.4 student_classes  (junction: which students are in which classes)
-- Replaces the dual Student.classes[] / Student.classIds[] pattern
-- ---------------------------------------------------------------------------

CREATE TABLE student_classes (
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  class_id   UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  PRIMARY KEY (student_id, class_id)
);

-- ---------------------------------------------------------------------------
-- 2.5 exams
-- Referenced by: exam_classes, exam_questions, scanned_copies
-- ---------------------------------------------------------------------------

CREATE TABLE exams (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  subject             TEXT NOT NULL,
  class_name          TEXT NOT NULL DEFAULT '',
  professor_id        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  establishment_id    UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  date                DATE NOT NULL,
  questions           INT NOT NULL DEFAULT 0,
  status              exam_status NOT NULL DEFAULT 'BROUILLON',
  response_sheet_id   response_sheet_id DEFAULT '20',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2.6 exam_classes  (junction: which classes are assigned to an exam)
-- Replaces Exam.classIds[] + denormalized Exam.className
-- ---------------------------------------------------------------------------

CREATE TABLE exam_classes (
  exam_id   UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  class_id  UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  PRIMARY KEY (exam_id, class_id)
);

-- ---------------------------------------------------------------------------
-- 2.7 exam_questions
-- Replaces the nested ExamQuestion[] inside exam.questionBank
-- ---------------------------------------------------------------------------

CREATE TABLE exam_questions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id         UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  number          INT NOT NULL,
  correct_answers TEXT[] NOT NULL DEFAULT '{}',
  detected_answers TEXT[],
  points          NUMERIC(4,1) NOT NULL DEFAULT 1.0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (exam_id, number)
);

-- ---------------------------------------------------------------------------
-- 2.8 scanned_copies
-- class_name stays as free text (OCR extracts it from the sheet).
-- establishment_id is denormalized for efficient RLS queries.
-- ---------------------------------------------------------------------------

CREATE TABLE scanned_copies (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id                  UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  exam_name                TEXT NOT NULL,
  student_id               UUID REFERENCES profiles(id) ON DELETE SET NULL,
  student_name             TEXT NOT NULL,
  matricule                TEXT NOT NULL,
  class_name               TEXT NOT NULL,
  establishment_id         UUID REFERENCES establishments(id) ON DELETE SET NULL,
  scanned_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  image_url                TEXT,
  annotated_image_url      TEXT,
  ai_confidence            NUMERIC(5,2) NOT NULL DEFAULT 0,
  review_status            copy_review_status NOT NULL DEFAULT 'PENDING',
  detected_answers         TEXT[] NOT NULL DEFAULT '{}',
  detected_answers_count   INT NOT NULL DEFAULT 0,
  calculated_score         TEXT,
  metadata                 JSONB,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2.9 ocr_results  (extracted from nested ScannedCopy.ocrResult)
-- 1:1 with scanned_copies via copy_id UNIQUE
-- ---------------------------------------------------------------------------

CREATE TABLE ocr_results (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  copy_id       UUID NOT NULL UNIQUE REFERENCES scanned_copies(id) ON DELETE CASCADE,
  extracted     BOOLEAN NOT NULL DEFAULT FALSE,
  name          TEXT,
  matricule     TEXT,
  class_name    TEXT,
  confidence    NUMERIC(5,2) NOT NULL DEFAULT 0,
  missing_fields TEXT[] NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2.10 omr_results  (extracted from nested ScannedCopy.omrResult)
-- 1:1 with scanned_copies via copy_id UNIQUE
-- ---------------------------------------------------------------------------

CREATE TABLE omr_results (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  copy_id    UUID NOT NULL UNIQUE REFERENCES scanned_copies(id) ON DELETE CASCADE,
  detected   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2.11 omr_answers  (extracted from OMRDetectionResult.answers[])
-- Each row = one question's OMR detection for a scanned copy
-- ---------------------------------------------------------------------------

CREATE TABLE omr_answers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  omr_result_id    UUID NOT NULL REFERENCES omr_results(id) ON DELETE CASCADE,
  question_number  INT NOT NULL,
  answer           TEXT,
  confidence       NUMERIC(5,2) NOT NULL DEFAULT 0,
  UNIQUE (omr_result_id, question_number)
);

-- =============================================================================
-- 3. INDEXES
-- =============================================================================

-- profiles
CREATE INDEX idx_profiles_email ON profiles (email);
CREATE INDEX idx_profiles_role ON profiles (role);
CREATE INDEX idx_profiles_establishment_id ON profiles (establishment_id);
CREATE INDEX idx_profiles_matricule ON profiles (matricule) WHERE matricule IS NOT NULL;
CREATE INDEX idx_profiles_status ON profiles (status);

-- establishments
CREATE INDEX idx_establishments_status ON establishments (status);

-- classes
CREATE INDEX idx_classes_establishment_id ON classes (establishment_id);

-- student_classes
CREATE INDEX idx_student_classes_student_id ON student_classes (student_id);
CREATE INDEX idx_student_classes_class_id ON student_classes (class_id);

-- exams
CREATE INDEX idx_exams_professor_id ON exams (professor_id);
CREATE INDEX idx_exams_establishment_id ON exams (establishment_id);
CREATE INDEX idx_exams_status ON exams (status);
CREATE INDEX idx_exams_date ON exams (date);

-- exam_classes
CREATE INDEX idx_exam_classes_exam_id ON exam_classes (exam_id);
CREATE INDEX idx_exam_classes_class_id ON exam_classes (class_id);

-- exam_questions
CREATE INDEX idx_exam_questions_exam_id ON exam_questions (exam_id);

-- scanned_copies
CREATE INDEX idx_scanned_copies_exam_id ON scanned_copies (exam_id);
CREATE INDEX idx_scanned_copies_student_id ON scanned_copies (student_id);
CREATE INDEX idx_scanned_copies_establishment_id ON scanned_copies (establishment_id);
CREATE INDEX idx_scanned_copies_review_status ON scanned_copies (review_status);
CREATE INDEX idx_scanned_copies_class_name ON scanned_copies (class_name);
CREATE INDEX idx_scanned_copies_scanned_at ON scanned_copies (scanned_at);

-- ocr_results
CREATE INDEX idx_ocr_results_copy_id ON ocr_results (copy_id);

-- omr_results
CREATE INDEX idx_omr_results_copy_id ON omr_results (copy_id);

-- omr_answers
CREATE INDEX idx_omr_answers_omr_result_id ON omr_answers (omr_result_id);

-- =============================================================================
-- 4. RLS HELPER FUNCTIONS
-- =============================================================================
-- NOTE: Functions live in public.* (not auth.*) for SQL Editor compatibility.
--       SECURITY DEFINER + SET search_path = public so they bypass RLS
--       when doing cross-table lookups (avoids infinite recursion).

-- Returns the role of the currently authenticated user.
CREATE OR REPLACE FUNCTION public.user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- Returns the establishment_id of the currently authenticated user.
CREATE OR REPLACE FUNCTION public.user_establishment_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT establishment_id FROM profiles WHERE id = auth.uid();
$$;

-- SECURITY DEFINER: checks if student is enrolled in a class (bypasses RLS to avoid recursion)
CREATE OR REPLACE FUNCTION public.is_student_in_class(p_class_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM student_classes
    WHERE class_id = p_class_id AND student_id = auth.uid()
  );
$$;

-- SECURITY DEFINER: checks if class belongs to current user's establishment (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_class_in_establishment(p_class_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM classes
    WHERE id = p_class_id AND establishment_id = public.user_establishment_id()
  );
$$;

-- SECURITY DEFINER: checks if student is enrolled in at least one class for the given exam
CREATE OR REPLACE FUNCTION public.is_student_enrolled_in_exam(p_exam_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    JOIN student_classes sc ON sc.student_id = p.id
    JOIN exam_classes ec ON ec.class_id = sc.class_id
    WHERE p.id = auth.uid()
      AND p.role = 'student'
      AND ec.exam_id = p_exam_id
  );
$$;

-- =============================================================================
-- 5. ROW LEVEL SECURITY
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 5.1 establishments
-- ---------------------------------------------------------------------------
ALTER TABLE establishments ENABLE ROW LEVEL SECURITY;

-- Super Admin: full access
CREATE POLICY "establishments_super_admin_all"
  ON establishments FOR ALL
  USING (public.user_role() = 'super_admin');

-- Admin: read own establishment
CREATE POLICY "establishments_admin_select"
  ON establishments FOR SELECT
  USING (
    public.user_role() = 'admin'
    AND id = public.user_establishment_id()
  );

-- Professor: read own establishment
CREATE POLICY "establishments_professor_select"
  ON establishments FOR SELECT
  USING (
    public.user_role() = 'professor'
    AND id = public.user_establishment_id()
  );

-- Student: read own establishment
CREATE POLICY "establishments_student_select"
  ON establishments FOR SELECT
  USING (
    public.user_role() = 'student'
    AND id = public.user_establishment_id()
  );

-- ---------------------------------------------------------------------------
-- 5.2 profiles
-- ---------------------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Super Admin: full access to all profiles
CREATE POLICY "profiles_super_admin_all"
  ON profiles FOR ALL
  USING (public.user_role() = 'super_admin');

-- Admin: full access to profiles in their establishment
CREATE POLICY "profiles_admin_establishment"
  ON profiles FOR ALL
  USING (
    public.user_role() = 'admin'
    AND establishment_id = public.user_establishment_id()
  );

-- Professor: read profiles in their establishment
CREATE POLICY "profiles_professor_select"
  ON profiles FOR SELECT
  USING (
    public.user_role() = 'professor'
    AND establishment_id = public.user_establishment_id()
  );

-- Professor: create student profiles in their establishment
CREATE POLICY "profiles_professor_insert"
  ON profiles FOR INSERT
  WITH CHECK (
    public.user_role() = 'professor'
    AND role = 'student'
    AND establishment_id = public.user_establishment_id()
  );

-- Professor: update any profile in their establishment (students, own account)
CREATE POLICY "profiles_professor_update_establishment"
  ON profiles FOR UPDATE
  USING (
    public.user_role() = 'professor'
    AND establishment_id = public.user_establishment_id()
  );

-- Professor: delete student profiles in their establishment
CREATE POLICY "profiles_professor_delete"
  ON profiles FOR DELETE
  USING (
    public.user_role() = 'professor'
    AND role = 'student'
    AND establishment_id = public.user_establishment_id()
  );

-- Student: read own profile only
CREATE POLICY "profiles_student_select_own"
  ON profiles FOR SELECT
  USING (
    public.user_role() = 'student'
    AND id = auth.uid()
  );

-- Student: update own profile (password changes)
CREATE POLICY "profiles_student_update_own"
  ON profiles FOR UPDATE
  USING (
    public.user_role() = 'student'
    AND id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- 5.3 classes
-- ---------------------------------------------------------------------------
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

-- Super Admin: full access
CREATE POLICY "classes_super_admin_all"
  ON classes FOR ALL
  USING (public.user_role() = 'super_admin');

-- Admin: full access to classes in their establishment
CREATE POLICY "classes_admin_establishment"
  ON classes FOR ALL
  USING (
    public.user_role() = 'admin'
    AND establishment_id = public.user_establishment_id()
  );

-- Professor: full access to classes in their establishment
CREATE POLICY "classes_professor_establishment"
  ON classes FOR ALL
  USING (
    public.user_role() = 'professor'
    AND establishment_id = public.user_establishment_id()
  );

-- Student: read classes they are enrolled in
-- Uses SECURITY DEFINER to avoid infinite recursion (classes -> student_classes -> classes)
CREATE POLICY "classes_student_enrolled"
  ON classes FOR SELECT
  USING (
    public.user_role() = 'student'
    AND public.is_student_in_class(id)
  );

-- ---------------------------------------------------------------------------
-- 5.4 student_classes
-- ---------------------------------------------------------------------------
ALTER TABLE student_classes ENABLE ROW LEVEL SECURITY;

-- Super Admin: full access
CREATE POLICY "student_classes_super_admin_all"
  ON student_classes FOR ALL
  USING (public.user_role() = 'super_admin');

-- Admin: full access to records in their establishment
-- Uses SECURITY DEFINER to avoid infinite recursion
CREATE POLICY "classes_student_classes_admin"
  ON student_classes FOR ALL
  USING (
    public.user_role() = 'admin'
    AND public.is_class_in_establishment(class_id)
  );

-- Professor: full access to student-class links in their establishment
-- Uses SECURITY DEFINER to avoid infinite recursion
CREATE POLICY "student_classes_professor_establishment"
  ON student_classes FOR ALL
  USING (
    public.user_role() = 'professor'
    AND public.is_class_in_establishment(class_id)
  );

-- Student: read own enrollments only
CREATE POLICY "student_classes_student_own"
  ON student_classes FOR SELECT
  USING (
    public.user_role() = 'student'
    AND student_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- 5.5 exams
-- ---------------------------------------------------------------------------
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;

-- Super Admin: full access
CREATE POLICY "exams_super_admin_all"
  ON exams FOR ALL
  USING (public.user_role() = 'super_admin');

-- Admin: full access to exams in their establishment
CREATE POLICY "exams_admin_establishment"
  ON exams FOR ALL
  USING (
    public.user_role() = 'admin'
    AND establishment_id = public.user_establishment_id()
  );

-- Professor: full access to exams in their establishment
CREATE POLICY "exams_professor_establishment"
  ON exams FOR ALL
  USING (
    public.user_role() = 'professor'
    AND establishment_id = public.user_establishment_id()
  );

-- Student: read exams assigned to classes they are enrolled in
CREATE POLICY "exams_student_enrolled"
  ON exams FOR SELECT
  USING (
    public.user_role() = 'student'
    AND public.is_student_enrolled_in_exam(id)
  );

-- ---------------------------------------------------------------------------
-- 5.6 exam_classes
-- ---------------------------------------------------------------------------
ALTER TABLE exam_classes ENABLE ROW LEVEL SECURITY;

-- Super Admin: full access
CREATE POLICY "exam_classes_super_admin_all"
  ON exam_classes FOR ALL
  USING (public.user_role() = 'super_admin');

-- Admin: full access in their establishment
CREATE POLICY "exam_classes_admin_establishment"
  ON exam_classes FOR ALL
  USING (
    public.user_role() = 'admin'
    AND EXISTS (
      SELECT 1 FROM exams e
      WHERE e.id = exam_classes.exam_id
        AND e.establishment_id = public.user_establishment_id()
    )
  );

-- Professor: full access in their establishment
CREATE POLICY "exam_classes_professor_establishment"
  ON exam_classes FOR ALL
  USING (
    public.user_role() = 'professor'
    AND EXISTS (
      SELECT 1 FROM exams e
      WHERE e.id = exam_classes.exam_id
        AND e.establishment_id = public.user_establishment_id()
    )
  );

-- Student: read exam-class links for exams they are enrolled in
CREATE POLICY "exam_classes_student_enrolled"
  ON exam_classes FOR SELECT
  USING (
    public.user_role() = 'student'
    AND public.is_student_enrolled_in_exam(exam_id)
  );

-- ---------------------------------------------------------------------------
-- 5.7 exam_questions
-- ---------------------------------------------------------------------------
ALTER TABLE exam_questions ENABLE ROW LEVEL SECURITY;

-- Super Admin: full access
CREATE POLICY "exam_questions_super_admin_all"
  ON exam_questions FOR ALL
  USING (public.user_role() = 'super_admin');

-- Admin: full access in their establishment
CREATE POLICY "exam_questions_admin_establishment"
  ON exam_questions FOR ALL
  USING (
    public.user_role() = 'admin'
    AND EXISTS (
      SELECT 1 FROM exams e
      WHERE e.id = exam_questions.exam_id
        AND e.establishment_id = public.user_establishment_id()
    )
  );

-- Professor: full access in their establishment
CREATE POLICY "exam_questions_professor_establishment"
  ON exam_questions FOR ALL
  USING (
    public.user_role() = 'professor'
    AND EXISTS (
      SELECT 1 FROM exams e
      WHERE e.id = exam_questions.exam_id
        AND e.establishment_id = public.user_establishment_id()
    )
  );

-- Student: read questions for exams they are enrolled in
CREATE POLICY "exam_questions_student_enrolled"
  ON exam_questions FOR SELECT
  USING (
    public.user_role() = 'student'
    AND public.is_student_enrolled_in_exam(exam_id)
  );

-- ---------------------------------------------------------------------------
-- 5.8 scanned_copies
-- ---------------------------------------------------------------------------
ALTER TABLE scanned_copies ENABLE ROW LEVEL SECURITY;

-- Super Admin: full access
CREATE POLICY "scanned_copies_super_admin_all"
  ON scanned_copies FOR ALL
  USING (public.user_role() = 'super_admin');

-- Admin: full access to scanned copies in their establishment
CREATE POLICY "scanned_copies_admin_establishment"
  ON scanned_copies FOR ALL
  USING (
    public.user_role() = 'admin'
    AND establishment_id = public.user_establishment_id()
  );

-- Professor: full access to scanned copies in their establishment
CREATE POLICY "scanned_copies_professor_establishment"
  ON scanned_copies FOR ALL
  USING (
    public.user_role() = 'professor'
    AND establishment_id = public.user_establishment_id()
  );

-- Student: read own scanned copies only (matched by student_id)
CREATE POLICY "scanned_copies_student_own"
  ON scanned_copies FOR SELECT
  USING (
    public.user_role() = 'student'
    AND student_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- 5.9 ocr_results
-- ---------------------------------------------------------------------------
ALTER TABLE ocr_results ENABLE ROW LEVEL SECURITY;

-- Super Admin: full access
CREATE POLICY "ocr_results_super_admin_all"
  ON ocr_results FOR ALL
  USING (public.user_role() = 'super_admin');

-- Admin: full access via establishment of the parent copy
CREATE POLICY "ocr_results_admin_establishment"
  ON ocr_results FOR ALL
  USING (
    public.user_role() = 'admin'
    AND EXISTS (
      SELECT 1 FROM scanned_copies sc
      WHERE sc.id = ocr_results.copy_id
        AND sc.establishment_id = public.user_establishment_id()
    )
  );

-- Professor: full access via establishment of the parent copy
CREATE POLICY "ocr_results_professor_establishment"
  ON ocr_results FOR ALL
  USING (
    public.user_role() = 'professor'
    AND EXISTS (
      SELECT 1 FROM scanned_copies sc
      WHERE sc.id = ocr_results.copy_id
        AND sc.establishment_id = public.user_establishment_id()
    )
  );

-- Student: read own OCR results only
CREATE POLICY "ocr_results_student_own"
  ON ocr_results FOR SELECT
  USING (
    public.user_role() = 'student'
    AND EXISTS (
      SELECT 1 FROM scanned_copies sc
      WHERE sc.id = ocr_results.copy_id
        AND sc.student_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 5.10 omr_results
-- ---------------------------------------------------------------------------
ALTER TABLE omr_results ENABLE ROW LEVEL SECURITY;

-- Super Admin: full access
CREATE POLICY "omr_results_super_admin_all"
  ON omr_results FOR ALL
  USING (public.user_role() = 'super_admin');

-- Admin: full access via establishment of the parent copy
CREATE POLICY "omr_results_admin_establishment"
  ON omr_results FOR ALL
  USING (
    public.user_role() = 'admin'
    AND EXISTS (
      SELECT 1 FROM scanned_copies sc
      WHERE sc.id = omr_results.copy_id
        AND sc.establishment_id = public.user_establishment_id()
    )
  );

-- Professor: full access via establishment of the parent copy
CREATE POLICY "omr_results_professor_establishment"
  ON omr_results FOR ALL
  USING (
    public.user_role() = 'professor'
    AND EXISTS (
      SELECT 1 FROM scanned_copies sc
      WHERE sc.id = omr_results.copy_id
        AND sc.establishment_id = public.user_establishment_id()
    )
  );

-- Student: read own OMR results only
CREATE POLICY "omr_results_student_own"
  ON omr_results FOR SELECT
  USING (
    public.user_role() = 'student'
    AND EXISTS (
      SELECT 1 FROM scanned_copies sc
      WHERE sc.id = omr_results.copy_id
        AND sc.student_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 5.11 omr_answers
-- ---------------------------------------------------------------------------
ALTER TABLE omr_answers ENABLE ROW LEVEL SECURITY;

-- Super Admin: full access
CREATE POLICY "omr_answers_super_admin_all"
  ON omr_answers FOR ALL
  USING (public.user_role() = 'super_admin');

-- Admin: full access via establishment of the parent chain
CREATE POLICY "omr_answers_admin_establishment"
  ON omr_answers FOR ALL
  USING (
    public.user_role() = 'admin'
    AND EXISTS (
      SELECT 1
      FROM omr_results or2
      JOIN scanned_copies sc ON sc.id = or2.copy_id
      WHERE or2.id = omr_answers.omr_result_id
        AND sc.establishment_id = public.user_establishment_id()
    )
  );

-- Professor: full access via establishment of the parent chain
CREATE POLICY "omr_answers_professor_establishment"
  ON omr_answers FOR ALL
  USING (
    public.user_role() = 'professor'
    AND EXISTS (
      SELECT 1
      FROM omr_results or2
      JOIN scanned_copies sc ON sc.id = or2.copy_id
      WHERE or2.id = omr_answers.omr_result_id
        AND sc.establishment_id = public.user_establishment_id()
    )
  );

-- Student: read own OMR answers only
CREATE POLICY "omr_answers_student_own"
  ON omr_answers FOR SELECT
  USING (
    public.user_role() = 'student'
    AND EXISTS (
      SELECT 1
      FROM omr_results or2
      JOIN scanned_copies sc ON sc.id = or2.copy_id
      WHERE or2.id = omr_answers.omr_result_id
        AND sc.student_id = auth.uid()
    )
  );

-- =============================================================================
-- 6. UPDATED_AT TRIGGERS
-- Automatically sets updated_at = now() on any UPDATE row.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_updated_at_establishments
  BEFORE UPDATE ON establishments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_classes
  BEFORE UPDATE ON classes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_exams
  BEFORE UPDATE ON exams
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_exam_questions
  BEFORE UPDATE ON exam_questions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_scanned_copies
  BEFORE UPDATE ON scanned_copies
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =============================================================================
-- 7. TABLE-LEVEL PERMISSIONS
-- =============================================================================
-- RLS controls WHICH rows; GRANT controls WHETHER the role can access the table at all.

-- Full CRUD for authenticated role (RLS restricts rows)
GRANT SELECT, INSERT, UPDATE, DELETE ON establishments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON classes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON student_classes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON exams TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON exam_classes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON exam_questions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON scanned_copies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ocr_results TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON omr_results TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON omr_answers TO authenticated;

-- Sequences needed for UUID generation on INSERT
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Minimal anon access (pre-login if needed)
GRANT SELECT ON establishments TO anon;
GRANT SELECT ON profiles TO anon;
