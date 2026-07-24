import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card, EmptyState, Icons, ScreenFrame, ScoreHero, SectionTitle, StatGrid } from '@/features/correctai/components/ui';
import { studentTabs } from '@/features/correctai/data/mock-data';
import { StudentScreenProps, styles, tabPress, getStudentVisibleExams, getStudentScannedCopy, computeStudentAverage, computeExamScore } from './shared';

export function StudentHomeScreen({ activeTab, onNavigate, studentsData, selectedStudent, examsData, onSelectExam }: StudentScreenProps) {
  const student = selectedStudent ?? studentsData[0] ?? null;
  const greeting = student ? `Bonjour, ${student.firstName ?? student.initials}` : 'Bonjour';
  
  const studentExamsList = useMemo(() => getStudentVisibleExams(student, examsData), [student, examsData]);
  const totalExams = studentExamsList.length;
  
  // "Passed" = exam has a corrected copy for this student (reviewStatus CORRECTED or real score like "X/Y")
  const passedExams = useMemo(() => studentExamsList.filter((e) => {
    const copy = getStudentScannedCopy(e, student);
    if (!copy) return false;
    const hasRealScore = copy.calculatedScore && copy.calculatedScore !== '--' && copy.calculatedScore.includes('/');
    return copy.reviewStatus === 'CORRECTED' || hasRealScore;
  }), [studentExamsList, student]);
  const totalPassed = passedExams.length;

  const averageScore = useMemo(() => computeStudentAverage(student, examsData), [student, examsData]);

  const stats = useMemo(() => [
    { label: 'Examens passes', value: String(totalPassed), tone: 'success' as const },
    { label: 'Examens disponibles', value: String(totalExams), tone: 'info' as const },
  ], [totalExams, totalPassed]);

  return (
    <ScreenFrame
      activeTab={activeTab}
      greeting={greeting}
      onTabPress={tabPress(onNavigate)}
      tabs={studentTabs}>
      <ScoreHero label="Moyenne" score={averageScore} />
      <SectionTitle>Statistiques</SectionTitle>
      <StatGrid items={stats} />
      <SectionTitle>Resultats recents</SectionTitle>
      <Card icon={Icons.chart} style={styles.resultsCard} title="Resultats recents">
        {passedExams.slice(0, 3).map((exam) => {
          const result = computeExamScore(exam, student);
          const score = result?.scoreStr ?? 'En attente';
          const isDanger = result && result.max > 0 && result.score < result.max / 2;
          return (
            <Pressable key={exam.id} onPress={() => { onSelectExam?.(exam); onNavigate('student-exam-result'); }}>
              <View style={[styles.resultRow, { paddingVertical: 4 }]}>
                <View>
                  <Text style={styles.rowTitle}>{exam.name}</Text>
                  <Text style={styles.rowSubtitle}>{new Date(exam.date).toLocaleDateString('fr-FR')}</Text>
                </View>
                <Text style={[styles.resultScore, isDanger && styles.resultScoreDanger]}>
                  {score}
                </Text>
              </View>
            </Pressable>
          );
        })}
        {passedExams.length === 0 && (
          <EmptyState icon={Icons.doc} title="Aucun résultat" subtitle="Vos résultats apparaîtront ici une fois les examens corrigés." />
        )}
      </Card>
    </ScreenFrame>
  );
}
