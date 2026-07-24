import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../client';
import type { Tables, TablesInsert, TablesUpdate } from '../types';
import type {
  Admin,
  ClassRoom,
  Establishment,
  Exam,
  Professor,
  ScannedCopy,
  Student,
} from '../../types';
import {
  toAdmin,
  toClassRoom,
  toEstablishment,
  toExam,
  toProfessor,
  toScannedCopy,
  toStudent,
} from '../adapters';

type RawData = {
  establishments: Tables<'establishments'>[];
  profiles: Tables<'profiles'>[];
  classes: Tables<'classes'>[];
  exams: Tables<'exams'>[];
  studentClasses: Tables<'student_classes'>[];
  examClasses: Tables<'exam_classes'>[];
  examQuestions: Tables<'exam_questions'>[];
};

function buildEstablishments(rows: Tables<'establishments'>[]): Establishment[] {
  return rows.map(toEstablishment);
}

function buildAdmins(profiles: Tables<'profiles'>[], establishments: Tables<'establishments'>[]): Admin[] {
  return profiles
    .filter((p) => p.role === 'admin')
    .map((p) => toAdmin(p, establishments));
}

function buildProfessors(profiles: Tables<'profiles'>[], establishments: Tables<'establishments'>[]): Professor[] {
  return profiles
    .filter((p) => p.role === 'professor')
    .map((p) => toProfessor(p, establishments));
}

function buildStudents(
  profiles: Tables<'profiles'>[],
  studentClasses: Tables<'student_classes'>[],
  classes: Tables<'classes'>[],
): Student[] {
  return profiles
    .filter((p) => p.role === 'student')
    .map((p) => toStudent(p, studentClasses, classes));
}

function buildClasses(rows: Tables<'classes'>[]): ClassRoom[] {
  return rows.map(toClassRoom);
}

function buildExams(
  exams: Tables<'exams'>[],
  examClasses: Tables<'exam_classes'>[],
  examQuestions: Tables<'exam_questions'>[],
  classes: Tables<'classes'>[],
): Exam[] {
  return exams.map((row) => toExam(row, examClasses, examQuestions, classes));
}

