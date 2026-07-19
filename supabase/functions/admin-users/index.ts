import { authenticateUser, requireAnyRole } from '../_shared/auth/index.ts';
import { createServiceClient } from '../_shared/database.ts';
import { assertMethod, assertUuid, HttpError } from '../_shared/errors.ts';
import { functionHandler } from '../_shared/function-handler.ts';
import { jsonResponse, readJson } from '../_shared/http.ts';
import { requestIdempotencyKey } from '../_shared/idempotency.ts';
import { serve } from '../_shared/runtime.ts';
import {
  createUser,
  inviteUser,
  normalizeEmail,
  replaceUserRoles,
  setProfileStatus,
} from '../_shared/services/admin-users.ts';
import { sha256Hex } from '../_shared/webhook.ts';

type AdminUsersBody = {
  action?: string;
  displayName?: unknown;
  display_name?: unknown;
  email?: unknown;
  roles?: unknown;
  status?: unknown;
  temporaryPassword?: unknown;
  temporary_password?: unknown;
  userId?: unknown;
  user_id?: unknown;
};

export const handleRequest = functionHandler('admin-users', async (request) => {
  assertMethod(request);
  const auth = await authenticateUser(request);
  requireAnyRole(auth, ['ADMINISTRATOR']);
  const body = await readJson<AdminUsersBody>(request);
  const action = body.action?.trim().toLowerCase().replaceAll('-', '_');
  const serviceClient = createServiceClient();

  if (action === 'invite') {
    const email = normalizeEmail(body.email);
    const emailHash = await sha256Hex(email);
    const hasClientKey = Boolean(request.headers.get('idempotency-key')?.trim());
    const fallback = hasClientKey
      ? `admin-user:invite:${emailHash}`
      : `admin-user:invite:${emailHash}:${crypto.randomUUID()}`;
    const key = requestIdempotencyKey(request, fallback);
    const result = await inviteUser(
      serviceClient,
      auth,
      {
        displayName: body.displayName ?? body.display_name,
        email,
        roles: body.roles,
      },
      key,
    );
    return jsonResponse(request, result, result.invited ? 201 : 200);
  }

  if (action === 'create') {
    const email = normalizeEmail(body.email);
    const emailHash = await sha256Hex(email);
    const hasClientKey = Boolean(request.headers.get('idempotency-key')?.trim());
    const fallback = hasClientKey
      ? `admin-user:create:${emailHash}`
      : `admin-user:create:${emailHash}:${crypto.randomUUID()}`;
    const key = requestIdempotencyKey(request, fallback);
    const result = await createUser(
      serviceClient,
      auth,
      {
        displayName: body.displayName ?? body.display_name,
        email,
        roles: body.roles,
        temporaryPassword: body.temporaryPassword ?? body.temporary_password,
      },
      key,
    );
    return jsonResponse(request, result, result.created ? 201 : 200);
  }

  const roleAction = action === 'replace_roles' || action === 'replaceroles';
  const statusAction = action === 'set_status' || action === 'setstatus';
  if (!roleAction && !statusAction) {
    throw new HttpError(
      400,
      'ADMIN_USER_ACTION_INVALID',
      'action must be invite, create, replace_roles, or set_status.',
    );
  }

  const userId = body.userId ?? body.user_id;
  assertUuid(userId, 'userId');
  if (roleAction) {
    const user = await replaceUserRoles(serviceClient, auth, userId, body.roles);
    return jsonResponse(request, { user });
  }
  if (statusAction) {
    const user = await setProfileStatus(serviceClient, auth, userId, body.status);
    return jsonResponse(request, { user });
  }
  throw new HttpError(500, 'INTERNAL_ERROR', 'The admin action could not be completed.');
});

serve(handleRequest);
