import { hasAnyRole, type RoleCode } from '../../domain/permissions';

export function canViewFinanceQueue(roles: readonly RoleCode[]) {
  return hasAnyRole(roles, ['SALES', 'FINANCE']);
}
