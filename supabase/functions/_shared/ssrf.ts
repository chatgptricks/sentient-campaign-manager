import { HttpError } from './errors.ts';
import { getDenoRuntime } from './runtime.ts';

export type ResourceProvider = 'CANVA' | 'GOOGLE_DRIVE' | 'DROPBOX' | 'SUPABASE_STORAGE' | 'OTHER';

export type DnsResolver = (hostname: string) => Promise<string[]>;

const providerDomains: Record<Exclude<ResourceProvider, 'OTHER'>, string[]> = {
  CANVA: ['canva.com'],
  DROPBOX: ['dropbox.com', 'dropboxusercontent.com'],
  GOOGLE_DRIVE: ['drive.google.com', 'docs.google.com'],
  SUPABASE_STORAGE: ['supabase.co', 'supabase.in'],
};

function domainMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

type Ipv4Segments = [number, number, number, number];
type Ipv6Segments = [number, number, number, number, number, number, number, number];

function parseIpv4(value: string): Ipv4Segments | undefined {
  const parts = value.split('.');
  if (parts.length !== 4) return undefined;
  const numbers = parts.map((part) => Number(part));
  if (numbers.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return undefined;
  return numbers as Ipv4Segments;
}

function parseIpv6(value: string): Ipv6Segments | undefined {
  let normalized = value.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized.includes('%') || !normalized.includes(':')) return undefined;
  if (normalized.includes('.')) {
    const lastColon = normalized.lastIndexOf(':');
    const ipv4 = parseIpv4(normalized.slice(lastColon + 1));
    if (!ipv4) return undefined;
    normalized = `${normalized.slice(0, lastColon)}:${((ipv4[0] << 8) | ipv4[1]).toString(16)}:${((ipv4[2] << 8) | ipv4[3]).toString(16)}`;
  }
  const halves = normalized.split('::');
  if (halves.length > 2) return undefined;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  if (halves.length === 1 && left.length !== 8) return undefined;
  const missing = 8 - left.length - right.length;
  if (missing < (halves.length === 2 ? 1 : 0)) return undefined;
  const rawSegments = [...left, ...Array.from({ length: missing }, () => '0'), ...right];
  if (rawSegments.length !== 8 || rawSegments.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) {
    return undefined;
  }
  return rawSegments.map((part) => Number.parseInt(part, 16)) as Ipv6Segments;
}

export function isPublicIpAddress(value: string): boolean {
  const normalized = value.toLowerCase().replace(/^\[|\]$/g, '');
  const ipv4 = parseIpv4(normalized);
  if (ipv4) {
    const [a, b, c] = ipv4;
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 0 && c === 0) return false;
    if (a === 192 && b === 0 && c === 2) return false;
    if (a === 192 && b === 168) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a === 198 && b === 51 && c === 100) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    if (a >= 224) return false;
    return true;
  }

  const ipv6 = parseIpv6(normalized);
  if (!ipv6) return false;
  if (ipv6.slice(0, 5).every((segment) => segment === 0) && ipv6[5] === 0xffff) {
    const mapped = `${ipv6[6] >> 8}.${ipv6[6] & 0xff}.${ipv6[7] >> 8}.${ipv6[7] & 0xff}`;
    return isPublicIpAddress(mapped);
  }
  // Only globally routed IPv6 unicast is eligible. This excludes loopback,
  // link-local, unique-local, multicast, IPv4-compatible, and NAT64 ranges.
  if ((ipv6[0] & 0xe000) !== 0x2000) return false;
  if (ipv6[0] === 0x2001 && ipv6[1] === 0x0db8) return false;
  return true;
}

export async function defaultDnsResolver(hostname: string): Promise<string[]> {
  const runtime = getDenoRuntime();
  if (!runtime?.resolveDns) {
    throw new HttpError(
      503,
      'DNS_RESOLVER_UNAVAILABLE',
      'URL validation is temporarily unavailable.',
    );
  }
  const answers = await Promise.allSettled([
    runtime.resolveDns(hostname, 'A'),
    runtime.resolveDns(hostname, 'AAAA'),
  ]);
  return answers.flatMap((answer) => (answer.status === 'fulfilled' ? answer.value : []));
}

