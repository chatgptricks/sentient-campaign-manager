import { HttpError } from './errors.ts';

const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { hash: 'SHA-256', name: 'HMAC' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return bytesToHex(new Uint8Array(signature));
}

async function timingSafeHexEqual(left: string, right: string): Promise<boolean> {
  if (!/^[0-9a-f]+$/i.test(left) || !/^[0-9a-f]+$/i.test(right)) return false;
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left.toLowerCase())),
    crypto.subtle.digest('SHA-256', encoder.encode(right.toLowerCase())),
  ]);
  const a = new Uint8Array(leftHash);
  const b = new Uint8Array(rightHash);
  let difference = a.length ^ b.length;
  for (let index = 0; index < a.length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0 && left.length === right.length;
}

export async function signWebhookPayload(
  secret: string,
  timestamp: string,
  rawBody: string,
): Promise<string> {
  return `sha256=${await hmacHex(secret, `${timestamp}.${rawBody}`)}`;
}

export async function verifyWebhookSignature(input: {
  rawBody: string;
  secret: string;
  signature: string;
  timestamp: string;
  now?: number;
  toleranceSeconds?: number;
}): Promise<void> {
  const timestampSeconds = Number.parseInt(input.timestamp, 10);
  const now = input.now ?? Date.now();
  const tolerance = (input.toleranceSeconds ?? 300) * 1000;
  if (!Number.isFinite(timestampSeconds) || Math.abs(now - timestampSeconds * 1000) > tolerance) {
    throw new HttpError(
      401,
      'WEBHOOK_TIMESTAMP_INVALID',
      'Webhook timestamp is outside the allowed window.',
    );
  }
  const expected = await signWebhookPayload(input.secret, input.timestamp, input.rawBody);
  const supplied = input.signature.trim().replace(/^sha256=/i, '');
  if (!(await timingSafeHexEqual(expected.replace(/^sha256=/, ''), supplied))) {
    throw new HttpError(401, 'WEBHOOK_SIGNATURE_INVALID', 'Webhook signature is invalid.');
  }
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return bytesToHex(new Uint8Array(digest));
}
