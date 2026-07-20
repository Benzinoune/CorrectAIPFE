import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AuthFrame,
  BrandTitle,
  Field,
  Icons,
  PrimaryButton,
  RoleSwitch,
  TextButton,
} from '@/features/correctai/components/ui';
import { admins, professors, students, superAdminUser } from '@/features/correctai/data/mock-data';
import { correctAiTheme } from '@/features/correctai/theme';
import type { AppScreen, UserRole } from '@/features/correctai/types';

type AuthProps = {
  onLogin: (role: UserRole, establishmentId?: string, userId?: string) => void;
  onNavigate: (screen: AppScreen) => void;
};

const { colors, spacing, radius } = correctAiTheme;

export function LoginScreen({ onLogin, onNavigate }: AuthProps) {
  const [role, setRole] = useState<UserRole>('professor');
  const [selectedAdminId, setSelectedAdminId] = useState<string | null>(null);
  const [selectedProfessorId, setSelectedProfessorId] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const canSignUp = role === 'professor';
  const activeAdmins = admins.filter((a) => a.status === 'ACTIF');
  const activeProfessors = professors.filter((p) => p.status === 'ACTIF');
  const activeStudents = students;

  const handleLogin = () => {
    if (role === 'super_admin') {
      onLogin(role, undefined, superAdminUser.id);
    } else if (role === 'admin') {
      const admin = admins.find((a) => a.id === selectedAdminId);
      onLogin(role, admin?.establishmentId, admin?.id);
    } else if (role === 'professor') {
      const prof = professors.find((p) => p.id === selectedProfessorId);
      onLogin(role, prof?.establishmentId, prof?.id);
    } else if (role === 'student') {
      const student = students.find((s) => s.id === selectedStudentId);
      onLogin(role, student?.establishmentId, student?.id);
    }
  };

  return (
    <AuthFrame>
      <BrandTitle subtitle="Connexion a votre compte" />
      <View style={styles.form}>
        <RoleSwitch selectedRole={role} onChange={(nextRole) => { setRole(nextRole); setSelectedAdminId(null); setSelectedProfessorId(null); setSelectedStudentId(null); }} />
        
        {role === 'admin' ? (
          <View style={styles.pickerGroup}>
            <Text style={styles.pickerLabel}>Choisir un administrateur</Text>
            {activeAdmins.map((admin) => (
              <Pressable
                key={admin.id}
                onPress={() => setSelectedAdminId(admin.id)}
                style={[styles.option, selectedAdminId === admin.id && styles.optionActive]}>
                <Text style={[styles.optionName, selectedAdminId === admin.id && styles.optionNameActive]}>
                  {admin.name}
                </Text>
                <Text style={styles.optionSub}>{admin.establishment}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {role === 'professor' ? (
          <View style={styles.pickerGroup}>
            <Text style={styles.pickerLabel}>Choisir un professeur</Text>
            {activeProfessors.map((prof) => (
              <Pressable
                key={prof.id}
                onPress={() => setSelectedProfessorId(prof.id)}
                style={[styles.option, selectedProfessorId === prof.id && styles.optionActive]}>
                <Text style={[styles.optionName, selectedProfessorId === prof.id && styles.optionNameActive]}>
                  {prof.name}
                </Text>
                <Text style={styles.optionSub}>{prof.establishment}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {role === 'student' ? (
          <View style={styles.pickerGroup}>
            <Text style={styles.pickerLabel}>Choisir un étudiant</Text>
            {activeStudents.map((student) => (
              <Pressable
                key={student.id}
                onPress={() => setSelectedStudentId(student.id)}
                style={[styles.option, selectedStudentId === student.id && styles.optionActive]}>
                <Text style={[styles.optionName, selectedStudentId === student.id && styles.optionNameActive]}>
                  {student.firstName} {student.lastName}
                </Text>
                <Text style={styles.optionSub}>{student.email}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Field autoCapitalize="none" keyboardType="email-address" placeholder="Email" />
        <Field placeholder="Mot de passe" secureTextEntry />
        <PrimaryButton icon={Icons.lock} onPress={handleLogin}>
          Se connecter
        </PrimaryButton>
        <TextButton icon={Icons.key} onPress={() => onNavigate('forgot-password')}>
          Mot de passe oublie ?
        </TextButton>
        {canSignUp ? (
          <TextButton icon={Icons.personAdd} onPress={() => onNavigate('signup')}>
            S'inscrire en tant que professeur
          </TextButton>
        ) : null}
      </View>
    </AuthFrame>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.md,
  },
  pickerGroup: {
    gap: spacing.xs,
  },
  pickerLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  option: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  optionName: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  optionNameActive: {
    color: colors.primary,
  },
  optionSub: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
});
