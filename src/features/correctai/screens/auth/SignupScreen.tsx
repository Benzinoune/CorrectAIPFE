import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  AuthFrame,
  BrandTitle,
  Field,
  Icons,
  PrimaryButton,
  SecureField,
  TextButton,
} from '@/features/correctai/components/ui';
import { correctAiTheme } from '@/features/correctai/theme';
import type { AppScreen } from '@/features/correctai/types';
import { isValidEmail, normalizeEmail, EMAIL_VALIDATION_MESSAGE } from '@/features/correctai/utils/validation';

const { colors } = correctAiTheme;

type AuthProps = {
  onNavigate: (screen: AppScreen) => void;
};

export function SignupScreen({ onNavigate }: AuthProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSignup = () => {
    const normalized = normalizeEmail(email);
    if (!normalized || !password) {
      setError('Veuillez remplir tous les champs');
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
      <BrandTitle subtitle="Creer un compte professeur" />
      <View style={styles.form}>
        <Field placeholder="Nom" />
        <Field placeholder="Prenom" />
        <Field autoCapitalize="none" keyboardType="email-address" placeholder="Email" value={email} onChangeText={(v) => { setEmail(v); if (error) setError(''); }} />
        <SecureField placeholder="Mot de passe" value={password} onChangeText={(v) => { setPassword(v); if (error) setError(''); }} />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <PrimaryButton icon={Icons.check} onPress={handleSignup}>
          Creer
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
