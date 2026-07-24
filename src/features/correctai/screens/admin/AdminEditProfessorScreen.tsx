import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { EmptyState, Field, FormActions, Icons, ScreenFrame } from '@/features/correctai/components/ui';
import { correctAiTheme } from '@/features/correctai/theme';
import type { AppScreen, NavItem, Professor } from '@/features/correctai/types';
import { isValidEmail } from '@/features/correctai/utils/validation';

const { colors, spacing } = correctAiTheme;

type AdminScreenProps = {
  activeTab: NavItem['id'];
  onNavigate: (screen: AppScreen) => void;
  onUpdateProfessor?: (professor: Professor) => void;
  selectedProfessor?: Professor | null;
};

type ProfessorFormErrors = Partial<Record<string, string>>;

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return { firstName: parts[0] ?? '', lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function buildInitials(firstName: string, lastName: string): string {
  const f = firstName.trim().charAt(0).toUpperCase();
  const l = lastName.trim().charAt(0).toUpperCase();
  return (f + l) || '??';
}

export function AdminEditProfessorScreen({
  activeTab,
  onNavigate,
  onUpdateProfessor,
  selectedProfessor,
}: AdminScreenProps) {
  const professor = selectedProfessor;
  if (!professor) {
    return (
      <ScreenFrame compactHeader onBack={() => onNavigate('admin-professors')} title="Modifier Professeur">
        <EmptyState icon={Icons.profile} title="Aucun professeur" subtitle="Sélectionnez un professeur pour le modifier." />
      </ScreenFrame>
    );
  }

  const { firstName: initialFirst, lastName: initialLast } = splitName(professor.name);
  const [firstName, setFirstName] = useState(initialFirst);
  const [lastName, setLastName] = useState(initialLast);
  const [email, setEmail] = useState(professor.email);
  const [errors, setErrors] = useState<ProfessorFormErrors>({});
  const [submitting, setSubmitting] = useState(false);

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

  const submit = () => {
    if (!validate() || submitting) return;
    setSubmitting(true);

    const trimmedFirst = draft.firstName.trim();
    const trimmedLast = draft.lastName.trim();
    const fullName = `${trimmedFirst} ${trimmedLast}`.trim();

    onUpdateProfessor?.({
      ...professor,
      firstName: trimmedFirst,
      lastName: trimmedLast,
      name: fullName,
      initials: buildInitials(trimmedFirst, trimmedLast),
      email: draft.email.trim().toLowerCase(),
    });
    onNavigate('admin-professor-detail');
  };

  return (
    <ScreenFrame compactHeader onBack={() => onNavigate('admin-professor-detail')} title="Modifier prof">
      <View style={styles.form}>
        <View style={styles.formIntro}>
          <Text style={styles.formTitle}>Modifier le professeur</Text>
          <Text style={styles.formHint}>
            Mettez a jour les informations du professeur. L&apos;etablissement et les donnees associees ne seront pas modifies.
          </Text>
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
          <Text style={styles.readonlyValue}>{professor.establishment}</Text>
        </View>

        <View style={styles.fieldReadonly}>
          <Text style={styles.readonlyLabel}>Statut</Text>
          <Text style={styles.readonlyValue}>{professor.status}</Text>
        </View>

        <FormActions onCancel={() => onNavigate('admin-professor-detail')} onSubmit={submit} submitLabel="Enregistrer" submitting={submitting} />
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
  hintText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
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
