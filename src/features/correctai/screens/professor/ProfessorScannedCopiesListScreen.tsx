import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  Card,
  Icon,
  Icons,
  PrimaryButton,
  ScreenFrame,
  StatusPill,
} from '@/features/correctai/components/ui';


import { correctAiTheme } from '@/features/correctai/theme';
import type { AppScreen, ClassRoom, Exam, ScannedCopy, TabId } from '@/features/correctai/types';
import {
  buildCopyCorrectionSummary,
  formatScannedCopyDateTime,
  formatScoreValue,
  reviewStatusLabel,
  reviewStatusTone,
} from './shared';
import { generateCopiesReportPDF, shareCopiesReportPDF } from '@/features/correctai/utils/pdf-report';

const { colors, spacing, radius } = correctAiTheme;

type ReviewCopiesProps = {
  activeTab?: TabId;
  classesData?: ClassRoom[];
  onNavigate: (screen: AppScreen) => void;
  onSelectScannedCopy?: (copy: ScannedCopy) => void;
  onUpdateExam?: (exam: Exam) => void;
  selectedExam?: Exam | null;
  selectedScannedCopy?: ScannedCopy | null;
};


type ReviewSort = 'date-desc' | 'date-asc' | 'score-desc' | 'name-asc';

function calculateReviewMetrics(copies: ScannedCopy[]) {
  const total = copies.length;
  if (total === 0) return { total: 0, pending: 0, corrected: 0, validated: 0, averageScore: 0, maxScore: 0, minScore: 0, successRate: 0 };
  const pending = copies.filter((c) => c.reviewStatus === 'DETECTED' || c.reviewStatus === 'PENDING').length;
  const corrected = copies.filter((c) => c.reviewStatus === 'CORRECTED').length;
  const validated = copies.filter((c) => c.reviewStatus === 'VALIDATED').length;
  const percentages: number[] = [];
  copies.forEach((c) => {
    if (c.calculatedScore && c.calculatedScore.includes('/')) {
      const [score, max] = c.calculatedScore.split('/').map(Number);
      if (!isNaN(score) && !isNaN(max) && max > 0) {
        percentages.push((score / max) * 100);
      }
    }
  });
  const averageScore = percentages.length > 0 ? Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length) : 0;
  const maxScore = percentages.length > 0 ? Math.round(Math.max(...percentages)) : 0;
  const minScore = percentages.length > 0 ? Math.round(Math.min(...percentages)) : 0;
  const successRate = percentages.length > 0 ? Math.round((percentages.filter((p) => p >= 50).length / percentages.length) * 100) : 0;
  return { total, pending, corrected, validated, averageScore, maxScore, minScore, successRate };
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const isHigh = confidence >= 70;
  const isMed = confidence >= 40 && confidence < 70;
  const bg = isHigh ? colors.successSoft : isMed ? colors.warningSoft : colors.dangerSoft;
  const fg = isHigh ? colors.success : isMed ? '#8E5600' : colors.danger;
  return (
    <View style={[styles.confidenceBadge, { backgroundColor: bg }]}>
      <Text style={[styles.confidenceBadgeText, { color: fg }]}>
        Confiance {confidence}%
      </Text>
    </View>
  );
}

