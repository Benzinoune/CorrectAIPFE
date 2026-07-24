import type { NavItem } from '@/features/correctai/types';

export const adminTabs: NavItem[] = [
  { id: 'home', label: 'Accueil', screen: 'admin-home' },
  { id: 'professors', label: 'Profs', screen: 'admin-professors' },
  { id: 'profile', label: 'Profil', screen: 'admin-account' },
];

export const superAdminTabs: NavItem[] = [
  { id: 'home', label: 'Accueil', screen: 'super-admin-home' },
  { id: 'establishments', label: 'Etablissements', screen: 'super-admin-establishments' },
  { id: 'professors', label: 'Professeurs', screen: 'super-admin-professors' },
  { id: 'profile', label: 'Profil', screen: 'super-admin-account' },
];

export const professorTabs: NavItem[] = [
  { id: 'home', label: 'Accueil', screen: 'professor-home' },
  { id: 'classes', label: 'Classes', screen: 'professor-classes' },
  { id: 'exams', label: 'Examens', screen: 'professor-exams' },
  { id: 'students', label: 'Etudiants', screen: 'professor-students' },
  { id: 'profile', label: 'Compte', screen: 'professor-account' },
];

export const studentTabs: NavItem[] = [
  { id: 'home', label: 'Accueil', screen: 'student-home' },
  { id: 'exams', label: 'Examens', screen: 'student-exams' },
  { id: 'report', label: 'Releve', screen: 'student-report' },
  { id: 'profile', label: 'Profil', screen: 'student-profile' },
];
