import { Alert, Text, View } from 'react-native';

import { Card, Icons, InfoRow, PrimaryButton, ScreenFrame, SectionTitle } from '@/features/correctai/components/ui';
import { adminTabs } from '@/features/correctai/data/mock-data';
import type { Admin, AppScreen, NavItem } from '@/features/correctai/types';

type AdminScreenProps = {
  activeTab: NavItem['id'];
  onNavigate: (screen: AppScreen) => void;
  onLogout: () => void;
  adminsData: Admin[];
  selectedAdmin: Admin | null;
};

export function AdminAccountScreen({ activeTab, onNavigate, onLogout, adminsData, selectedAdmin }: AdminScreenProps) {
  const admin = selectedAdmin ?? adminsData[0];
  const greeting = `Profil Admin`;

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
      tabs={adminTabs}>
      <View style={{ marginBottom: 24, alignItems: 'center' }}>
        <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#6366F1', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
          <Text style={{ fontSize: 32, fontWeight: '700', color: '#FFFFFF' }}>{admin.initials}</Text>
        </View>
        <Text style={{ fontSize: 24, fontWeight: '700', color: '#1F2937' }}>{admin.name}</Text>
        <Text style={{ fontSize: 14, color: '#6B7280', marginTop: 4 }}>Administrateur - {admin.establishment}</Text>
      </View>

      <SectionTitle>Informations Personnelles</SectionTitle>
      <Card icon={Icons.profile} style={{ marginBottom: 24 }} title="Détails Personnels">
        <InfoRow icon={Icons.profile} label="Nom complet" value={admin.name} />
        <InfoRow icon={Icons.mail} label="Email" value={admin.email} />
        <InfoRow icon={Icons.book} label="Établissement" value={admin.establishment} />
      </Card>

      <SectionTitle>Informations du Compte</SectionTitle>
      <Card icon={Icons.gear} style={{ marginBottom: 24 }} title="Détails du Compte">
        <InfoRow icon={Icons.shield} label="Rôle" value="Administrateur" />
        <InfoRow icon={Icons.check} label="Statut" value={admin.status} />
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
