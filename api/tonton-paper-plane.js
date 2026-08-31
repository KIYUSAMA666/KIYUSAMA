import { randomUUID } from 'node:crypto';

export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, code: 'METHOD_NOT_ALLOWED' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const source = String(body.source ?? 'iphone-back-tap').trim();
  const gesture = String(body.gesture ?? 'double-tap').trim();
  const externalId = String(body.externalId ?? randomUUID()).trim();
  const occurredAt = String(body.occurredAt ?? new Date().toISOString());

  if (!source || !externalId) {
    return res.status(400).json({ ok: false, code: 'INVALID_TONTON_SIGNAL' });
  }

  const receipt = {
    schema: 'tonton-paper-plane/0.1',
    receiptId: randomUUID(),
    externalId,
    source,
    gesture,
    occurredAt,
    receivedAt: new Date().toISOString(),
    physicalIngress: 'ACCEPTED',
    osDispatch: 'NOT_BOUND',
    phase3Pass: false,
  };

  console.log('TONTON_PHYSICAL_INGRESS', JSON.stringify(receipt));

  return res.status(200).json({
    ok: true,
    ack: 'TONTON_PHYSICAL_INGRESS_ACK',
    ...receipt,
  });
}
