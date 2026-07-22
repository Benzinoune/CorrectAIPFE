import { StyleSheet, Text, View } from 'react-native';

import { Icons, PrimaryButton, ScreenFrame } from '@/features/correctai/components/ui';
import { correctAiTheme } from '@/features/correctai/theme';

const { colors, spacing } = correctAiTheme;

type Props = {
  message: string;
  onReturnToLogin: () => void;
};

export function InstitutionUnavailableScreen({ message, onReturnToLogin }: Props) {
  return (
    <ScreenFrame title="Institution Indisponible">
      <View style={styles.container}>
        <View style={styles.iconCircle}>
          <Text style={styles.iconText}>⚠</Text>
        </View>

        <Text style={styles.title}>Institution Unavailable</Text>
        <Text style={styles.message}>{message}</Text>

        <View style={styles.buttonRow}>
          <PrimaryButton icon={Icons.back} onPress={onReturnToLogin}>
            Return to Login
          </PrimaryButton>
        </View>
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 36,
  },
  title: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  message: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 22,
  },
  buttonRow: {
    marginTop: spacing.md,
    width: '100%',
    maxWidth: 320,
  },
});
