import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Field, FormActions, ScreenFrame } from '@/features/correctai/components/ui';
import { correctAiTheme } from '@/features/correctai/theme';
import type { AppScreen, NavItem, ProfessorCreateInput } from '@/features/correctai/types';
import { isValidEmail } from '@/features/correctai/utils/validation';

const { colors, spacing } = correctAiTheme;

type AdminScreenProps = {
  activeTab: NavItem['id'];
  adminEstablishmentId?: string;
  establishmentName?: string;
  onCreateProfessor?: (professor: ProfessorCreateInput) => void;
  onNavigate: (screen: AppScreen) => void;
};

type ProfessorFormErrors = Partial<Record<keyof ProfessorCreateInput, string>>;

export function AdminNewProfessorScreen({ adminEstablishmentId, establishmentName = '', onCreateProfessor, onNavigate }: AdminScreenProps) {

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<ProfessorFormErrors>({});

  const draft = useMemo(
    () => ({ firstName, lastName, email }),
    [email, firstName, lastName],
  );

  const validate = () => {
    const nextErrors: ProfessorFormErrors = {};

    if (!draft.firstName.trim()) {
      nextErrors.firstName = 'Le prenom est requis.';
    }
    if (!draft.lastName.trim()) {
      nextErrors.lastName = 'Le nom est requis.';
    }
    if (!isValidEmail(draft.email)) {
      nextErrors.email = 'Entrez un email valide.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const [submitting, setSubmitting] = useState(false);
  const submit = () => {
    if (!validate() || submitting) return;
    setSubmitting(true);

    onCreateProfessor?.({
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      email: draft.email.trim().toLowerCase(),
      establishment: establishmentName,
      establishmentId: adminEstablishmentId ?? '',
    });
    onNavigate('admin-professors');
  };

  return (
    <ScreenFrame compactHeader onBack={() => onNavigate('admin-professors')} title="Nouveau professeur">
      <View style={styles.form}>
        <View style={styles.formIntro}>
          <Text style={styles.formTitle}>Compte professeur</Text>
          <Text style={styles.formHint}>L'email sera utilise pour la connexion du professeur.</Text>
        </View>

        <View style={styles.row}>
          <View style={styles.fieldHalf}>
            <Field
              autoCapitalize="words"
              label="Prenom *"
              onChangeText={setFirstName}
              value={firstName}
            />
            {errors.firstName ? <Text style={styles.errorText}>{errors.firstName}</Text> : null}
          </View>
          <View style={styles.fieldHalf}>
            <Field
              autoCapitalize="words"
              label="Nom *"
              onChangeText={setLastName}
              value={lastName}
            />
            {errors.lastName ? <Text style={styles.errorText}>{errors.lastName}</Text> : null}
          </View>
        </View>

        <Field
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          label="Email *"
          onChangeText={setEmail}
          textContentType="emailAddress"
          value={email}
        />
        {errors.email ? <Text style={styles.errorText}>{errors.email}</Text> : null}

        <View style={styles.fieldReadonly}>
          <Text style={styles.readonlyLabel}>Etablissement</Text>
          <Text style={styles.readonlyValue}>{establishmentName}</Text>
        </View>

        <FormActions onCancel={() => onNavigate('admin-professors')} onSubmit={submit} submitLabel="Creer" submitting={submitting} />
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.md,
  },
  formIntro: {
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  formTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '900',
  },
  formHint: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  fieldHalf: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  errorText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '700',
    marginTop: -spacing.xs,
  },
  fieldReadonly: {
    gap: spacing.xxs,
    padding: spacing.md,
    backgroundColor: colors.neutralSoft,
    borderRadius: 10,
  },
  readonlyLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  readonlyValue: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
});
