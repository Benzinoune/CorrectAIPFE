import { StyleSheet } from 'react-native';

import { correctAiTheme } from '@/features/correctai/theme';
import type { AppScreen, Establishment, Exam, ExamQuestion, NavItem, ScannedCopy, Student } from '@/features/correctai/types';

const { colors, spacing, radius } = correctAiTheme;

export type StudentScreenProps = {
  activeTab: NavItem['id'];
  onNavigate: (screen: AppScreen) => void;
  studentsData: Student[];
  establishmentsData?: Establishment[];
  selectedStudent?: Student | null;
  examsData?: Exam[];
  selectedExam?: Exam | null;
  onSelectExam?: (exam: Exam) => void;
  onUpdateStudent?: (student: Student) => void;
  onLogout?: () => void;
};

export function getStudentVisibleExams(student: Student | null | undefined, examsData: Exam[] | undefined) {
  if (!student || !examsData) return [];
  const studentClassIds = (student.classIds ?? []).map(id => id.trim().toLowerCase());
  const normalizedStudentClasses = student.classes.map(c => c.trim().toLowerCase());
  return examsData.filter((exam) => {
    // If both sides have IDs, compare ID-to-ID
    if (exam.classIds && exam.classIds.length > 0 && studentClassIds.length > 0) {
      if (exam.classIds.some(id => studentClassIds.includes(id.trim().toLowerCase()))) return true;
    }
    // Fallback: compare class name strings
    const examClasses = (exam.className ?? '').split(/[,/|]+/).map(c => c.trim().toLowerCase()).filter(Boolean);
    return examClasses.some(ec => normalizedStudentClasses.includes(ec));
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getStudentScannedCopy(exam: Exam | null | undefined, student: Student | null | undefined) {
  if (!exam || !student || !exam.scannedCopies || exam.scannedCopies.length === 0) {
    return null;
  }

  // 1. Match by exact matricule (most reliable if OCR reads matricule correctly)
  if (student.matricule && student.matricule.trim() !== '') {
    const byMatricule = exam.scannedCopies.find(c => 
      c.matricule && c.matricule.trim() === student.matricule.trim()
    );
    if (byMatricule) {
      return byMatricule;
    }
  }

  // 2. Match by correctAiId or externalRef (used in some naming patterns)
  const refs = [student.correctAiId, student.externalRef].filter(Boolean);
  for (const ref of refs) {
    const byRef = exam.scannedCopies.find(c => 
      (c.matricule && c.matricule.trim() === ref!.trim()) ||
      (c.ocrResult?.matricule && c.ocrResult.matricule.trim() === ref!.trim())
    );
    if (byRef) {
      return byRef;
    }
  }

  // 3. Fallback: Match by full name (case-insensitive)
  const studentFullName = [student.firstName, student.lastName].filter(Boolean).join(' ').trim().toLowerCase();
  if (studentFullName) {
    const byName = exam.scannedCopies.find(c => 
      c.studentName && c.studentName.trim().toLowerCase() === studentFullName
    );
    if (byName) {
      return byName;
    }
  }

  return null;
}

function parseAnswerToken(value: string | undefined): string[] {
  if (!value) return [];
  return value.split('+').map((p) => p.trim()).filter(Boolean);
}

export function answersMatchMulti(studentAns: string | null | undefined, correctAnswers: string[]): boolean {
  if (!studentAns || correctAnswers.length === 0) return false;
  const sortedStudent = parseAnswerToken(studentAns).sort();
  const sortedCorrect = [...correctAnswers].sort();
  return (
    sortedStudent.length > 0 &&
    sortedCorrect.length > 0 &&
    sortedStudent.length === sortedCorrect.length &&
    sortedStudent.every((a, idx) => a === sortedCorrect[idx])
  );
}

export function formatCorrectAnswers(correctAnswers: string[]): string {
  if (correctAnswers.length === 0) return '—';
  return [...correctAnswers].sort().join('+');
}

export function computeExamScore(
  exam: Exam | null | undefined,
  student: Student | null | undefined,
): { score: number; max: number; scoreStr: string } | null {
  const copy = getStudentScannedCopy(exam, student);
  if (!copy || !exam) return null;

  const bank = exam.questionBank;
  if (bank && bank.length > 0) {
    let earned = 0;
    let possible = 0;
    bank.forEach((q) => {
      possible += q.points;
      const studentAns = copy.omrResult?.answers?.find((a) => a.question === q.number)?.answer;
      if (answersMatchMulti(studentAns, q.correctAnswers)) {
        earned += q.points;
      }
    });
    if (possible > 0) {
      return { score: earned, max: possible, scoreStr: `${earned}/${possible}` };
    }
  }

  const raw = copy.calculatedScore;
  if (raw && raw !== '--' && raw.includes('/')) {
    const [num, den] = raw.split('/');
    return { score: parseFloat(num) || 0, max: parseFloat(den) || 0, scoreStr: raw };
  }

  return null;
}

export function computeStudentAverage(
  student: Student | null | undefined,
  examsData: Exam[] | undefined,
): string {
  if (!student || !examsData) return 'N/A';
  const visible = getStudentVisibleExams(student, examsData);
  let totalEarned = 0;
  let totalMax = 0;
  for (const exam of visible) {
    const result = computeExamScore(exam, student);
    if (result && result.max > 0) {
      totalEarned += result.score;
      totalMax += result.max;
    }
  }
  if (totalMax === 0) return 'N/A';
  const avg = (totalEarned / totalMax) * 20;
  return Number.isInteger(avg) ? `${avg}/20` : `${avg.toFixed(1)}/20`;
}

export { tabPress } from '@/features/correctai/utils';

export const styles = StyleSheet.create({
  resultsCard: { gap: spacing.lg },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  rowSubtitle: { color: colors.muted, fontSize: 13, marginTop: spacing.xs },
  resultScore: { color: colors.success, fontSize: 18, fontWeight: '800' },
  resultScoreDanger: { color: colors.danger },
  examCards: { gap: spacing.md },
  pressedCard: { borderRadius: radius.md },
  studentExamCard: { gap: spacing.sm },
  examStatusRow: { alignSelf: 'stretch', alignItems: 'flex-end' },
  bigScoreCard: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xxl },
  bigScore: { color: colors.primary, fontSize: 56, fontWeight: '800', lineHeight: 62 },
  bigScoreBase: { color: colors.ink, fontSize: 22, fontWeight: '800', marginTop: -spacing.lg },
  rankText: { color: colors.muted, fontSize: 14, fontWeight: '700', marginTop: spacing.sm },
  questionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  questionChip: { width: '28%', height: 52, borderRadius: radius.sm, backgroundColor: colors.card, justifyContent: 'center' },
  questionText: { color: colors.success, fontSize: 17, fontWeight: '800' },
  questionTextWrong: { color: colors.danger },
  studentName: { color: colors.muted, fontSize: 15, fontWeight: '700', marginTop: -spacing.md },
  reportCard: { gap: spacing.md },
  settingsCard: { gap: spacing.xs },
  reportHeader: { flexDirection: 'row' },
  reportHeaderText: { flex: 1, color: colors.muted, fontSize: 14, fontWeight: '800' },
  reportRow: { flexDirection: 'row', minHeight: 32, alignItems: 'center' },
  reportCell: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: '700' },
  profileHeader: { alignItems: 'center', gap: spacing.xs },
  profileAvatar: { width: 70, height: 70, borderRadius: 35, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  profileAvatarText: { color: colors.primaryDark, fontSize: 24, fontWeight: '800' },
  profileName: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  confirmation: { color: colors.success, fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.72 },
  passwordError: { color: colors.danger, fontSize: 13, fontWeight: '700' },
});
