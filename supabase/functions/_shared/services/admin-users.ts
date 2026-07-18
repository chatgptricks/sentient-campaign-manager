import type { AuthContext } from '../auth/index.ts';
import type { DatabaseClient } from '../database.ts';
import { getEnv } from '../env.ts';
import { databaseError, HttpError } from '../errors.ts';
import { executeIdempotently, recordIntegrationAttempt } from '../idempotency.ts';

const allowedRoles = new Set([
  'ADMINISTRATOR',
  'APPROVER',
  'CREATOR',
  'FINANCE',
  'PUBLISHER',
  'SALES',
]);
const allowedStatuses = new Set(['ACTIVE', 'INVITED', 'SUSPENDED']);

export function normalizeEmail(input: unknown): string {
  const email = typeof input === 'string' ? input.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'EMAIL_INVALID', 'A valid email address is required.');
  }
  return email;
}

export function normalizeRoleCodes(input: unknown): string[] {
  if (!Array.isArray(input)) {
    throw new HttpError(400, 'ROLES_INVALID', 'roles must be an array.');
  }
  const roles = [...new Set(input.map((role) => String(role).trim().toUpperCase()))].sort();
  if (roles.some((role) => !allowedRoles.has(role))) {
    throw new HttpError(400, 'ROLES_INVALID', 'One or more role codes are invalid.');
  }
  return roles;
}

async function userRoleCodes(client: DatabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await client
    .from('user_roles')
    .select('roles(code)')
    .eq('user_id', userId);
  if (error) throw databaseError(error, 'User roles could not be loaded.');
  const codes = new Set<string>();
  for (const row of data ?? []) {
    const relations = Array.isArray(row.roles) ? row.roles : [row.roles];
    for (const relation of relations) {
      if (relation && typeof relation === 'object' && 'code' in relation) {
        codes.add(String(relation.code).toUpperCase());
      }
    }
  }
  return [...codes].sort();
}

async function userSummary(
  client: DatabaseClient,
  userId: string,
): Promise<Record<string, unknown>> {
  const { data: profile, error } = await client
    .from('profiles')
    .select('id,email,display_name,status')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw databaseError(error, 'User profile could not be loaded.');
  if (!profile) throw new HttpError(404, 'USER_NOT_FOUND', 'User was not found.');
  return {
    displayName: profile.display_name,
    email: profile.email,
    id: profile.id,
    roles: await userRoleCodes(client, userId),
    status: profile.status,
  };
}

export async function replaceUserRoles(
  serviceClient: DatabaseClient,
  auth: AuthContext,
  userId: string,
  desiredRolesInput: unknown,
): Promise<Record<string, unknown>> {
  const desired = normalizeRoleCodes(desiredRolesInput);
  if (userId === auth.user.id && !desired.includes('ADMINISTRATOR')) {
    throw new HttpError(
      400,
      'CANNOT_REMOVE_OWN_ADMIN_ROLE',
      'Administrators cannot remove their own Administrator role.',
    );
  }
  await userSummary(serviceClient, userId);
  const { error } = await auth.userClient.rpc('replace_user_roles', {
    profile_id: userId,
    role_codes: desired,
  });
  if (error) throw databaseError(error, 'User roles could not be replaced.');
  return userSummary(serviceClient, userId);
}

export async function inviteUser(
  serviceClient: DatabaseClient,
  auth: AuthContext,
  input: { displayName?: unknown; email?: unknown; roles?: unknown },
  idempotencyKey: string,
): Promise<Record<string, unknown>> {
  const email = normalizeEmail(input.email);
  const displayName =
    typeof input.displayName === 'string' ? input.displayName.trim().slice(0, 120) : '';
  if (!displayName) {
    throw new HttpError(400, 'DISPLAY_NAME_REQUIRED', 'displayName is required.');
  }
  const rolesSupplied = input.roles !== undefined;
  const desiredRoles = rolesSupplied ? normalizeRoleCodes(input.roles) : [];
  return executeIdempotently(
    serviceClient,
    'SUPABASE_AUTH',
    'INVITE_USER',
    idempotencyKey,
    async () => {
      const existingResult = await serviceClient
        .from('profiles')
        .select('id,status')
        .ilike('email', email)
        .maybeSingle();
      let existing = existingResult.data;
      const existingError = existingResult.error;
      if (existingError) throw databaseError(existingError, 'Existing user could not be checked.');
      if (existing?.status === 'SUSPENDED') {
        throw new HttpError(409, 'USER_SUSPENDED', 'The existing user is suspended.');
      }
      let invited = false;
      if (!existing) {
        const redirectTo = getEnv('ADMIN_INVITE_REDIRECT_URL') ?? getEnv('SITE_URL');
        const { data, error } = await serviceClient.auth.admin.inviteUserByEmail(email, {
          data: { display_name: displayName },
          ...(redirectTo ? { redirectTo } : {}),
        });
        if (error || !data.user) {
          const lookup = await serviceClient
            .from('profiles')
            .select('id,status')
            .ilike('email', email)
            .maybeSingle();
          if (lookup.error || !lookup.data) {
            throw new HttpError(502, 'INVITE_FAILED', 'The invitation could not be created.');
          }
          existing = lookup.data;
        } else {
          existing = { id: data.user.id, status: 'INVITED' };
          invited = true;
        }
      }

      if (!existing)
        throw new HttpError(500, 'INVITE_FAILED', 'The invitation could not be created.');
      if (rolesSupplied) {
        await replaceUserRoles(serviceClient, auth, existing.id, desiredRoles);
      }
      const user = await userSummary(serviceClient, existing.id);
      await recordIntegrationAttempt(serviceClient, {
        aggregateId: existing.id,
        idempotencyKey,
        operation: 'INVITE_USER',
        provider: 'SUPABASE_AUTH',
        requestMetadata: { roleCount: desiredRoles.length },
        responseMetadata: { invited, userId: existing.id },
        status: 'SUCCEEDED',
      });
      return { duplicate: false, existing: !invited, invited, user };
    },
  );
}

export async function setProfileStatus(
  serviceClient: DatabaseClient,
  auth: AuthContext,
  userId: string,
  statusInput: unknown,
): Promise<Record<string, unknown>> {
  const status = typeof statusInput === 'string' ? statusInput.trim().toUpperCase() : '';
  if (!allowedStatuses.has(status)) {
    throw new HttpError(400, 'PROFILE_STATUS_INVALID', 'Profile status is invalid.');
  }
  if (userId === auth.user.id && status !== 'ACTIVE') {
    throw new HttpError(
      400,
      'CANNOT_DEACTIVATE_SELF',
      'Administrators cannot deactivate themselves.',
    );
  }
  const { error } = await auth.userClient.rpc('set_profile_status', {
    profile_id: userId,
    status,
  });
  if (error) throw databaseError(error, 'Profile status could not be changed.');
  return userSummary(serviceClient, userId);
}
