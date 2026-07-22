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
import { isValidEmail, normalizeEmail, EMAIL_VALIDATION_MESSAGE } from '@/features/correctai/utils/validation';
import { correctAiTheme } from '@/features/correctai/theme';
import type { AppScreen } from '@/features/correctai/types';

type AuthProps = {
  onLogin: (email: string, password: string) => { success: boolean; error?: string };
  onNavigate: (screen: AppScreen) => void;
};

const { colors, spacing } = correctAiTheme;

export function LoginScreen({ onLogin, onNavigate }: AuthProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = () => {
    const normalized = normalizeEmail(email);
    if (!normalized || !password) {
      setError('Veuillez remplir tous les champs');
      return;
    }
    if (!isValidEmail(normalized)) {
      setError(EMAIL_VALIDATION_MESSAGE);
      return;
    }
    const result = onLogin(normalized, password);
    if (!result.success) {
      setError(result.error ?? 'Email ou mot de passe incorrect');
    }
  };

  const handleEmailChange = (value: string) => {
    setEmail(value);
    if (error) setError('');
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    if (error) setError('');
  };

  return (
    <AuthFrame>
      <BrandTitle subtitle="Connexion a votre compte" />
      <View style={styles.form}>
        <Field
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Email"
          value={email}
          onChangeText={handleEmailChange}
        />
        <SecureField
          placeholder="Mot de passe"
          value={password}
          onChangeText={handlePasswordChange}
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <PrimaryButton icon={Icons.lock} onPress={handleLogin}>
          Se connecter
        </PrimaryButton>
        <TextButton icon={Icons.key} onPress={() => onNavigate('forgot-password')}>
          Mot de passe oublie ?
        </TextButton>
        <TextButton icon={Icons.personAdd} onPress={() => onNavigate('signup')}>
          S'inscrire en tant que professeur
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
