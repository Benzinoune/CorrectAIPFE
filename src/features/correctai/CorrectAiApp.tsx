import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { InstitutionUnavailableScreen } from '@/features/correctai/components/InstitutionUnavailableScreen';
import { DataRefreshProvider } from '@/features/correctai/components/ui';
import {
  AdminHomeScreen,
  AdminEditProfessorScreen,
  AdminNewProfessorScreen,
  AdminProfessorDetailScreen,
  AdminProfessorsScreen,
  AdminAccountScreen,
} from '@/features/correctai/screens/admin';
import {
  ForgotPasswordScreen,
  LoginScreen,
  SignupScreen,
  SplashScreen,
} from '@/features/correctai/screens/auth';
import {
  SuperAdminAdminDetailScreen,
  SuperAdminAdminsScreen,
  SuperAdminEstablishmentDetailScreen,
  SuperAdminEstablishmentsScreen,
  SuperAdminEstablishmentSettingsScreen,
  SuperAdminHomeScreen,
  SuperAdminNewAdminScreen,
  SuperAdminNewEstablishmentScreen,
  SuperAdminNewProfessorScreen,
  SuperAdminProfessorDetailScreen,
  SuperAdminProfessorsScreen,
  SuperAdminAccountScreen,
} from '@/features/correctai/screens/super-admin';
import {
  ProfessorAccountScreen,
  ProfessorAddStudentScreen,
  ProfessorQuestionDetailScreen,
  ProfessorAnswerKeyScreen,
  ProfessorAnswerSheetScreen,
  ProfessorClassDetailScreen,
  ProfessorClassesScreen,
  ProfessorScannedCopyCorrectionScreen,
  ProfessorExamMenuScreen,
  ProfessorExamsScreen,
  ProfessorHomeScreen,
  ProfessorNewExamScreen,
  ProfessorScannedCopyDetailScreen,
  ProfessorScanValidationScreen,
  ProfessorScanResultScreen,
  ProfessorScannerScreen,
  ProfessorScannedCopiesListScreen,
  ProfessorStudentDetailScreen,
  ProfessorStudentEditScreen,
  ProfessorStudentsScreen,
} from '@/features/correctai/screens/professor';
import {
  StudentExamResultScreen,
  StudentExamsScreen,
  StudentHomeScreen,
  StudentProfileScreen,
  StudentReportScreen,
} from '@/features/correctai/screens/student';
import { useCorrectAiData } from '@/features/correctai/supabase/hooks/useCorrectAiData';
import type {
  Admin,
  AdminCreateInput,
  AppScreen,
  ClassRoom,
  Establishment,
  Exam,
  ExamQuestion,
  Professor,
  ProfessorCreateInput,
  ScannedCopy,
  ScannedCopyDraft,
  Student,
  StudentCreateInput,
  TabId,
  UserRole,
} from '@/features/correctai/types';
import { checkInstitutionStatus, getBlockedMessage } from '@/features/correctai/utils/institution-status';

const activeTabs: Partial<Record<AppScreen, TabId>> = {
  'super-admin-home': 'home',
  'super-admin-establishments': 'establishments',
  'super-admin-establishment-detail': 'establishments',
  'super-admin-establishment-settings': 'establishments',
  'super-admin-new-establishment': 'establishments',
  'super-admin-admins': 'establishments',
  'super-admin-admin-detail': 'establishments',
  'super-admin-new-admin': 'establishments',
  'super-admin-professors': 'professors',
  'super-admin-professor-detail': 'professors',
  'super-admin-new-professor': 'professors',
  'admin-home': 'home',
  'admin-professors': 'professors',
  'professor-home': 'home',
  'professor-classes': 'classes',
  'professor-exams': 'exams',
  'professor-students': 'students',
  'professor-account': 'profile',
  'admin-account': 'profile',
  'super-admin-account': 'profile',
  'student-home': 'home',
  'student-exams': 'exams',
  'student-report': 'report',
  'student-profile': 'profile',
};

function cloneScannedCopy(copy: ScannedCopy): ScannedCopy {
  return {
    ...copy,
    detectedAnswers: [...copy.detectedAnswers],
    ocrResult: copy.ocrResult
      ? {
          ...copy.ocrResult,
          missingFields: [...copy.ocrResult.missingFields],
        }
      : undefined,
    omrResult: copy.omrResult
      ? {
          ...copy.omrResult,
          answers: copy.omrResult.answers.map((answer) => ({ ...answer })),
        }
      : undefined,
    metadata: copy.metadata ? { ...copy.metadata } : undefined,
  };
}

function buildDefaultQuestionBank(questionCount: number, defaultPoints = 1): ExamQuestion[] {
  return Array.from({ length: questionCount }, (_, index) => ({
    number: index + 1,
    correctAnswers: [],
    detectedAnswers: [],
    points: defaultPoints,
  }));
}

function classNamesFromIds(classIds: string[] | undefined, classList: ClassRoom[]) {
  if (!classIds?.length) {
    return [];
  }

  return classIds.map((classId) => classList.find((classItem) => classItem.id === classId)?.name ?? classId);
}

function normalizeClassValue(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
}

function matchesClassReference(value: string, classItem: Pick<ClassRoom, 'id' | 'name'>) {
  const normalizedValue = normalizeClassValue(value);
  return (
    value === classItem.id ||
    normalizedValue === normalizeClassValue(classItem.id) ||
    normalizedValue === normalizeClassValue(classItem.name)
  );
}

function studentBelongsToClass(student: Student, classItem: ClassRoom) {
  if (student.classIds?.some((id) => id === classItem.id)) {
    return true;
  }
  return student.classes.some((value) => matchesClassReference(value, classItem));
}

function examBelongsToClass(exam: Exam, classItem: ClassRoom) {
  if (exam.classIds?.some((classId) => classId === classItem.id)) {
    return true;
  }

  if (matchesClassReference(exam.className, classItem)) {
    return true;
  }

  return (exam.className ?? '')
    .split(/[,/|]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => matchesClassReference(part, classItem));
}

function buildClassesWithCounts(classItems: ClassRoom[], studentItems: Student[], examItems: Exam[]) {
  return classItems.map((classItem) => ({
    ...classItem,
    students: studentItems.filter((student) => studentBelongsToClass(student, classItem)).length,
    exams: examItems.filter((exam) => examBelongsToClass(exam, classItem)).length,
  }));
}

function buildStudentInitials(firstName: string, lastName: string) {
  const first = firstName.trim().charAt(0);
  const last = lastName.trim().charAt(0);
  const initials = `${first}${last}`.trim();

  return initials ? initials.toUpperCase() : 'ST';
}

function buildProfessorInitials(firstName: string, lastName: string) {
  const initials = `${firstName.trim().charAt(0)}${lastName.trim().charAt(0)}`;

  return initials ? initials.toUpperCase() : 'PR';
}

