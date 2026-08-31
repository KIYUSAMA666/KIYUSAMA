const encoder = new TextEncoder();

function decodeHex(hex: string): ArrayBuffer | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes.buffer as ArrayBuffer;
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

export type ReceiverDependencies = {
  validateContract: (body: unknown) => boolean;
  persistInbox: (body: unknown) => Promise<void> | void;
  trace?: (step: string) => void;
};

export type ReceiverRequest = {
  rawBody: string;
  signatureHex: string;
  timestamp: string;
  headerDeliveryEventId: string | null | undefined;
};

export async function authenticateAndHandleRequest(
  secret: string,
  request: ReceiverRequest,
  dependencies: ReceiverDependencies,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const trace = dependencies.trace ?? (() => undefined);

  trace('capture-raw-body');
  const rawBody = request.rawBody;

  trace('read-signature');
  const signatureHex = request.signatureHex;

  trace('read-timestamp');
  const timestamp = request.timestamp;

  trace('verify-timestamp');
  if (!verifyTimestamp(timestamp, nowSeconds)) return false;

  trace('verify-hmac');
  if (!await verifySignature(secret, timestamp, rawBody, signatureHex)) return false;

  trace('parse-json');
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return false;
  }

  trace('validate-contract');
  if (!dependencies.validateContract(body)) return false;

  const bodyDeliveryEventId = typeof body === 'object' && body !== null && 'delivery_event_id' in body
    ? (body as { delivery_event_id?: unknown }).delivery_event_id
    : undefined;

  trace('verify-delivery-event-id-binding');
  if (!verifyDeliveryEventIdBinding(
    request.headerDeliveryEventId,
    typeof bodyDeliveryEventId === 'string' ? bodyDeliveryEventId : undefined,
  )) return false;

  trace('persist-inbox');
  await dependencies.persistInbox(body);
  return true;
}
