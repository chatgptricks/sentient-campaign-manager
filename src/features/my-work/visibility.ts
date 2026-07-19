import type { RoleCode } from '../../domain/permissions';

export function canViewFinanceQueue(roles: readonly RoleCode[]) {
  return roles.includes('ADMINISTRATOR') || roles.includes('SALES');
}
