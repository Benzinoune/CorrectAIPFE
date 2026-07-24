import { useMemo, useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Icon, Icons, PrimaryButton, ScreenFrame, StatusPill, TextButton } from '@/features/correctai/components/ui';
import { correctAiTheme } from '@/features/correctai/theme';
import type { AppScreen, ClassRoom, Exam, ScannedCopy } from '@/features/correctai/types';
import {
  answerSheetChoices,
  formatQuestionPoints,
  formatScoreValue,
  resolveQuestionBank,
} from './shared';

const { colors, radius, spacing } = correctAiTheme;

type RevisionStatus = 'correct' | 'wrong' | 'modified' | 'unanswered';

type Props = {
  onNavigate: (screen: AppScreen) => void;
  onSelectScannedCopy?: (copy: ScannedCopy | null) => void;
  onUpdateExam?: (exam: Exam) => void;
  classesData?: ClassRoom[];
  selectedExam?: Exam | null;
  selectedScannedCopy?: ScannedCopy | null;
};

function parseAnswerToken(value: string | undefined) {
  if (!value) return [];
  const token = value.includes(':') ? value.split(':').pop() ?? value : value;
  return token
    .split(/[+]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function calculateScore(detected: string[], exam: Exam | null) {
  const bank = resolveQuestionBank(exam);
  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;
  let score = 0;
  const max = bank.reduce((sum, q) => sum + q.points, 0);
  const rows = bank.map((q, i) => {
    const studentToken = detected[i];
    const studentAnswers = parseAnswerToken(studentToken);
    const sortedStudent = [...studentAnswers].sort();
    const sortedCorrect = [...(q.correctAnswers ?? [])].sort();
    const isCorrect =
      sortedStudent.length > 0 &&
      sortedCorrect.length > 0 &&
      sortedStudent.length === sortedCorrect.length &&
      sortedStudent.every((a, idx) => a === sortedCorrect[idx]);
    if (isCorrect) {
      score += q.points;
      correctCount++;
    } else if (sortedStudent.length === 0) {
      unansweredCount++;
    } else {
      wrongCount++;
    }
    return {
      number: q.number,
      status: (isCorrect ? 'correct' : sortedStudent.length === 0 ? 'unanswered' : 'wrong') as RevisionStatus,
      correct: sortedCorrect.join('+') || '—',
      student: sortedStudent.join('+') || '—',
      pointsEarned: isCorrect ? q.points : 0,
      points: q.points,
    };
  });
  const percentage = max > 0 ? Math.round((score / max) * 100) : 0;
  return { score, max, correctCount, wrongCount, unansweredCount, percentage, rows };
}

export function ProfessorScannedCopyCorrectionScreen({
  onNavigate,
  onSelectScannedCopy,
  onUpdateExam,
  classesData,
  selectedExam,
  selectedScannedCopy,
}: Props) {
  const exam = selectedExam;
  const copy = selectedScannedCopy;

  const [localAnswers, setLocalAnswers] = useState<string[]>(() => copy?.detectedAnswers ?? []);
  const [modifiedQuestions, setModifiedQuestions] = useState<Set<number>>(new Set());
  const [selectedQuestion, setSelectedQuestion] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'validated'>('idle');
  const [zoom, setZoom] = useState(1);
  const [studentName, setStudentName] = useState(() => copy?.studentName ?? '');
  const [matricule, setMatricule] = useState(() => copy?.matricule ?? '');
  const [className, setClassName] = useState(() => copy?.className ?? '');

  const summary = useMemo(() => calculateScore(localAnswers, exam ?? null), [localAnswers, exam]);
  const scoreText = `${formatScoreValue(summary.score)}/${formatScoreValue(summary.max)}`;

  const hasStudentEdits =
    studentName !== (copy?.studentName ?? '') ||
    matricule !== (copy?.matricule ?? '') ||
    className !== (copy?.className ?? '');
  const hasAnswerEdits = modifiedQuestions.size > 0;
  const hasAnyEdits = hasStudentEdits || hasAnswerEdits;

  const handleAnswerPress = (questionNumber: number, choice: string) => {
    setLocalAnswers((current) => {
      const next = [...current];
      const existing = parseAnswerToken(next[questionNumber - 1]);
      const idx = existing.indexOf(choice);
      let updated: string[];
      if (idx >= 0) {
        updated = existing.filter((a) => a !== choice);
      } else {
        updated = [...existing, choice].sort();
      }
      next[questionNumber - 1] = updated.length > 0 ? updated.join('+') : '';
      return next;
    });
    setModifiedQuestions((prev) => new Set(prev).add(questionNumber));
    setSaveStatus('idle');
  };

  const handleSelectQuestion = (questionNumber: number) => {
    setSelectedQuestion(questionNumber);
  };

  const handleSave = () => {
    if (!copy || !exam) return;
    const nextCopy: ScannedCopy = {
      ...copy,
      studentName: studentName.trim() || copy.studentName,
      matricule: matricule.trim() || copy.matricule,
      className: className.trim() || copy.className,
      detectedAnswers: localAnswers,
      detectedAnswersCount: localAnswers.filter((a) => a.trim()).length,
      reviewStatus: 'CORRECTED',
      calculatedScore: scoreText,
      metadata: {
        ...copy.metadata,
        source: 'scanner',
        processedAt: copy.metadata?.processedAt ?? copy.scannedAt,
        reviewedAt: new Date().toISOString(),
      },
    };
    const nextCopies = (exam.scannedCopies ?? []).map((c) => (c.id === copy.id ? nextCopy : c));
    onUpdateExam?.({ ...exam, scannedCopies: nextCopies, copies: nextCopies.length });
    onSelectScannedCopy?.(nextCopy);
    setSaveStatus('saved');
    setModifiedQuestions(new Set());
  };

  const handleValidate = () => {
    handleSave();
    setSaveStatus('validated');
    setTimeout(() => onNavigate('professor-review-copies'), 400);
  };

  const handleCancel = () => {
    onNavigate('professor-review-copies');
  };

  function questionStatus(qNumber: number): RevisionStatus {
    const row = summary.rows.find((r) => r.number === qNumber);
    if (modifiedQuestions.has(qNumber)) return 'modified';
    return row?.status ?? 'unanswered';
  }

  function statusColors(status: RevisionStatus) {
    switch (status) {
      case 'correct': return { bg: colors.successSoft, text: colors.success, border: colors.success };
      case 'wrong': return { bg: colors.dangerSoft, text: colors.danger, border: colors.danger };
      case 'modified': return { bg: colors.warningSoft, text: '#8E5600', border: colors.warning };
      default: return { bg: colors.neutralSoft, text: colors.neutralText, border: colors.border };
    }
  }

  if (!exam || !copy) {
    return (
      <ScreenFrame compactHeader onBack={() => onNavigate('professor-review-copies')} title="Modifier la copie">
        <View style={styles.emptyContainer}>
          <Icon name={Icons.info} color={colors.muted} size={32} />
          <Text style={styles.emptyText}>Aucune copie sélectionnée</Text>
        </View>
      </ScreenFrame>
    );
  }

  const renderCorrectionSummary = () => (
    <View style={styles.summaryCard}>
      <View style={styles.summaryHeader}>
        <View style={styles.summaryTitleRow}>
          <Icon name={Icons.trophy} color={colors.primary} size={18} />
          <Text style={styles.summaryTitle}>Résumé de la correction</Text>
        </View>
        {modifiedQuestions.size > 0 && <StatusPill label="Modifiée" tone="warning" />}
      </View>
      <View style={styles.summaryStatsRow}>
        <View style={[styles.summaryStat, { backgroundColor: colors.successSoft }]}>
          <Text style={[styles.summaryStatValue, { color: colors.success }]}>{summary.correctCount}</Text>
          <Text style={styles.summaryStatLabel}>Correctes</Text>
        </View>
        <View style={[styles.summaryStat, { backgroundColor: colors.dangerSoft }]}>
          <Text style={[styles.summaryStatValue, { color: colors.danger }]}>{summary.wrongCount}</Text>
          <Text style={styles.summaryStatLabel}>Fausse</Text>
        </View>
        <View style={[styles.summaryStat, { backgroundColor: colors.neutralSoft }]}>
          <Text style={[styles.summaryStatValue, { color: colors.neutralText }]}>{summary.unansweredCount}</Text>
          <Text style={styles.summaryStatLabel}>Vides</Text>
        </View>
        <View style={[styles.summaryStat, { backgroundColor: colors.primarySoft }]}>
          <Text style={[styles.summaryStatValue, { color: colors.primary }]}>{scoreText}</Text>
          <Text style={styles.summaryStatLabel}>Score</Text>
        </View>
      </View>
      <View style={styles.summaryDetailRow}>
        <View style={styles.summaryDetailItem}>
          <Text style={styles.summaryDetailLabel}>Étudiant</Text>
          <Text style={styles.summaryDetailValue}>{studentName || 'Non identifié'}</Text>
        </View>
        <View style={styles.summaryDetailItem}>
          <Text style={styles.summaryDetailLabel}>Examen</Text>
          <Text style={styles.summaryDetailValue}>{copy.examName}</Text>
        </View>
      </View>
      <View style={styles.summaryDetailRow}>
        <View style={styles.summaryDetailItem}>
          <Text style={styles.summaryDetailLabel}>Questions</Text>
          <Text style={styles.summaryDetailValue}>{summary.rows.length}</Text>
        </View>
        <View style={styles.summaryDetailItem}>
          <Text style={styles.summaryDetailLabel}>Pourcentage</Text>
          <Text style={[styles.summaryDetailValue, { color: summary.percentage >= 50 ? colors.success : colors.danger }]}>
            {summary.percentage}%
          </Text>
        </View>
      </View>
      <View style={styles.summaryBarTrack}>
        <View style={[styles.summaryBarFill, { width: `${Math.min(summary.percentage, 100)}%`, backgroundColor: summary.percentage >= 50 ? colors.success : colors.danger }]} />
      </View>
    </View>
  );

  const renderStudentInfoEditor = () => (
    <View style={styles.studentInfoCard}>
      <View style={styles.sectionTitleRow}>
        <Icon name={Icons.profile} color={colors.primary} size={16} />
        <Text style={styles.sectionTitle}>Informations de l'étudiant</Text>
      </View>
      <View style={styles.studentInfoGrid}>
        <View style={styles.studentInfoField}>
          <Text style={styles.fieldLabel}>Nom complet</Text>
          <TextInput
            style={styles.fieldInput}
            value={studentName}
            onChangeText={setStudentName}
            placeholder="Nom de l'étudiant"
            placeholderTextColor={colors.faint}
            selectionColor={colors.primary}
          />
        </View>
        <View style={styles.studentInfoField}>
          <Text style={styles.fieldLabel}>Matricule</Text>
          <TextInput
            style={styles.fieldInput}
            value={matricule}
            onChangeText={setMatricule}
            placeholder="Matricule"
            placeholderTextColor={colors.faint}
            selectionColor={colors.primary}
          />
        </View>
        <View style={styles.studentInfoField}>
          <Text style={styles.fieldLabel}>Classe</Text>
          <TextInput
            style={styles.fieldInput}
            value={className}
            onChangeText={setClassName}
            placeholder="Classe"
            placeholderTextColor={colors.faint}
            selectionColor={colors.primary}
          />
        </View>
      </View>
      {hasStudentEdits && (
        <View style={styles.studentInfoEditedBadge}>
          <StatusPill label="Modifié" tone="warning" />
        </View>
      )}
    </View>
  );

  const renderImageSection = () => (
    <View style={styles.imageSection}>
      <View style={styles.imageSectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Icon name={Icons.camera} color={colors.primary} size={16} />
          <Text style={styles.sectionTitle}>Feuille scannée</Text>
        </View>
        {Platform.OS !== 'ios' && (
          <View style={styles.zoomControls}>
            <Pressable
              onPress={() => setZoom((z) => Math.max(1, z - 0.25))}
              style={({ pressed }) => [styles.zoomBtn, pressed && styles.pressed]}
            >
              <Icon name={Icons.minus} color={colors.primary} size={16} />
            </Pressable>
            <Text style={styles.zoomText}>{Math.round(zoom * 100)}%</Text>
            <Pressable
              onPress={() => setZoom((z) => Math.min(3, z + 0.25))}
              style={({ pressed }) => [styles.zoomBtn, pressed && styles.pressed]}
            >
              <Icon name={Icons.plus} color={colors.primary} size={16} />
            </Pressable>
          </View>
        )}
      </View>
      <ScrollView
        bouncesZoom
        contentContainerStyle={styles.imageScrollContent}
        maximumZoomScale={3}
        minimumZoomScale={1}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        style={styles.imageScroll}
      >
        <View style={[styles.imageWrapper, { transform: Platform.OS !== 'ios' ? [{ scale: zoom }] : [] }]}>
          {copy.imageUri ? (
            <Image source={{ uri: copy.imageUri }} resizeMode="contain" style={styles.scannedImage} />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Icon name={Icons.camera} color={colors.faint} size={40} />
              <Text style={styles.imagePlaceholderText}>Aucune image scannée</Text>
            </View>
          )}
          {selectedQuestion && (
            <View style={styles.questionOverlay}>
              {(() => {
                const qIdx = selectedQuestion - 1;
                const qTotal = summary.rows.length || exam.questions || 1;
                const cols = qTotal >= 100 ? 4 : qTotal >= 50 ? 3 : 2;
                const perCol = Math.ceil(qTotal / cols);
                const colIdx = Math.floor(qIdx / perCol);
                const rowIdx = qIdx % perCol;
                const colWidth = 100 / cols;
                const rowHeight = 100 / perCol;
                return (
                  <View
                    style={[
                      styles.questionHighlight,
                      {
                        left: `${colIdx * colWidth}%`,
                        top: `${rowIdx * rowHeight}%`,
                        width: `${colWidth}%`,
                        height: `${rowHeight}%`,
                      },
                    ]}
                  />
                );
              })()}
            </View>
          )}
        </View>
      </ScrollView>
      {zoom > 1 && <Text style={styles.zoomHint}>Déplacez-vous dans l'image pour voir les détails</Text>}
    </View>
  );

  const renderAnswerSection = () => (
    <View style={styles.answerSection}>
      <View style={styles.answerSectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Icon name={Icons.check} color={colors.primary} size={16} />
          <Text style={styles.sectionTitle}>Réponses détectées par l'IA</Text>
        </View>
        <Text style={styles.answerListCount}>{summary.rows.length} questions</Text>
      </View>
      <View style={styles.answerGrid}>
        {summary.rows.map((row) => {
          const status = questionStatus(row.number);
          const sc = statusColors(status);
          const isSelected = selectedQuestion === row.number;
          return (
            <Pressable
              key={row.number}
              onPress={() => handleSelectQuestion(row.number)}
              style={[
                styles.answerQuestionCard,
                isSelected && styles.answerQuestionCardSelected,
                { borderLeftColor: sc.border },
              ]}
            >
              <View style={styles.answerQuestionHeader}>
                <View style={[styles.answerQuestionDot, { backgroundColor: sc.bg, borderColor: sc.border }]}>
                  <Text style={[styles.answerQuestionNumber, { color: sc.text }]}>{row.number}</Text>
                </View>
                {modifiedQuestions.has(row.number) && <StatusPill label="Modifiée" tone="warning" />}
                {!modifiedQuestions.has(row.number) && row.status === 'correct' && <StatusPill label="Correcte" tone="success" />}
                {!modifiedQuestions.has(row.number) && row.status === 'wrong' && <StatusPill label="Fausse" tone="danger" />}
                {!modifiedQuestions.has(row.number) && row.status === 'unanswered' && <StatusPill label="Vide" tone="neutral" />}
                <View style={styles.answerPointsBadge}>
                  <Text style={[styles.answerPointsText, { color: row.pointsEarned > 0 ? colors.success : colors.muted }]}>
                    {formatQuestionPoints(row.points)}
                  </Text>
                </View>
              </View>
              <View style={styles.answerBubbleRow}>
                {answerSheetChoices.map((choice) => {
                  const answers = parseAnswerToken(localAnswers[row.number - 1]);
                  const isActive = answers.includes(choice);
                  const isCorrectChoice = row.correct.split('+').includes(choice);
                  const bc = isActive ? sc : statusColors('unanswered');
                  return (
                    <Pressable
                      key={choice}
                      onPress={() => handleAnswerPress(row.number, choice)}
                      style={({ pressed }) => [
                        styles.answerBubble,
                        {
                          backgroundColor: isActive ? bc.text : colors.card,
                          borderColor: isActive ? bc.text : isCorrectChoice ? colors.success : colors.border,
                        },
                        isCorrectChoice && !isActive && styles.answerBubbleCorrectHint,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={[styles.answerBubbleText, { color: isActive ? colors.card : colors.muted }]}>
                        {choice}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.answerQuestionFooter}>
                <Text style={styles.answerKeyLabel}>
                  Clé : {row.correct}
                </Text>
                <Text style={[styles.answerEarnedLabel, { color: row.pointsEarned > 0 ? colors.success : colors.danger }]}>
                  {row.pointsEarned > 0 ? `+${formatScoreValue(row.pointsEarned)}` : '0'} / {formatScoreValue(row.points)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const renderBottomActions = () => (
    <View style={styles.bottomActions}>
      <TextButton icon={Icons.close} onPress={handleCancel} tone="neutral">
        Annuler
      </TextButton>
      <View style={styles.bottomActionsRight}>
        <PrimaryButton
          icon={Icons.save}
          onPress={handleSave}
          tone="primary"
          variant="outline"
          disabled={!hasAnyEdits}
          style={styles.actionButton}
        >
          Sauvegarder
        </PrimaryButton>
        <PrimaryButton icon={Icons.check} onPress={handleValidate} tone="success" style={styles.actionButton}>
          Enregistrer
        </PrimaryButton>
      </View>
    </View>
  );

  return (
    <ScreenFrame compactHeader onBack={handleCancel} title="Modifier la copie" scrollable={false}>
      <View style={styles.page}>
        <ScrollView
          style={styles.mainScroll}
          contentContainerStyle={styles.mainScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {renderCorrectionSummary()}
          {renderStudentInfoEditor()}
          {renderImageSection()}
          {renderAnswerSection()}
        </ScrollView>
        {renderBottomActions()}
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xxl,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 16,
    fontWeight: '600',
  },
  mainScroll: {
    flex: 1,
  },
  mainScrollContent: {
    padding: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: 110,
    gap: spacing.sm,
  },
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    gap: spacing.sm,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  summaryTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  summaryStatsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  summaryStat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    gap: 2,
  },
  summaryStatValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  summaryStatLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '600',
  },
  summaryDetailRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  summaryDetailItem: {
    flex: 1,
    gap: 2,
  },
  summaryDetailLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  summaryDetailValue: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  summaryBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.neutralSoft,
    overflow: 'hidden',
  },
  summaryBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  studentInfoCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    gap: spacing.sm,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '800',
  },
  studentInfoGrid: {
    gap: spacing.sm,
  },
  studentInfoField: {
    gap: spacing.xxs,
  },
  fieldLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  fieldInput: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: '#D7D9E0',
    borderRadius: radius.xs,
    paddingHorizontal: spacing.md,
    color: colors.ink,
    fontSize: 15,
    backgroundColor: colors.screen,
    fontWeight: '500',
  },
  studentInfoEditedBadge: {
    alignItems: 'flex-start',
  },
  imageSection: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  imageSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  zoomControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  zoomBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    minWidth: 36,
    textAlign: 'center',
  },
  imageScroll: {
    borderRadius: radius.md,
    minHeight: 220,
    backgroundColor: colors.screen,
  },
  imageScrollContent: {
    minHeight: 260,
  },
  imageWrapper: {
    width: '100%',
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannedImage: {
    width: '100%',
    height: '100%',
    borderRadius: radius.md,
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xxl,
  },
  imagePlaceholderText: {
    color: colors.faint,
    fontSize: 13,
    fontWeight: '600',
  },
  questionOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  questionHighlight: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: 4,
    backgroundColor: 'rgba(108, 92, 255, 0.1)',
  },
  zoomHint: {
    color: colors.faint,
    fontSize: 11,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  answerSection: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    gap: spacing.xs,
  },
  answerSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  answerListCount: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 'auto',
  },
  answerGrid: {
    gap: spacing.xs,
  },
  answerQuestionCard: {
    backgroundColor: colors.screen,
    borderRadius: radius.sm,
    padding: spacing.sm,
    borderLeftWidth: 3,
    gap: spacing.xs,
  },
  answerQuestionCardSelected: {
    backgroundColor: colors.primarySoft,
    borderLeftWidth: 3,
  },
  answerQuestionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  answerQuestionDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  answerQuestionNumber: {
    fontSize: 12,
    fontWeight: '800',
  },
  answerPointsBadge: {
    marginLeft: 'auto',
  },
  answerPointsText: {
    fontSize: 11,
    fontWeight: '700',
  },
  answerBubbleRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  answerBubble: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  answerBubbleCorrectHint: {
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  answerBubbleText: {
    fontSize: 13,
    fontWeight: '800',
  },
  answerQuestionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  answerKeyLabel: {
    color: colors.faint,
    fontSize: 11,
  },
  answerEarnedLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  bottomActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    paddingBottom: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  bottomActionsRight: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 0,
  },
  pressed: {
    opacity: 0.72,
  },
});
