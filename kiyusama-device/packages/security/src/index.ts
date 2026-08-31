const encoder = new TextEncoder();

function decodeHex(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signRequest(secret: string, timestamp: string, rawBody: string): Promise<string> {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${rawBody}`));
  return toHex(signature);
}

export async function verifySignature(
  secret: string,
  timestamp: string,
  rawBody: string,
  signatureHex: string,
): Promise<boolean> {
  try {
    const signature = decodeHex(signatureHex);
    if (!signature) return false;
    const key = await importHmacKey(secret);
    return crypto.subtle.verify('HMAC', key, signature, encoder.encode(`${timestamp}.${rawBody}`));
  } catch {
    return false;
  }
}

export function verifyTimestamp(timestamp: string, nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = 300): boolean {
  if (!/^-?\d+$/.test(timestamp)) return false;
  const parsed = Number(timestamp);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return false;
  if (!Number.isFinite(nowSeconds) || !Number.isInteger(nowSeconds)) return false;
  if (!Number.isFinite(toleranceSeconds) || !Number.isInteger(toleranceSeconds) || toleranceSeconds < 0) return false;
  return Math.abs(nowSeconds - parsed) <= toleranceSeconds;
}

export function verifyDeliveryEventIdBinding(
  headerDeliveryEventId: string | null | undefined,
  bodyDeliveryEventId: string | null | undefined,
): boolean {
  return typeof headerDeliveryEventId === 'string'
    && typeof bodyDeliveryEventId === 'string'
    && headerDeliveryEventId.length > 0
    && bodyDeliveryEventId.length > 0
    && headerDeliveryEventId === bodyDeliveryEventId;
}
