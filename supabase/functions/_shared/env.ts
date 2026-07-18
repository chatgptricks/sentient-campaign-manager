type RuntimeGlobal = typeof globalThis & {
  Deno?: { env: { get(name: string): string | undefined } };
  process?: { env?: Record<string, string | undefined> };
};

export function getEnv(name: string): string | undefined {
  const runtime = globalThis as RuntimeGlobal;
  return runtime.Deno?.env.get(name) ?? runtime.process?.env?.[name];
}

export function requireEnv(name: string): string {
  const value = getEnv(name)?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getIntegerEnv(
  name: string,
  fallback: number,
  range: { min: number; max: number },
): number {
  const raw = getEnv(name);
  const parsed = raw ? Number.parseInt(raw, 10) : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(range.min, Math.min(range.max, parsed));
}
