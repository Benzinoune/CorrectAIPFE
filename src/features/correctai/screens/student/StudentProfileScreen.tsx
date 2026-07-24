import { Alert, Text, View } from 'react-native';

import { Card, EmptyState, Icons, InfoRow, PrimaryButton, ScreenFrame, SectionTitle } from '@/features/correctai/components/ui';
import { studentTabs } from '@/features/correctai/data/mock-data';
import { StudentScreenProps, styles, tabPress } from './shared';

export function StudentProfileScreen({ activeTab, onNavigate, studentsData, establishmentsData, selectedStudent, onUpdateStudent, onLogout }: StudentScreenProps) {
  const student = selectedStudent ?? studentsData[0] ?? null;
  if (!student) {
    return (
      <ScreenFrame activeTab={activeTab} tabs={studentTabs} onTabPress={tabPress(onNavigate)} greeting="Mon Profil">
        <EmptyState icon={Icons.profile} title="Aucun étudiant" subtitle="Connectez-vous en tant qu'étudiant pour voir votre profil." />
      </ScreenFrame>
    );
  }
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
          <Text style={styles.profileAvatarText}>{initials || ''}</Text>
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
        <InfoRow icon={Icons.notifications} label="Notifications" value="Activées" />
        <InfoRow icon={Icons.book} label="Langue" value="Français" />
      </Card>
      
      <View style={{ marginTop: 24, paddingHorizontal: 16, paddingBottom: 32 }}>
        <PrimaryButton icon={Icons.logout} onPress={handleLogout} tone="danger">
          Se déconnecter
        </PrimaryButton>
      </View>
    </ScreenFrame>
  );
}
