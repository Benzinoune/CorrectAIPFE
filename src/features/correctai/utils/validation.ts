const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates that a string is a properly formatted email address.
 * Trims whitespace before testing.
 */
export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim());
}

/**
 * Normalizes an email: trims and lowercases.
 */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export const EMAIL_VALIDATION_MESSAGE = 'Veuillez entrer une adresse email valide.';
