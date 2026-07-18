import type { User } from '@supabase/supabase-js';
import { createServiceClient, createUserClient, type DatabaseClient } from '../database.ts';
import { getEnv } from '../env.ts';
import { HttpError } from '../errors.ts';

export type AuthContext = {
  accessToken: string;
  roles: ReadonlySet<string>;
  user: User;
  userClient: DatabaseClient;
};

function bearerToken(request: Request): string | undefined {
  const authorization = request.headers.get('authorization')?.trim();
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim();
}

async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftDigest);
  const rightBytes = new Uint8Array(rightDigest);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

export async function isInternalRequest(
  request: Request,
  options: { allowOutboxSecret?: boolean } = {},
): Promise<boolean> {
  const candidates = [getEnv('INTERNAL_FUNCTION_SECRET')];
  if (options.allowOutboxSecret) candidates.push(getEnv('OUTBOX_PROCESSOR_SECRET'));
  const configuredCandidates = candidates.filter((value): value is string => Boolean(value));
  const suppliedInternal = request.headers.get('x-internal-secret')?.trim();
  if (suppliedInternal) {
    for (const candidate of configuredCandidates) {
      if (await constantTimeEqual(suppliedInternal, candidate)) return true;
    }
  }

  const token = bearerToken(request);
  const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  return Boolean(token && serviceKey && (await constantTimeEqual(token, serviceKey)));
}

export async function requireInternalRequest(request: Request): Promise<void> {
  if (!(await isInternalRequest(request, { allowOutboxSecret: true }))) {
    throw new HttpError(401, 'INTERNAL_AUTH_REQUIRED', 'Internal authorization is required.');
  }
}

function extractRoleCodes(rows: unknown): Set<string> {
  const codes = new Set<string>();
  for (const row of (rows ?? []) as Array<Record<string, unknown>>) {
    const relation = row.roles;
    const values = Array.isArray(relation) ? relation : [relation];
    for (const value of values) {
      if (value && typeof value === 'object' && 'code' in value) {
        const code = String((value as { code: unknown }).code)
          .trim()
          .toUpperCase();
        if (code) codes.add(code);
      }
    }
  }
  return codes;
}

export async function authenticateUser(
  request: Request,
  suppliedServiceClient?: DatabaseClient,
): Promise<AuthContext> {
  const accessToken = bearerToken(request);
  if (!accessToken) {
    throw new HttpError(401, 'AUTH_REQUIRED', 'A valid bearer token is required.');
  }
  const serviceClient = suppliedServiceClient ?? createServiceClient();

  const { data: authData, error: authError } = await serviceClient.auth.getUser(accessToken);
  if (authError || !authData.user) {
    throw new HttpError(401, 'INVALID_TOKEN', 'The bearer token is invalid or expired.');
  }

  const { data: profile, error: profileError } = await serviceClient
    .from('profiles')
    .select('id,status')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (profileError || !profile || profile.status !== 'ACTIVE') {
    throw new HttpError(403, 'USER_INACTIVE', 'The user is not active.');
  }

  const { data: roleRows, error: roleError } = await serviceClient
    .from('user_roles')
    .select('roles(code)')
    .eq('user_id', authData.user.id);
  if (roleError) {
    throw new HttpError(500, 'AUTHORIZATION_LOOKUP_FAILED', 'Authorization could not be checked.');
  }

  return {
    accessToken,
    roles: extractRoleCodes(roleRows),
    user: authData.user,
    userClient: createUserClient(accessToken),
  };
}

export function requireAnyRole(context: AuthContext, allowedRoles: string[]): void {
  if (!allowedRoles.some((role) => context.roles.has(role.toUpperCase()))) {
    throw new HttpError(403, 'FORBIDDEN', 'You do not have permission for this action.');
  }
}

export async function requireInternalOrRoles(
  request: Request,
  roles: string[],
  options: { allowOutboxSecret?: boolean } = {},
): Promise<{ internal: true } | { internal: false; auth: AuthContext }> {
  if (await isInternalRequest(request, options)) return { internal: true };
  const auth = await authenticateUser(request);
  requireAnyRole(auth, roles);
  return { internal: false, auth };
}
