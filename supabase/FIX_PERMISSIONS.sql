-- FIX: Grant table-level permissions to authenticated and anon roles
-- RLS policies control WHO can access WHAT, but GRANT controls WHETHER the role can access the table at all.

-- Grant SELECT on all tables to authenticated (RLS still limits rows)
GRANT SELECT ON establishments TO authenticated;
GRANT SELECT ON profiles TO authenticated;
GRANT SELECT ON classes TO authenticated;
GRANT SELECT ON student_classes TO authenticated;
GRANT SELECT ON exams TO authenticated;
GRANT SELECT ON exam_classes TO authenticated;
GRANT SELECT ON exam_questions TO authenticated;
GRANT SELECT ON scanned_copies TO authenticated;
GRANT SELECT ON ocr_results TO authenticated;
GRANT SELECT ON omr_results TO authenticated;
GRANT SELECT ON omr_answers TO authenticated;

-- Grant INSERT/UPDATE/DELETE on all tables to authenticated (RLS still limits rows)
GRANT INSERT, UPDATE, DELETE ON establishments TO authenticated;
GRANT INSERT, UPDATE, DELETE ON profiles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON classes TO authenticated;
GRANT INSERT, UPDATE, DELETE ON student_classes TO authenticated;
GRANT INSERT, UPDATE, DELETE ON exams TO authenticated;
GRANT INSERT, UPDATE, DELETE ON exam_classes TO authenticated;
GRANT INSERT, UPDATE, DELETE ON exam_questions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON scanned_copies TO authenticated;
GRANT INSERT, UPDATE, DELETE ON ocr_results TO authenticated;
GRANT INSERT, UPDATE, DELETE ON omr_results TO authenticated;
GRANT INSERT, UPDATE, DELETE ON omr_answers TO authenticated;

-- Grant USAGE on all sequences (needed for INSERT with auto-generated UUIDs)
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Grant anon role (minimal: just SELECT, for pre-login checks if needed)
GRANT SELECT ON establishments TO anon;
GRANT SELECT ON profiles TO anon;
