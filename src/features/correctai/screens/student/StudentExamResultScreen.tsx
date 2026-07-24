import { Text, View } from 'react-native';

import { EmptyState, Card, Icon, Icons, ScreenFrame, SectionTitle, StatusPill } from '@/features/correctai/components/ui';
import { StudentScreenProps, styles, getStudentScannedCopy, answersMatchMulti, formatCorrectAnswers, computeExamScore } from './shared';

export function StudentExamResultScreen({ onNavigate, selectedExam, selectedStudent, studentsData }: StudentScreenProps) {
  const student = selectedStudent ?? studentsData[0] ?? null;
  const examTitle = selectedExam ? selectedExam.name : 'Examen inconnu';
  
  const copy = getStudentScannedCopy(selectedExam, student);
  
  // A copy is considered corrected if:
  // - reviewStatus is 'CORRECTED' (professor manually reviewed)
  // - OR calculatedScore exists and is not '--' (auto-calculated score)
  const hasRealScore = copy?.calculatedScore && copy.calculatedScore !== '--' && copy.calculatedScore.includes('/');
  const isCorrected = copy && (copy.reviewStatus === 'CORRECTED' || hasRealScore);

  if (!selectedExam) {
    return (
      <ScreenFrame compactHeader onBack={() => onNavigate('student-exams')} title={examTitle}>
        <EmptyState icon={Icons.search} title="Aucun examen sélectionné" subtitle="Sélectionnez un examen pour voir les résultats." />
      </ScreenFrame>
    );
  }

  if (!isCorrected) {
    return (
      <ScreenFrame compactHeader onBack={() => onNavigate('student-exams')} title={examTitle}>
        <EmptyState icon={Icons.calendar} title="En attente de correction" subtitle="Votre copie n'a pas encore été corrigée par le professeur." />
      </ScreenFrame>
    );
  }

  let correctCount = 0;
  let incorrectCount = 0;
  const totalQuestions = selectedExam.questions || selectedExam.questionBank?.length || 0;

  const computed = computeExamScore(selectedExam, student);
  const points = computed?.score ?? 0;
  const totalPoints = computed?.max ?? 0;
  const percentage = totalPoints > 0 ? (points / totalPoints) * 100 : 0;

  selectedExam.questionBank?.forEach(q => {
    const studentAns = copy.omrResult?.answers?.find(a => a.question === q.number)?.answer;
    if (answersMatchMulti(studentAns, q.correctAnswers)) {
      correctCount++;
    } else {
      incorrectCount++;
    }
  });

  let tone: 'success' | 'warning' | 'danger' = 'success';
  let label = 'Bien';
  if (percentage < 50) { tone = 'danger'; label = 'Insuffisant'; }
  else if (percentage < 70) { tone = 'warning'; label = 'Moyen'; }

  return (
    <ScreenFrame compactHeader onBack={() => onNavigate('student-exams')} title={examTitle}>
      <Card icon={Icons.trophy} style={styles.bigScoreCard} title="Resultat Final">
        <View style={{ alignItems: 'center', marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={styles.bigScore}>{points}</Text>
            <Text style={styles.bigScoreBase}>/{totalPoints}</Text>
          </View>
          <Text style={{ fontSize: 18, color: '#6B7280', fontWeight: '600', marginTop: 4 }}>
            {percentage.toFixed(1)}%
          </Text>
        </View>
        
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', width: '100%', marginBottom: 16, backgroundColor: '#F3F4F6', padding: 12, borderRadius: 12 }}>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: '#10B981' }}>{correctCount}</Text>
            <Text style={{ fontSize: 12, color: '#6B7280' }}>Correctes</Text>
          </View>
          <View style={{ width: 1, backgroundColor: '#E5E7EB' }} />
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: '#EF4444' }}>{incorrectCount}</Text>
            <Text style={{ fontSize: 12, color: '#6B7280' }}>Incorrectes</Text>
          </View>
          <View style={{ width: 1, backgroundColor: '#E5E7EB' }} />
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: '#3B82F6' }}>{totalQuestions}</Text>
            <Text style={{ fontSize: 12, color: '#6B7280' }}>Questions</Text>
          </View>
        </View>
        
        <StatusPill label={label} tone={tone} />
      </Card>
      
      <SectionTitle>Détail par question</SectionTitle>
      <View style={{ gap: 12, paddingBottom: 32 }}>
        {selectedExam.questionBank?.map((q, index) => {
          // Find student answer
          const studentAns = copy.omrResult?.answers?.find(a => a.question === q.number)?.answer;
          // Determine if correct based on question bank
          const correct = answersMatchMulti(studentAns, q.correctAnswers);
          const pointsEarned = correct ? q.points : 0;
          
          return (
            <View key={q.number} style={{ 
              backgroundColor: '#FFFFFF',
              borderRadius: 12,
              padding: 16,
              borderWidth: 1,
              borderColor: '#E5E7EB',
              flexDirection: 'column',
              alignItems: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.05,
              shadowRadius: 2,
              elevation: 2,
            }}>
              
              <View style={{ flexDirection: 'row', width: '100%', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <View style={{ 
                  backgroundColor: '#F3F4F6', 
                  borderRadius: 20, 
                  paddingHorizontal: 12, 
                  paddingVertical: 4 
                }}>
                  <Text style={{ fontWeight: '700', color: '#374151', fontSize: 14 }}>Question {q.number}</Text>
                </View>
                <StatusPill label={correct ? 'Correct' : 'Incorrect'} tone={correct ? 'success' : 'danger'} />
              </View>

              <View style={{ flexDirection: 'row', width: '100%', justifyContent: 'space-around', marginVertical: 8 }}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Votre réponse</Text>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: correct ? '#10B981' : '#EF4444' }}>
                    {studentAns || '-'}
                  </Text>
                </View>

                <View style={{ width: 1, backgroundColor: '#E5E7EB' }} />

                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Bonne réponse</Text>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: '#10B981' }}>
                    {formatCorrectAnswers(q.correctAnswers)}
                  </Text>
                </View>
              </View>

              <View style={{ width: '100%', height: 1, backgroundColor: '#F3F4F6', marginVertical: 12 }} />

              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#6B7280' }}>Score</Text>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#374151', marginTop: 2 }}>
                  {pointsEarned} / {q.points} pt{q.points > 1 ? 's' : ''}
                </Text>
              </View>

            </View>
          );
        })}
      </View>
    </ScreenFrame>
  );
}
