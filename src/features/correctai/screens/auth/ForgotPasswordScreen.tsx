import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  AuthFrame,
  BrandTitle,
  Field,
  Icons,
  PrimaryButton,
  TextButton,
} from '@/features/correctai/components/ui';
import { correctAiTheme } from '@/features/correctai/theme';
import type { AppScreen } from '@/features/correctai/types';
import { isValidEmail, normalizeEmail, EMAIL_VALIDATION_MESSAGE } from '@/features/correctai/utils/validation';

const { colors } = correctAiTheme;

type AuthProps = {
  onNavigate: (screen: AppScreen) => void;
};

export function ForgotPasswordScreen({ onNavigate }: AuthProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const handleSend = () => {
    const normalized = normalizeEmail(email);
    if (!normalized) {
      setError('Veuillez entrer votre email');
      return;
    }
    if (!isValidEmail(normalized)) {
      setError(EMAIL_VALIDATION_MESSAGE);
      return;
    }
    onNavigate('login');
  };

  return (
    <AuthFrame>
      <View style={styles.form}>
        <BrandTitle subtitle="Entrez votre email pour recevoir le lien" />
        <Field autoCapitalize="none" keyboardType="email-address" placeholder="Votre email" value={email} onChangeText={(v) => { setEmail(v); if (error) setError(''); }} />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <PrimaryButton icon={Icons.mail} onPress={handleSend}>
          Envoyer le lien
        </PrimaryButton>
        <TextButton icon={Icons.back} onPress={() => onNavigate('login')}>
          Se connecter
        </TextButton>
      </View>
    </AuthFrame>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: correctAiTheme.spacing.md,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