export function useCorrectAiData(role?: string | null) {
  const roleRef = useRef(role);
  roleRef.current = role;

  const requireRole = useCallback((...allowed: string[]) => {
    if (!roleRef.current || !allowed.includes(roleRef.current)) {
      throw new Error('Unauthorized');
    }
  }, []);

  const sanitizeError = useCallback((err: { message: string } | null): string => {
    if (!err) return 'Une erreur est survenue.';
    const msg = err.message.toLowerCase();
    if (msg.includes('row-level security') || msg.includes('permission denied')) return 'Vous n\'avez pas les droits pour cette opération.';
    if (msg.includes('unique') || msg.includes('duplicate')) return 'Un élément similaire existe déjà.';
    if (msg.includes('foreign key') || msg.includes('violates')) return 'Opération impossible : des dépendances existent.';
    if (msg.includes('check constraint')) return 'Les données saisies ne sont pas valides.';
    return 'Une erreur est survenue. Réessayez.';
  }, []);

  const [establishmentsData, setEstablishmentsData] = useState<Establishment[]>([]);
  const [adminsData, setAdminsData] = useState<Admin[]>([]);
  const [professorsData, setProfessorsData] = useState<Professor[]>([]);
  const [studentsData, setStudentsData] = useState<Student[]>([]);
  const [classesData, setClassesData] = useState<ClassRoom[]>([]);
  const [examsData, setExamsData] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const rawRef = useRef<RawData>({
    establishments: [],
    profiles: [],
    classes: [],
    exams: [],
    studentClasses: [],
    examClasses: [],
    examQuestions: [],
  });

  const rebuild = useCallback((raw: RawData) => {
    const ests = buildEstablishments(raw.establishments);
    const profs = buildProfessors(raw.profiles, raw.establishments);
    const studs = buildStudents(raw.profiles, raw.studentClasses, raw.classes);
    const cls = buildClasses(raw.classes);
    const exms = buildExams(raw.exams, raw.examClasses, raw.examQuestions, raw.classes);

    const examById = new Map(raw.exams.map((e) => [e.id, e]));
    const profExamClassCounts = new Map<string, Set<string>>();
    const profExamCounts = new Map<string, number>();
    for (const ec of raw.examClasses) {
      const exam = examById.get(ec.exam_id);
      if (!exam?.professor_id) continue;
      if (!profExamClassCounts.has(exam.professor_id)) profExamClassCounts.set(exam.professor_id, new Set());
      profExamClassCounts.get(exam.professor_id)!.add(ec.class_id);
    }
    for (const exam of raw.exams) {
      if (exam.professor_id) profExamCounts.set(exam.professor_id, (profExamCounts.get(exam.professor_id) ?? 0) + 1);
    }
    const studentsByEst = new Map<string, number>();
    for (const s of studs) {
      studentsByEst.set(s.establishmentId, (studentsByEst.get(s.establishmentId) ?? 0) + 1);
    }
    const examCountByEst = new Map<string, number>();
    for (const e of exms) {
      examCountByEst.set(e.establishmentId, (examCountByEst.get(e.establishmentId) ?? 0) + 1);
    }

    const enrichedProfessors = profs.map((prof) => ({
      ...prof,
      stats: [
        { label: 'Classes', value: String(profExamClassCounts.get(prof.id)?.size ?? 0), tone: 'primary' as const },
        { label: 'Examens', value: String(profExamCounts.get(prof.id) ?? 0), tone: 'primary' as const },
        { label: 'Etudiants', value: String(studentsByEst.get(prof.establishmentId) ?? 0), tone: 'primary' as const },
      ],
    }));

    const enrichedEstablishments = ests.map((est) => ({
      ...est,
      stats: [
        { label: 'Professeurs', value: String(est.professorsCount), tone: 'primary' as const },
        { label: 'Etudiants', value: String(est.studentsCount), tone: 'primary' as const },
        { label: 'Examens/mois', value: String(examCountByEst.get(est.id) ?? 0), tone: 'primary' as const },
      ],
    }));

    setEstablishmentsData(enrichedEstablishments);
    setAdminsData(buildAdmins(raw.profiles, raw.establishments));
    setProfessorsData(enrichedProfessors);
    setStudentsData(studs);
    setClassesData(cls);
    setExamsData(exms);
  }, []);

  const refetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [estResult, profileResult, classResult, scResult, ecResult, eqResult, examResult] =
        await Promise.all([
          supabase.from('establishments').select('*').order('created_at', { ascending: false }),
          supabase.from('profiles').select('*').order('created_at', { ascending: false }),
          supabase.from('classes').select('*').order('name', { ascending: true }),
          supabase.from('student_classes').select('*'),
          supabase.from('exam_classes').select('*'),
          supabase.from('exam_questions').select('*'),
          supabase.from('exams').select('*').order('date', { ascending: false }),
        ]);

      const raw: RawData = {
        establishments: estResult.data ?? [],
        profiles: profileResult.data ?? [],
        classes: classResult.data ?? [],
        studentClasses: scResult.data ?? [],
        examClasses: ecResult.data ?? [],
        examQuestions: eqResult.data ?? [],
        exams: examResult.data ?? [],
      };

      rawRef.current = raw;

      const firstError =
        estResult.error ??
        profileResult.error ??
        classResult.error ??
        scResult.error ??
        ecResult.error ??
        eqResult.error ??
        examResult.error;

      if (firstError) {
        setError(firstError.message);
      } else {
        rebuild(raw);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [rebuild]);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      await refetchAll();
    })();
    return () => { controller.abort(); };
  }, [refetchAll]);

  const loadScannedCopiesForExam = useCallback(async (examId: string): Promise<ScannedCopy[]> => {
    const { data: copies } = await supabase
      .from('scanned_copies')
      .select('*, ocr_results(*), omr_results(*, omr_answers(*))')
      .eq('exam_id', examId)
      .order('scanned_at', { ascending: false });

    if (!copies || copies.length === 0) return [];

    return copies.map((copy) => {
      const ocrRow = Array.isArray(copy.ocr_results) ? copy.ocr_results[0] : copy.ocr_results;
      const omrRow = Array.isArray(copy.omr_results) ? copy.omr_results[0] : copy.omr_results;
      const omrAnswers = omrRow && Array.isArray(omrRow.omr_answers) ? omrRow.omr_answers : [];
      return toScannedCopy(
        copy,
        ocrRow ?? undefined,
        omrRow ? { ...omrRow, answers: omrAnswers } : undefined,
      );
    });
  }, []);

  const createEstablishmentRow = useCallback(async (draft: TablesInsert<'establishments'>): Promise<Establishment | null> => {
    requireRole('super_admin');
    const { data: row, error: err } = await supabase
      .from('establishments')
      .insert(draft)
      .select()
      .single();
    if (err) { setError(sanitizeError(err)); return null; }
    rawRef.current.establishments = [row, ...rawRef.current.establishments];
    rebuild(rawRef.current);
    return toEstablishment(row);
  }, [rebuild, requireRole]);

  const updateEstablishmentRow = useCallback(async (id: string, changes: TablesUpdate<'establishments'>): Promise<Establishment | null> => {
    requireRole('super_admin');
    const { data: row, error: err } = await supabase
      .from('establishments')
      .update(changes)
      .eq('id', id)
      .select()
      .single();
    if (err) { setError(sanitizeError(err)); return null; }
    if (!row) return null;
    rawRef.current.establishments = rawRef.current.establishments.map((e) => (e.id === id ? row : e));
    rebuild(rawRef.current);
    return toEstablishment(row);
  }, [rebuild, requireRole]);

  const removeEstablishment = useCallback(async (id: string): Promise<boolean> => {
    requireRole('super_admin');
    const removedProfileIds = rawRef.current.profiles.filter((p) => p.establishment_id === id).map((p) => p.id);
    const removedExamIds = rawRef.current.exams.filter((e) => e.establishment_id === id).map((e) => e.id);

    const childDeletes = [
      ...removedExamIds.flatMap((examId) => [
        supabase.from('scanned_copies').delete().eq('exam_id', examId),
        supabase.from('exam_questions').delete().eq('exam_id', examId),
        supabase.from('exam_classes').delete().eq('exam_id', examId),
      ]),
      ...removedProfileIds.map((pid) => supabase.from('student_classes').delete().eq('student_id', pid)),
      supabase.from('classes').delete().eq('establishment_id', id),
    ];
    await Promise.all(childDeletes);

    await Promise.all([
      supabase.from('exams').delete().eq('establishment_id', id),
      supabase.from('profiles').delete().eq('establishment_id', id),
    ]);

    const { error: err } = await supabase.from('establishments').delete().eq('id', id);
    if (err) { setError(sanitizeError(err)); return false; }
    rawRef.current.establishments = rawRef.current.establishments.filter((e) => e.id !== id);
    rawRef.current.profiles = rawRef.current.profiles.filter((p) => p.establishment_id !== id);
    rawRef.current.classes = rawRef.current.classes.filter((c) => c.establishment_id !== id);
    rawRef.current.exams = rawRef.current.exams.filter((e) => e.establishment_id !== id);
    rawRef.current.studentClasses = rawRef.current.studentClasses.filter((sc) => !removedProfileIds.includes(sc.student_id));
    rawRef.current.examClasses = rawRef.current.examClasses.filter((ec) => !removedExamIds.includes(ec.exam_id));
    rawRef.current.examQuestions = rawRef.current.examQuestions.filter((eq) => !removedExamIds.includes(eq.exam_id));
    rebuild(rawRef.current);
    return true;
  }, [rebuild, requireRole]);

  const createProfileRow = useCallback(async (draft: TablesInsert<'profiles'>): Promise<Tables<'profiles'> | null> => {
    requireRole('super_admin', 'admin');
    const { data: row, error: err } = await supabase
      .from('profiles')
      .insert(draft)
      .select()
      .single();
    if (err) { setError(sanitizeError(err)); return null; }
    rawRef.current.profiles = [row, ...rawRef.current.profiles];
    rebuild(rawRef.current);
    return row;
  }, [rebuild, requireRole]);

  const updateProfileRow = useCallback(async (id: string, changes: TablesUpdate<'profiles'>): Promise<Tables<'profiles'> | null> => {
    requireRole('super_admin', 'admin', 'professor');
    const { data: row, error: err } = await supabase
      .from('profiles')
      .update(changes)
      .eq('id', id)
      .select()
      .single();
    if (err) { setError(sanitizeError(err)); return null; }
    if (!row) return null;
    rawRef.current.profiles = rawRef.current.profiles.map((p) => (p.id === id ? row : p));
    rebuild(rawRef.current);
    return row;
  }, [rebuild, requireRole]);

  const removeProfile = useCallback(async (id: string): Promise<boolean> => {
    requireRole('super_admin', 'admin', 'professor');
    const { error: err } = await supabase.from('profiles').delete().eq('id', id);
    if (err) { setError(sanitizeError(err)); return false; }
    rawRef.current.profiles = rawRef.current.profiles.filter((p) => p.id !== id);
    rawRef.current.studentClasses = rawRef.current.studentClasses.filter((sc) => sc.student_id !== id);
    rawRef.current.examClasses = rawRef.current.examClasses.filter((ec) => {
      const exam = rawRef.current.exams.find((e) => e.id === ec.exam_id);
      return !exam || exam.professor_id !== id;
    });
    rawRef.current.exams = rawRef.current.exams.filter((e) => e.professor_id !== id);
    rebuild(rawRef.current);
    return true;
  }, [rebuild, requireRole]);

  const createClassRow = useCallback(async (draft: TablesInsert<'classes'>): Promise<ClassRoom | null> => {
    requireRole('super_admin', 'admin');
    const { data: row, error: err } = await supabase
      .from('classes')
      .insert(draft)
      .select()
      .single();
    if (err) { setError(sanitizeError(err)); return null; }
    rawRef.current.classes = [...rawRef.current.classes, row];
    rebuild(rawRef.current);
    return toClassRoom(row);
  }, [rebuild, requireRole]);

  const updateClassRow = useCallback(async (id: string, changes: TablesUpdate<'classes'>): Promise<ClassRoom | null> => {
    requireRole('super_admin', 'admin');
    const { data: row, error: err } = await supabase
      .from('classes')
      .update(changes)
      .eq('id', id)
      .select()
      .single();
    if (err) { setError(sanitizeError(err)); return null; }
    if (!row) return null;
    rawRef.current.classes = rawRef.current.classes.map((c) => (c.id === id ? row : c));
    rebuild(rawRef.current);
    return toClassRoom(row);
  }, [rebuild, requireRole]);

  const removeClass = useCallback(async (id: string): Promise<boolean> => {
    requireRole('super_admin', 'admin');
    const { error: err } = await supabase.from('classes').delete().eq('id', id);
    if (err) { setError(sanitizeError(err)); return false; }
    rawRef.current.classes = rawRef.current.classes.filter((c) => c.id !== id);
    rawRef.current.studentClasses = rawRef.current.studentClasses.filter((sc) => sc.class_id !== id);
    rawRef.current.examClasses = rawRef.current.examClasses.filter((ec) => ec.class_id !== id);
    rebuild(rawRef.current);
    return true;
  }, [rebuild, requireRole]);

  const createExamRow = useCallback(async (draft: TablesInsert<'exams'>): Promise<Exam | null> => {
    requireRole('super_admin', 'admin', 'professor');
    const { data: row, error: err } = await supabase
      .from('exams')
      .insert(draft)
      .select()
      .single();
    if (err) { setError(sanitizeError(err)); return null; }
    rawRef.current.exams = [row, ...rawRef.current.exams];
    rebuild(rawRef.current);
    return toExam(row, rawRef.current.examClasses, rawRef.current.examQuestions, rawRef.current.classes);
  }, [rebuild, requireRole]);

  const updateExamRow = useCallback(async (id: string, changes: TablesUpdate<'exams'>): Promise<Exam | null> => {
    requireRole('super_admin', 'admin', 'professor');
    const { data: row, error: err } = await supabase
      .from('exams')
      .update(changes)
      .eq('id', id)
      .select()
      .single();
    if (err) { setError(sanitizeError(err)); return null; }
    rawRef.current.exams = rawRef.current.exams.map((e) => (e.id === id ? row : e));
    rebuild(rawRef.current);
    return toExam(row, rawRef.current.examClasses, rawRef.current.examQuestions, rawRef.current.classes);
  }, [rebuild, requireRole]);

  const removeExam = useCallback(async (id: string): Promise<boolean> => {
    requireRole('super_admin', 'admin', 'professor');
    const { error: err } = await supabase.from('exams').delete().eq('id', id);
    if (err) { setError(sanitizeError(err)); return false; }
    rawRef.current.exams = rawRef.current.exams.filter((e) => e.id !== id);
    rawRef.current.examClasses = rawRef.current.examClasses.filter((ec) => ec.exam_id !== id);
    rawRef.current.examQuestions = rawRef.current.examQuestions.filter((eq) => eq.exam_id !== id);
    rebuild(rawRef.current);
    return true;
  }, [rebuild, requireRole]);

  const createExamClass = useCallback(async (examId: string, classId: string): Promise<boolean> => {
    requireRole('super_admin', 'admin', 'professor');
    const { error: err } = await supabase
      .from('exam_classes')
      .insert({ exam_id: examId, class_id: classId });
    if (err) { setError(sanitizeError(err)); return false; }
    rawRef.current.examClasses = [...rawRef.current.examClasses, { exam_id: examId, class_id: classId }];
    rebuild(rawRef.current);
    return true;
  }, [rebuild, requireRole]);

  const removeExamClass = useCallback(async (examId: string, classId: string): Promise<boolean> => {
    requireRole('super_admin', 'admin', 'professor');
    const { error: err } = await supabase
      .from('exam_classes')
      .delete()
      .eq('exam_id', examId)
      .eq('class_id', classId);
    if (err) { setError(sanitizeError(err)); return false; }
    rawRef.current.examClasses = rawRef.current.examClasses.filter(
      (ec) => !(ec.exam_id === examId && ec.class_id === classId),
    );
    rebuild(rawRef.current);
    return true;
  }, [rebuild, requireRole]);

  const upsertExamQuestion = useCallback(async (
    examId: string,
    number: number,
    changes: TablesUpdate<'exam_questions'>,
  ): Promise<boolean> => {
    requireRole('super_admin', 'admin', 'professor');
    const existing = rawRef.current.examQuestions.find(
      (eq) => eq.exam_id === examId && eq.number === number,
    );
    if (existing) {
      const { error: err } = await supabase
        .from('exam_questions')
        .update(changes)
        .eq('id', existing.id);
      if (err) { setError(sanitizeError(err)); return false; }
      rawRef.current.examQuestions = rawRef.current.examQuestions.map((eq) =>
        eq.id === existing.id ? { ...eq, ...changes } : eq,
      );
    } else {
      const { data: row, error: err } = await supabase
        .from('exam_questions')
        .insert({ exam_id: examId, number, ...changes })
        .select()
        .single();
      if (err) { setError(sanitizeError(err)); return false; }
      rawRef.current.examQuestions = [...rawRef.current.examQuestions, row];
    }
    rebuild(rawRef.current);
    return true;
  }, [rebuild, requireRole]);

  const createStudentClass = useCallback(async (studentId: string, classId: string): Promise<boolean> => {
    requireRole('super_admin', 'admin', 'professor');
    const { error: err } = await supabase
      .from('student_classes')
      .insert({ student_id: studentId, class_id: classId });
    if (err) { setError(sanitizeError(err)); return false; }
    rawRef.current.studentClasses = [...rawRef.current.studentClasses, { student_id: studentId, class_id: classId }];
    rebuild(rawRef.current);
    return true;
  }, [rebuild, requireRole]);

  const removeStudentClass = useCallback(async (studentId: string, classId: string): Promise<boolean> => {
    requireRole('super_admin', 'admin', 'professor');
    const { error: err } = await supabase
      .from('student_classes')
      .delete()
      .eq('student_id', studentId)
      .eq('class_id', classId);
    if (err) { setError(sanitizeError(err)); return false; }
    rawRef.current.studentClasses = rawRef.current.studentClasses.filter(
      (sc) => !(sc.student_id === studentId && sc.class_id === classId),
    );
    rebuild(rawRef.current);
    return true;
  }, [rebuild, requireRole]);

  const createScannedCopyRow = useCallback(async (draft: TablesInsert<'scanned_copies'>): Promise<Tables<'scanned_copies'> | null> => {
    requireRole('super_admin', 'admin', 'professor', 'student');
    const { data: row, error: err } = await supabase
      .from('scanned_copies')
      .insert(draft)
      .select()
      .single();
    if (err) { setError(sanitizeError(err)); return null; }
    return row;
  }, [requireRole]);

  const updateScannedCopyRow = useCallback(async (id: string, changes: TablesUpdate<'scanned_copies'>): Promise<Tables<'scanned_copies'> | null> => {
    requireRole('super_admin', 'admin', 'professor');
    const { data: row, error: err } = await supabase
      .from('scanned_copies')
      .update(changes)
      .eq('id', id)
      .select()
      .single();
    if (err) { setError(sanitizeError(err)); return null; }
    return row;
  }, [requireRole]);

  const removeScannedCopyRow = useCallback(async (id: string): Promise<boolean> => {
    requireRole('super_admin', 'admin', 'professor');
    const { error: err } = await supabase.from('scanned_copies').delete().eq('id', id);
    if (err) { setError(sanitizeError(err)); return false; }
    return true;
  }, [requireRole]);

  const insertOcrResult = useCallback(async (draft: TablesInsert<'ocr_results'>): Promise<boolean> => {
    requireRole('super_admin', 'admin', 'professor');
    const { error: err } = await supabase.from('ocr_results').insert(draft);
    if (err) { setError(sanitizeError(err)); return false; }
    return true;
  }, [requireRole]);

  const insertOmrResult = useCallback(async (
    draft: TablesInsert<'omr_results'>,
    answers: TablesInsert<'omr_answers'>[],
  ): Promise<boolean> => {
    requireRole('super_admin', 'admin', 'professor');
    const { data: row, error: err } = await supabase
      .from('omr_results')
      .insert(draft)
      .select()
      .single();
    if (err) { setError(sanitizeError(err)); return false; }
    if (answers.length > 0) {
      const { error: ansErr } = await supabase
        .from('omr_answers')
        .insert(answers.map((a) => ({ ...a, omr_result_id: row.id })));
      if (ansErr) { setError(sanitizeError(ansErr)); return false; }
    }
    return true;
  }, [requireRole]);

  return {
    establishmentsData,
    adminsData,
    professorsData,
    studentsData,
    classesData,
    examsData,
    loading,
    error,
    refetchAll,
    loadScannedCopiesForExam,
    createEstablishmentRow,
    updateEstablishmentRow,
    removeEstablishment,
    createProfileRow,
    updateProfileRow,
    removeProfile,
    createClassRow,
    updateClassRow,
    removeClass,
    createExamRow,
    updateExamRow,
    removeExam,
    createExamClass,
    removeExamClass,
    upsertExamQuestion,
    createStudentClass,
    removeStudentClass,
    createScannedCopyRow,
    updateScannedCopyRow,
    removeScannedCopyRow,
    insertOcrResult,
    insertOmrResult,
  };
}