export async function validateSafeExternalUrl(
  input: string,
  options: { provider?: ResourceProvider; resolveDns?: DnsResolver } = {},
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new HttpError(400, 'RESOURCE_URL_INVALID', 'Resource URL is invalid.');
  }
  if (url.protocol !== 'https:') {
    throw new HttpError(400, 'RESOURCE_URL_UNSAFE', 'Resource URL must use HTTPS.');
  }
  if (url.username || url.password) {
    throw new HttpError(400, 'RESOURCE_URL_UNSAFE', 'Resource URL cannot contain credentials.');
  }
  if (url.port && url.port !== '443') {
    throw new HttpError(400, 'RESOURCE_URL_UNSAFE', 'Resource URL cannot use a custom port.');
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new HttpError(400, 'RESOURCE_URL_UNSAFE', 'Resource URL host is not allowed.');
  }

  const provider = options.provider ?? 'OTHER';
  if (provider !== 'OTHER') {
    const allowed = providerDomains[provider];
    if (!allowed.some((domain) => domainMatches(hostname, domain))) {
      throw new HttpError(
        400,
        'RESOURCE_PROVIDER_MISMATCH',
        `Resource URL does not match provider ${provider}.`,
      );
    }
  }

  if (parseIpv4(hostname) || hostname.includes(':')) {
    if (!isPublicIpAddress(hostname)) {
      throw new HttpError(
        400,
        'RESOURCE_URL_UNSAFE',
        'Resource URL resolves to a private address.',
      );
    }
    return url;
  }

  let addresses: string[];
  try {
    addresses = await (options.resolveDns ?? defaultDnsResolver)(hostname);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(422, 'RESOURCE_DNS_FAILED', 'Resource host could not be resolved.');
  }
  if (addresses.length === 0) {
    throw new HttpError(422, 'RESOURCE_DNS_FAILED', 'Resource host has no public address.');
  }
  if (addresses.some((address) => !isPublicIpAddress(address))) {
    throw new HttpError(400, 'RESOURCE_URL_UNSAFE', 'Resource host resolves to a private address.');
  }
  return url;
}

export async function safeHeadRequest(
  input: string,
  options: {
    fetcher?: typeof fetch;
    maxRedirects?: number;
    provider?: ResourceProvider;
    resolveDns?: DnsResolver;
    timeoutMs?: number;
  } = {},
): Promise<{ available: boolean; finalUrl: string; status: number }> {
  const fetcher = options.fetcher ?? fetch;
  let current = await validateSafeExternalUrl(input, options);
  const maxRedirects = options.maxRedirects ?? 3;
  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5_000);
    let response: Response;
    try {
      response = await fetcher(current, {
        method: 'HEAD',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': 'SentientCampaignManager-ResourceValidator/1.0' },
      });
    } catch {
      throw new HttpError(
        422,
        'RESOURCE_UNAVAILABLE',
        'Resource availability could not be checked.',
      );
    } finally {
      clearTimeout(timeout);
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || redirectCount === maxRedirects) {
        throw new HttpError(
          422,
          'RESOURCE_REDIRECT_INVALID',
          'Resource redirect could not be validated.',
        );
      }
      current = await validateSafeExternalUrl(new URL(location, current).toString(), {
        provider: options.provider ?? 'OTHER',
        resolveDns: options.resolveDns,
      });
      continue;
    }
    return {
      available:
        (response.status >= 200 && response.status < 300) ||
        response.status === 401 ||
        response.status === 403,
      finalUrl: current.toString(),
      status: response.status,
    };
  }
  throw new HttpError(422, 'RESOURCE_REDIRECT_INVALID', 'Too many resource redirects.');
}
