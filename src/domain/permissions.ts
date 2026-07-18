export const roleCodes = [
  'SALES',
  'CREATOR',
  'APPROVER',
  'PUBLISHER',
  'FINANCE',
  'ADMINISTRATOR',
] as const;

export type RoleCode = (typeof roleCodes)[number];

export const roleLabel: Record<RoleCode, string> = {
  SALES: 'Sales',
  CREATOR: 'Creator',
  APPROVER: 'Approver',
  PUBLISHER: 'Publisher',
  FINANCE: 'Finance',
  ADMINISTRATOR: 'Administrator',
};

export function hasAnyRole(currentRoles: readonly RoleCode[], allowed: readonly RoleCode[]) {
  return (
    currentRoles.includes('ADMINISTRATOR') || allowed.some((role) => currentRoles.includes(role))
  );
}