function ScannedCopyListCard({
  copy,
  exam,
  onPress,
}: {
  copy: ScannedCopy;
  exam: Exam;
  onPress: () => void;
}) {
  const correctionSummary = useMemo(() => buildCopyCorrectionSummary(exam, copy), [copy, exam]);
  const isPending = copy.reviewStatus === 'DETECTED' || copy.reviewStatus === 'PENDING';
  const isValidated = copy.reviewStatus === 'VALIDATED';
  const stripeColor = isPending ? colors.warning : isValidated ? colors.success : colors.primary;

  const scorePoints = correctionSummary ? formatScoreValue(correctionSummary.totalPoints) : '--';
  const maxPoints = correctionSummary ? formatScoreValue(correctionSummary.maxPoints) : '--';
  const pct = correctionSummary && correctionSummary.maxPoints > 0
    ? Math.round((correctionSummary.totalPoints / correctionSummary.maxPoints) * 100)
    : 0;
  const scoreColor = pct >= 50 ? colors.success : pct > 0 ? colors.warning : colors.danger;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.copyCard,
        pressed && styles.pressed,
      ]}>
      {/* Left accent stripe */}
      <View style={[styles.copyStripe, { backgroundColor: stripeColor }]} />

      {/* Thumbnail */}
      <View style={styles.copyThumbWrap}>
        {copy.imageUri ? (
          <Image
            source={{ uri: copy.imageUri }}
            resizeMode="cover"
            style={styles.copyThumbImage}
          />
        ) : (
          <View style={styles.copyThumbPlaceholder}>
            <Icon name={Icons.camera} color={colors.faint} size={20} />
          </View>
        )}
      </View>

      {/* Main content */}
      <View style={styles.copyMain}>
        <Text numberOfLines={1} style={styles.copyName}>
          {copy.studentName || 'Non identifié'}
        </Text>
        <Text numberOfLines={1} style={styles.copyId}>
          ID : {copy.matricule || 'À extraire plus tard'}
        </Text>

        <View style={styles.copyBadgeRow}>
          <ConfidenceBadge confidence={copy.aiConfidence ?? 0} />
        </View>

        <Text numberOfLines={1} style={styles.copyMeta}>
          {copy.className ? `${copy.className} · ` : ''}{formatScannedCopyDateTime(copy.scannedAt)}
        </Text>
      </View>

      {/* Score side */}
      <View style={styles.copySide}>
        <Text style={styles.copyScoreRatio}>
          {scorePoints} / {maxPoints}
        </Text>
        <Text style={[styles.copyScore, { color: scoreColor }]}>{scorePoints}</Text>
        <Text style={[styles.copyScorePct, { color: scoreColor }]}>{pct}%</Text>
      </View>
    </Pressable>
  );
}

