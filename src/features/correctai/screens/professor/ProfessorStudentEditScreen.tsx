import { useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextInputProps,
} from 'react-native';

import {
  Card,
  FormActions,
  Icon,
  Icons,
  PrimaryButton,
  ScreenFrame,
} from '@/features/correctai/components/ui';


import { correctAiTheme } from '@/features/correctai/theme';
import type { Student } from '@/features/correctai/types';
import {
  ProfessorScreenProps,
  resolveSelectedClassIds,
  StudentFormErrors,
  StudentFormValues,
  validateStudentForm,
} from './shared';
import { StudentFormField } from './shared-components';

const { colors, spacing, radius } = correctAiTheme;

export function ProfessorStudentEditScreen({
  onNavigate,
  selectedStudent,
  classesData,
  studentsData,
  onUpdateStudent,
}: ProfessorScreenProps) {
  const classList = classesData ?? [];
  const studentList = studentsData ?? [];
  const student =
    studentList.find((item) => item.id === selectedStudent?.id) ?? selectedStudent ?? studentList[0];
  const [draftStudent, setDraftStudent] = useState<Student>(() => ({
    ...student,
    classes: [...student.classes],
  }));
  const [selectedClasses, setSelectedClasses] = useState<string[]>(() => resolveSelectedClassIds(student.classes, classList));
  const [formErrors, setFormErrors] = useState<StudentFormErrors>({});

  useEffect(() => {
    setDraftStudent({
      ...student,
      classes: [...student.classes],
    });
    setSelectedClasses(resolveSelectedClassIds(student.classes, classList));
    setFormErrors({});
  }, [classList, student]);

  const toggleClass = (classId: string) => {
    setSelectedClasses((current) =>
      current.includes(classId) ? current.filter((item) => item !== classId) : [...current, classId],
    );
  };

  const handleSubmit = () => {
    const nextErrors = validateStudentForm(
      {
        firstName: draftStudent.firstName,
        lastName: draftStudent.lastName,
        matricule: draftStudent.matricule,
        email: draftStudent.email,
      },
      {
        existingStudents: studentList,
        currentId: student.id,
      },
    );

    setFormErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const nextClassIds = [...selectedClasses];

    onUpdateStudent?.({
      ...draftStudent,
      firstName: draftStudent.firstName.trim(),
      lastName: draftStudent.lastName.trim(),
      matricule: draftStudent.matricule.trim(),
      email: draftStudent.email.trim().toLowerCase(),
      classes: nextClassIds.map((id) => classList.find((c) => c.id === id)?.name ?? id),
      classIds: nextClassIds,
    });
    onNavigate('professor-student-detail');
  };

  return (
    <ScreenFrame compactHeader scrollable={true} onBack={() => onNavigate('professor-student-detail')} title="Etudiant">
      <View key={student.id} style={styles.editStudentPage}>
        <View style={styles.editStudentFields}>
          <StudentFormField
            label="Prenom *"
            error={formErrors.firstName}
            value={draftStudent.firstName}
            onChangeText={(value) => setDraftStudent((current) => ({ ...current, firstName: value }))}
            autoCapitalize="words"
          />
          <StudentFormField
            label="Nom *"
            error={formErrors.lastName}
            value={draftStudent.lastName}
            onChangeText={(value) => setDraftStudent((current) => ({ ...current, lastName: value }))}
            autoCapitalize="words"
          />
          <StudentFormField
            label="Matricule *"
            error={formErrors.matricule}
            value={draftStudent.matricule}
            onChangeText={(value) => setDraftStudent((current) => ({ ...current, matricule: value }))}
          />
          <StudentFormField
            label="Email *"
            error={formErrors.email}
            value={draftStudent.email}
            onChangeText={(value) => setDraftStudent((current) => ({ ...current, email: value }))}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
          <Text style={styles.readonly}>CorrectAI ID: {draftStudent.correctAiId}</Text>
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
              nestedScrollEnabled
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

        <FormActions
          onCancel={() => onNavigate('professor-student-detail')}
          onSubmit={handleSubmit}
        />
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.72 },
  readonly: {
    color: colors.ink,
    fontWeight: '800',
  },
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
  studentFormFieldGroup: {
    gap: 4,
  },
  studentFormInput: {
    minHeight: 42,
  },
  studentFormInputError: {
    borderColor: colors.danger,
    backgroundColor: '#FFF7F7',
  },
  studentFormError: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  editStudentPage: {
    gap: spacing.md,
  },
  editStudentFields: {
    gap: spacing.md,
  },
  classSelectCard: {},
  classSelectList: {
    maxHeight: 300,
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
});
