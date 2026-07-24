import { supabase } from './client';
import type { Tables, UserRole } from './types';

const failedAttempts = new Map<string, { count: number; until: number }>();
const LOCKOUT_MS = 60_000;
const MAX_ATTEMPTS = 5;

export type AuthUser = {
  id: string;
  email: string;
  role: UserRole;
  profile: Tables<'profiles'>;
};

export type AuthResult = {
  success: boolean;
  error?: string;
  user?: AuthUser;
};

/**
 * Sign up a new user with Supabase Auth.
 * Creates auth.users entry + profiles row in one call.
 */
export async function signUp(
  email: string,
  password: string,
  profile: Omit<Tables<'profiles'>, 'id' | 'created_at' | 'updated_at'>,
): Promise<AuthResult> {
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authError) {
    return { success: false, error: authError.message };
  }

  if (!authData.user) {
    return { success: false, error: 'Aucun utilisateur créé.' };
  }

  const { error: profileError } = await supabase.from('profiles').insert({
    id: authData.user.id,
    ...profile,
  });

  if (profileError) {
    return { success: false, error: profileError.message };
  }

  return {
    success: true,
    user: { id: authData.user.id, email, role: profile.role, profile: { id: authData.user.id, ...profile, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as Tables<'profiles'> },
  };
}

/**
 * Sign in with email + password.
 * Fetches the profile row to determine role and establishment.
 */
export async function signIn(email: string, password: string): Promise<AuthResult> {
  const key = email.toLowerCase();
  const locked = failedAttempts.get(key);
  if (locked && locked.until > Date.now()) {
    return { success: false, error: `Trop de tentatives. Réessayez dans ${Math.ceil((locked.until - Date.now()) / 1000)}s.` };
  }

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError) {
    const prev = failedAttempts.get(key);
    const count = (prev?.count ?? 0) + 1;
    if (count >= MAX_ATTEMPTS) {
      failedAttempts.set(key, { count: 0, until: Date.now() + LOCKOUT_MS });
    } else {
      failedAttempts.set(key, { count, until: 0 });
    }
    return { success: false, error: 'Email ou mot de passe incorrect' };
  }

  failedAttempts.delete(key);

  if (!authData.user) {
    return { success: false, error: 'Aucun utilisateur trouvé.' };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authData.user.id)
    .single();

  if (profileError || !profile) {
    return { success: false, error: 'Profil introuvable.' };
  }

  if (profile.status !== 'ACTIF') {
    await supabase.auth.signOut();
    return { success: false, error: 'Votre compte est désactivé.' };
  }

  return {
    success: true,
    user: { id: authData.user.id, email: authData.user.email ?? email, role: profile.role, profile },
  };
}

/**
 * Sign out the current user.
 */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/**
 * Get the current session (if any).
 */
export async function getCurrentSession(): Promise<AuthUser | null> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user) return null;

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    await supabase.auth.signOut();
    return null;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (!profile) return null;

  if (profile.status !== 'ACTIF') {
    await supabase.auth.signOut();
    return null;
  }

  return {
    id: session.user.id,
    email: session.user.email ?? '',
    role: profile.role,
    profile,
  };
}

/**
 * Listen for auth state changes.
 */
export function onAuthStateChange(callback: (user: AuthUser | null) => void) {
  return supabase.auth.onAuthStateChange(async (event, session) => {
    if (!session?.user) {
      callback(null);
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    if (!profile) {
      callback(null);
      return;
    }

    callback({
      id: session.user.id,
      email: session.user.email ?? '',
      role: profile.role,
      profile,
    });
  });
}

/**
 * Check institution status for a given establishment_id.
 */
export async function checkInstitutionStatus(
  establishmentId: string,
): Promise<{ allowed: boolean; reason?: 'INACTIF' | 'SUSPENDU' | 'NOT_FOUND' }> {
  if (!establishmentId) return { allowed: true };

  const { data } = await supabase
    .from('establishments')
    .select('status')
    .eq('id', establishmentId)
    .single();

  if (!data) return { allowed: false, reason: 'NOT_FOUND' };
  if (data.status === 'ACTIF') return { allowed: true };
  return { allowed: false, reason: data.status as 'INACTIF' | 'SUSPENDU' };
}
