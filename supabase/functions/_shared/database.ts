import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnv, requireEnv } from './env.ts';

export type DatabaseClient = SupabaseClient;

const clientOptions = {
  auth: { autoRefreshToken: false, persistSession: false },
} as const;

export function createServiceClient(): DatabaseClient {
  return createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    clientOptions,
  );
}

export function createUserClient(accessToken: string): DatabaseClient {
  const publicKey = getEnv('SUPABASE_ANON_KEY') ?? getEnv('SUPABASE_PUBLISHABLE_KEY');
  if (!publicKey) throw new Error('Missing Supabase public key.');
  return createClient(requireEnv('SUPABASE_URL'), publicKey, {
    ...clientOptions,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