export function ProfessorScannedCopiesListScreen({
  onNavigate,
  onSelectScannedCopy,
  selectedExam,
}: ReviewCopiesProps) {
  const exam = selectedExam ?? null;
  const [filter, setFilter] = useState<string>('all');
  const [sort, setSort] = useState<ReviewSort>('date-desc');
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const copies = useMemo(() => {
    if (!exam?.scannedCopies) return [];
    let result = [...exam.scannedCopies];
    if (filter !== 'all') {
      result = result.filter((c) => c.className === filter);
    }
    result.sort((a, b) => {
      if (sort === 'date-desc') return new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime();
      if (sort === 'date-asc') return new Date(a.scannedAt).getTime() - new Date(b.scannedAt).getTime();
      if (sort === 'name-asc') return (a.studentName || '').localeCompare(b.studentName || '');
      if (sort === 'score-desc') {
        const scoreA = parseFloat(a.calculatedScore?.split('/')[0] || '0');
        const scoreB = parseFloat(b.calculatedScore?.split('/')[0] || '0');
        return scoreB - scoreA;
      }
      return 0;
    });
    return result;
  }, [exam?.scannedCopies, filter, sort]);

  const metrics = useMemo(() => calculateReviewMetrics(exam?.scannedCopies ?? []), [exam?.scannedCopies]);

  useEffect(() => {
    console.log(
      '[ScanHistory] render state: examId=%s copyCount=%d filter=%s sort=%s',
      exam?.id ?? 'none',
      exam?.scannedCopies?.length ?? 0,
      filter,
      sort,
    );
  }, [exam?.id, exam?.scannedCopies?.length, filter, sort]);

  if (!exam) {
    return (
      <ScreenFrame compactHeader onBack={() => onNavigate('professor-exams')} title="Copies scannées">
        <Card icon={Icons.info} style={styles.listCard} title="Aucun examen sélectionné">
          <Text style={styles.emptyText}>Sélectionnez un examen pour voir ses copies scannées.</Text>
          <PrimaryButton
            icon={Icons.folder}
            onPress={() => onNavigate('professor-exams')}
            style={styles.reviewEmptyButton}>
            Voir mes examens
          </PrimaryButton>
        </Card>
      </ScreenFrame>
    );
  }

  const handleCopyPress = (copy: ScannedCopy) => {
    console.log(
      '[ScanHistory] open copy: copyId=%s examId=%s student=%s',
      copy.id,
      copy.examId,
      copy.studentName,
    );
    onSelectScannedCopy?.(copy);
    onNavigate('professor-copy-detail');
  };

  const filterOptions = useMemo(() => {
    const options = [{ id: 'all', label: 'Toutes les classes', icon: Icons.school }];
    if (!exam?.scannedCopies) return options;
    const classes = new Set<string>();
    exam.scannedCopies.forEach((c) => {
      if (c.className) classes.add(c.className);
    });
    Array.from(classes).sort().forEach((className) => {
      options.push({ id: className, label: className, icon: Icons.school });
    });
    return options;
  }, [exam?.scannedCopies]);

  const getFilterLabel = () => {
    if (filter === 'all') return 'Toutes les classes';
    return filter;
  };

  const getSortLabel = () => {
    switch (sort) {
      case 'date-desc': return 'Date ↓';
      case 'date-asc': return 'Date ↑';
      case 'score-desc': return 'Score ↓';
      case 'name-asc': return 'Nom A-Z';
    }
  };

  const handleDownloadPDF = async () => {
    if (copies.length === 0) {
      Alert.alert('Aucune copie', 'Il n\'y a aucune copie à exporter pour le moment.');
      return;
    }
    try {
      setIsGeneratingPDF(true);
      const uri = await generateCopiesReportPDF(exam, copies);
      await shareCopiesReportPDF(uri);
    } catch (error) {
      Alert.alert('Erreur', error instanceof Error ? error.message : 'Échec de la génération du PDF.');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  return (
    <ScreenFrame
      compactHeader
      onBack={() => onNavigate('professor-exam-menu')}
      rightAction={{ icon: Icons.download, onPress: handleDownloadPDF }}
      scrollable={false}
      title="Réviser les copies">
      {isGeneratingPDF && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Génération du rapport PDF...</Text>
          </View>
        </View>
      )}
      <View style={styles.page}>

        {/* ── Hero card ─────────────────────────────── */}
        <View style={styles.hero}>
          {/* Exam info row */}
          <View style={styles.heroTopRow}>
            <View style={styles.heroIconWrap}>
              <Icon name={Icons.doc} color={colors.card} size={22} />
            </View>
            <View style={styles.heroTextBlock}>
              <Text numberOfLines={1} style={styles.heroExamName}>{exam.name}</Text>
              <Text numberOfLines={1} style={styles.heroExamSub}>
                {exam.name} · {exam.date}
              </Text>
            </View>
          </View>

          {/* Stat boxes row */}
          <View style={styles.heroStatRow}>
            <View style={styles.heroStatBox}>
              <Text style={styles.heroStatValue}>{metrics.total}</Text>
              <Text style={styles.heroStatLabel}>Copies</Text>
            </View>
            <View style={[styles.heroStatBox, styles.heroStatBoxDivider]}>
              <Text style={styles.heroStatValue}>{exam.questions ?? 20}</Text>
              <Text style={styles.heroStatLabel}>Questions</Text>
            </View>
            <View style={[styles.heroStatBox, styles.heroStatBoxDivider]}>
              <Text style={styles.heroStatValue}>{metrics.pending}</Text>
              <Text style={styles.heroStatLabel}>À vérifier</Text>
            </View>
            <View style={[styles.heroStatBox, styles.heroStatBoxDivider]}>
              <Text style={styles.heroStatValue}>{metrics.validated}</Text>
              <Text style={styles.heroStatLabel}>Validées</Text>
            </View>
          </View>
        </View>

        {/* ── Metrics strip ─────────────────────────── */}
        <View style={styles.metricsStrip}>
          <View style={styles.metricCell}>
            <Text style={[styles.metricValue, { color: colors.danger }]}>{metrics.averageScore}</Text>
            <Text style={styles.metricLabel}>Moyenne</Text>
          </View>
          <View style={[styles.metricCell, styles.metricCellDivider]}>
            <Text style={[styles.metricValue, { color: colors.success }]}>{metrics.maxScore}</Text>
            <Text style={styles.metricLabel}>Max</Text>
          </View>
          <View style={[styles.metricCell, styles.metricCellDivider]}>
            <Text style={[styles.metricValue, { color: colors.danger }]}>{metrics.minScore}</Text>
            <Text style={styles.metricLabel}>Min</Text>
          </View>
          <View style={[styles.metricCell, styles.metricCellDivider]}>
            <Text style={[styles.metricValue, { color: '#E08B00' }]}>{metrics.successRate}%</Text>
            <Text style={styles.metricLabel}>Réussite</Text>
          </View>
        </View>

        {/* ── Controls ──────────────────────────────── */}
        <View style={styles.controls}>
          {/* Filter pill */}
          <Pressable
            accessibilityRole="button"
            onPress={() => setFilterModalVisible(true)}
            style={({ pressed }) => [styles.filterPill, pressed && styles.pressed]}>
            <Text style={styles.filterPillLabel}>Classe</Text>
            <Text numberOfLines={1} style={styles.filterPillValue}>{getFilterLabel()}</Text>
            <Icon name={Icons.chevronDown} color={colors.muted} size={16} />
          </Pressable>

          {/* Sort button */}
          <Pressable
            accessibilityRole="button"
            onPress={() => setSortModalVisible(true)}
            style={({ pressed }) => [
              styles.sortButton,
              sort !== 'date-desc' && styles.sortButtonActive,
              pressed && styles.pressed,
            ]}>
            <Icon name={Icons.chevronDown} color={sort !== 'date-desc' ? colors.primary : colors.muted} size={18} />
          </Pressable>
        </View>

        {/* ── List ──────────────────────────────────── */}
        <FlatList
          data={copies}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ScannedCopyListCard
              copy={item}
              exam={exam}
              onPress={() => handleCopyPress(item)}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <Icon name={Icons.doc} color={colors.primary} size={36} />
              </View>
              <Text style={styles.emptyTitle}>Aucune copie trouvée</Text>
              <Text style={styles.emptySubtitle}>
                Aucune copie scannée ne correspond au filtre sélectionné.
              </Text>
            </View>
          }
        />
      </View>

      {/* ── Filter modal ──────────────────────────── */}
      <Modal
        animationType="slide"
        transparent
        visible={filterModalVisible}
        onRequestClose={() => setFilterModalVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setFilterModalVisible(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filtrer les copies</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setFilterModalVisible(false)}
                style={({ pressed }) => [styles.modalCloseBtn, pressed && styles.pressed]}>
                <Icon name={Icons.close} color={colors.ink} size={18} />
              </Pressable>
            </View>
            <View style={styles.modalOptions}>
              {filterOptions.map((option) => (
                <Pressable
                  key={option.id}
                  accessibilityRole="button"
                  onPress={() => {
                    setFilter(option.id);
                    setFilterModalVisible(false);
                  }}
                  style={({ pressed }) => [
                    styles.modalOption,
                    filter === option.id && styles.modalOptionActive,
                    pressed && styles.pressed,
                  ]}>
                  <View style={[styles.modalOptionIcon, filter === option.id && styles.modalOptionIconActive]}>
                    <Icon name={option.icon} color={filter === option.id ? colors.card : colors.muted} size={16} />
                  </View>
                  <Text style={[styles.modalOptionLabel, filter === option.id && styles.modalOptionLabelActive]}>
                    {option.label}
                  </Text>
                  {filter === option.id && (
                    <View style={styles.modalOptionCheck}>
                      <Icon name={Icons.check} color={colors.primary} size={16} />
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Sort modal ────────────────────────────── */}
      <Modal
        animationType="slide"
        transparent
        visible={sortModalVisible}
        onRequestClose={() => setSortModalVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSortModalVisible(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Trier les copies</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setSortModalVisible(false)}
                style={({ pressed }) => [styles.modalCloseBtn, pressed && styles.pressed]}>
                <Icon name={Icons.close} color={colors.ink} size={18} />
              </Pressable>
            </View>
            <View style={styles.modalOptions}>
              {([
                { id: 'date-desc', label: 'Date (récent → ancien)', icon: Icons.calendar },
                { id: 'date-asc', label: 'Date (ancien → récent)', icon: Icons.calendar },
                { id: 'score-desc', label: 'Meilleur score', icon: Icons.trophy },
                { id: 'name-asc', label: 'Nom A → Z', icon: Icons.people },
              ] as const).map((option) => (
                <Pressable
                  key={option.id}
                  accessibilityRole="button"
                  onPress={() => {
                    setSort(option.id);
                    setSortModalVisible(false);
                  }}
                  style={({ pressed }) => [
                    styles.modalOption,
                    sort === option.id && styles.modalOptionActive,
                    pressed && styles.pressed,
                  ]}>
                  <View style={[styles.modalOptionIcon, sort === option.id && styles.modalOptionIconActive]}>
                    <Icon name={option.icon} color={sort === option.id ? colors.card : colors.muted} size={16} />
                  </View>
                  <Text style={[styles.modalOptionLabel, sort === option.id && styles.modalOptionLabelActive]}>
                    {option.label}
                  </Text>
                  {sort === option.id && (
                    <View style={styles.modalOptionCheck}>
                      <Icon name={Icons.check} color={colors.primary} size={16} />
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  // ── Layout ──────────────────────────────────────
  page: {
    flex: 1,
    minHeight: 0,
    gap: spacing.sm,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    zIndex: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingCard: {
    backgroundColor: colors.card,
    padding: spacing.xl,
    borderRadius: radius.lg,
    alignItems: 'center',
    gap: spacing.md,
    shadowColor: '#1F2440',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  loadingText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  listCard: { gap: spacing.sm, paddingVertical: spacing.sm },
  emptyText: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  reviewEmptyButton: { alignSelf: 'flex-start' },

  // ── Hero ────────────────────────────────────────
  hero: {
    borderRadius: radius.xl,
    backgroundColor: colors.primary,
    padding: spacing.md,
    gap: spacing.md,
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTextBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  heroExamName: {
    color: colors.card,
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 24,
  },
  heroExamSub: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '600',
  },
  heroStatRow: {
    flexDirection: 'row',
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.13)',
    overflow: 'hidden',
  },
  heroStatBox: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  heroStatBoxDivider: {
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.18)',
  },
  heroStatValue: {
    color: colors.card,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 26,
  },
  heroStatLabel: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 11,
    fontWeight: '700',
  },

  // ── Metrics strip ────────────────────────────────
  metricsStrip: {
    flexDirection: 'row',
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#1F2440',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  metricCell: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  metricCellDivider: {
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 26,
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },

  // ── Controls ────────────────────────────────────
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  filterPill: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    shadowColor: '#1F2440',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  filterPillLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  filterPillValue: {
    flex: 1,
    minWidth: 0,
    color: colors.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  sortButton: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1F2440',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  sortButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },

  // ── List ────────────────────────────────────────
  listContent: {
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
  },

  // ── Copy card ───────────────────────────────────
  copyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingVertical: spacing.sm,
    paddingRight: spacing.sm,
    paddingLeft: spacing.sm + 6,
    shadowColor: '#1F2440',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    overflow: 'hidden',
  },
  copyStripe: {
    position: 'absolute',
    left: 0,
    top: 10,
    bottom: 10,
    width: 4,
    borderRadius: 999,
  },
  copyThumbWrap: {
    width: 60,
    height: 72,
    flexShrink: 0,
    borderRadius: radius.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.screen,
  },
  copyThumbImage: {
    width: '100%',
    height: '100%',
  },
  copyThumbPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyMain: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  copyName: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 19,
  },
  copyId: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 15,
  },
  copyBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxs,
    paddingVertical: 1,
  },
  confidenceBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
    borderRadius: 999,
  },
  confidenceBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  copyMeta: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
  },
  copySide: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 0,
    minWidth: 56,
  },
  copyScoreRatio: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
  },
  copyScore: {
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 28,
  },
  copyScorePct: {
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 14,
  },

  // ── Empty state ──────────────────────────────────
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '900',
  },
  emptySubtitle: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: spacing.lg,
  },

  // ── Modal ────────────────────────────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17,24,39,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.md,
    shadowColor: '#1F2440',
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 12,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.border,
    marginBottom: spacing.xs,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '900',
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.neutralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOptions: {
    gap: spacing.xs,
  },
  modalOption: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.card,
  },
  modalOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  modalOptionIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.xs,
    backgroundColor: colors.neutralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOptionIconActive: {
    backgroundColor: colors.primary,
  },
  modalOptionLabel: {
    flex: 1,
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  modalOptionLabelActive: {
    color: colors.primary,
    fontWeight: '900',
  },
  modalOptionCheck: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  pressed: { opacity: 0.72 },
});
