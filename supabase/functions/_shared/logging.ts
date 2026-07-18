const sensitiveKeyPattern =
  /authorization|cookie|credential|password|secret|signature|token|api[_-]?key/i;
const urlKeyPattern = /url|uri|endpoint|webhook/i;

export function sanitizeText(value: string): string {
  return value
    .replace(/bearer\s+[a-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(
      /([?&](?:access_token|api_key|apikey|key|secret|signature|token)=)[^&#\s]+/gi,
      '$1[REDACTED]',
    )
    .replace(/\b(?:sk|sb_secret|whsec)_[a-z0-9_-]{8,}\b/gi, '[REDACTED]');
}

function sanitizeUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.hostname === 'hooks.slack.com') return 'https://hooks.slack.com/[REDACTED]';
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return sanitizeText(value);
  }
}

export function sanitizeForLog(value: unknown, key = '', seen = new WeakSet<object>()): unknown {
  if (sensitiveKeyPattern.test(key)) return '[REDACTED]';
  if (typeof value === 'string') {
    return urlKeyPattern.test(key) ? sanitizeUrl(value) : sanitizeText(value);
  }
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLog(item, key, seen));
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([childKey, child]) => [
      childKey,
      sanitizeForLog(child, childKey, seen),
    ]),
  );
}

function writeLog(
  level: 'debug' | 'info' | 'warn' | 'error',
  event: string,
  metadata: Record<string, unknown> = {},
): void {
  const entry = JSON.stringify({
    level,
    event,
    timestamp: new Date().toISOString(),
    ...(sanitizeForLog(metadata) as Record<string, unknown>),
  });
  if (level === 'error') console.error(entry);
  else if (level === 'warn') console.warn(entry);
  else console.log(entry);
}

export const logger = {
  debug: (event: string, metadata?: Record<string, unknown>) => writeLog('debug', event, metadata),
  error: (event: string, metadata?: Record<string, unknown>) => writeLog('error', event, metadata),
  info: (event: string, metadata?: Record<string, unknown>) => writeLog('info', event, metadata),
  warn: (event: string, metadata?: Record<string, unknown>) => writeLog('warn', event, metadata),
};
