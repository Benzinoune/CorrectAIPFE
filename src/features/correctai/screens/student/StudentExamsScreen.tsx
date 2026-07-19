import { Pressable, Text, View } from 'react-native';

import { Card, Icons, ScreenFrame, StatusPill } from '@/features/correctai/components/ui';
import { studentTabs } from '@/features/correctai/data/mock-data';
import { StudentScreenProps, styles, tabPress, getStudentVisibleExams, getStudentScannedCopy } from './shared';

export function StudentExamsScreen({ activeTab, onNavigate, studentsData, selectedStudent, examsData, onSelectExam }: StudentScreenProps) {
  const student = selectedStudent ?? studentsData[0];
  const visibleExams = getStudentVisibleExams(student, examsData);
  return (
    <ScreenFrame
      activeTab={activeTab}
      greeting="Mes examens"
      onTabPress={tabPress(onNavigate)}
      tabs={studentTabs}>
      <View style={styles.examCards}>
        {visibleExams.map((exam) => {
          const copy = getStudentScannedCopy(exam, student);
          const hasRealScore = copy?.calculatedScore && copy.calculatedScore !== '--' && copy.calculatedScore.includes('/');
          const isCorrected = copy && (copy.reviewStatus === 'CORRECTED' || hasRealScore);
          const statusLabel = isCorrected 
            ? (copy!.calculatedScore ?? 'Corrigé')
            : copy 
              ? 'En attente'
              : exam.status ?? 'Disponible';
          const statusTone = isCorrected ? 'success' : copy ? 'warning' : 'info';
          return (
            <Pressable
              accessibilityRole="button"
              key={exam.id}
              onPress={() => { onSelectExam?.(exam); onNavigate('student-exam-result'); }}
              style={({ pressed }) => [styles.pressedCard, pressed && styles.pressed]}>
              <Card icon={Icons.doc} style={styles.studentExamCard} title={exam.name} subtitle={new Date(exam.date).toLocaleDateString('fr-FR')}>
                <View style={styles.examStatusRow}>
                  <StatusPill label={statusLabel} tone={statusTone} />
                </View>
              </Card>
            </Pressable>
          );
        })}
        {visibleExams.length === 0 && (
          <Text style={{ textAlign: 'center', color: '#6B7280', marginVertical: 32 }}>Aucun examen disponible pour votre classe.</Text>
        )}
      </View>
    </ScreenFrame>
  );
}
