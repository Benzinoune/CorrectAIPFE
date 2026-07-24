-- FIX: Infinite recursion in classes/student_classes RLS policies
-- The cycle is: classes policy -> queries student_classes -> student_classes policy -> queries classes -> loop
-- Fix: Use SECURITY DEFINER functions that bypass RLS to break the cycle.

-- 1. Drop the problematic policies
DROP POLICY IF EXISTS "classes_student_enrolled" ON classes;
DROP POLICY IF EXISTS "student_classes_student_own" ON student_classes;
DROP POLICY IF EXISTS "student_classes_professor_establishment" ON student_classes;
DROP POLICY IF EXISTS "classes_student_classes_admin" ON student_classes;

-- 2. Create SECURITY DEFINER helper functions (bypass RLS, break the cycle)
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

-- 3. Recreate policies using the SECURITY DEFINER functions
CREATE POLICY "classes_student_enrolled"
  ON classes FOR SELECT
  USING (
    public.user_role() = 'student'
    AND public.is_student_in_class(id)
  );

CREATE POLICY "student_classes_student_own"
  ON student_classes FOR SELECT
  USING (public.user_role() = 'student' AND student_id = auth.uid());

CREATE POLICY "student_classes_professor_establishment"
  ON student_classes FOR ALL
  USING (
    public.user_role() = 'professor'
    AND public.is_class_in_establishment(class_id)
  );

CREATE POLICY "classes_student_classes_admin"
  ON student_classes FOR ALL
  USING (
    public.user_role() = 'admin'
    AND public.is_class_in_establishment(class_id)
  );
