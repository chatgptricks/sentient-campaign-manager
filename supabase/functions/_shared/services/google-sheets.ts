import { getEnv, requireEnv } from '../env.ts';
import { HttpError } from '../errors.ts';

export type SheetChannelItemInput = {
  accountName?: string;
  accountUrl?: string;
  active: boolean;
  displayName?: string;
  handle?: string;
  notes?: string;
  ownershipType?: 'SENTIENT_OWNED' | 'CLIENT_OWNED' | 'EXTERNAL_PARTNER';
  partnerName?: string;
  platform?: 'INSTAGRAM' | 'X' | 'LINKEDIN';
  rowValues: string[];
};

export type SheetChannelItem = SheetChannelItemInput & {
  crmItemId: string;
  headers: string[];
  rowNumber: number;
  raw: Record<string, string>;
};

const headerAliases: Record<string, string> = {
  account: 'account_name',
  accountname: 'account_name',
  account_name: 'account_name',
  account_url: 'account_url',
  accounturl: 'account_url',
  active: 'active',
  channel: 'platform',
  crm_item_id: 'crm_item_id',
  crmitemid: 'crm_item_id',
  handle: 'handle',
  notes: 'notes',
  ownership: 'ownership_type',
  ownership_type: 'ownership_type',
  ownershiptype: 'ownership_type',
  partner: 'partner_name',
  partner_name: 'partner_name',
  partnername: 'partner_name',
  platform: 'platform',
  url: 'account_url',
};

const optionalHeaders = new Set(Object.values(headerAliases));

function base64Url(input: Uint8Array | string) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function normalizePrivateKey(raw: string) {
  return raw.replace(/\\n/g, '\n').trim();
}

