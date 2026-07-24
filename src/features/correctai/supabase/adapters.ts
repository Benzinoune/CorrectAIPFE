import type {
  Admin,
  ClassRoom,
  Establishment,
  Exam,
  ExamQuestion,
  Professor,
  ScannedCopy,
  Student,
} from '../types';
import type { Tables } from './types';

type ProfileRow = Tables<'profiles'>;
type EstablishmentRow = Tables<'establishments'>;
type ClassRow = Tables<'classes'>;
type ExamRow = Tables<'exams'>;
type ScannedCopyRow = Tables<'scanned_copies'>;
type ExamQuestionRow = Tables<'exam_questions'>;
type OcrResultRow = Tables<'ocr_results'>;
type OmrResultRow = Tables<'omr_results'>;
type OmrAnswerRow = Tables<'omr_answers'>;
type ExamClassRow = Tables<'exam_classes'>;
type StudentClassRow = Tables<'student_classes'>;

export function toEstablishment(row: EstablishmentRow): Establishment {
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    adminName: row.admin_name,
    adminEmail: row.admin_email,
    status: row.status,
    professorsCount: row.professors_count,
    studentsCount: row.students_count,
    createdAt: row.created_at,
    stats: [
      { label: 'Professeurs', value: String(row.professors_count), tone: 'primary' },
      { label: 'Etudiants', value: String(row.students_count), tone: 'primary' },
      { label: 'Examens/mois', value: '0', tone: 'primary' },
    ],
  };
}

export function toAdmin(row: ProfileRow, establishments: EstablishmentRow[]): Admin {
  const est = establishments.find((e) => e.id === row.establishment_id);
  const firstName = row.first_name;
  const lastName = row.last_name;
  const fullName = `${firstName} ${lastName}`.trim();
  return {
    id: row.id,
    initials: row.initials,
    firstName,
    lastName,
    name: fullName,
    email: row.email,
    status: row.status,
    establishment: est?.name ?? '',
    establishmentId: row.establishment_id ?? '',
    createdAt: row.created_at,
  };
}

export function toProfessor(row: ProfileRow, establishments: EstablishmentRow[]): Professor {
  const est = establishments.find((e) => e.id === row.establishment_id);
  const firstName = row.first_name;
  const lastName = row.last_name;
  const fullName = `${firstName} ${lastName}`.trim();
  return {
    id: row.id,
    initials: row.initials,
    firstName,
    lastName,
    name: fullName,
    email: row.email,
    status: row.status,
    establishment: est?.name ?? '',
    establishmentId: row.establishment_id ?? '',
    stats: [
      { label: 'Classes', value: '0', tone: 'primary' },
      { label: 'Examens', value: '0', tone: 'primary' },
      { label: 'Etudiants', value: '0', tone: 'primary' },
    ],
  };
}

export function toStudent(
  row: ProfileRow,
  studentClasses: StudentClassRow[],
  classes: ClassRow[],
): Student {
  const classIds = studentClasses
    .filter((sc) => sc.student_id === row.id)
    .map((sc) => sc.class_id);
  const classNames = classIds.map(
    (id) => classes.find((c) => c.id === id)?.name ?? id,
  );
  return {
    id: row.id,
    initials: row.initials,
    firstName: row.first_name,
    lastName: row.last_name,
    matricule: row.matricule ?? '',
    email: row.email,
    externalRef: row.external_ref ?? '',
    correctAiId: row.correct_ai_id ?? '',
    establishmentId: row.establishment_id ?? '',
    classes: classNames,
    classIds,
  };
}

export function toClassRoom(row: ClassRow): ClassRoom {
  return {
    id: row.id,
    name: row.name,
    students: row.students_count,
    exams: row.exams_count,
    establishmentId: row.establishment_id,
  };
}

export function toExam(
  row: ExamRow,
  examClasses: ExamClassRow[],
  examQuestions: ExamQuestionRow[],
  classes: ClassRow[],
  scannedCopies?: ScannedCopy[],
): Exam {
  const classIds = examClasses
    .filter((ec) => ec.exam_id === row.id)
    .map((ec) => ec.class_id);
  const className =
    classIds.length > 0
      ? classIds.map((id) => classes.find((c) => c.id === id)?.name ?? id).join(', ')
      : row.class_name;

  const questionBank: ExamQuestion[] = examQuestions
    .filter((eq) => eq.exam_id === row.id)
    .sort((a, b) => a.number - b.number)
    .map((eq) => ({
      number: eq.number,
      correctAnswers: eq.correct_answers,
      detectedAnswers: eq.detected_answers ?? [],
      points: eq.points,
    }));

  const copies = scannedCopies?.length ?? 0;

  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    className,
    classIds: classIds.length > 0 ? classIds : undefined,
    professorId: row.professor_id ?? undefined,
    date: row.date,
    copies,
    status: row.status,
    questions: row.questions,
    establishmentId: row.establishment_id,
    responseSheetId: row.response_sheet_id ?? undefined,
    questionBank: questionBank.length > 0 ? questionBank : undefined,
    scannedCopies: scannedCopies && scannedCopies.length > 0 ? scannedCopies : undefined,
  };
}

export function toScannedCopy(
  row: ScannedCopyRow,
  ocrResult?: OcrResultRow,
  omrResult?: OmrResultRow & { answers: OmrAnswerRow[] },
): ScannedCopy {
  return {
    id: row.id,
    examId: row.exam_id,
    examName: row.exam_name,
    studentId: row.student_id ?? undefined,
    studentName: row.student_name,
    matricule: row.matricule,
    className: row.class_name,
    scannedAt: row.scanned_at,
    establishmentId: row.establishment_id ?? '',
    imageUri: row.image_url ?? undefined,
    annotatedImageUri: row.annotated_image_url ?? undefined,
    aiConfidence: row.ai_confidence,
    reviewStatus: row.review_status,
    detectedAnswers: row.detected_answers,
    detectedAnswersCount: row.detected_answers_count,
    calculatedScore: row.calculated_score ?? undefined,
    ocrResult: ocrResult
      ? {
          extracted: ocrResult.extracted,
          name: ocrResult.name,
          matricule: ocrResult.matricule,
          className: ocrResult.class_name,
          confidence: ocrResult.confidence,
          missingFields: ocrResult.missing_fields,
        }
      : undefined,
    omrResult: omrResult
      ? {
          detected: omrResult.detected,
          answers: omrResult.answers.map((a) => ({
            question: a.question_number,
            answer: a.answer,
            confidence: a.confidence,
          })),
        }
      : undefined,
    metadata: (row.metadata as ScannedCopy['metadata']) ?? undefined,
  };
}
