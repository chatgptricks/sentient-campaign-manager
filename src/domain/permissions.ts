export const roleCodes = [
  'ADMINISTRATOR',
  'FINANCE',
  'SALES',
  'APPROVER',
  'CREATOR',
  'PUBLISHER',
] as const;

export type RoleCode = (typeof roleCodes)[number];

export const assignableRoleCodes = [
  'ADMINISTRATOR',
  'SALES',
  'CREATOR',
] as const satisfies readonly RoleCode[];

export const roleLabel: Record<RoleCode, string> = {
  SALES: 'Sales',
  CREATOR: 'Creator',
  APPROVER: 'Creator',
  PUBLISHER: 'Creator',
  FINANCE: 'Sales',
  ADMINISTRATOR: 'Administrator',
};

const roleRank: Record<RoleCode, number> = {
  ADMINISTRATOR: 60,
  FINANCE: 50,
  SALES: 40,
  APPROVER: 20,
  CREATOR: 20,
  PUBLISHER: 20,
};

export function hasRole(currentRoles: readonly RoleCode[], allowedRole: RoleCode) {
  const requiredRank = roleRank[allowedRole];
  return currentRoles.some((role) => roleRank[role] >= requiredRank);
}

export function hasAnyRole(currentRoles: readonly RoleCode[], allowed: readonly RoleCode[]) {
  return allowed.some((role) => hasRole(currentRoles, role));
}
