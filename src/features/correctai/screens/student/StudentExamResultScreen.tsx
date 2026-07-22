import { Text, View } from 'react-native';

import { Card, Icon, Icons, ScreenFrame, SectionTitle, StatusPill } from '@/features/correctai/components/ui';
import { StudentScreenProps, styles, getStudentScannedCopy } from './shared';

export function StudentExamResultScreen({ onNavigate, selectedExam, selectedStudent, studentsData }: StudentScreenProps) {
  const student = selectedStudent ?? studentsData[0];
  const examTitle = selectedExam ? selectedExam.name : 'Examen inconnu';
  
  const copy = getStudentScannedCopy(selectedExam, student);
  
  // A copy is considered corrected if:
  // - reviewStatus is 'CORRECTED' (professor manually reviewed)
  // - OR calculatedScore exists and is not '--' (auto-calculated score)
  const hasRealScore = copy?.calculatedScore && copy.calculatedScore !== '--' && copy.calculatedScore.includes('/');
  const isCorrected = copy && (copy.reviewStatus === 'CORRECTED' || hasRealScore);

  console.log('[Student] StudentExamResultScreen: exam=%s copy=%s reviewStatus=%s score=%s isCorrected=%s',
    selectedExam?.name ?? 'none',
    copy?.id ?? 'none',
    copy?.reviewStatus ?? 'none',
    copy?.calculatedScore ?? 'none',
    String(!!isCorrected)
  );

  if (!selectedExam) {
    return (
      <ScreenFrame compactHeader onBack={() => onNavigate('student-exams')} title={examTitle}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 64 }}>
          <Text style={{ color: '#6B7280', fontSize: 16 }}>Aucun examen sélectionné.</Text>
        </View>
      </ScreenFrame>
    );
  }

  if (!isCorrected) {
    return (
      <ScreenFrame compactHeader onBack={() => onNavigate('student-exams')} title={examTitle}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 64 }}>
          <Icon name={Icons.calendar} color="#9CA3AF" size={48} />
          <Text style={{ color: '#4B5563', fontSize: 18, fontWeight: '700', marginTop: 16 }}>En attente de correction</Text>
          <Text style={{ color: '#6B7280', fontSize: 14, textAlign: 'center', marginTop: 8 }}>Votre copie n'a pas encore été corrigée par le professeur.</Text>
        </View>
      </ScreenFrame>
    );
  }

  let correctCount = 0;
  let incorrectCount = 0;
  let dynamicPoints = 0;
  let dynamicTotalPoints = 0;
  const totalQuestions = selectedExam.questions || selectedExam.questionBank?.length || 0;

  selectedExam.questionBank?.forEach(q => {
    dynamicTotalPoints += q.points;
    const studentAns = copy.omrResult?.answers?.find(a => a.question === q.number)?.answer;
    if (studentAns && q.correctAnswers.includes(studentAns)) {
      correctCount++;
      dynamicPoints += q.points;
    } else {
      incorrectCount++;
    }
  });

  // Use dynamic points if questionBank is available, otherwise fallback to calculatedScore string parsing
  const scoreStr = copy.calculatedScore || '0/0';
  const scoreParts = scoreStr.split('/');
  const points = selectedExam.questionBank ? dynamicPoints : parseFloat(scoreParts[0] || '0');
  const totalPoints = selectedExam.questionBank ? dynamicTotalPoints : parseFloat(scoreParts[1] || `${selectedExam.questions}`);
  const percentage = totalPoints > 0 ? (points / totalPoints) * 100 : 0;

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
          const correct = !!studentAns && q.correctAnswers.includes(studentAns);
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
                    {q.correctAnswers.join(' ou ')}
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
