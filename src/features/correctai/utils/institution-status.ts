import type { Establishment, EstablishmentStatus } from '@/features/correctai/types';

export type InstitutionBlockReason = 'INACTIF' | 'SUSPENDU' | 'NOT_FOUND';

export type InstitutionCheckResult = {
  allowed: boolean;
  reason?: InstitutionBlockReason;
  establishmentName?: string;
};

/**
 * Centralized institution status gate.
 * Every authenticated role (admin, professor, student) must pass through this
 * before accessing any protected screen or performing any CRUD.
 *
 * Super Admin is exempt — passes institutionId = ''.
 */
export function checkInstitutionStatus(
  establishmentsData: Establishment[],
  establishmentId: string,
): InstitutionCheckResult {
  if (!establishmentId) {
    return { allowed: true };
  }

  const establishment = establishmentsData.find((e) => e.id === establishmentId);

  if (!establishment) {
    return { allowed: false, reason: 'NOT_FOUND' };
  }

  if (establishment.status === 'ACTIF') {
    return { allowed: true, establishmentName: establishment.name };
  }

  return {
    allowed: false,
    reason: establishment.status as InstitutionBlockReason,
    establishmentName: establishment.name,
  };
}

/**
 * Message shown to the user when access is denied due to institution status.
 */
export function getBlockedMessage(reason: InstitutionBlockReason): string {
  switch (reason) {
    case 'INACTIF':
      return "Votre etablissement est actuellement inactif. Veuillez contacter le Super Administrateur.";
    case 'SUSPENDU':
      return "Votre etablissement a ete suspendu. Veuillez contacter le Super Administrateur.";
    case 'NOT_FOUND':
      return "Etablissement introuvable. Veuillez contacter le Super Administrateur.";
  }
}
