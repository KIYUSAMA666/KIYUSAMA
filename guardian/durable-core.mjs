import fs from "node:fs";
import path from "node:path";

function atomicWriteJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp-" + process.pid;
  const fd = fs.openSync(tmp, "w", 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(value, null, 2) + "\n", "utf8");
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
  const dfd = fs.openSync(path.dirname(file), "r");
  try { fs.fsyncSync(dfd); } finally { fs.closeSync(dfd); }
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { if (e.code === "ENOENT") return fallback; throw e; }
}

export class BodyLockError extends Error {}

export class DurableBodyLock {
  constructor(file) { this.file=file; }
  read() { return readJson(this.file, null); }
  acquire({bodyId, ownerId}) {
    const current=this.read();
    if (current && current.bodyId===bodyId && current.ownerId!==ownerId)
      throw new BodyLockError("BODY_ALREADY_OWNED");
    if (current && current.bodyId!==bodyId)
      throw new BodyLockError("LOCK_FILE_BOUND_TO_OTHER_BODY");
    const lock={bodyId,ownerId,acquiredAt:new Date().toISOString()};
    atomicWriteJson(this.file,lock); return lock;
  }
  release({bodyId, ownerId}) {
    const current=this.read();
    if (!current) return false;
    if (current.bodyId!==bodyId || current.ownerId!==ownerId)
      throw new BodyLockError("LOCK_NOT_OWNED");
    fs.unlinkSync(this.file); return true;
  }
}

export class DurableLedger {
  constructor(file) { this.file=file; }
  read() { return readJson(this.file,{version:1,bodies:{}}); }
  record(bodyId, entry) {
    const data=this.read();
    const previous=data.bodies[bodyId] ?? null;
    const seq=(previous?.seq ?? 0)+1;
    data.bodies[bodyId]={...entry,seq,bodyId,recordedAt:new Date().toISOString()};
    atomicWriteJson(this.file,data);
    return data.bodies[bodyId];
  }
  get(bodyId) { return this.read().bodies[bodyId] ?? null; }
}

export function recoveryDecision(entry) {
  if (!entry) return "NO_LEDGER";
  if (entry.state==="RESULT_COMMITTED") return "RESULT_COMMITTED";
  if (entry.sendStarted===true && entry.resultCommitted!==true) return "UNCERTAIN";
  return entry.state;
}
