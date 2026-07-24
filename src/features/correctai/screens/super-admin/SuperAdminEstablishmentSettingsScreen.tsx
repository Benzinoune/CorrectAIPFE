import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { EmptyState, Field, FormActions, Icons, ScreenFrame, SectionTitle, StatusPill } from '@/features/correctai/components/ui';
import type { EstablishmentStatus } from '@/features/correctai/types';
import { SuperAdminScreenProps, statusTone, styles } from './shared';

export function SuperAdminEstablishmentSettingsScreen({
  onNavigate,
  selectedEstablishment,
  establishmentsData,
  onUpdateEstablishment,
}: SuperAdminScreenProps) {
  const establishment = selectedEstablishment ?? establishmentsData[0];
  if (!establishment) {
    return (
      <ScreenFrame compactHeader onBack={() => onNavigate('super-admin-establishment-detail')} title="Paramètres">
        <EmptyState icon={Icons.school} title="Aucun établissement" subtitle="Sélectionnez un établissement pour modifier ses paramètres." />
      </ScreenFrame>
    );
  }

  const [name, setName] = useState(establishment.name);
  const [city, setCity] = useState(establishment.city);
  const [adminName, setAdminName] = useState(establishment.adminName);
  const [adminEmail, setAdminEmail] = useState(establishment.adminEmail);
  const [status, setStatus] = useState<EstablishmentStatus>(establishment.status);
  const [submitting, setSubmitting] = useState(false);

  const cycleStatus = () => {
    setStatus((prev) => {
      if (prev === 'ACTIF') return 'SUSPENDU';
      if (prev === 'SUSPENDU') return 'INACTIF';
      return 'ACTIF';
    });
  };

  const statusLabel = status === 'ACTIF' ? 'Actif' : status === 'SUSPENDU' ? 'Suspendu' : 'Inactif';

  const submit = () => {
    if (submitting) return;
    setSubmitting(true);
    onUpdateEstablishment?.({
      ...establishment,
      name: name.trim() || establishment.name,
      city: city.trim() || establishment.city,
      adminName: adminName.trim() || establishment.adminName,
      adminEmail: adminEmail.trim().toLowerCase() || establishment.adminEmail,
      status,
    });
    onNavigate('super-admin-establishment-detail');
  };

  return (
    <ScreenFrame compactHeader onBack={() => onNavigate('super-admin-establishment-detail')} title="Parametres">
      <View style={styles.form}>
        <Text style={styles.formTitle}>Modifier l'etablissement</Text>
        <Text style={styles.formHint}>Modifiez les informations de l'etablissement et de son administrateur principal.</Text>

        <SectionTitle>Informations</SectionTitle>
        <Field autoCapitalize="words" label="Nom de l'etablissement" onChangeText={setName} value={name} />
        <Field autoCapitalize="words" label="Ville" onChangeText={setCity} value={city} />

        <View style={styles.statusRow}>
          <Text style={styles.pickerLabel}>Statut</Text>
          <Pressable onPress={cycleStatus} style={styles.statusButton}>
            <StatusPill label={statusLabel} tone={statusTone(status)} />
          </Pressable>
          <Text style={styles.statusHint}>Cliquer pour changer le statut</Text>
        </View>

        <SectionTitle>Administrateur principal</SectionTitle>
        <Field autoCapitalize="words" label="Nom complet" onChangeText={setAdminName} value={adminName} />
        <Field autoCapitalize="none" keyboardType="email-address" label="Email" onChangeText={setAdminEmail} value={adminEmail} />

        <FormActions onCancel={() => onNavigate('super-admin-establishment-detail')} submitLabel="Enregistrer" onSubmit={submit} submitting={submitting} />
      </View>
    </ScreenFrame>
  );
}
