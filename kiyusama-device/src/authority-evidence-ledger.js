import { createHash } from 'node:crypto';

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(entry) {
  return createHash('sha256').update(stable(entry)).digest('hex');
}

export function createAuthorityEvidenceLedger({ store } = {}) {
  if (!store || typeof store.append !== 'function' || typeof store.readAll !== 'function') {
    throw new Error('DURABLE_EVIDENCE_STORE_REQUIRED');
  }

  async function verify() {
    const rows = await store.readAll();
    let previousHash = null;
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (row.sequence !== index + 1 || row.previous_hash !== previousHash) {
        return { ok: false, code: 'EVIDENCE_CHAIN_BROKEN', index };
      }
      const { integrity_hash, ...unsigned } = row;
      if (digest(unsigned) !== integrity_hash) {
        return { ok: false, code: 'EVIDENCE_HASH_MISMATCH', index };
      }
      previousHash = integrity_hash;
    }
    return { ok: true, count: rows.length, head: previousHash };
  }

  async function append(event) {
    const before = await verify();
    if (!before.ok) throw new Error(before.code);
    const row = {
      sequence: before.count + 1,
      previous_hash: before.head,
      recorded_at: new Date().toISOString(),
      event,
    };
    const sealed = { ...row, integrity_hash: digest(row) };
    await store.append(sealed);
    const after = await verify();
    if (!after.ok) throw new Error(after.code);
    return sealed;
  }

  return { append, verify };
}
