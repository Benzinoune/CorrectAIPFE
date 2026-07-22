import { useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Card, Icons, InfoRow, PrimaryButton, ScreenFrame, SectionTitle, SecureField } from '@/features/correctai/components/ui';
import { studentTabs } from '@/features/correctai/data/mock-data';
import { StudentScreenProps, styles, tabPress } from './shared';

export function StudentProfileScreen({ activeTab, onNavigate, studentsData, establishmentsData, selectedStudent, onUpdateStudent, onLogout }: StudentScreenProps) {
  const student = selectedStudent ?? studentsData[0];
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saved, setSaved] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const handleUpdatePassword = () => {
    setPasswordError('');
    if (!oldPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      setPasswordError('Veuillez remplir tous les champs.');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('Le nouveau mot de passe doit contenir au moins 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Les mots de passe ne correspondent pas.');
      return;
    }
    if (oldPassword !== student.password) {
      setPasswordError('Ancien mot de passe incorrect.');
      return;
    }
    onUpdateStudent?.({ ...student, password: newPassword });
    setSaved(true);
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };
  const initials = student.initials ?? (student.firstName?.[0] ?? '') + (student.lastName?.[0] ?? '');
  const fullName = student.firstName && student.lastName ? `${student.firstName} ${student.lastName}` : student.initials ?? 'Etudiant';
  const establishmentName = establishmentsData?.find((e) => e.id === student.establishmentId)?.name ?? (student.establishmentId || 'Non assigné');

  const handleLogout = () => {
    Alert.alert(
      'Se déconnecter ?',
      'Êtes-vous sûr de vouloir vous déconnecter ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { 
          text: 'Se déconnecter', 
          style: 'destructive', 
          onPress: () => {
            if (onLogout) {
              onLogout();
            } else {
              onNavigate('login');
            }
          }
        },
      ],
    );
  };

  return (
    <ScreenFrame
      activeTab={activeTab}
      greeting="Profil"
      onTabPress={tabPress(onNavigate)}
      tabs={studentTabs}>
      <View style={styles.profileHeader}>
        <View style={styles.profileAvatar}>
          <Text style={styles.profileAvatarText}>{initials || 'AB'}</Text>
        </View>
        <Text style={styles.profileName}>{fullName}</Text>
        <Text style={styles.rowSubtitle}>{student.matricule ?? 'N/A'}</Text>
      </View>

      <SectionTitle>Informations Personnelles</SectionTitle>
      <Card icon={Icons.profile} style={styles.settingsCard} title="Details Personnels">
        <InfoRow icon={Icons.profile} label="Nom complet" value={fullName} />
        <InfoRow icon={Icons.mail} label="Email" value={student.email || 'Non renseigné'} />
        <InfoRow icon={Icons.key} label="Mot de passe" value="••••••••" />
      </Card>

      <SectionTitle>Informations Académiques</SectionTitle>
      <Card icon={Icons.school} style={styles.settingsCard} title="Details Académiques">
        <InfoRow icon={Icons.doc} label="Matricule" value={student.matricule || 'Non renseigné'} />
        <InfoRow icon={Icons.school} label="Établissement" value={establishmentName} />
        <InfoRow icon={Icons.school} label="Classes" value={student.classes?.length > 0 ? student.classes.join(', ') : 'Aucune classe'} />
      </Card>

      <SectionTitle>Informations du Compte</SectionTitle>
      <Card icon={Icons.gear} style={styles.settingsCard} title="Details du Compte">
        <InfoRow icon={Icons.shield} label="ID CorrectAI" value={student.correctAiId || 'Non renseigné'} />
        <InfoRow icon={Icons.doc} label="Ref Externe" value={student.externalRef || 'Non renseigné'} />
        <InfoRow icon={Icons.notifications} label="Notifications" value="Activees" />
        <InfoRow icon={Icons.book} label="Langue" value="Francais" />
      </Card>
      
      <SectionTitle>Changer de mot de passe</SectionTitle>
      <SecureField placeholder="Ancien mot de passe" onChangeText={setOldPassword} value={oldPassword} />
      <SecureField placeholder="Nouveau" onChangeText={setNewPassword} value={newPassword} />
      <SecureField placeholder="Confirmer" onChangeText={setConfirmPassword} value={confirmPassword} />
      {passwordError ? <Text style={styles.passwordError}>{passwordError}</Text> : null}
      <View style={{ marginTop: 8 }}>
        <PrimaryButton icon={Icons.save} onPress={handleUpdatePassword}>
          {saved ? 'Mis a jour' : 'Mettre a jour'}
        </PrimaryButton>
        {saved ? <Text style={styles.confirmation}>Mot de passe mis a jour.</Text> : null}
      </View>
      
      <View style={{ marginTop: 24, paddingHorizontal: 16, paddingBottom: 32 }}>
        <PrimaryButton icon={Icons.logout} onPress={handleLogout} tone="danger">
          Se déconnecter
        </PrimaryButton>
      </View>
    </ScreenFrame>
  );
}
