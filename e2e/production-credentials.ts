export type ProductionRole = 'admin' | 'sales' | 'creator' | 'approver' | 'publisher' | 'finance';

export type ProductionCredential = { email: string; password: string };
export type ProductionAccounts = Record<ProductionRole, ProductionCredential>;

const roles: ProductionRole[] = ['admin', 'sales', 'creator', 'approver', 'publisher', 'finance'];

export function readProductionAccounts(): ProductionAccounts {
  const raw = process.env.PRODUCTION_E2E_ACCOUNTS_JSON;
  if (!raw) {
    throw new Error('PRODUCTION_E2E_ACCOUNTS_JSON is required for production E2E.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('PRODUCTION_E2E_ACCOUNTS_JSON must be valid JSON.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('PRODUCTION_E2E_ACCOUNTS_JSON must be an object keyed by role.');
  }

  const accounts = {} as ProductionAccounts;
  const emails = new Set<string>();
  for (const role of roles) {
    const candidate = (parsed as Record<string, unknown>)[role];
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new Error(`Production E2E credential is missing for ${role}.`);
    }
    const email = (candidate as Record<string, unknown>).email;
    const password = (candidate as Record<string, unknown>).password;
    if (
      typeof email !== 'string' ||
      !/^\S+@\S+\.\S+$/.test(email) ||
      typeof password !== 'string' ||
      password.length < 10
    ) {
      throw new Error(`Production E2E credential is invalid for ${role}.`);
    }
    const normalizedEmail = email.toLowerCase();
    if (emails.has(normalizedEmail)) {
      throw new Error('Production E2E roles must use distinct accounts.');
    }
    emails.add(normalizedEmail);
    accounts[role] = { email, password };
  }
  return accounts;
}