async function importPrivateKey(pem: string) {
  const body = normalizePrivateKey(pem)
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return crypto.subtle.importKey(
    'pkcs8',
    bytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function serviceAccountAccessToken() {
  const email = requireEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  const key = await importPrivateKey(requireEnv('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY'));
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
  };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)),
  );
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${base64Url(signature)}`,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !payload.access_token) {
    throw new HttpError(
      502,
      'GOOGLE_AUTH_FAILED',
      payload.error_description ?? payload.error ?? 'Google service account auth failed.',
    );
  }
  return payload.access_token;
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseBoolean(value: string) {
  return !['false', 'no', '0', 'inactive', 'off'].includes(value.trim().toLowerCase());
}

function normalizePlatform(value: string): SheetChannelItemInput['platform'] | undefined {
  const normalized = value.trim().toUpperCase();
  if (!normalized) return undefined;
  if (normalized === 'TWITTER') return 'X';
  if (['INSTAGRAM', 'X', 'LINKEDIN'].includes(normalized)) {
    return normalized as SheetChannelItemInput['platform'];
  }
  return undefined;
}

function normalizeOwnership(value: string): SheetChannelItemInput['ownershipType'] | undefined {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_');
  if (!normalized) return undefined;
  if (['SENTIENT_OWNED', 'CLIENT_OWNED', 'EXTERNAL_PARTNER'].includes(normalized)) {
    return normalized as SheetChannelItemInput['ownershipType'];
  }
  return undefined;
}

function optionalLink(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    if (url.protocol === 'http:' || url.protocol === 'https:') return trimmed;
  } catch {
    return '';
  }
  return '';
}

export function parseGoogleSheetUrl(sheetUrl: string) {
  let url: URL;
  try {
    url = new URL(sheetUrl);
  } catch {
    throw new HttpError(400, 'SHEET_URL_INVALID', 'Paste a valid Google Sheet link.');
  }
  const spreadsheetId = url.pathname.match(/\/spreadsheets\/d\/([^/]+)/)?.[1];
  if (!spreadsheetId) {
    throw new HttpError(400, 'SHEET_URL_INVALID', 'Paste a Google Sheets spreadsheet link.');
  }
  const gid = url.hash.match(/gid=([0-9]+)/)?.[1] ?? url.searchParams.get('gid') ?? undefined;
  return { gid, spreadsheetId };
}

export class GoogleSheetsClient {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = getEnv('GOOGLE_SHEETS_ACCESS_TOKEN') ?? (await serviceAccountAccessToken());
    const response = await this.fetcher(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
        ...(init?.headers ?? {}),
      },
    });
    const payload = (await response.json().catch(() => ({}))) as T & {
      error?: { message?: string; status?: string };
    };
    if (!response.ok) {
      throw new HttpError(
        response.status === 403 ? 403 : 502,
        'GOOGLE_SHEETS_ERROR',
        payload.error?.message ?? 'Google Sheets request failed.',
      );
    }
    return payload;
  }

  async spreadsheet(spreadsheetId: string) {
    return this.request<{
      sheets?: Array<{
        properties?: { gridProperties?: { rowCount?: number }; sheetId?: number; title?: string };
      }>;
    }>(`${spreadsheetId}?fields=sheets(properties(sheetId,title,gridProperties(rowCount)))`);
  }

  async values(spreadsheetId: string, range: string) {
    const escapedRange = encodeURIComponent(range);
    return this.request<{ values?: string[][] }>(`${spreadsheetId}/values/${escapedRange}`);
  }

  async updateValues(spreadsheetId: string, range: string, values: string[][]) {
    const escapedRange = encodeURIComponent(range);
    return this.request(`${spreadsheetId}/values/${escapedRange}?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      body: JSON.stringify({ majorDimension: 'ROWS', values }),
    });
  }

  async appendValues(spreadsheetId: string, range: string, values: string[][]) {
    const escapedRange = encodeURIComponent(range);
    return this.request(
      `${spreadsheetId}/values/${escapedRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      { method: 'POST', body: JSON.stringify({ majorDimension: 'ROWS', values }) },
    );
  }
}

export function sheetTitleFor(
  spreadsheet: Awaited<ReturnType<GoogleSheetsClient['spreadsheet']>>,
  gid?: string,
) {
  const selected = gid
    ? spreadsheet.sheets?.find((sheet) => String(sheet.properties?.sheetId) === gid)
    : spreadsheet.sheets?.[0];
  const title = selected?.properties?.title;
  if (!title)
    throw new HttpError(400, 'SHEET_TAB_NOT_FOUND', 'The selected Sheet tab was not found.');
  return title;
}

function indexHeaders(headers: string[]) {
  const indexes = new Map<string, number>();
  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    const canonical = headerAliases[normalized] ?? normalized;
    if (optionalHeaders.has(canonical)) indexes.set(canonical, index);
  });
  return indexes;
}

function rowValue(row: string[], indexes: Map<string, number>, key: string) {
  const index = indexes.get(key);
  return index === undefined ? '' : String(row[index] ?? '').trim();
}

export function parseSheetChannelRows(values: string[][]) {
  const rawHeaders = values[0] ?? [];
  if (!rawHeaders.some((header) => String(header ?? '').trim())) {
    throw new HttpError(400, 'SHEET_HEADERS_INVALID', 'The Sheet needs a header row.');
  }
  const headers = rawHeaders.map((header, index) => {
    const trimmed = String(header ?? '').trim();
    return trimmed || `Column ${index + 1}`;
  });
  const indexes = indexHeaders(headers);
  const items: SheetChannelItem[] = [];
  const missingIds: Array<{ rowNumber: number; value: string }> = [];
  for (let offset = 1; offset < values.length; offset += 1) {
    const row = values[offset] ?? [];
    if (row.every((cell) => !String(cell ?? '').trim())) continue;
    const rowNumber = offset + 1;
    const rowValues = Array.from({ length: headers.length }, (_, index) =>
      String(row[index] ?? '').trim(),
    );
    const visibleValues = rowValues.filter(Boolean);
    const displayName = visibleValues.slice(0, 3).join(' · ') || `Row ${rowNumber}`;
    const crmItemId = rowValue(row, indexes, 'crm_item_id') || `row-${rowNumber}`;
    if (!rowValue(row, indexes, 'crm_item_id')) missingIds.push({ rowNumber, value: crmItemId });
    const accountName = rowValue(row, indexes, 'account_name') || displayName;
    const handle = rowValue(row, indexes, 'handle') || displayName;
    const notes = rowValue(row, indexes, 'notes');
    const platform = normalizePlatform(rowValue(row, indexes, 'platform'));
    const ownershipType = normalizeOwnership(rowValue(row, indexes, 'ownership_type'));
    const item: SheetChannelItem = {
      accountName,
      accountUrl: optionalLink(rowValue(row, indexes, 'account_url')),
      active: indexes.has('active') ? parseBoolean(rowValue(row, indexes, 'active')) : true,
      crmItemId,
      displayName,
      handle,
      headers,
      notes,
      ownershipType,
      partnerName: rowValue(row, indexes, 'partner_name'),
      platform,
      raw: Object.fromEntries(headers.map((header, index) => [header, rowValues[index] ?? ''])),
      rowNumber,
      rowValues,
    };
    items.push(item);
  }
  return { headers, indexes, items, missingIds };
}
