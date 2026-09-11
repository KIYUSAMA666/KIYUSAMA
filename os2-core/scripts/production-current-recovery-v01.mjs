import assert from "node:assert/strict";
import { recoverProductionCurrent } from "../dist/src/production-current-recovery.js";

const AUDIENCE = "kiyusama-os2-production-current-recovery-v01";
const RELAY_URL = "https://zdypjilutgxjsneultqj.supabase.co/functions/v1/os2-production-current-recovery-v01";
const STATE_ID = "OS2-PTE-V01-STATE";
const LINEAGE_ID = "OS2-PTE-V01-LINEAGE";

async function getGitHubOidcToken() {
  const base = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!base || !requestToken) throw new Error("GITHUB_OIDC_NOT_AVAILABLE");
  const url = new URL(base);
  url.searchParams.set("audience", AUDIENCE);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${requestToken}` } });
  if (!response.ok) throw new Error(`GITHUB_OIDC_REQUEST_FAILED:${response.status}`);
  const body = await response.json();
  if (!body?.value) throw new Error("GITHUB_OIDC_TOKEN_MISSING");
  return body.value;
}

const oidc = await getGitHubOidcToken();
const response = await fetch(RELAY_URL, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${oidc}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({ stateId: STATE_ID, lineageId: LINEAGE_ID, minCommitSequence: 1 }),
});
const body = await response.json().catch(() => null);
console.log("OS2_PCR_V01_RELAY", JSON.stringify({ status: response.status, body }));
if (!response.ok || !body?.ok) {
  throw new Error(`PRODUCTION_CURRENT_RECOVERY_RELAY_FAILED:${response.status}:${JSON.stringify(body)}`);
}

const recovered = await recoverProductionCurrent(
  { readCurrent: async () => body.current },
  { stateId: STATE_ID, lineageId: LINEAGE_ID, minCommitSequence: 1 },
);
console.log("OS2_PCR_V01_RECOVERY", JSON.stringify(recovered));

assert.equal(recovered.status, "RECOVERED");
assert.equal(recovered.commitSequence, 1);
assert.equal(recovered.current.identity.stateId, STATE_ID);
assert.equal(recovered.current.identity.lineageId, LINEAGE_ID);
assert.equal(recovered.current.identity.stateRevision, 2);
assert.equal(recovered.current.humanDecisionFinal.sourceAuthority, "KIYUSAMA");
assert.equal(recovered.current.writeBack.source.sourceResultId, "OS2-PTE-V01-RESULT-001");
assert.equal(recovered.current.writeBack.source.sourceHandoffId, "OS2-PTE-V01-HANDOFF-001");

body.current.current.identity.lineageId = "MUTATED_PROVIDER_OBJECT";
assert.equal(recovered.current.identity.lineageId, LINEAGE_ID);

console.log("OS2_PCR_V01_PASS", JSON.stringify({
  stateId: recovered.current.identity.stateId,
  lineageId: recovered.current.identity.lineageId,
  revision: recovered.current.identity.stateRevision,
  commitSequence: recovered.commitSequence,
  providerAliasIsolation: true,
}));