function buildCorrectAiId() {
  return `CA-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*';
  const arr = new Uint8Array(18);
  for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * chars.length);
  return Array.from(arr, (n) => chars[n % chars.length]).join('');
}

export function CorrectAiApp() {
  const [screen, setScreen] = useState<AppScreen>(() => 'splash');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [selectedEstablishment, setSelectedEstablishment] = useState<Establishment | null>(null);
  const [selectedProfessor, setSelectedProfessor] = useState<Professor | null>(null);
  const [selectedAdmin, setSelectedAdmin] = useState<Admin | null>(null);
  const [selectedClass, setSelectedClass] = useState<ClassRoom | null>(null);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [selectedScannedCopy, setSelectedScannedCopy] = useState<ScannedCopy | null>(null);
  const [selectedExamCopies, setSelectedExamCopies] = useState<ScannedCopy[]>([]);
  const [selectedQuestionNumber, setSelectedQuestionNumber] = useState<number | null>(null);
  const [scannerMode, setScannerMode] = useState<'copies' | 'key'>('copies');

  const [adminEstablishmentId, setAdminEstablishmentId] = useState<string | undefined>(undefined);
  const [loggedInUserId, setLoggedInUserId] = useState<string | null>(null);
  const [loggedInRole, setLoggedInRole] = useState<UserRole | null>(null);
  const [loggedInProfile, setLoggedInProfile] = useState<{ initials: string; first_name: string; last_name: string; email: string; status: string; created_at: string } | null>(null);

  const {
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
  } = useCorrectAiData(loggedInRole);

  const activeTab = useMemo(() => activeTabs[screen] ?? 'home', [screen]);

  const classesWithCounts = useMemo(
    () => buildClassesWithCounts(classesData, studentsData, examsData),
    [classesData, examsData, studentsData],
  );
  const selectedClassForRender = useMemo(
    () => (selectedClass ? classesWithCounts.find((classItem) => classItem.id === selectedClass.id) ?? selectedClass : null),
    [classesWithCounts, selectedClass],
  );
  const selectedStudentForRender = useMemo(
    () => (selectedStudent ? studentsData.find((student) => student.id === selectedStudent.id) ?? selectedStudent : null),
    [selectedStudent, studentsData],
  );
  const selectedEstablishmentForRender = useMemo(
    () =>
      selectedEstablishment
        ? establishmentsData.find((est) => est.id === selectedEstablishment.id) ?? selectedEstablishment
        : null,
    [establishmentsData, selectedEstablishment],
  );
  const selectedProfessorForRender = useMemo(
    () =>
      selectedProfessor
        ? professorsData.find((professor) => professor.id === selectedProfessor.id) ?? selectedProfessor
        : null,
    [professorsData, selectedProfessor],
  );
  const selectedExamForRender = useMemo(() => {
    if (!selectedExam) return null;
    const base = examsData.find((exam) => exam.id === selectedExam.id) ?? selectedExam;
    if (selectedExamCopies.length > 0) {
      return { ...base, scannedCopies: selectedExamCopies, copies: selectedExamCopies.length };
    }
    return base;
  }, [examsData, selectedExam, selectedExamCopies]);
  const totalCopies = useMemo(
    () => examsData.reduce((sum, exam) => sum + exam.copies, 0),
    [examsData],
  );

  const selectedScannedCopyForRender = useMemo(() => {
    if (!selectedExamForRender?.scannedCopies?.length) {
      return null;
    }

    return (
      selectedExamForRender.scannedCopies.find((copy) => copy.id === selectedScannedCopy?.id) ??
      selectedExamForRender.scannedCopies[selectedExamForRender.scannedCopies.length - 1] ??
      null
    );
  }, [selectedExamForRender, selectedScannedCopy]);

  useEffect(() => {
    if (!selectedExam) {
      setSelectedExamCopies([]);
      return;
    }
    let mounted = true;
    loadScannedCopiesForExam(selectedExam.id).then((copies) => {
      if (mounted) setSelectedExamCopies(copies);
    });
    return () => { mounted = false; };
  }, [selectedExam, loadScannedCopiesForExam]);

  const [previousScreen, setPreviousScreen] = useState<AppScreen | null>(null);

  const navigate = useCallback((nextScreen: AppScreen) => {
    if (nextScreen !== screen) {
      setPreviousScreen(screen);
      setScreen(nextScreen);
    }
  }, [screen]);

  const loggedInProfessor = useMemo(
    () => (loggedInRole === 'professor' && loggedInUserId ? professorsData.find((p) => p.id === loggedInUserId) ?? null : null),
    [loggedInRole, loggedInUserId, professorsData],
  );

  const loggedInAdmin = useMemo(
    () => (loggedInRole === 'admin' && loggedInUserId ? adminsData.find((a) => a.id === loggedInUserId) ?? null : null),
    [adminsData, loggedInRole, loggedInUserId],
  );

  const loggedInStudent = useMemo(
    () => (loggedInRole === 'student' && loggedInUserId ? studentsData.find((s) => s.id === loggedInUserId) ?? null : null),
    [loggedInRole, loggedInUserId, studentsData],
  );

  const loggedInSuperAdmin = useMemo<Admin | undefined>(() => {
    if (loggedInRole !== 'super_admin' || !loggedInUserId || !loggedInProfile) return undefined;
    return {
      id: loggedInUserId,
      initials: loggedInProfile.initials,
      firstName: loggedInProfile.first_name,
      lastName: loggedInProfile.last_name,
      name: `${loggedInProfile.first_name} ${loggedInProfile.last_name}`.trim(),
      email: loggedInProfile.email,
      status: 'ACTIF',
      establishment: '',
      establishmentId: '',
      createdAt: loggedInProfile.created_at,
    };
  }, [loggedInRole, loggedInUserId, loggedInProfile]);

  const institutionCheck = useMemo(() => {
    if (!loggedInRole || loggedInRole === 'super_admin') {
      return { allowed: true } as const;
    }
    if (establishmentsData.length === 0) {
      return { allowed: true } as const;
    }
    const establishmentId = loggedInProfessor?.establishmentId
      ?? loggedInAdmin?.establishmentId
      ?? loggedInStudent?.establishmentId
      ?? adminEstablishmentId
      ?? '';
    return checkInstitutionStatus(establishmentsData, establishmentId);
  }, [loggedInRole, loggedInProfessor?.establishmentId, loggedInAdmin?.establishmentId, loggedInStudent?.establishmentId, adminEstablishmentId, establishmentsData]);

  useEffect(() => {
    if (!institutionCheck.allowed && loggedInRole && loggedInRole !== 'super_admin') {
      setLoggedInUserId(null);
      setLoggedInRole(null);
      setAdminEstablishmentId(undefined);
      setScreen('login');
    }
  }, [institutionCheck.allowed, loggedInRole]);

  useEffect(() => {
    let mounted = true;
    let subscription: { unsubscribe: () => void } | null = null;

    const init = async () => {
      try {
        const authModule = await import('@/features/correctai/supabase/auth');
        const { data: { subscription: sub } } = authModule.onAuthStateChange(async (authUser) => {
          if (!mounted) return;
          if (authUser) {
            setLoggedInUserId(authUser.id);
            setLoggedInRole(authUser.role);
            setAdminEstablishmentId(authUser.profile.establishment_id ?? undefined);
            setLoggedInProfile(authUser.profile);
          } else {
            setLoggedInUserId(null);
            setLoggedInRole(null);
            setAdminEstablishmentId(undefined);
            setLoggedInProfile(null);
            setSelectedStudent(null);
            setSelectedProfessor(null);
            setSelectedAdmin(null);
            setSelectedEstablishment(null);
            setSelectedClass(null);
            setSelectedExam(null);
            setSelectedScannedCopy(null);
            setSelectedExamCopies([]);
            setSelectedQuestionNumber(null);
            setScreen('login');
          }
        });
        subscription = sub;

        const session = await authModule.getCurrentSession();
        if (mounted && session) {
          setLoggedInUserId(session.id);
          setLoggedInRole(session.role);
          setAdminEstablishmentId(session.profile.establishment_id ?? undefined);
          setLoggedInProfile(session.profile);

          const homeScreens: Record<string, string> = {
            super_admin: 'super-admin-home',
            admin: 'admin-home',
            professor: 'professor-home',
            student: 'student-home',
          };
          const homeScreen = homeScreens[session.role];
          if (homeScreen) {
            setScreen(homeScreen as AppScreen);
          }
        }
      } catch (e) {
        if (mounted) setScreen('login');
      }
    };

    init();

    return () => {
      mounted = false;
      subscription?.unsubscribe?.();
    };
  }, []);

  const professorEstablishmentId = loggedInProfessor?.establishmentId ?? '';
  const professorClasses = useMemo(
    () => classesWithCounts.filter((c) => c.establishmentId === professorEstablishmentId),
    [classesWithCounts, professorEstablishmentId],
  );
  const professorExams = useMemo(
    () => examsData.filter(
      (e) => e.establishmentId === professorEstablishmentId
        && (!e.professorId || e.professorId === loggedInProfessor?.id),
    ),
    [examsData, professorEstablishmentId, loggedInProfessor?.id],
  );
  const professorStudents = useMemo(
    () => studentsData.filter((s) => s.establishmentId === professorEstablishmentId),
    [studentsData, professorEstablishmentId],
  );

  const studentEstablishmentId = loggedInStudent?.establishmentId ?? '';
  const studentClassIds = loggedInStudent?.classIds ?? [];
  const studentClassNames = loggedInStudent?.classes ?? [];
  const studentExams = useMemo(
    () => examsData.filter((e) => {
      if (e.establishmentId !== studentEstablishmentId) return false;
      if (studentClassIds.length > 0 && e.classIds?.some((id) => studentClassIds.includes(id))) return true;
      return (e.className ?? '')
        .split(/[,/|]+/)
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean)
        .some((part) => studentClassNames.some((name) => name.toLowerCase() === part));
    }),
    [examsData, studentEstablishmentId, studentClassIds, studentClassNames],
  );
  const studentStudents = useMemo(
    () => studentsData.filter((s) => s.id === loggedInStudent?.id),
    [studentsData, loggedInStudent?.id],
  );

  const handleLogout = useCallback(async () => {
    try {
      const { signOut } = await import('@/features/correctai/supabase/auth');
      await signOut();
    } catch {
      // Sign out may fail on network error; state cleanup still proceeds
    }
    setLoggedInUserId(null);
    setLoggedInRole(null);
    setLoggedInProfile(null);
    setAdminEstablishmentId(undefined);
    setSelectedStudent(null);
    setSelectedProfessor(null);
    setSelectedAdmin(null);
    setSelectedEstablishment(null);
    setSelectedClass(null);
    setSelectedExam(null);
    setSelectedScannedCopy(null);
    setSelectedExamCopies([]);
    setSelectedQuestionNumber(null);
    setScreen('login');
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    const { signIn, checkInstitutionStatus: checkInst } = await import('@/features/correctai/supabase/auth');
    const normalizedEmail = email.trim().toLowerCase();

    let result;
    try {
      result = await signIn(normalizedEmail, password);
    } catch (e) {
      return { success: false, error: 'Erreur réseau. Vérifiez votre connexion.' };
    }
    if (!result.success) {
      return { success: false, error: result.error };
    }

    const user = result.user!;
    setSelectedStudent(null);
    setSelectedProfessor(null);
    setSelectedAdmin(null);
    setSelectedEstablishment(null);
    setSelectedClass(null);
    setSelectedExam(null);
    setSelectedScannedCopy(null);
    setSelectedExamCopies([]);
    setSelectedQuestionNumber(null);

    const instCheck = await checkInst(user.profile.establishment_id ?? '');
    if (!instCheck.allowed) {
      return { success: false, error: instCheck.reason ? getBlockedMessage(instCheck.reason) : 'Accès refusé.' };
    }

    setLoggedInRole(user.role);
    setLoggedInUserId(user.id);
    setAdminEstablishmentId(user.profile.establishment_id ?? undefined);
    setLoggedInProfile(user.profile);

    switch (user.role) {
      case 'super_admin':
        setScreen('super-admin-home');
        break;
      case 'admin':
        setSelectedAdmin({
          id: user.id,
          initials: user.profile.initials,
          firstName: user.profile.first_name,
          lastName: user.profile.last_name,
          name: `${user.profile.first_name} ${user.profile.last_name}`,
          email: user.email,
          status: user.profile.status,
          establishment: '',
          establishmentId: user.profile.establishment_id ?? '',
          createdAt: user.profile.created_at,
        });
        setScreen('admin-home');
        break;
      case 'professor':
        setSelectedProfessor({
          id: user.id,
          initials: user.profile.initials,
          firstName: user.profile.first_name,
          lastName: user.profile.last_name,
          name: `${user.profile.first_name} ${user.profile.last_name}`,
          email: user.email,
          status: user.profile.status,
          establishment: '',
          establishmentId: user.profile.establishment_id ?? '',
          stats: [],
        });
        setScreen('professor-home');
        break;
      case 'student':
        setSelectedStudent({
          id: user.id,
          initials: user.profile.initials,
          firstName: user.profile.first_name,
          lastName: user.profile.last_name,
          matricule: user.profile.matricule ?? '',
          email: user.email,
          externalRef: user.profile.external_ref ?? '',
          correctAiId: user.profile.correct_ai_id ?? '',
          establishmentId: user.profile.establishment_id ?? '',
          classes: [],
          classIds: [],
        });
        setScreen('student-home');
        break;
    }

    return { success: true };
  };

  const createAdmin = async (draft: AdminCreateInput) => {
    const firstName = draft.firstName.trim();
    const lastName = draft.lastName.trim();
    const email = draft.email.trim().toLowerCase();
    const tempPassword = generateTempPassword();
    const { signUp } = await import('@/features/correctai/supabase/auth');
    const result = await signUp(email, tempPassword, {
      role: 'admin',
      status: 'ACTIF',
      initials: `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase(),
      first_name: firstName,
      last_name: lastName || ' ',
      email,
      establishment_id: draft.establishmentId || null,
      matricule: null,
      external_ref: null,
      correct_ai_id: null,
    });
    if (!result.success) return;
    const row = result.user!.profile;
    setSelectedAdmin({
      id: row.id, initials: row.initials, firstName: row.first_name, lastName: row.last_name,
      name: `${row.first_name} ${row.last_name}`.trim(),
      email: row.email, status: row.status, establishment: draft.establishment,
      establishmentId: row.establishment_id ?? '', createdAt: row.created_at,
    });
  };

  const updateAdmin = async (updated: Admin) => {
    await updateProfileRow(updated.id, {
      initials: updated.initials,
      first_name: updated.firstName,
      last_name: updated.lastName,
      email: updated.email,
      status: updated.status,
    });
    setSelectedAdmin(updated);
  };

  const deleteAdmin = async (adminId: string) => {
    await removeProfile(adminId);
    setSelectedAdmin((current) => (current?.id === adminId ? null : current));
  };

  const updateProfessor = async (updated: Professor) => {
    await updateProfileRow(updated.id, {
      initials: updated.initials,
      first_name: updated.firstName,
      last_name: updated.lastName,
      email: updated.email,
      status: updated.status,
    });
    setSelectedProfessor(updated);
  };

  const deleteProfessor = async (professorId: string) => {
    await removeProfile(professorId);
    setSelectedProfessor((current) =>
      current?.id === professorId ? (professorsData[0] ? professorsData[0] : null) : current,
    );
  };

  const createEstablishment = async (draft: {
    name: string;
    city: string;
    adminName: string;
    adminEmail: string;
  }) => {
    const estRow = await createEstablishmentRow({
      name: draft.name,
      city: draft.city,
      admin_name: draft.adminName,
      admin_email: draft.adminEmail.toLowerCase(),
      status: 'ACTIF',
    });
    if (estRow) {
      setSelectedEstablishment(estRow);
      const { signUp } = await import('@/features/correctai/supabase/auth');
      const nameParts = draft.adminName.split(' ');
      const tempPassword = generateTempPassword();
      await signUp(draft.adminEmail.toLowerCase(), tempPassword, {
        role: 'admin',
        initials: draft.adminName.split(' ').map((p) => p.charAt(0)).join('').toUpperCase().slice(0, 2) || 'AD',
        first_name: nameParts[0] ?? draft.adminName,
        last_name: nameParts.slice(1).join(' ') || ' ',
        email: draft.adminEmail.toLowerCase(),
        establishment_id: estRow.id,
        status: 'ACTIF',
        matricule: null,
        external_ref: null,
        correct_ai_id: null,
      });
    }
  };

  const updateEstablishment = async (updated: Establishment) => {
    await updateEstablishmentRow(updated.id, {
      name: updated.name,
      city: updated.city,
      admin_name: updated.adminName,
      admin_email: updated.adminEmail,
      status: updated.status,
      professors_count: updated.professorsCount,
      students_count: updated.studentsCount,
    });
    setSelectedEstablishment(updated);
  };

  const deleteEstablishment = async (establishmentId: string) => {
    await removeEstablishment(establishmentId);
    setSelectedEstablishment(null);
    setSelectedProfessor(null);
    setSelectedExam(null);
    setSelectedScannedCopy(null);
  };

  const createProfessor = async (professorDraft: ProfessorCreateInput) => {
    const firstName = professorDraft.firstName.trim();
    const lastName = professorDraft.lastName.trim();
    const establishmentId = professorDraft.establishmentId || adminEstablishmentId || '';
    const email = professorDraft.email.trim().toLowerCase();
    const tempPassword = generateTempPassword();
    const { signUp } = await import('@/features/correctai/supabase/auth');
    const result = await signUp(email, tempPassword, {
      role: 'professor',
      status: 'ACTIF',
      initials: buildProfessorInitials(firstName, lastName),
      first_name: firstName || 'Nouveau',
      last_name: lastName || 'Professeur',
      email,
      establishment_id: establishmentId || null,
      matricule: null,
      external_ref: null,
      correct_ai_id: null,
    });
    if (!result.success) return;
    const row = result.user!.profile;
    const prof: Professor = {
      id: row.id, initials: row.initials, firstName: row.first_name, lastName: row.last_name,
      name: `${row.first_name} ${row.last_name}`.trim(),
      email: row.email, status: row.status,
      establishment: professorDraft.establishment || 'Etablissement',
      establishmentId: row.establishment_id ?? '',
      stats: [{ label: 'Classes', value: '0', tone: 'primary' }, { label: 'Examens', value: '0', tone: 'primary' }, { label: 'Etudiants', value: '0', tone: 'primary' }],
    };
    setSelectedProfessor(prof);
  };

  const updateStudent = async (updatedStudent: Student) => {
    await updateProfileRow(updatedStudent.id, {
      initials: updatedStudent.initials,
      first_name: updatedStudent.firstName,
      last_name: updatedStudent.lastName,
      email: updatedStudent.email.trim().toLowerCase(),
      matricule: updatedStudent.matricule,
      external_ref: updatedStudent.externalRef,
      correct_ai_id: updatedStudent.correctAiId,
    });
    const oldStudent = studentsData.find((s) => s.id === updatedStudent.id);
    const oldClassIds = oldStudent?.classIds ?? [];
    const newClassIds = updatedStudent.classIds ?? [];
    for (const classId of oldClassIds) {
      if (!newClassIds.includes(classId)) {
        await removeStudentClass(updatedStudent.id, classId);
      }
    }
    for (const classId of newClassIds) {
      if (!oldClassIds.includes(classId)) {
        await createStudentClass(updatedStudent.id, classId);
      }
    }
    setSelectedStudent(updatedStudent);
  };

  const createStudent = async (studentDraft: StudentCreateInput) => {
    const firstName = studentDraft.firstName.trim();
    const lastName = studentDraft.lastName.trim();
    const matricule = studentDraft.matricule.trim();
    const estId = loggedInProfessor?.establishmentId ?? loggedInAdmin?.establishmentId ?? '';
    const email = studentDraft.email.trim().toLowerCase();
    const tempPassword = generateTempPassword();
    const { signUp } = await import('@/features/correctai/supabase/auth');
    const result = await signUp(email, tempPassword, {
      role: 'student',
      status: 'ACTIF',
      initials: buildStudentInitials(firstName, lastName),
      first_name: firstName || 'Prenom',
      last_name: lastName || 'Nom',
      email,
      matricule: matricule || `MAT-${Date.now().toString(36).slice(-4)}`,
      external_ref: matricule || `MAT-${Date.now().toString(36).slice(-4)}`,
      correct_ai_id: buildCorrectAiId(),
      establishment_id: estId || null,
    });
    if (!result.success) return;
    const row = result.user!.profile;
    const student: Student = {
      id: row.id, initials: row.initials, firstName: row.first_name, lastName: row.last_name,
      matricule: row.matricule ?? '', email: row.email,
      externalRef: row.external_ref ?? '', correctAiId: row.correct_ai_id ?? '',
      establishmentId: row.establishment_id ?? '',
      classes: [...studentDraft.classes],
      classIds: studentDraft.classIds ? [...studentDraft.classIds] : undefined,
    };
    const classIds = studentDraft.classIds ?? [];
    for (const classId of classIds) {
      await createStudentClass(row.id, classId);
    }
    setSelectedStudent(student);
  };

  const deleteStudent = async (studentId: string) => {
    await removeProfile(studentId);
    setSelectedStudent((current) =>
      current?.id === studentId ? (studentsData[0] ? studentsData[0] : null) : current,
    );
  };

  const createExam = async (examDraft: Omit<Exam, 'id'>) => {
    const estId = loggedInProfessor?.establishmentId ?? loggedInAdmin?.establishmentId ?? examDraft.establishmentId ?? '';
    const examId = `exam-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const row = await createExamRow({
      id: examId,
      name: examDraft.name,
      subject: examDraft.subject,
      class_name: examDraft.className,
      professor_id: examDraft.professorId || loggedInProfessor?.id || null,
      establishment_id: estId,
      date: examDraft.date,
      questions: examDraft.questions,
      status: examDraft.status,
    });
    if (row) {
      if (examDraft.classIds) {
        for (const classId of examDraft.classIds) {
          await createExamClass(examId, classId);
        }
      }
      const bank = examDraft.questionBank ?? buildDefaultQuestionBank(examDraft.questions);
      for (const q of bank) {
        await upsertExamQuestion(examId, q.number, { correct_answers: q.correctAnswers, points: q.points });
      }
      setSelectedExam({ ...row, questionBank: bank, scannedCopies: [], copies: 0 });
    }
  };

  const updateExam = async (updatedExam: Exam) => {
    await updateExamRow(updatedExam.id, {
      name: updatedExam.name,
      subject: updatedExam.subject,
      class_name: updatedExam.className,
      professor_id: updatedExam.professorId || null,
      date: updatedExam.date,
      questions: updatedExam.questions,
      status: updatedExam.status,
    });
    const oldExam = examsData.find((e) => e.id === updatedExam.id);
    const oldClassIds = oldExam?.classIds ?? [];
    const newClassIds = updatedExam.classIds ?? [];
    for (const classId of oldClassIds) {
      if (!newClassIds.includes(classId)) {
        await removeExamClass(updatedExam.id, classId);
      }
    }
    for (const classId of newClassIds) {
      if (!oldClassIds.includes(classId)) {
        await createExamClass(updatedExam.id, classId);
      }
    }
    if (updatedExam.questionBank) {
      for (const q of updatedExam.questionBank) {
        await upsertExamQuestion(updatedExam.id, q.number, { correct_answers: q.correctAnswers, points: q.points });
      }
    }
    const oldCopies = selectedExamCopies;
    const newCopies = updatedExam.scannedCopies ?? [];
    const newCopyIds = new Set(newCopies.map((c) => c.id));
    for (const oldCopy of oldCopies) {
      if (!newCopyIds.has(oldCopy.id)) {
        await removeScannedCopyRow(oldCopy.id);
      }
    }
    for (const copy of newCopies) {
      const existing = oldCopies.find((c) => c.id === copy.id);
      if (existing) {
        await updateScannedCopyRow(copy.id, {
          review_status: copy.reviewStatus,
          calculated_score: copy.calculatedScore,
          detected_answers: copy.detectedAnswers,
          detected_answers_count: copy.detectedAnswersCount,
          annotated_image_url: copy.annotatedImageUri ?? null,
          ai_confidence: copy.aiConfidence,
        });
      }
    }
    setSelectedExam(updatedExam);
    setSelectedScannedCopy((currentCopy) => {
      if (!updatedExam.scannedCopies?.length) return null;
      if (currentCopy) {
        const found = updatedExam.scannedCopies.find((copy) => copy.id === currentCopy.id);
        if (found) return found;
      }
      return updatedExam.scannedCopies[0] ?? null;
    });
  };

  const deleteExam = async (examId: string) => {
    for (const copy of selectedExamCopies.filter((c) => c.examId === examId)) {
      await removeScannedCopyRow(copy.id);
    }
    setSelectedExamCopies((current) => current.filter((c) => c.examId !== examId));
    await removeExam(examId);
    setSelectedExam((currentExam) => (currentExam?.id === examId ? null : currentExam));
    setSelectedScannedCopy(null);
  };

  const registerExamScan = (draft?: ScannedCopyDraft): ScannedCopy | null => {
    if (!selectedExam) return null;

    const existingCopies = selectedExamCopies;
    const nextCopyNumber = existingCopies.length + 1;
    const detectedAnswers =
      draft?.detectedAnswers ??
      draft?.omrResult?.answers?.map((answer) => answer.answer ?? '') ??
      Array.from({ length: selectedExam.questions }, () => '');

    let computedScore = draft?.calculatedScore ?? '--';
    const bank = selectedExam.questionBank;
    if ((computedScore === '--' || !computedScore) && bank && detectedAnswers.length > 0) {
      let earned = 0;
      let possible = 0;
      bank.forEach((q, i) => {
        possible += q.points;
        const studentAns = detectedAnswers[i];
        if (studentAns && q.correctAnswers.length > 0) {
          const studentParts = studentAns.split('+').sort().join('+');
          const correctParts = [...q.correctAnswers].sort().join('+');
          if (studentParts === correctParts) earned += q.points;
        }
      });
      if (possible > 0) computedScore = `${earned}/${possible}`;
    }

    const studentId = (() => {
      const mat = draft?.ocrResult?.matricule?.trim() || draft?.matricule?.trim() || '';
      return mat ? studentsData.find((s) => s.matricule === mat)?.id : undefined;
    })();
    const className = selectedExam.classIds?.length
      ? classNamesFromIds(selectedExam.classIds, classesWithCounts).join(', ')
      : draft?.ocrResult?.className?.trim() || draft?.className?.trim() || selectedExam.className;

    const nextCopy: ScannedCopy = cloneScannedCopy({
      id: `copy-${selectedExam.id}-${Date.now().toString(36)}-${nextCopyNumber}`,
      examId: selectedExam.id,
      examName: selectedExam.name,
      studentId,
      studentName: draft?.ocrResult?.name?.trim() || draft?.studentName?.trim() || 'A extraire',
      matricule: draft?.ocrResult?.matricule?.trim() || draft?.matricule?.trim() || 'A extraire',
      className,
      scannedAt: new Date().toISOString(),
      establishmentId: selectedExam.establishmentId ?? '',
      imageUri: draft?.imageUri,
      annotatedImageUri: draft?.annotatedImageUri,
      aiConfidence: draft?.aiConfidence ?? 0,
      reviewStatus: 'DETECTED',
      detectedAnswers,
      detectedAnswersCount: draft?.detectedAnswersCount ?? detectedAnswers.length,
      calculatedScore: computedScore,
      ocrResult: draft?.ocrResult
        ? { ...draft.ocrResult, missingFields: [...draft.ocrResult.missingFields] }
        : {
            extracted: true,
            name: draft?.studentName?.trim() || 'A extraire',
            matricule: draft?.matricule?.trim() || 'A extraire',
            className,
            confidence: draft?.aiConfidence ?? 0,
            missingFields: [],
          },
      omrResult: draft?.omrResult
        ? { ...draft.omrResult, answers: draft.omrResult.answers.map((a) => ({ ...a })) }
        : {
            detected: detectedAnswers.length > 0,
            answers: detectedAnswers.map((answer, index) => ({
              question: index + 1,
              answer: answer || null,
              confidence: answer ? 82 : 0,
            })),
          },
      metadata: { source: 'scanner', processedAt: new Date().toISOString(), ...(draft?.metadata ?? {}) },
    });

    setSelectedExamCopies((current) => [...current, nextCopy]);
    setSelectedScannedCopy(nextCopy);

    (async () => {
      const copyRow = await createScannedCopyRow({
        exam_id: selectedExam.id,
        exam_name: selectedExam.name,
        student_id: studentId ?? null,
        student_name: nextCopy.studentName,
        matricule: nextCopy.matricule,
        class_name: className,
        establishment_id: selectedExam.establishmentId || null,
        ai_confidence: nextCopy.aiConfidence,
        review_status: 'DETECTED',
        detected_answers: detectedAnswers,
        detected_answers_count: nextCopy.detectedAnswersCount,
        calculated_score: computedScore,
        image_url: draft?.imageUri ?? null,
        annotated_image_url: draft?.annotatedImageUri ?? null,
        metadata: { source: 'scanner', processedAt: new Date().toISOString(), ...(draft?.metadata ?? {}) },
      });
      if (copyRow) {
        const ocrData = nextCopy.ocrResult;
        if (ocrData) {
          await insertOcrResult({
            copy_id: copyRow.id, extracted: ocrData.extracted, name: ocrData.name,
            matricule: ocrData.matricule, class_name: ocrData.className,
            confidence: ocrData.confidence, missing_fields: ocrData.missingFields,
          });
        }
        if (nextCopy.omrResult) {
          await insertOmrResult(
            { copy_id: copyRow.id, detected: nextCopy.omrResult.detected },
            nextCopy.omrResult.answers.map((a) => ({
              omr_result_id: '', question_number: a.question, answer: a.answer, confidence: a.confidence,
            })),
          );
        }
      }
    })();

    return nextCopy;
  };

  const updateScannedCopy = async (copy: ScannedCopy) => {
    await updateScannedCopyRow(copy.id, {
      review_status: copy.reviewStatus,
      calculated_score: copy.calculatedScore,
      detected_answers: copy.detectedAnswers,
      detected_answers_count: copy.detectedAnswersCount,
      annotated_image_url: copy.annotatedImageUri ?? null,
      ai_confidence: copy.aiConfidence,
    });
    setSelectedExamCopies((current) =>
      current.map((c) => (c.id === copy.id ? copy : c)),
    );
    if (selectedExam) {
      const updatedCopies = selectedExamCopies.map((c) => (c.id === copy.id ? copy : c));
      setSelectedExam({ ...selectedExam, scannedCopies: updatedCopies });
    }
    setSelectedScannedCopy(copy);
  };

  const deleteScannedCopy = async (copyId: string) => {
    await removeScannedCopyRow(copyId);
    setSelectedExamCopies((current) => current.filter((c) => c.id !== copyId));
    if (selectedExam) {
      const updatedCopies = (selectedExam.scannedCopies ?? []).filter((c) => c.id !== copyId);
      setSelectedExam({ ...selectedExam, scannedCopies: updatedCopies });
    }
    setSelectedScannedCopy(null);
  };

  const registerAnswerKeyScan = async (detectedAnswers: string[]) => {
    if (!selectedExam) return;
    const currentQuestionBank = selectedExam.questionBank ?? buildDefaultQuestionBank(selectedExam.questions);
    for (const question of currentQuestionBank) {
      const idx = question.number - 1;
      const rawAnswer = detectedAnswers[idx] ?? '';
      const answers = rawAnswer ? rawAnswer.split('+') : [];
      await upsertExamQuestion(selectedExam.id, question.number, { correct_answers: answers });
    }
    const updatedBank = currentQuestionBank.map((question, index) => {
      const rawAnswer = detectedAnswers[index] ?? '';
      return {
        ...question,
        correctAnswers: rawAnswer ? rawAnswer.split('+') : [],
        detectedAnswers: rawAnswer ? [rawAnswer] : [],
      };
    });
    setSelectedExam({ ...selectedExam, questionBank: updatedBank });
  };

  const createClass = async (className: string) => {
    const nextName = className.trim();
    if (!nextName) return;
    const estId = loggedInProfessor?.establishmentId ?? loggedInAdmin?.establishmentId ?? '';
    await createClassRow({ name: nextName, establishment_id: estId });
  };

  const updateClass = async (updatedClass: ClassRoom) => {
    await updateClassRow(updatedClass.id, { name: updatedClass.name });
    setSelectedClass(updatedClass);
  };

  const deleteClass = async (classId: string) => {
    await removeClass(classId);
    setSelectedClass((currentClass) =>
      currentClass?.id === classId ? (classesData[0] ?? null) : currentClass,
    );
  };

  if (!institutionCheck.allowed && loggedInRole && loggedInRole !== 'super_admin') {
    return (
      <InstitutionUnavailableScreen
        message={institutionCheck.reason ? getBlockedMessage(institutionCheck.reason) : 'Accès refusé.'}
        onReturnToLogin={handleLogout}
      />
    );
  }

  const isAuthScreen = screen === 'splash' || screen === 'login' || screen === 'signup' || screen === 'forgot-password';

  if (loading && !isAuthScreen) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8F9FC' }}>
        <ActivityIndicator size="large" color="#4A90D9" />
        <Text style={{ marginTop: 16, fontSize: 16, color: '#6B7280' }}>Chargement...</Text>
      </View>
    );
  }

  if (error && !isAuthScreen) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8F9FC', padding: 32 }}>
        <Ionicons name="alert-circle-outline" size={56} color="#EF4444" />
        <Text style={{ marginTop: 16, fontSize: 17, fontWeight: '600', color: '#1F2937', textAlign: 'center' }}>Erreur de chargement</Text>
        <Text style={{ marginTop: 8, fontSize: 14, color: '#6B7280', textAlign: 'center' }}>{error}</Text>
        <Pressable
          onPress={refetchAll}
          style={({ pressed }) => [{ marginTop: 24, backgroundColor: '#4A90D9', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }, pressed && { opacity: 0.8 }]}>
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>Réessayer</Text>
        </Pressable>
      </View>
    );
  }

  const renderScreen = () => {
    switch (screen) {
      case 'splash':
        return <SplashScreen onNavigate={navigate} />;
    case 'forgot-password':
      return <ForgotPasswordScreen onNavigate={navigate} />;
    case 'signup':
      return <SignupScreen onNavigate={navigate} />;
    case 'super-admin-home':
      return (
        <SuperAdminHomeScreen
          activeTab={activeTab}
          adminsData={adminsData}
          classesCount={classesWithCounts.length}
          copiesCount={totalCopies}
          establishmentsData={establishmentsData}
          examsCount={examsData.length}
          loggedInSuperAdmin={loggedInSuperAdmin}
          onNavigate={navigate}
          onSelectEstablishment={setSelectedEstablishment}
          professorsData={professorsData}
          studentsCount={studentsData.length}
        />
      );
    case 'super-admin-establishments':
      return (
        <SuperAdminEstablishmentsScreen
          activeTab={activeTab}
          establishmentsData={establishmentsData}
          onNavigate={navigate}
          onSelectEstablishment={setSelectedEstablishment}
        />
      );
    case 'super-admin-establishment-detail':
      return (
        <SuperAdminEstablishmentDetailScreen
          activeTab={activeTab}
          adminsData={adminsData}
          establishmentsData={establishmentsData}
          onDeleteEstablishment={deleteEstablishment}
          onNavigate={navigate}
          selectedEstablishment={selectedEstablishmentForRender}
        />
      );
    case 'super-admin-establishment-settings':
      return (
        <SuperAdminEstablishmentSettingsScreen
          activeTab={activeTab}
          establishmentsData={establishmentsData}
          onNavigate={navigate}
          onUpdateEstablishment={updateEstablishment}
          selectedEstablishment={selectedEstablishmentForRender}
        />
      );
    case 'super-admin-new-establishment':
      return (
        <SuperAdminNewEstablishmentScreen
          activeTab={activeTab}
          establishmentsData={establishmentsData}
          onNavigate={navigate}
          onCreateEstablishment={createEstablishment}
        />
      );
    case 'super-admin-admins':
      return (
        <SuperAdminAdminsScreen
          activeTab={activeTab}
          adminsData={adminsData}
          establishmentsData={establishmentsData}
          onNavigate={navigate}
          onSelectAdmin={setSelectedAdmin}
          selectedEstablishment={selectedEstablishmentForRender}
        />
      );
    case 'super-admin-admin-detail':
      return (
        <SuperAdminAdminDetailScreen
          activeTab={activeTab}
          establishmentsData={establishmentsData}
          onNavigate={navigate}
          onUpdateAdmin={updateAdmin}
          onDeleteAdmin={deleteAdmin}
          selectedAdmin={selectedAdmin}
        />
      );
    case 'super-admin-new-admin':
      return (
        <SuperAdminNewAdminScreen
          activeTab={activeTab}
          establishmentsData={establishmentsData}
          onNavigate={navigate}
          onCreateAdmin={createAdmin}
        />
      );
    case 'super-admin-professors':
      return (
        <SuperAdminProfessorsScreen
          activeTab={activeTab}
          establishmentsData={establishmentsData}
          onNavigate={navigate}
          onSelectProfessor={setSelectedProfessor}
          professorsData={professorsData}
        />
      );
    case 'super-admin-professor-detail':
      return (
        <SuperAdminProfessorDetailScreen
          activeTab={activeTab}
          establishmentsData={establishmentsData}
          onNavigate={navigate}
          onUpdateProfessor={updateProfessor}
          onDeleteProfessor={deleteProfessor}
          selectedProfessor={selectedProfessorForRender}
        />
      );
    case 'super-admin-new-professor':
      return (
        <SuperAdminNewProfessorScreen
          activeTab={activeTab}
          establishmentsData={establishmentsData}
          onCreateProfessor={createProfessor}
          onNavigate={navigate}
        />
      );
    case 'super-admin-account':
      return (
        <SuperAdminAccountScreen
          activeTab={activeTab}
          establishmentsData={establishmentsData}
          loggedInSuperAdmin={loggedInSuperAdmin}
          onNavigate={navigate}
          onLogout={handleLogout}
        />
      );
    case 'admin-home':
      return (
        <AdminHomeScreen
          activeTab={activeTab}
          adminEstablishmentId={adminEstablishmentId}
          loggedInAdmin={loggedInAdmin}
          onNavigate={navigate}
          onSelectProfessor={setSelectedProfessor}
          professorsData={professorsData}
        />
      );
    case 'admin-professors':
      return (
        <AdminProfessorsScreen
          activeTab={activeTab}
          adminEstablishmentId={adminEstablishmentId}
          onNavigate={navigate}
          onSelectProfessor={setSelectedProfessor}
          professorsData={professorsData}
        />
      );
    case 'admin-professor-detail':
      return (
        <AdminProfessorDetailScreen
          activeTab={activeTab}
          adminEstablishmentId={adminEstablishmentId}
          onDeleteProfessor={deleteProfessor}
          onNavigate={navigate}
          onUpdateProfessor={updateProfessor}
          selectedProfessor={selectedProfessorForRender}
        />
      );
    case 'admin-professor-edit':
      return (
        <AdminEditProfessorScreen
          activeTab={activeTab}
          onNavigate={navigate}
          onUpdateProfessor={updateProfessor}
          selectedProfessor={selectedProfessorForRender}
        />
      );
    case 'admin-new-professor':
      return (
        <AdminNewProfessorScreen
          activeTab={activeTab}
          adminEstablishmentId={adminEstablishmentId}
          establishmentName={establishmentsData.find((e) => e.id === adminEstablishmentId)?.name ?? ''}
          onCreateProfessor={createProfessor}
          onNavigate={navigate}
        />
      );
    case 'admin-account':
      return (
        <AdminAccountScreen
          activeTab={activeTab}
          onNavigate={navigate}
          onLogout={handleLogout}
          adminsData={adminsData}
          selectedAdmin={loggedInAdmin ?? selectedAdmin}
        />
      );
    case 'professor-home':
      return (
        <ProfessorHomeScreen
          activeTab={activeTab}
          classesData={professorClasses}
          examsData={professorExams}
          onNavigate={navigate}
          selectedProfessor={loggedInProfessor ?? selectedProfessorForRender}
          studentsData={professorStudents}
        />
      );
    case 'professor-students':
      return (
        <ProfessorStudentsScreen
          activeTab={activeTab}
          onNavigate={navigate}
          classesData={professorClasses}
          onSelectStudent={setSelectedStudent}
          studentsData={professorStudents}
        />
      );
    case 'professor-student-detail':
      return (
        <ProfessorStudentDetailScreen
          activeTab={activeTab}
          classesData={professorClasses}
          onDeleteStudent={deleteStudent}
          onNavigate={navigate}
          selectedStudent={selectedStudentForRender}
          studentsData={professorStudents}
          previousScreen={previousScreen}
        />
      );
    case 'professor-student-edit':
      return (
        <ProfessorStudentEditScreen
          activeTab={activeTab}
          onNavigate={navigate}
          selectedStudent={selectedStudentForRender}
          classesData={professorClasses}
          onUpdateStudent={updateStudent}
          onDeleteStudent={deleteStudent}
          studentsData={professorStudents}
        />
      );
    case 'professor-add-student':
      return (
        <ProfessorAddStudentScreen
          activeTab={activeTab}
          classesData={professorClasses}
          onCreateStudent={createStudent}
          onNavigate={navigate}
          selectedClass={selectedClassForRender}
          studentsData={professorStudents}
          previousScreen={previousScreen}
        />
      );
    case 'professor-classes':
      return (
        <ProfessorClassesScreen
          activeTab={activeTab}
          classesData={professorClasses}
          onCreateClass={createClass}
          onNavigate={navigate}
          onSelectClass={setSelectedClass}
        />
      );
    case 'professor-class-detail':
      return (
        <ProfessorClassDetailScreen
          activeTab={activeTab}
          classesData={professorClasses}
          examsData={professorExams}
          onDeleteClass={deleteClass}
          onNavigate={navigate}
          onSelectExam={setSelectedExam}
          onUpdateClass={updateClass}
          selectedClass={selectedClassForRender}
          studentsData={professorStudents}
        />
      );
    case 'professor-exams':
      return (
        <ProfessorExamsScreen
          activeTab={activeTab}
          examsData={professorExams}
          onNavigate={navigate}
          onSelectExam={setSelectedExam}
        />
      );
    case 'professor-new-exam':
      return (
        <ProfessorNewExamScreen
          activeTab={activeTab}
          classesData={professorClasses}
          examsData={professorExams}
          onCreateExam={createExam}
          onNavigate={navigate}
          onUpdateExam={updateExam}
          selectedExam={selectedExamForRender}
          selectedClass={selectedClassForRender}
          previousScreen={previousScreen}
        />
      );
    case 'professor-exam-menu':
      return (
        <ProfessorExamMenuScreen
          activeTab={activeTab}
          examsData={professorExams}
          classesData={professorClasses}
          onNavigate={navigate}
          onSetScannerMode={setScannerMode}
          selectedExam={selectedExamForRender}
          onSelectExam={setSelectedExam}
          onDeleteExam={deleteExam}
        />
      );
    case 'professor-answer-sheet':
      return (
        <ProfessorAnswerSheetScreen
          activeTab={activeTab}
          classesData={professorClasses}
          onNavigate={navigate}
          selectedExam={selectedExamForRender}
        />
      );
    case 'professor-scanner':
      return (
        <ProfessorScannerScreen
          activeTab={activeTab}
          onNavigate={navigate}
          onRegisterAnswerKeyScan={registerAnswerKeyScan}
          onRegisterExamScan={registerExamScan}
          scannerMode={scannerMode}
          selectedExam={selectedExamForRender}
        />
      );
    case 'professor-scan-result':
      return (
        <ProfessorScanResultScreen
          onNavigate={navigate}
          onScanReset={() => {
            setSelectedScannedCopy(null);
          }}
          selectedExam={selectedExamForRender}
          selectedScannedCopy={selectedScannedCopyForRender}
        />
      );
    case 'professor-review-copies':
      return (
        <ProfessorScannedCopiesListScreen
          activeTab={activeTab}
          classesData={professorClasses}
          onNavigate={navigate}
          onSelectScannedCopy={setSelectedScannedCopy}
          onUpdateExam={updateExam}
          selectedExam={selectedExamForRender}
          selectedScannedCopy={selectedScannedCopyForRender}
        />
      );
    case 'professor-copy-detail':
      return (
        <ProfessorScannedCopyDetailScreen
          activeTab={activeTab}
          classesData={professorClasses}
          onNavigate={navigate}
          onSelectScannedCopy={setSelectedScannedCopy}
          onUpdateExam={updateExam}
          selectedExam={selectedExamForRender}
          selectedScannedCopy={selectedScannedCopyForRender}
        />
      );
    case 'professor-copy-review':
      return (
        <ProfessorScanValidationScreen
          activeTab={activeTab}
          classesData={professorClasses}
          onNavigate={navigate}
          onSelectScannedCopy={setSelectedScannedCopy}
          onUpdateExam={updateExam}
          selectedExam={selectedExamForRender}
          selectedScannedCopy={selectedScannedCopyForRender}
        />
      );
    case 'professor-copy-revision':
      return (
        <ProfessorScannedCopyCorrectionScreen
          classesData={professorClasses}
          onNavigate={navigate}
          onSelectScannedCopy={setSelectedScannedCopy}
          onUpdateExam={updateExam}
          selectedExam={selectedExamForRender}
          selectedScannedCopy={selectedScannedCopyForRender}
        />
      );
    case 'professor-answer-key':
      return (
        <ProfessorAnswerKeyScreen
          activeTab={activeTab}
          onNavigate={navigate}
          onSelectQuestion={setSelectedQuestionNumber}
          onUpdateExam={updateExam}
          onSetScannerMode={setScannerMode}
          selectedExam={selectedExamForRender}
          selectedQuestionNumber={selectedQuestionNumber}
        />
      );
    case 'professor-answer-detail':
      return (
        <ProfessorQuestionDetailScreen
          activeTab={activeTab}
          onNavigate={navigate}
          onUpdateExam={updateExam}
          selectedExam={selectedExamForRender}
          selectedQuestionNumber={selectedQuestionNumber}
        />
      );
    case 'professor-account':
      return (
        <ProfessorAccountScreen
          activeTab={activeTab}
          classesData={professorClasses}
          examsData={professorExams}
          onLogout={handleLogout}
          onNavigate={navigate}
          onUpdateProfessor={updateProfessor}
          professorsData={professorsData}
          selectedProfessor={loggedInProfessor ?? selectedProfessorForRender}
          studentsData={professorStudents}
        />
      );
    case 'student-home':
      return <StudentHomeScreen activeTab={activeTab} establishmentsData={establishmentsData} examsData={studentExams} onNavigate={navigate} selectedStudent={loggedInStudent ?? selectedStudentForRender} studentsData={studentStudents} selectedExam={selectedExamForRender} onSelectExam={setSelectedExam} onLogout={handleLogout} />;
    case 'student-exams':
      return <StudentExamsScreen activeTab={activeTab} establishmentsData={establishmentsData} examsData={studentExams} onNavigate={navigate} selectedStudent={loggedInStudent ?? selectedStudentForRender} studentsData={studentStudents} selectedExam={selectedExamForRender} onSelectExam={setSelectedExam} onLogout={handleLogout} />;
    case 'student-exam-result':
      return <StudentExamResultScreen activeTab={activeTab} establishmentsData={establishmentsData} examsData={studentExams} onNavigate={navigate} selectedStudent={loggedInStudent ?? selectedStudentForRender} studentsData={studentStudents} selectedExam={selectedExamForRender} onSelectExam={setSelectedExam} onLogout={handleLogout} />;
    case 'student-report':
      return <StudentReportScreen activeTab={activeTab} establishmentsData={establishmentsData} examsData={studentExams} onNavigate={navigate} selectedStudent={loggedInStudent ?? selectedStudentForRender} studentsData={studentStudents} selectedExam={selectedExamForRender} onSelectExam={setSelectedExam} onLogout={handleLogout} />;
    case 'student-profile':
      return <StudentProfileScreen activeTab={activeTab} establishmentsData={establishmentsData} examsData={studentExams} onNavigate={navigate} onUpdateStudent={updateStudent} selectedStudent={loggedInStudent ?? selectedStudentForRender} studentsData={studentStudents} selectedExam={selectedExamForRender} onSelectExam={setSelectedExam} onLogout={handleLogout} />;
    case 'login':
    default:
      return <LoginScreen onLogin={login} onNavigate={navigate} />;
    }
  };

  return (
    <DataRefreshProvider value={{ onRefresh: refetchAll, refreshing: loading }}>
      {renderScreen()}
    </DataRefreshProvider>
  );
}
