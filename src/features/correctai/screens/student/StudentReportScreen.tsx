import { useState, useMemo } from 'react';
import { Alert, Text, View } from 'react-native';
import * as Print from 'expo-print';

import { Card, Icons, PrimaryButton, ScreenFrame, StatusPill } from '@/features/correctai/components/ui';
import { studentTabs } from '@/features/correctai/data/mock-data';
import { StudentScreenProps, styles, tabPress, getStudentScannedCopy, getStudentVisibleExams } from './shared';

export function StudentReportScreen({ activeTab, onNavigate, studentsData, establishmentsData, selectedStudent, examsData }: StudentScreenProps) {
  const [downloading, setDownloading] = useState(false);
  const student = selectedStudent ?? studentsData[0];
  const fullName = student.firstName && student.lastName ? `${student.firstName} ${student.lastName}` : student.initials ?? 'Etudiant';
  const establishmentName = establishmentsData?.find((e) => e.id === student.establishmentId)?.name ?? (student.establishmentId || 'N/A');
  const reportGreeting = `Releve ${fullName}`;

  const correctedExams = useMemo(() => {
    const visibleExams = getStudentVisibleExams(student, examsData);
    const results: Array<{
      exam: any;
      copy: any;
      points: number;
      totalPoints: number;
      percentage: number;
      mention: string;
      tone: 'success' | 'warning' | 'danger';
    }> = [];

    for (const exam of visibleExams) {
      const copy = getStudentScannedCopy(exam, student);
      if (!copy) continue;

      const hasRealScore = copy.calculatedScore && copy.calculatedScore !== '--' && copy.calculatedScore.includes('/');
      const isCorrected = copy.reviewStatus === 'CORRECTED' || hasRealScore;
      
      if (!isCorrected) continue;

      let dynamicPoints = 0;
      let dynamicTotalPoints = 0;

      if (exam.questionBank) {
        exam.questionBank.forEach(q => {
          dynamicTotalPoints += q.points;
          const studentAns = copy.omrResult?.answers?.find(a => a.question === q.number)?.answer;
          if (studentAns && q.correctAnswers.includes(studentAns)) {
            dynamicPoints += q.points;
          }
        });
      }

      const scoreStr = copy.calculatedScore || '0/0';
      const scoreParts = scoreStr.split('/');
      const points = exam.questionBank ? dynamicPoints : parseFloat(scoreParts[0] || '0');
      const totalPoints = exam.questionBank ? dynamicTotalPoints : parseFloat(scoreParts[1] || `${exam.questions}`);
      const percentage = totalPoints > 0 ? (points / totalPoints) * 100 : 0;

      let tone: 'success' | 'warning' | 'danger' = 'success';
      let mention = 'Bien';
      if (percentage < 50) { tone = 'danger'; mention = 'Insuffisant'; }
      else if (percentage < 70) { tone = 'warning'; mention = 'Moyen'; }

      results.push({ exam, copy, points, totalPoints, percentage, mention, tone });
    }
    
    // Sort by date descending
    return results.sort((a, b) => new Date(b.exam.date).getTime() - new Date(a.exam.date).getTime());
  }, [student, examsData]);

  const totalExamsCount = correctedExams.length;
  let overallAverage = 0;
  if (totalExamsCount > 0) {
    const sumPercentages = correctedExams.reduce((acc, curr) => acc + curr.percentage, 0);
    overallAverage = sumPercentages / totalExamsCount;
  }

  const handleDownloadPDF = async () => {
    setDownloading(true);
    try {
      const rowsHtml = correctedExams.map(res => `
        <tr>
          <td>${res.exam.name}</td>
          <td>${res.exam.subject}</td>
          <td>${new Date(res.exam.date).toLocaleDateString('fr-FR')}</td>
          <td><b>${res.points} / ${res.totalPoints}</b></td>
          <td>${res.percentage.toFixed(1)}%</td>
          <td>${res.mention}</td>
        </tr>
      `).join('');

      const html = `
        <html>
          <head>
            <style>
              body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #1F2937; }
              .header { text-align: center; margin-bottom: 40px; }
              .logo { font-size: 28px; font-weight: bold; color: #6366F1; margin-bottom: 8px; }
              .title { font-size: 24px; font-weight: bold; margin-bottom: 16px; }
              .student-info { background: #F3F4F6; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
              .info-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
              .info-label { font-weight: bold; color: #4B5563; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
              th, td { padding: 12px; text-align: left; border-bottom: 1px solid #E5E7EB; }
              th { background-color: #F9FAFB; font-weight: bold; color: #374151; }
              .footer { background: #F3F4F6; padding: 20px; border-radius: 8px; margin-top: 20px; }
              .summary-row { font-size: 18px; font-weight: bold; display: flex; justify-content: space-between; }
              .gen-date { text-align: center; color: #9CA3AF; font-size: 12px; margin-top: 40px; }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="logo">CorrectAI</div>
              <div class="title">Relevé de Notes Officiel</div>
            </div>
            
            <div class="student-info">
              <div class="info-row"><span class="info-label">Étudiant :</span> <span>${fullName}</span></div>
              <div class="info-row"><span class="info-label">Matricule :</span> <span>${student.matricule ?? 'N/A'}</span></div>
              <div class="info-row"><span class="info-label">Classes :</span> <span>${student.classes?.join(', ') || 'N/A'}</span></div>
              <div class="info-row"><span class="info-label">Établissement :</span> <span>${establishmentName}</span></div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Examen</th>
                  <th>Matière</th>
                  <th>Date</th>
                  <th>Note</th>
                  <th>Pourcentage</th>
                  <th>Mention</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml || '<tr><td colspan="6" style="text-align:center;">Aucun examen corrigé</td></tr>'}
              </tbody>
            </table>

            <div class="footer">
              <div class="summary-row">
                <span>Total Examens Corrigés :</span>
                <span>${totalExamsCount}</span>
              </div>
              <div class="summary-row" style="margin-top: 12px;">
                <span>Moyenne Générale :</span>
                <span>${overallAverage.toFixed(1)}%</span>
              </div>
            </div>

            <div class="gen-date">Généré par CorrectAI le ${new Date().toLocaleDateString('fr-FR')}</div>
          </body>
        </html>
      `;

      // Use Print.printAsync which opens the native system print/share dialog.
      // This works in Expo Go on Android without any file system permissions.
      await Print.printAsync({ html });
    } catch (error) {
      console.error(error);
      Alert.alert('Erreur', 'Impossible de générer le PDF.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <ScreenFrame
      activeTab={activeTab}
      greeting={reportGreeting}
      onTabPress={tabPress(onNavigate)}
      tabs={studentTabs}>
      
      <View style={{ marginBottom: 24, padding: 16, backgroundColor: '#F3F4F6', borderRadius: 12 }}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: '#1F2937', marginBottom: 4 }}>{fullName}</Text>
        <Text style={{ fontSize: 14, color: '#6B7280', marginBottom: 16 }}>{student.classes?.join(', ') ?? 'Aucune classe'} • {student.matricule ?? 'N/A'}</Text>
        
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#FFFFFF', padding: 12, borderRadius: 8 }}>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#6366F1' }}>{totalExamsCount}</Text>
            <Text style={{ fontSize: 12, color: '#6B7280' }}>Examens</Text>
          </View>
          <View style={{ width: 1, backgroundColor: '#E5E7EB' }} />
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: overallAverage >= 50 ? '#10B981' : '#EF4444' }}>
              {totalExamsCount > 0 ? `${overallAverage.toFixed(1)}%` : '-'}
            </Text>
            <Text style={{ fontSize: 12, color: '#6B7280' }}>Moyenne</Text>
          </View>
        </View>
      </View>

      <View style={{ marginBottom: 24 }}>
        <PrimaryButton icon={Icons.download} onPress={handleDownloadPDF} disabled={downloading}>
          {downloading ? 'Génération...' : 'Télécharger PDF'}
        </PrimaryButton>
      </View>

      <Text style={{ fontSize: 18, fontWeight: '700', color: '#1F2937', marginBottom: 12 }}>Vos Résultats</Text>

      <View style={{ gap: 12, paddingBottom: 32 }}>
        {correctedExams.map((res) => (
          <View key={res.exam.id} style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 12,
            padding: 16,
            borderWidth: 1,
            borderColor: '#E5E7EB',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 2,
            elevation: 2,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#1F2937' }}>{res.exam.name}</Text>
                <Text style={{ fontSize: 14, color: '#6B7280', marginTop: 2 }}>{res.exam.subject} • {new Date(res.exam.date).toLocaleDateString('fr-FR')}</Text>
              </View>
              <StatusPill label={res.mention} tone={res.tone} />
            </View>

            <View style={{ height: 1, backgroundColor: '#F3F4F6', marginVertical: 12 }} />

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text style={{ fontSize: 12, color: '#6B7280' }}>Note Finale</Text>
                <Text style={{ fontSize: 18, fontWeight: '700', color: '#374151', marginTop: 2 }}>{res.points} / {res.totalPoints}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 12, color: '#6B7280' }}>Pourcentage</Text>
                <Text style={{ fontSize: 18, fontWeight: '700', color: res.tone === 'success' ? '#10B981' : res.tone === 'danger' ? '#EF4444' : '#F59E0B', marginTop: 2 }}>
                  {res.percentage.toFixed(1)}%
                </Text>
              </View>
            </View>
          </View>
        ))}

        {correctedExams.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 32 }}>
            <Text style={{ color: '#6B7280', fontSize: 16 }}>Aucun résultat corrigé disponible pour le moment.</Text>
          </View>
        )}
      </View>
    </ScreenFrame>
  );
}
