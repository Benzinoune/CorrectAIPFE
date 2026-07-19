import { StyleSheet } from 'react-native';

import { correctAiTheme } from '@/features/correctai/theme';
import type { AppScreen, Exam, NavItem, Student } from '@/features/correctai/types';

const { colors, spacing, radius } = correctAiTheme;

export type StudentScreenProps = {
  activeTab: NavItem['id'];
  onNavigate: (screen: AppScreen) => void;
  studentsData: Student[];
  selectedStudent?: Student | null;
  examsData?: Exam[];
  selectedExam?: Exam | null;
  onSelectExam?: (exam: Exam) => void;
  onUpdateStudent?: (student: Student) => void;
  onLogout?: () => void;
};

export function getStudentVisibleExams(student: Student | null | undefined, examsData: Exam[] | undefined) {
  if (!student || !examsData) return [];
  const normalizedStudentClasses = student.classes.map(c => c.trim().toLowerCase());
  return examsData.filter((exam) => {
    // If the exam has classIds and one matches the student's classes directly
    if (exam.classIds?.some(id => normalizedStudentClasses.includes(id.trim().toLowerCase()))) return true;
    
    // Check against the exam.className string
    const examClasses = exam.className.split(/[,/|]+/).map(c => c.trim().toLowerCase()).filter(Boolean);
    return examClasses.some(ec => normalizedStudentClasses.includes(ec));
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getStudentScannedCopy(exam: Exam | null | undefined, student: Student | null | undefined) {
  if (!exam || !student || !exam.scannedCopies || exam.scannedCopies.length === 0) {
    console.log('[Student] getStudentScannedCopy: no exam, student, or scannedCopies');
    return null;
  }

  console.log('[Student] getStudentScannedCopy: exam=%s, student=%s %s, matricule=%s, correctAiId=%s, externalRef=%s',
    exam.name, student.firstName, student.lastName, student.matricule, student.correctAiId, student.externalRef);
  console.log('[Student] scannedCopies count:', exam.scannedCopies.length);
  exam.scannedCopies.forEach((c, i) => {
    console.log(`[Student]   copy[${i}] studentName="${c.studentName}" matricule="${c.matricule}" reviewStatus="${c.reviewStatus}" score="${c.calculatedScore}"`);
  });

  // 1. Match by exact matricule (most reliable if OCR reads matricule correctly)
  if (student.matricule && student.matricule !== 'À extraire plus tard') {
    const byMatricule = exam.scannedCopies.find(c => 
      c.matricule && c.matricule.trim() === student.matricule.trim()
    );
    if (byMatricule) {
      console.log('[Student] matched by matricule:', byMatricule.studentName);
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
      console.log('[Student] matched by ref (%s):', ref, byRef.studentName);
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
      console.log('[Student] matched by name:', byName.studentName);
      return byName;
    }
  }

  console.log('[Student] getStudentScannedCopy: no match found for student');
  return null;
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
