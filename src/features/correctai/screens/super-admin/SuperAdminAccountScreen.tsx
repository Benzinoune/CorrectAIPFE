import { Alert, Text, View } from 'react-native';

import { Card, Icons, InfoRow, PrimaryButton, ScreenFrame, SectionTitle } from '@/features/correctai/components/ui';
import { superAdminTabs, superAdminUser } from '@/features/correctai/data/mock-data';
import { SuperAdminScreenProps } from './shared';

export function SuperAdminAccountScreen({ activeTab, onNavigate, onLogout, loggedInSuperAdmin }: SuperAdminScreenProps & { onLogout: () => void }) {
  const admin = loggedInSuperAdmin ?? superAdminUser;
  const greeting = `Bonjour, ${admin.name.split(' ')[0]}`;

  const initials = admin.name
      .split(' ')
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);

  const handleLogout = () => {
    Alert.alert(
      'Se déconnecter ?',
      'Êtes-vous sûr de vouloir vous déconnecter ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { 
          text: 'Se déconnecter', 
          style: 'destructive', 
          onPress: onLogout 
        },
      ],
    );
  };

  return (
    <ScreenFrame
      activeTab={activeTab}
      greeting={greeting}
      onTabPress={(item) => onNavigate(item.screen)}
      tabs={superAdminTabs}>
      <View style={{ marginBottom: 24, alignItems: 'center' }}>
        <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
          <Text style={{ fontSize: 32, fontWeight: '700', color: '#FFFFFF' }}>{initials}</Text>
        </View>
        <Text style={{ fontSize: 24, fontWeight: '700', color: '#1F2937' }}>{admin.name}</Text>
        <Text style={{ fontSize: 14, color: '#6B7280', marginTop: 4 }}>Super Administrateur</Text>
      </View>

      <SectionTitle>Informations Personnelles</SectionTitle>
      <Card icon={Icons.profile} style={{ marginBottom: 24 }} title="Détails Personnels">
        <InfoRow icon={Icons.profile} label="Nom complet" value={admin.name} />
        <InfoRow icon={Icons.mail} label="Email" value={admin.email} />
      </Card>

      <SectionTitle>Informations du Compte</SectionTitle>
      <Card icon={Icons.gear} style={{ marginBottom: 24 }} title="Détails du Compte">
        <InfoRow icon={Icons.shield} label="Rôle" value="Super Administrateur" />
        <InfoRow icon={Icons.check} label="Statut" value="ACTIF" />
        <InfoRow icon={Icons.calendar} label="Créé le" value={new Date(admin.createdAt).toLocaleDateString('fr-FR')} />
      </Card>

      <View style={{ marginTop: 24, paddingHorizontal: 16, paddingBottom: 32 }}>
        <PrimaryButton icon={Icons.logout} onPress={handleLogout} tone="danger">
          Se déconnecter
        </PrimaryButton>
      </View>
    </ScreenFrame>
  );
}
