import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Field, FormActions, ScreenFrame } from '@/features/correctai/components/ui';
import { isValidEmail, normalizeEmail, EMAIL_VALIDATION_MESSAGE } from '@/features/correctai/utils/validation';
import { SuperAdminScreenProps, styles } from './shared';

export function SuperAdminNewAdminScreen({ onNavigate, establishmentsData, onCreateAdmin }: SuperAdminScreenProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [selectedEstId, setSelectedEstId] = useState(establishmentsData[0]?.id ?? '');
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const selectedEst = establishmentsData.find((e) => e.id === selectedEstId);

  const submit = () => {
    const missing: string[] = [];
    if (!firstName.trim()) missing.push('Prenom');
    if (!lastName.trim()) missing.push('Nom');
    if (!email.trim()) missing.push('Email');
    if (!selectedEst) missing.push('Etablissement');
    if (missing.length > 0) { setErrors(missing); return; }
    if (!isValidEmail(normalizeEmail(email))) { setErrors([EMAIL_VALIDATION_MESSAGE]); return; }
    if (submitting) return;
    setErrors([]);
    setSubmitting(true);
    const est = selectedEst!;
    onCreateAdmin?.({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
      establishment: est.name,
      establishmentId: est.id,
    });
    onNavigate('super-admin-admins');
  };

  return (
    <ScreenFrame compactHeader onBack={() => onNavigate('super-admin-admins')} title="Nouvel Admin">
      <View style={styles.form}>
        <Text style={styles.formTitle}>Creer un compte administrateur</Text>
        <Text style={styles.formHint}>Cet admin aura acces a la gestion des professeurs et des etudiants de son etablissement.</Text>
        <View style={styles.row}>
          <View style={styles.fieldHalf}>
            <Field autoCapitalize="words" label="Prenom *" onChangeText={setFirstName} value={firstName} />
          </View>
          <View style={styles.fieldHalf}>
            <Field autoCapitalize="words" label="Nom *" onChangeText={setLastName} value={lastName} />
          </View>
        </View>
        <Field autoCapitalize="none" keyboardType="email-address" label="Email *" onChangeText={setEmail} value={email} />
        {errors.length > 0 && <Text style={styles.formError}>Champs obligatoires: {errors.join(', ')}.</Text>}
        <View style={styles.pickerWrap}>
          <Text style={styles.pickerLabel}>Etablissement *</Text>
          <View style={styles.pickerOptions}>
            {establishmentsData.filter((e) => e.status === 'ACTIF').map((est) => (
              <Pressable
                key={est.id}
                onPress={() => setSelectedEstId(est.id)}
                style={[styles.pickerChip, selectedEstId === est.id && styles.pickerChipActive]}>
                <Text style={[styles.pickerChipText, selectedEstId === est.id && styles.pickerChipTextActive]}>{est.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <FormActions onCancel={() => onNavigate('super-admin-admins')} submitLabel="Creer l'admin" onSubmit={submit} submitting={submitting} />
      </View>
    </ScreenFrame>
  );
}
