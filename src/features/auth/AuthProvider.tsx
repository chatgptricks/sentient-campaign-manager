import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';

import type { Profile } from '../../domain/models';
import type { RoleCode } from '../../domain/permissions';
import { supabase } from '../../lib/supabase/client';
import { isSupabaseConfigured, publicConfig } from '../../lib/supabase/config';
import { logger } from '../../lib/observability/logger';

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  credentialSetup: 'invite' | 'recovery' | null;
  signIn(email: string, password: string): Promise<void>;
  sendMagicLink(email: string): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  clearCredentialSetup(): void;
  signOut(): Promise<void>;
  refreshProfile(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function clearCredentialCallbackUrl(): void {
  const currentUrl = new URL(window.location.href);
  const hasCredentialMarker =
    currentUrl.searchParams.has('auth') ||
    /(?:^|[&#])type=(?:invite|recovery)(?:&|$)/i.test(currentUrl.hash);
  if (!hasCredentialMarker) return;

  currentUrl.searchParams.delete('auth');
  currentUrl.hash = '#/dashboard';
  window.history.replaceState(
    window.history.state,
    document.title,
    `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
  );
}

function asRoleList(value: unknown): RoleCode[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const role = (entry as { role?: { code?: unknown } | { code?: unknown }[] }).role;
      const roleValue = Array.isArray(role) ? role[0] : role;
      return typeof roleValue?.code === 'string' ? (roleValue.code as RoleCode) : null;
    })
    .filter((role): role is RoleCode => role !== null);
}

async function loadProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, user_roles!user_roles_user_id_fkey(role:roles(code))')
    .eq('id', userId)
    .single();

  if (error) throw error;
  const row = data as Record<string, unknown>;
  return {
    id: String(row.id),
    email: String(row.email),
    displayName: String(row.display_name),
    status: String(row.status) as Profile['status'],
    roles: asRoleList(row.user_roles),
  };
}

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const initialCredentialSetup = useMemo<'invite' | 'recovery' | null>(() => {
    const location = `${window.location.search}${window.location.hash}`;
    if (/type=invite|auth=invite/i.test(location)) return 'invite';
    if (/type=recovery|auth=recovery/i.test(location)) return 'recovery';
    return null;
  }, []);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);
  const [credentialSetup, setCredentialSetup] = useState<'invite' | 'recovery' | null>(
    initialCredentialSetup,
  );
  const identityRef = useRef<string | null>(null);

  const resolveProfile = useCallback(
    async (nextSession: Session | null) => {
      const nextIdentity = nextSession?.user.id ?? null;
      if (identityRef.current !== nextIdentity) {
        queryClient.clear();
        identityRef.current = nextIdentity;
        setProfile(null);
      }
      setSession(nextSession);
      if (!nextSession) {
        setProfile(null);
        return;
      }
      try {
        const nextProfile = await loadProfile(nextSession.user.id);
        if (identityRef.current !== nextSession.user.id) return;
        if (nextProfile.status === 'SUSPENDED') {
          await supabase.auth.signOut();
          setError('This account is suspended. Contact an administrator.');
          setProfile(null);
          return;
        }
        setProfile(nextProfile);
        if (nextSession.user.user_metadata?.must_change_password === true) {
          setCredentialSetup((current) => (current === 'recovery' ? current : 'invite'));
        }
        setError(null);
      } catch (profileError) {
        if (identityRef.current !== nextSession.user.id) return;
        logger.error('Failed to load authenticated profile', { userId: nextSession.user.id });
        setError(
          profileError instanceof Error ? profileError.message : 'Unable to load your profile.',
        );
        setProfile(null);
      }
    },
    [queryClient],
  );

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let active = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (active) {
        await resolveProfile(data.session);
        setLoading(false);
      }
    });

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') setCredentialSetup('recovery');
      if (event === 'SIGNED_OUT') setCredentialSetup(null);
      if (active) void resolveProfile(nextSession);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [resolveProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      loading,
      error,
      credentialSetup,
      async signIn(email, password) {
        setError(null);
        const result = await supabase.auth.signInWithPassword({ email, password });
        if (result.error) {
          setError(result.error.message);
          throw result.error;
        }
      },
      async sendMagicLink(email) {
        setError(null);
        const result = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}${publicConfig.basePath}` },
        });
        if (result.error) {
          setError(result.error.message);
          throw result.error;
        }
      },
      async sendPasswordReset(email) {
        setError(null);
        const redirectUrl = new URL(publicConfig.basePath, window.location.origin);
        redirectUrl.searchParams.set('auth', 'recovery');
        const result = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: redirectUrl.toString(),
        });
        if (result.error) {
          setError(result.error.message);
          throw result.error;
        }
      },
      async updatePassword(password) {
        setError(null);
        const result = await supabase.auth.updateUser({
          password,
          data: { must_change_password: false },
        });
        if (result.error) {
          setError(result.error.message);
          throw result.error;
        }
        clearCredentialCallbackUrl();
        setCredentialSetup(null);
      },
      clearCredentialSetup() {
        clearCredentialCallbackUrl();
        setCredentialSetup(null);
      },
      async signOut() {
        const result = await supabase.auth.signOut();
        if (result.error) throw result.error;
        clearCredentialCallbackUrl();
        setCredentialSetup(null);
      },
      async refreshProfile() {
        if (session) await resolveProfile(session);
      },
    }),
    [credentialSetup, error, loading, profile, resolveProfile, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
