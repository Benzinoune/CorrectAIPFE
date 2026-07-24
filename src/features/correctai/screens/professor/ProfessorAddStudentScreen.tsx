import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, Icon, Icons, PrimaryButton, ScreenFrame } from '@/features/correctai/components/ui';


import { correctAiTheme } from '@/features/correctai/theme';
import { validateStudentForm, type ProfessorScreenProps, type StudentFormErrors, type StudentFormValues } from './shared';
import { StudentFormField } from './shared-components';

const { colors, spacing, radius } = correctAiTheme;

export function ProfessorAddStudentScreen({
  onNavigate,
  classesData,
  studentsData,
  onCreateStudent,
  selectedClass,
  previousScreen,
}: ProfessorScreenProps) {
  const classList = classesData ?? [];
  const studentList = studentsData ?? [];
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [matricule, setMatricule] = useState('');
  const [email, setEmail] = useState('');
  const [selectedClasses, setSelectedClasses] = useState<string[]>(
    previousScreen === 'professor-class-detail' && selectedClass ? [selectedClass.id] : [],
  );
  const [formErrors, setFormErrors] = useState<StudentFormErrors>({});

  const toggleClass = (classId: string) => {
    setSelectedClasses((current) =>
      current.includes(classId) ? current.filter((item) => item !== classId) : [...current, classId],
    );
  };

  const handleSubmit = () => {
    const nextErrors = validateStudentForm(
      { firstName, lastName, matricule, email },
      { existingStudents: studentList },
    );

    setFormErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    onCreateStudent?.({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      matricule: matricule.trim(),
      email: email.trim().toLowerCase(),
      classes: selectedClasses.map((id) => classList.find((c) => c.id === id)?.name ?? id),
      classIds: [...selectedClasses],
    });
    
    if (previousScreen === 'professor-class-detail') {
      onNavigate('professor-class-detail');
    } else {
      onNavigate('professor-student-detail');
    }
  };

  const handleCancel = () => {
    if (previousScreen === 'professor-class-detail') {
      onNavigate('professor-class-detail');
    } else {
      onNavigate('professor-students');
    }
  };

  return (
    <ScreenFrame compactHeader scrollable={true} onBack={handleCancel} title="Ajouter Etudiant">
      <View style={styles.editStudentPage}>
        <View style={styles.editStudentFields}>
          <StudentFormField
            label="Prenom *"
            error={formErrors.firstName}
            value={firstName}
            onChangeText={setFirstName}
            autoCapitalize="words"
          />
          <StudentFormField
            label="Nom *"
            error={formErrors.lastName}
            value={lastName}
            onChangeText={setLastName}
            autoCapitalize="words"
          />
          <StudentFormField
            label="Matricule *"
            error={formErrors.matricule}
            value={matricule}
            onChangeText={setMatricule}
          />
          <StudentFormField
            label="Email *"
            error={formErrors.email}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
        </View>

        <Card
          icon={Icons.school}
          style={styles.classSelectCard}
          title={`Classes (${selectedClasses.length})`}
          subtitle="Selection multiple">
          {classList.length === 0 ? (
            <View style={styles.emptyClassContainer}>
              <Text style={styles.emptyClassText}>
                Aucune classe disponible.{'\n'}Creez une classe d'abord ou continuez sans en assigner.
              </Text>
              <PrimaryButton icon={Icons.plus} onPress={() => onNavigate('professor-classes')} variant="soft">
                Creer une classe
              </PrimaryButton>
            </View>
          ) : (
            <FlatList
              data={classList}
              extraData={selectedClasses}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              scrollEnabled={false}
              renderItem={({ item }) => {
                const selected = selectedClasses.includes(item.id);
                return (
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    onPress={() => toggleClass(item.id)}
                    style={({ pressed }) => [
                      styles.classSelectRow,
                      selected && styles.classSelectRowSelected,
                      pressed && styles.pressed,
                    ]}>
                    <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                      {selected ? <Icon name={Icons.check} color={colors.card} size={14} /> : null}
                    </View>
                    <View style={styles.classSelectRowText}>
                      <Text numberOfLines={1} style={styles.classSelectTitle}>
                        {item.name}
                      </Text>
                      <Text style={styles.classSelectSubtitle}>
                        {item.students} etudiants - {item.exams} examens
                      </Text>
                    </View>
                  </Pressable>
                );
              }}
              showsVerticalScrollIndicator={false}
              style={styles.classSelectList}
              contentContainerStyle={styles.classSelectListContent}
              ItemSeparatorComponent={() => <View style={styles.classSelectSeparator} />}
            />
          )}
        </Card>

        <View style={styles.form}>
          <PrimaryButton icon={Icons.addCircle} onPress={handleSubmit}>
            Ajouter
          </PrimaryButton>
          <PrimaryButton icon={Icons.close} onPress={handleCancel} variant="soft">
            Annuler
          </PrimaryButton>
        </View>
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.72 },
  studentFormFieldGroup: { gap: spacing.xxs },
  studentFormInput: { marginBottom: 0 },
  studentFormInputError: { borderColor: colors.danger },
  studentFormError: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  emptyClassContainer: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  emptyClassText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
  },
  editStudentPage: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  editStudentFields: {
    gap: spacing.md,
  },
  classSelectCard: {
  },
  classSelectList: {
  },
  classSelectListContent: {
    paddingBottom: spacing.xs,
  },
  classSelectRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  classSelectRowSelected: {
    backgroundColor: colors.primarySoft,
  },
  classSelectRowText: {
    flex: 1,
    gap: 2,
  },
  classSelectTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },
  classSelectSubtitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  classSelectSeparator: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 36,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    flexShrink: 0,
  },
  checkboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  form: {
    gap: spacing.md,
  },
});
